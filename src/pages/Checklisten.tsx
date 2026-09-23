import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useChecklistTemplates,
  ChecklistTemplate,
  ChecklistTemplateStep,
} from '@/hooks/useChecklistTemplates';

/**
 * Anleitungen.
 *
 * Entscheidung 10 des Umsetzungsplans: Prozesse sind Anleitungen, keine
 * eigene Aufgabenquelle. Hier wird gepflegt, was später als Checkliste auf
 * einer Aufgabe landet — mit Erklärtext je Schritt, damit niemand nachschlagen
 * muss.
 */
export default function Checklisten() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: anleitungen = [], isLoading } = useChecklistTemplates();

  const [offen, setOffen] = useState<Record<string, boolean>>({});
  const [neueAnleitung, setNeueAnleitung] = useState('');
  const [neuerSchritt, setNeuerSchritt] = useState<Record<string, string>>({});
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [text, setText] = useState('');

  const neuLaden = () => qc.invalidateQueries({ queryKey: ['checklist-templates'] });

  const anlegen = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('process_templates')
        .insert({ name, created_by: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      neuLaden();
      setNeueAnleitung('');
      toast({ title: 'Anleitung angelegt' });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht angelegt', description: e.message, variant: 'destructive' }),
  });

  const schrittAnlegen = useMutation({
    mutationFn: async (input: { templateId: string; title: string; position: number }) => {
      const { error } = await supabase.from('process_template_steps').insert({
        template_id: input.templateId,
        title: input.title,
        position: input.position,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      neuLaden();
      setNeuerSchritt(s => ({ ...s, [input.templateId]: '' }));
    },
    onError: (e: any) =>
      toast({ title: 'Schritt nicht angelegt', description: e.message, variant: 'destructive' }),
  });

  const schrittText = useMutation({
    mutationFn: async (input: { id: string; description: string }) => {
      const { error } = await supabase
        .from('process_template_steps')
        .update({ description: input.description || null } as any)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      neuLaden();
      setBearbeite(null);
      toast({ title: 'Erklärtext gespeichert' });
    },
    onError: (e: any) =>
      toast({ title: 'Nicht gespeichert', description: e.message, variant: 'destructive' }),
  });

  const schrittLoeschen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('process_template_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: neuLaden,
    onError: (e: any) =>
      toast({ title: 'Nicht gelöscht', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-semibold text-foreground">Anleitungen</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Was hier steht, lässt sich auf jeder Aufgabe als Checkliste übernehmen — mit Erklärtext zum
          Aufklappen. Aufgaben entstehen hier nicht.
        </p>
      </div>

      <div className="flex max-w-[520px] gap-2">
        <Input
          placeholder="Neue Anleitung, z. B. „Eigentümerwechsel WEG“"
          value={neueAnleitung}
          onChange={e => setNeueAnleitung(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && neueAnleitung.trim()) anlegen.mutate(neueAnleitung.trim());
          }}
        />
        <Button
          disabled={!neueAnleitung.trim() || anlegen.isPending}
          onClick={() => anlegen.mutate(neueAnleitung.trim())}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Anlegen
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-[72px]" />
          <Skeleton className="h-[72px]" />
        </div>
      )}

      {!isLoading && anleitungen.length === 0 && (
        <p className="py-12 text-center text-[13px] text-muted-foreground">
          Noch keine Anleitung angelegt.
        </p>
      )}

      <div className="space-y-3">
        {anleitungen.map((a: ChecklistTemplate) => {
          const auf = !!offen[a.id];
          const schritte = a.steps ?? [];

          return (
            <section key={a.id} className="rounded-[11px] border border-border bg-card">
              <button
                type="button"
                onClick={() => setOffen(o => ({ ...o, [a.id]: !auf }))}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <span className="text-[14.5px] font-semibold text-foreground">{a.name}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {schritte.length} {schritte.length === 1 ? 'Schritt' : 'Schritte'}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {auf ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {auf && (
                <div className="border-t border-border px-4 py-3">
                  {a.description && (
                    <p className="mb-3 text-[12.5px] text-muted-foreground">{a.description}</p>
                  )}

                  <div className="space-y-1">
                    {schritte.map((s: ChecklistTemplateStep, i: number) => (
                      <div key={s.id} className="group rounded-lg px-2 py-2 hover:bg-muted/50">
                        <div className="flex items-start gap-2">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                          <span className="mt-[1px] w-5 shrink-0 text-[12px] text-muted-foreground">
                            {i + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block text-[13.5px] text-foreground">{s.title}</span>

                            {bearbeite === s.id ? (
                              <div className="mt-2 space-y-2">
                                <Textarea
                                  value={text}
                                  onChange={e => setText(e.target.value)}
                                  rows={4}
                                  placeholder="Was muss man hier wissen? Dieser Text steht später aufklappbar auf der Aufgabe."
                                  className="text-[12.5px]"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      schrittText.mutate({ id: s.id, description: text.trim() })
                                    }
                                  >
                                    Speichern
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setBearbeite(null)}
                                  >
                                    Abbrechen
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              s.description && (
                                <p className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">
                                  {s.description}
                                </p>
                              )
                            )}
                          </div>

                          {bearbeite !== s.id && (
                            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setBearbeite(s.id);
                                  setText(s.description || '');
                                }}
                                aria-label={`Erklärtext für „${s.title}“ bearbeiten`}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                              <button
                                type="button"
                                onClick={() => schrittLoeschen.mutate(s.id)}
                                aria-label={`Schritt „${s.title}“ löschen`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <Input
                      placeholder="Schritt hinzufügen …"
                      value={neuerSchritt[a.id] ?? ''}
                      onChange={e => setNeuerSchritt(s => ({ ...s, [a.id]: e.target.value }))}
                      onKeyDown={e => {
                        const wert = (neuerSchritt[a.id] ?? '').trim();
                        if (e.key === 'Enter' && wert) {
                          schrittAnlegen.mutate({
                            templateId: a.id,
                            title: wert,
                            position: schritte.length,
                          });
                        }
                      }}
                      className="h-9 text-[13px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!(neuerSchritt[a.id] ?? '').trim()}
                      onClick={() =>
                        schrittAnlegen.mutate({
                          templateId: a.id,
                          title: (neuerSchritt[a.id] ?? '').trim(),
                          position: schritte.length,
                        })
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="pt-2 text-[12px] text-muted-foreground">
        Eine Anleitung übernimmst du auf einer Aufgabe unter „Anleitung" — die Schritte werden dort
        zu Unterpunkten dieser einen Karte.{' '}
        <button
          type="button"
          onClick={() => navigate('/pinnwand')}
          className="text-primary hover:underline"
        >
          Zur Pinnwand
        </button>
      </p>
    </div>
  );
}
