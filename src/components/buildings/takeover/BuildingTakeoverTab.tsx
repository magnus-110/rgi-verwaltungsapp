import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { TAKEOVER_SECTIONS } from "./questions";
import { QuestionRow } from "./QuestionRow";

interface Props { buildingId: string }

export const BuildingTakeoverTab = ({ buildingId }: Props) => {
  const { data: answers = [] } = useQuery({
    queryKey: ["takeover-answers", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_takeover_answers" as any)
        .select("*")
        .eq("building_id", buildingId);
      if (error) throw error;
      return data as any[];
    },
  });

  const byKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of answers) map.set(a.question_key, a);
    return map;
  }, [answers]);

  const isVisible = (q: any) => {
    if (!q.dependsOn) return true;
    const dep = byKey.get(q.dependsOn.key);
    if (!dep) return false;
    const depVal = dep.value_bool ?? dep.value_text ?? dep.value_number ?? dep.value_date;
    if ("equals" in q.dependsOn) return depVal === q.dependsOn.equals;
    if ("notEquals" in q.dependsOn) return depVal != null && depVal !== q.dependsOn.notEquals;
    if ("in" in q.dependsOn) return Array.isArray(q.dependsOn.in) && q.dependsOn.in.includes(depVal);
    return false;
  };

  const visibleSections = TAKEOVER_SECTIONS.map((sec) => ({
    ...sec,
    questions: sec.questions.filter(isVisible),
  }));

  const totalQuestions = visibleSections.reduce((s, sec) => s + sec.questions.length, 0);
  const visibleKeys = new Set(visibleSections.flatMap((s) => s.questions.map((q) => q.key)));
  const answered = answers.filter((a) => visibleKeys.has(a.question_key) && (a.status === "answered" || a.status === "applied")).length;
  const applied = answers.filter((a) => visibleKeys.has(a.question_key) && a.status === "applied").length;
  const pct = totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Verwalter-Übernahme
              </CardTitle>
              <CardDescription>
                Fragenkatalog für die Übergabe vom Vorverwalter bzw. der Eigentümergemeinschaft.
                Antworten können pro Frage direkt in die zuständige Stelle (Stammdaten, Dienstleister, Notizen) übernommen werden.
              </CardDescription>
            </div>
            <div className="text-right space-y-1 flex-shrink-0">
              <Badge variant="secondary">{answered}/{totalQuestions} beantwortet</Badge>
              <div className="text-xs text-muted-foreground">{applied} übernommen</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={pct} />
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={TAKEOVER_SECTIONS.map((s) => s.key)} className="space-y-2">
        {visibleSections.map((section) => {
          const sectionAnswered = section.questions.filter((q) => {
            const a = byKey.get(q.key);
            return a && (a.status === "answered" || a.status === "applied");
          }).length;
          return (
            <AccordionItem key={section.key} value={section.key} className="border rounded-md bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{section.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {sectionAnswered}/{section.questions.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2">
                  {section.questions.map((q) => (
                    <QuestionRow
                      key={q.key}
                      buildingId={buildingId}
                      section={section.key}
                      question={q}
                      existing={byKey.get(q.key) ?? null}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
