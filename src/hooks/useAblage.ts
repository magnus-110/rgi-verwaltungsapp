import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  ABLAGE_BUCKET,
  ablageDb,
  type AblageItemRow,
  type AblageSource,
  type MailAnhangDrag,
} from '@/integrations/supabase/ablage';
import { useAuth } from '@/hooks/useAuth';
import { useWallPeople, type WallPerson } from '@/hooks/useBoardWalls';

/**
 * Büro-Ablage — die Datenschicht.
 *
 * Ein gemeinsamer Korb fürs Büro: Dateien und kurze Notizen hinlegen, die
 * Kollegen sehen es sofort, wer fertig ist, löscht es. Wer was sehen darf,
 * entscheidet die Datenbank (RLS); hier wird nur geladen und angezeigt.
 */

export const ABLAGE_KEY = ['office-drop-items'] as const;
const READS_KEY = ['office-drop-reads'] as const;

/** Größte Datei, die man in die Ablage legen kann. */
export const ABLAGE_MAX_BYTES = 50 * 1024 * 1024;

export interface AblageItem extends AblageItemRow {
  /** Name des Absenders, z. B. "Anna Huber". */
  fromName: string;
  fromInitials: string;
  /** Namen der Empfänger; leer = für alle. */
  recipientNames: string[];
  fuerMich: boolean;
  vonMir: boolean;
  /** Noch nicht angesehen (und nicht von mir selbst). */
  neu: boolean;
}

// --------------------------------------------------------------- Löschen
// Löschen passiert erst nach ein paar Sekunden — so lange steht im Hinweis
// "Rückgängig". Der Speicher liegt außerhalb von React, damit ein Seitenwechsel
// das Löschen nicht abbricht und der Eintrag überall sofort verschwindet.

const UNDO_MS = 6000;
const pendingDeletes = new Set<string>();
const listeners = new Set<() => void>();
let pendingSnapshot: ReadonlySet<string> = new Set();

function notifyPending() {
  pendingSnapshot = new Set(pendingDeletes);
  listeners.forEach(l => l());
}

function usePendingDeletes() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pendingSnapshot,
  );
}

async function wirklichLoeschen(items: AblageItemRow[]) {
  const pfade = items.map(i => i.file_path).filter((p): p is string => !!p);
  const ids = items.map(i => i.id);
  // Erst die Datei, dann der Eintrag: Die Speicher-Regel prüft am Eintrag,
  // ob man die Datei sehen (und damit löschen) darf.
  if (pfade.length) {
    const { error: sErr } = await supabase.storage.from(ABLAGE_BUCKET).remove(pfade);
    if (sErr) console.warn('Ablage: Datei konnte nicht aus dem Speicher entfernt werden', sErr);
  }
  const { error } = await ablageDb.from('office_drop_items').delete().in('id', ids);
  if (error) throw error;
}

// --------------------------------------------------------------- Laden

export function useAblage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: people = [] } = useWallPeople();
  const pending = usePendingDeletes();

  const itemsQuery = useQuery({
    queryKey: ABLAGE_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<AblageItemRow[]> => {
      const { data, error } = await ablageDb
        .from('office_drop_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as AblageItemRow[];
    },
  });

  const readsQuery = useQuery({
    queryKey: [...READS_KEY, userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await ablageDb
        .from('office_drop_reads')
        .select('item_id')
        .eq('user_id', userId!);
      if (error) throw error;
      return new Set((data || []).map(r => r.item_id));
    },
  });

  const items = useMemo<AblageItem[]>(() => {
    const byId = new Map<string, WallPerson>(people.map(p => [p.userId, p]));
    const gelesen = readsQuery.data ?? new Set<string>();
    return (itemsQuery.data ?? [])
      .filter(row => !pending.has(row.id))
      .map(row => {
        const von = byId.get(row.created_by);
        const vonMir = row.created_by === userId;
        return {
          ...row,
          fromName: vonMir ? 'Ich' : von?.name ?? 'Unbekannt',
          fromInitials: von?.initials ?? '??',
          recipientNames: (row.recipient_ids || []).map(id =>
            id === userId ? 'mich' : byId.get(id)?.name ?? 'Unbekannt',
          ),
          fuerMich: !!userId && (row.recipient_ids || []).includes(userId),
          vonMir,
          neu: !vonMir && !gelesen.has(row.id),
        };
      });
  }, [itemsQuery.data, readsQuery.data, people, pending, userId]);

  return {
    items,
    people,
    isLoading: itemsQuery.isLoading,
    neuCount: items.filter(i => i.neu).length,
  };
}

