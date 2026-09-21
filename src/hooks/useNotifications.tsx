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
