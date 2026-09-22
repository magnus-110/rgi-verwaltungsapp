import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { boardDb } from '@/integrations/supabase/board';
import { useAuth } from '@/hooks/useAuth';

/**
 * Der Posteingang der Glocke.
 *
 * Anders als notification_log (ein Dedup-Protokoll für Push) ist das hier eine
 * echte Liste mit Gelesen-Status. Geschrieben wird sie von der App beim
 * Auslösen — nur die App weiß, ob beim Hinlegen "still" gewählt war.
 */

export type NotificationType =
  | 'pin_assigned'
  | 'pin_returned'
  | 'subtask_done'
  | 'comment'
  | 'reminder'
  | 'case_email'
  | 'review_due'
  | 'deadline';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_user_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications(limit = 50) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await boardDb
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as AppNotification[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter(n => !n.read_at).length;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await boardDb
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { error } = await boardDb
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user!.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

/**
 * Was meldet sich bei mir?
 *
 * Fünf Schalter, hinter denen sieben Spalten stecken: „Rückmeldungen auf
 * meine Zettel" fasst Kommentar, abgehakter Unterpunkt und zurückgegebener
 * Zettel zusammen — für den, der es einstellt, ist das eine Sache.
 */
export type MeldungSchalter =
  | 'neue_emails'
  | 'neue_zettel'
  | 'rueckmeldungen'
  | 'erinnerungen'
  | 'durchsicht';

/** Welche Spalten hinter einem Schalter stehen. */
export const SCHALTER_SPALTEN: Record<MeldungSchalter, string[]> = {
  neue_emails: ['notify_case_email'],
  neue_zettel: ['notify_pin_assigned'],
  rueckmeldungen: ['notify_comment', 'notify_subtask_done', 'notify_pin_returned'],
  erinnerungen: ['notify_reminder'],
  durchsicht: ['notify_review_due'],
};

export const SCHALTER_TEXT: Record<MeldungSchalter, string> = {
  neue_emails: 'Neue E-Mails',
  neue_zettel: 'Neue Aufgaben (Zettel)',
  rueckmeldungen: 'Rückmeldungen auf meine Zettel',
  erinnerungen: 'Erinnerungen vom Kalender',
  durchsicht: 'Wöchentliche Durchsicht der Vorgänge',
};

/** Kleingedrucktes unter einem Schalter, wo der Name allein zu knapp ist. */
export const SCHALTER_ZUSATZ: Partial<Record<MeldungSchalter, string>> = {
  neue_zettel: 'nur die, die dir jemand anderes hinlegt',
};

export const SCHALTER_REIHENFOLGE: MeldungSchalter[] = [
  'neue_emails',
  'neue_zettel',
  'rueckmeldungen',
  'erinnerungen',
  'durchsicht',
];

export type MeldungsEinstellungen = Record<MeldungSchalter, boolean>;

/** Standard, solange niemand etwas eingestellt hat — wie in der Tabelle. */
const STANDARD: MeldungsEinstellungen = {
  neue_emails: false,
  neue_zettel: true,
  rueckmeldungen: true,
  erinnerungen: true,
  durchsicht: true,
};

export function useNotificationPrefs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-prefs', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<MeldungsEinstellungen> => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!data) return STANDARD;

      const zeile = data as any;
      const wert = (schalter: MeldungSchalter) => {
        const spalten = SCHALTER_SPALTEN[schalter];
        // An, sobald eine der dahinterliegenden Spalten an ist.
        return spalten.some(s => zeile[s] !== false);
      };

      return {
        // E-Mails sind der einzige Schalter, der standardmaessig aus ist —
        // sonst meldet sich die Glocke bei jeder eingehenden Nachricht.
        neue_emails: zeile.notify_case_email === true,
        neue_zettel: wert('neue_zettel'),
        rueckmeldungen: wert('rueckmeldungen'),
        erinnerungen: wert('erinnerungen'),
        durchsicht: wert('durchsicht'),
      };
    },
  });
}

export function useSetNotificationPref() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { schalter: MeldungSchalter; an: boolean }) => {
      const felder: Record<string, boolean> = {};
      SCHALTER_SPALTEN[input.schalter].forEach(s => {
        felder[s] = input.an;
      });

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user!.id, ...felder } as any, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-prefs', user?.id] }),
  });
}

/**
 * Eine Benachrichtigung schreiben. Nie an den Auslöser selbst, und nie,
 * wenn der Empfänger diesen Typ abgeschaltet hat.
 */
export async function createNotification(input: {
  userId: string;
  actorUserId: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  url?: string | null;
  refType?: string | null;
  refId?: string | null;
  /** true = "still hinlegen": es wird nichts geschrieben. */
  silent?: boolean;
}) {
  if (input.silent) return;
  if (input.userId === input.actorUserId) return;

  const prefColumn: Partial<Record<NotificationType, string>> = {
    pin_assigned: 'notify_pin_assigned',
    pin_returned: 'notify_pin_returned',
    subtask_done: 'notify_subtask_done',
    comment: 'notify_comment',
    reminder: 'notify_reminder',
    case_email: 'notify_case_email',
    review_due: 'notify_review_due',
  };

  const col = prefColumn[input.type];
  if (col) {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(col)
      .eq('user_id', input.userId)
      .maybeSingle();
    // Keine Zeile = Standardwerte der Tabelle greifen, also senden.
    if (prefs && (prefs as any)[col] === false) return;
  }

  await boardDb.from('notifications').insert({
    user_id: input.userId,
    actor_user_id: input.actorUserId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    url: input.url ?? null,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
  });
}
