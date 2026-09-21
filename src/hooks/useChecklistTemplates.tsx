import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Anleitungen als Checklisten-Vorlage.
 *
 * Entscheidung 10 des Umsetzungsplans: Prozesse sind Anleitungen, keine
 * eigene Aufgabenquelle. Die Schritte einer Vorlage werden zu Unterpunkten
 * EINER Karte — nicht zu einer eigenen Prozessinstanz mit eigenem Leben.
 */

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  steps?: ChecklistTemplateStep[];
}

export interface ChecklistTemplateStep {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number | null;
  suggested_offset_days: number | null;
}

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ['checklist-templates'],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const { data, error } = await supabase
        .from('process_templates')
        .select('id, name, description, steps:process_template_steps(id, template_id, title, description, sort_order, suggested_offset_days)')
        .order('name');
      if (error) throw error;
      return ((data || []) as any[]).map(t => ({
        ...t,
        steps: (t.steps || []).sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }));
    },
  });
}

/**
 * Schritte einer Anleitung als Unterpunkte an eine Aufgabe hängen.
 *
 * Der Anleitungstext wandert mit in `description` — damit er in der Karte
 * aufklappbar ist, ohne dass man die Vorlage nachschlagen muss. Und
 * `template_step_id` bleibt erhalten, damit später nachvollziehbar ist,
 * woher ein Punkt stammt.
 *
 * Bereits vorhandene Punkte werden nicht angefasst; die neuen hängen sich
 * hinten an.
 */
export async function applyChecklistTemplate(
  todoId: string,
  templateId: string,
  userId: string
): Promise<number> {
  const { data: steps, error } = await supabase
    .from('process_template_steps')
    .select('id, title, description, sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  if (!steps || steps.length === 0) return 0;

  const { data: existing } = await supabase
    .from('todo_subtasks')
    .select('sort_order, template_step_id')
    .eq('todo_id', todoId);

  const schonDa = new Set(
    ((existing || []) as any[]).map(s => s.template_step_id).filter(Boolean)
  );
  const maxSort = ((existing || []) as any[]).reduce(
    (m, s) => Math.max(m, s.sort_order ?? 0),
    -1
  );

  const neu = (steps as any[])
    .filter(s => !schonDa.has(s.id))
    .map((s, i) => ({
      todo_id: todoId,
      title: s.title,
      description: s.description,
      template_step_id: s.id,
      created_by: userId,
      sort_order: maxSort + 1 + i,
    }));

  if (neu.length === 0) return 0;

  const { error: insertError } = await supabase.from('todo_subtasks').insert(neu as any);
  if (insertError) throw insertError;
  return neu.length;
}

/** Eine Anleitung nachträglich auf einen bestehenden Zettel anwenden. */
export function useApplyChecklistTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { todoId: string; templateId: string; userId: string }) => {
      const anzahl = await applyChecklistTemplate(input.todoId, input.templateId, input.userId);
      await supabase
        .from('todos')
        .update({ checklist_template_id: input.templateId } as any)
        .eq('id', input.todoId);
      return anzahl;
    },
    onSuccess: (anzahl, input) => {
      qc.invalidateQueries({ queryKey: ['todo-subtasks', input.todoId] });
      qc.invalidateQueries({ queryKey: ['todo', input.todoId] });
      qc.invalidateQueries({ queryKey: ['board-pins'] });
      toast({
        title: anzahl > 0 ? 'Anleitung übernommen' : 'Nichts hinzugefügt',
        description:
          anzahl > 0
            ? `${anzahl} ${anzahl === 1 ? 'Punkt' : 'Punkte'} zur Checkliste hinzugefügt.`
            : 'Alle Punkte dieser Anleitung stehen schon auf dem Zettel.',
      });
    },
    onError: (e: any) =>
      toast({ title: 'Anleitung nicht übernommen', description: e.message, variant: 'destructive' }),
  });
}
