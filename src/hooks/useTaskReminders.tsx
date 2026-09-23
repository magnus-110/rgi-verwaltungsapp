import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

/**
 * Erinnerungen, bewusst getrennt von der Frist.
 *
 * Der Mahnungsfall aus dem Plan: Mahnung geht raus, in 14 Tagen soll jemand
 * den Zahlungseingang prüfen. Eine Frist wäre falsch — die Aufgabe läge
 * 14 Tage sichtbar im Weg. Mehrere Erinnerungen pro Aufgabe sind möglich.
 */

export interface TaskReminder {
  id: string;
  todo_id: string | null;
  case_id: string | null;
  user_id: string;
  remind_at: string;
  note: string | null;
  fired_at: string | null;
  created_at: string;
}

/**
 * task_reminders steht noch nicht in der generierten types.ts — die wird von
 * `npm run db:types` erzeugt. Bis zum naechsten Lauf reicht dieser enge
 * Zugriff; danach kann er ersatzlos entfallen.
 */
const reminderDb = supabase as any;

export function useTaskReminders(todoId: string | null) {
  return useQuery({
    queryKey: ['task-reminders', todoId],
    enabled: !!todoId,
    queryFn: async (): Promise<TaskReminder[]> => {
      const { data, error } = await reminderDb
        .from('task_reminders')
        .select('*')
        .eq('todo_id', todoId!)
        .order('remind_at', { ascending: true });
      if (error) throw error;
      return (data || []) as TaskReminder[];
    },
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { todoId: string; remindAt: string; note?: string | null }) => {
      const { error } = await reminderDb.from('task_reminders').insert({
        todo_id: input.todoId,
        user_id: user!.id,
        remind_at: new Date(input.remindAt).toISOString(),
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['task-reminders', input.todoId] });
      toast({ title: 'Erinnerung gesetzt' });
    },
    onError: (e: any) =>
      toast({ title: 'Erinnerung nicht gesetzt', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; todoId: string }) => {
      const { error } = await reminderDb.from('task_reminders').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, input) =>
      qc.invalidateQueries({ queryKey: ['task-reminders', input.todoId] }),
  });
}
