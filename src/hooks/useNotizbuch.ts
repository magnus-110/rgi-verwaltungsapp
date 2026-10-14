import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Notizbuch — die Datenschicht.
 *
 * Eine Notiz gehört zu einem Gebäude ODER zu einem Bereich. Eine
 * Gebäude-Notiz kann zusätzlich einen Bereich als Thema haben (ETV,
 * Buchhaltung, Technik …). Bereiche gelten für alle Gebäude und werden
 * selbst angelegt.
 *
 * Wer was sehen und ändern darf, entscheidet die Datenbank (RLS):
 * „für alle" = das ganze Büro, „nur für mich" = nur der Ersteller.
 */

// Die neuen Tabellen stehen noch nicht in den erzeugten Typen.
const db = supabase as any;

export const NOTIZBUCH_BUCKET = 'notebook';
export const NOTIZEN_KEY = ['notebook-notes'] as const;
export const BEREICHE_KEY = ['notebook-areas'] as const;

/** Größte Datei, die man an eine Notiz hängen kann. */
export const ANHANG_MAX_BYTES = 50 * 1024 * 1024;

/** Farben, aus denen man beim Anlegen eines Bereichs wählt. */
export const BEREICH_FARBEN = [
  { name: 'Orange', hex: '#d6650b' },
  { name: 'Grün', hex: '#3f8a6c' },
  { name: 'Blau', hex: '#3e6ea8' },
  { name: 'Lila', hex: '#8a5cb0' },
  { name: 'Ocker', hex: '#8a7a55' },
  { name: 'Rot', hex: '#b5483a' },
  { name: 'Grau', hex: '#6b6869' },
];

export interface NotizBereich {
  id: string;
  name: string;
  color: string;
}

export interface NotizAnhang {
  id: string;
  note_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface Notiz {
  id: string;
  title: string;
  content: string;
  area_id: string | null;
  building_id: string | null;
  is_private: boolean;
  pinned: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  anhaenge: NotizAnhang[];
}

export interface GebaeudeKurz {
  id: string;
  name: string;
}

export function istBild(a: Pick<NotizAnhang, 'mime_type' | 'file_name'>) {
  return (a.mime_type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.file_name);
}

/** Text ohne HTML — für Vorschau und Suche. */
export function nurText(html: string) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------ Laden

export function useNotizBereiche() {
  return useQuery({
    queryKey: BEREICHE_KEY,
    queryFn: async (): Promise<NotizBereich[]> => {
      const { data, error } = await db
        .from('notebook_areas')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return (data || []) as NotizBereich[];
    },
  });
}

export function useNotizen() {
  return useQuery({
    queryKey: NOTIZEN_KEY,
    queryFn: async (): Promise<Notiz[]> => {
      const { data, error } = await db
        .from('notebook_notes')
        .select(
          'id, title, content, area_id, building_id, is_private, pinned, created_by, updated_by, created_at, updated_at, anhaenge:notebook_attachments(id, note_id, file_path, file_name, mime_type, file_size, created_at)',
        )
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).map(n => ({
        ...n,
        anhaenge: ((n.anhaenge || []) as NotizAnhang[]).sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      }));
    },
  });
}

export function useNotizGebaeude() {
  return useQuery({
    queryKey: ['notebook-buildings'],
    queryFn: async (): Promise<GebaeudeKurz[]> => {
      const { data, error } = await supabase.from('buildings').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as GebaeudeKurz[];
    },
  });
}