/**
 * Live-Update: neue Einträge der Kollegen erscheinen sofort.
 * Wird einmal oben in der Kopfzeile eingebunden.
 */
export function useAblageLive(onNeu?: (row: AblageItemRow) => void) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`office-drop-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'office_drop_items' },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ABLAGE_KEY });
          if (payload.eventType === 'INSERT' && payload.new?.created_by !== userId) {
            onNeu?.(payload.new as AblageItemRow);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // onNeu absichtlich nicht als Abhängigkeit — sonst wird bei jedem Rendern neu verbunden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, qc]);
}

// --------------------------------------------------------------- Gelesen

export function useMarkAblageRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      if (!user?.id || !itemIds.length) return;
      const { error } = await ablageDb
        .from('office_drop_reads')
        .upsert(
          itemIds.map(id => ({ item_id: id, user_id: user.id })),
          { onConflict: 'item_id,user_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: READS_KEY }),
  });
}

// --------------------------------------------------------------- Hinlegen

function sichererDateiname(name: string) {
  const sauber = name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return sauber.slice(-120) || 'datei';
}

async function hochladen(blob: Blob, name: string) {
  const path = `${crypto.randomUUID()}/${sichererDateiname(name)}`;
  const { error } = await supabase.storage
    .from(ABLAGE_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

export interface Hinlegen {
  recipientIds: string[];
  /** Kommentar zur Datei bzw. Text der Notiz. */
  note?: string | null;
}

export function useAblageHinlegen() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const dateien = useMutation({
    mutationFn: async (input: Hinlegen & { files: File[]; source?: AblageSource }) => {
      if (!user?.id) throw new Error('Nicht angemeldet');
      let ok = 0;
      for (const file of input.files) {
        if (file.size > ABLAGE_MAX_BYTES) {
          toast.error(`${file.name} ist zu groß (höchstens 50 MB)`);
          continue;
        }
        try {
          const path = await hochladen(file, file.name);
          const { error } = await ablageDb.from('office_drop_items').insert({
            kind: 'file',
            file_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size,
            note: input.note?.trim() || null,
            recipient_ids: input.recipientIds,
            source: input.source ?? 'upload',
            created_by: user.id,
          });
          if (error) {
            await supabase.storage.from(ABLAGE_BUCKET).remove([path]);
            throw error;
          }
          ok++;
        } catch (e: any) {
          toast.error(`${file.name}: ${e?.message ?? 'konnte nicht abgelegt werden'}`);
        }
      }
      return ok;
    },
    onSuccess: ok => {
      qc.invalidateQueries({ queryKey: ABLAGE_KEY });
      if (ok) toast.success(ok === 1 ? 'In die Ablage gelegt' : `${ok} Dateien in die Ablage gelegt`);
    },
  });

  const notiz = useMutation({
    mutationFn: async (input: Hinlegen) => {
      if (!user?.id) throw new Error('Nicht angemeldet');
      const text = input.note?.trim();
      if (!text) throw new Error('Die Notiz ist leer');
      const { error } = await ablageDb.from('office_drop_items').insert({
        kind: 'note',
        note: text,
        recipient_ids: input.recipientIds,
        source: 'upload',
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ABLAGE_KEY });
      toast.success('Notiz in die Ablage gelegt');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Notiz konnte nicht abgelegt werden'),
  });

  /** Mail-Anhänge in die Ablage kopieren (das Original in der Mail bleibt). */
  const mailAnhaenge = useMutation({
    mutationFn: async (input: Hinlegen & { anhaenge: MailAnhangDrag[] }) => {
      if (!user?.id) throw new Error('Nicht angemeldet');
      let ok = 0;
      for (const a of input.anhaenge) {
        try {
          const { data: blob, error: dErr } = await supabase.storage
            .from('email-attachments')
            .download(a.path);
          if (dErr || !blob) throw dErr ?? new Error('Anhang nicht lesbar');
          const typed = a.mimeType ? new Blob([blob], { type: a.mimeType }) : blob;
          const path = await hochladen(typed, a.name);
          const { error } = await ablageDb.from('office_drop_items').insert({
            kind: 'file',
            file_path: path,
            file_name: a.name,
            mime_type: a.mimeType || blob.type || null,
            file_size: a.size ?? blob.size,
            note: input.note?.trim() || null,
            recipient_ids: input.recipientIds,
            source: 'email',
            source_email_id: a.emailId,
            created_by: user.id,
          });
          if (error) {
            await supabase.storage.from(ABLAGE_BUCKET).remove([path]);
            throw error;
          }
          ok++;
        } catch (e: any) {
          toast.error(`${a.name}: ${e?.message ?? 'konnte nicht abgelegt werden'}`);
        }
      }
      return ok;
    },
    onSuccess: ok => {
      qc.invalidateQueries({ queryKey: ABLAGE_KEY });
      if (ok) toast.success(ok === 1 ? 'Anhang in die Ablage gelegt' : `${ok} Anhänge in die Ablage gelegt`);
    },
  });

  return { dateien, notiz, mailAnhaenge };
}

// --------------------------------------------------------------- Löschen

/**
 * Löscht Einträge — mit ein paar Sekunden "Rückgängig".
 * `still` = ohne Hinweis und sofort (z. B. nach "Im DMS ablegen").
 */
export function useAblageLoeschen() {
  const qc = useQueryClient();

  return useCallback(
    (items: AblageItemRow[], opts?: { still?: boolean }) => {
      if (!items.length) return;
      const ids = items.map(i => i.id);
      ids.forEach(id => pendingDeletes.add(id));
      notifyPending();

      const freigeben = () => {
        ids.forEach(id => pendingDeletes.delete(id));
        notifyPending();
      };

      const ausfuehren = async () => {
        try {
          await wirklichLoeschen(items);
          await qc.invalidateQueries({ queryKey: ABLAGE_KEY });
        } catch (e: any) {
          toast.error('Löschen fehlgeschlagen: ' + (e?.message ?? 'unbekannter Fehler'));
        } finally {
          freigeben();
        }
      };

      if (opts?.still) {
        void ausfuehren();
        return;
      }

      let abgebrochen = false;
      const timer = window.setTimeout(() => {
        if (!abgebrochen) void ausfuehren();
      }, UNDO_MS);

      toast(items.length === 1 ? 'Eintrag gelöscht' : `${items.length} Einträge gelöscht`, {
        duration: UNDO_MS,
        action: {
          label: 'Rückgängig',
          onClick: () => {
            abgebrochen = true;
            window.clearTimeout(timer);
            freigeben();
          },
        },
      });
    },
    [qc],
  );
}

// --------------------------------------------------------------- Dateien

export async function ablageSignedUrl(path: string, sekunden = 600) {
  const { data, error } = await supabase.storage.from(ABLAGE_BUCKET).createSignedUrl(path, sekunden);
  if (error || !data?.signedUrl) throw error ?? new Error('Datei nicht erreichbar');
  return data.signedUrl;
}

export async function ablageHerunterladen(item: Pick<AblageItemRow, 'file_path' | 'file_name'>) {
  if (!item.file_path) return;
  const { data, error } = await supabase.storage.from(ABLAGE_BUCKET).download(item.file_path);
  if (error || !data) {
    toast.error('Download fehlgeschlagen');
    return;
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.file_name || 'datei';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Lädt einen Eintrag als File — zum Anhängen an eine E-Mail. */
export async function ablageAlsFile(item: Pick<AblageItemRow, 'file_path' | 'file_name' | 'mime_type'>) {
  if (!item.file_path) throw new Error('Keine Datei');
  const { data, error } = await supabase.storage.from(ABLAGE_BUCKET).download(item.file_path);
  if (error || !data) throw error ?? new Error('Download fehlgeschlagen');
  return new File([data], item.file_name || 'datei', {
    type: item.mime_type || data.type || 'application/octet-stream',
  });
}

export function formatGroesse(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function relativeZeit(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