/** Namen der Kollegen, für „geändert von …". */
export function useNotizPersonen() {
  return useQuery({
    queryKey: ['notebook-people'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('role', ['admin', 'employee']);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of (data || []) as any[]) {
        map[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbenannt';
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ------------------------------------------------------------------ Bereiche

export function useBereichAktionen() {
  const qc = useQueryClient();
  const neuLaden = () => qc.invalidateQueries({ queryKey: BEREICHE_KEY });

  const anlegen = useMutation({
    mutationFn: async (input: { name: string; color: string }): Promise<NotizBereich> => {
      const name = input.name.trim();
      if (!name) throw new Error('Bitte einen Namen eingeben');
      const { data, error } = await db
        .from('notebook_areas')
        .insert({ name, color: input.color })
        .select('id, name, color')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('Diesen Bereich gibt es schon');
        throw error;
      }
      return data as NotizBereich;
    },
    onSuccess: () => {
      neuLaden();
      toast.success('Bereich angelegt');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Bereich nicht angelegt'),
  });

  const aendern = useMutation({
    mutationFn: async (input: { id: string; name: string; color: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error('Bitte einen Namen eingeben');
      const { error } = await db
        .from('notebook_areas')
        .update({ name, color: input.color })
        .eq('id', input.id);
      if (error) {
        if (error.code === '23505') throw new Error('Diesen Namen gibt es schon');
        throw error;
      }
    },
    onSuccess: () => {
      neuLaden();
      toast.success('Gespeichert');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Nicht gespeichert'),
  });

  const loeschen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('notebook_areas').delete().eq('id', id);
      if (error) {
        // Fremdschlüssel: es hängen noch Notizen dran
        if (error.code === '23503') {
          throw new Error('In diesem Bereich liegen noch Notizen. Bitte erst verschieben.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      neuLaden();
      toast.success('Bereich gelöscht');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Nicht gelöscht'),
  });

  return { anlegen, aendern, loeschen };
}

// ------------------------------------------------------------------ Notizen

export interface NotizEingabe {
  title: string;
  content: string;
  area_id: string | null;
  building_id: string | null;
  is_private: boolean;
  pinned: boolean;
}

export function useNotizAktionen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const neuLaden = () => qc.invalidateQueries({ queryKey: NOTIZEN_KEY });

  const pruefen = (n: NotizEingabe) => {
    if (!n.title.trim()) throw new Error('Bitte einen Titel eingeben');
    if (!n.area_id && !n.building_id) {
      throw new Error('Bitte ein Gebäude oder einen Bereich wählen');
    }
  };

  const anlegen = useMutation({
    mutationFn: async (n: NotizEingabe): Promise<string> => {
      if (!user?.id) throw new Error('Nicht angemeldet');
      pruefen(n);
      const { data, error } = await db
        .from('notebook_notes')
        .insert({ ...n, title: n.title.trim(), created_by: user.id, updated_by: user.id })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => neuLaden(),
    onError: (e: any) => toast.error(e?.message ?? 'Notiz nicht angelegt'),
  });

  const speichern = useMutation({
    mutationFn: async (input: { id: string } & NotizEingabe) => {
      pruefen(input);
      const { id, ...rest } = input;
      const { error } = await db
        .from('notebook_notes')
        .update({ ...rest, title: rest.title.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => neuLaden(),
    onError: (e: any) => toast.error(e?.message ?? 'Notiz nicht gespeichert'),
  });

  const anheften = useMutation({
    mutationFn: async (input: { id: string; pinned: boolean }) => {
      const { error } = await db
        .from('notebook_notes')
        .update({ pinned: input.pinned })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => neuLaden(),
    onError: (e: any) => toast.error(e?.message ?? 'Nicht geändert'),
  });

  const loeschen = useMutation({
    mutationFn: async (notiz: Notiz) => {
      const pfade = notiz.anhaenge.map(a => a.file_path);
      const { error } = await db.from('notebook_notes').delete().eq('id', notiz.id);
      if (error) throw error;
      if (pfade.length) await supabase.storage.from(NOTIZBUCH_BUCKET).remove(pfade);
    },
    onSuccess: () => {
      neuLaden();
      toast.success('Notiz gelöscht');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Notiz nicht gelöscht'),
  });

  return { anlegen, speichern, anheften, loeschen };
}

// ------------------------------------------------------------------ Anhänge

function sichererDateiname(name: string) {
  const sauber = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_');
  return sauber.slice(-120) || 'datei';
}

/** Name für ein eingefügtes Bildschirmfoto ohne eigenen Namen. */
export function bildschirmfotoName(file: File) {
  if (file.name && file.name !== 'image.png') return file.name;
  const jetzt = new Date();
  const zwei = (n: number) => String(n).padStart(2, '0');
  const endung = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return `Bildschirmfoto ${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())} ${zwei(jetzt.getHours())}.${zwei(jetzt.getMinutes())}.${endung}`;
}

export function useAnhangAktionen() {
  const qc = useQueryClient();
  const neuLaden = () => qc.invalidateQueries({ queryKey: NOTIZEN_KEY });

  const hochladen = useMutation({
    mutationFn: async (input: { noteId: string; files: File[] }) => {
      let ok = 0;
      for (const file of input.files) {
        if (file.size > ANHANG_MAX_BYTES) {
          toast.error(`${file.name} ist zu groß (höchstens 50 MB)`);
          continue;
        }
        const name = bildschirmfotoName(file);
        const path = `${input.noteId}/${crypto.randomUUID()}/${sichererDateiname(name)}`;
        try {
          const { error: upErr } = await supabase.storage
            .from(NOTIZBUCH_BUCKET)
            .upload(path, file, { contentType: file.type || 'application/octet-stream' });
          if (upErr) throw upErr;
          const { error } = await db.from('notebook_attachments').insert({
            note_id: input.noteId,
            file_path: path,
            file_name: name,
            mime_type: file.type || null,
            file_size: file.size,
          });
          if (error) {
            await supabase.storage.from(NOTIZBUCH_BUCKET).remove([path]);
            throw error;
          }
          ok++;
        } catch (e: any) {
          toast.error(`${name}: ${e?.message ?? 'konnte nicht hochgeladen werden'}`);
        }
      }
      return ok;
    },
    onSuccess: ok => {
      neuLaden();
      if (ok) toast.success(ok === 1 ? 'Datei angehängt' : `${ok} Dateien angehängt`);
    },
  });

  const loeschen = useMutation({
    mutationFn: async (a: NotizAnhang) => {
      const { error } = await db.from('notebook_attachments').delete().eq('id', a.id);
      if (error) throw error;
      await supabase.storage.from(NOTIZBUCH_BUCKET).remove([a.file_path]);
    },
    onSuccess: () => neuLaden(),
    onError: (e: any) => toast.error(e?.message ?? 'Datei nicht entfernt'),
  });

  return { hochladen, loeschen };
}

/** Kurzlebige Links für die Bilder einer Notiz (Speicher ist privat). */
export function useAnhangLinks(anhaenge: NotizAnhang[]) {
  const pfade = anhaenge.map(a => a.file_path);
  return useQuery({
    queryKey: ['notebook-attachment-urls', pfade],
    enabled: pfade.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(NOTIZBUCH_BUCKET)
        .createSignedUrls(pfade, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data || []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
    staleTime: 50 * 60 * 1000,
  });
}

export async function anhangHerunterladen(a: NotizAnhang) {
  const { data, error } = await supabase.storage.from(NOTIZBUCH_BUCKET).download(a.file_path);
  if (error || !data) {
    toast.error('Datei konnte nicht geladen werden');
    return;
  }
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.file_name || 'datei';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
