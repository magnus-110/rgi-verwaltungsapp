import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Circle, CheckCircle2 } from "lucide-react";
import { applyAnswer } from "./applyHandlers";
import type { TakeoverQuestion } from "./questions";

interface Props {
  buildingId: string;
  section: string;
  question: TakeoverQuestion;
  existing: any | null;
}

export const QuestionRow = ({ buildingId, section, question, existing }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState<string>(existing?.value_text ?? "");
  const [num, setNum] = useState<string>(existing?.value_number?.toString() ?? "");
  const [date, setDate] = useState<string>(existing?.value_date ?? "");
  const [bool, setBool] = useState<boolean>(existing?.value_bool ?? false);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setText(existing?.value_text ?? "");
    setNum(existing?.value_number?.toString() ?? "");
    setDate(existing?.value_date ?? "");
    setBool(existing?.value_bool ?? false);
    setNotes(existing?.notes ?? "");
  }, [existing?.id]);

  const status: "open" | "answered" | "applied" = existing?.status ?? "open";

  const buildValues = () => ({
    value_text: question.type === "text" || question.type === "textarea" ? (text.trim() || null) : null,
    value_number: question.type === "number" ? (num.trim() === "" ? null : Number(num)) : null,
    value_date: question.type === "date" ? (date || null) : null,
    value_bool: question.type === "bool" ? bool : null,
    notes: notes.trim() || null,
  });

  const upsert = async (status: "answered" | "applied", applied_to?: string) => {
    const { data: user } = await supabase.auth.getUser();
    const payload: any = {
      building_id: buildingId,
      section,
      question_key: question.key,
      ...buildValues(),
      status,
      applied_to: applied_to ?? existing?.applied_to ?? null,
      applied_at: status === "applied" ? new Date().toISOString() : existing?.applied_at ?? null,
      created_by: existing?.created_by ?? user.user?.id ?? null,
    };
    const { error } = await supabase
      .from("building_takeover_answers" as any)
      .upsert(payload, { onConflict: "building_id,question_key" });
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert("answered");
      toast({ title: "Gespeichert" });
      qc.invalidateQueries({ queryKey: ["takeover-answers", buildingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!question.apply) return;
    setApplying(true);
    try {
      const applied_to = await applyAnswer(buildingId, question, buildValues());
      await upsert("applied", applied_to);
      toast({ title: "Übernommen", description: applied_to });
      qc.invalidateQueries({ queryKey: ["takeover-answers", buildingId] });
    } catch (e: any) {
      toast({ title: "Übernahme fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {status === "applied" ? (
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
            ) : status === "answered" ? (
              <Check className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="text-sm font-medium">{question.label}</div>
            {status === "applied" && <Badge variant="secondary" className="text-[10px]">übernommen</Badge>}
            {status === "answered" && <Badge variant="outline" className="text-[10px]">beantwortet</Badge>}
          </div>
          {question.hint && <div className="text-xs text-muted-foreground mt-0.5">{question.hint}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {question.type === "text" && (
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort" />
        )}
        {question.type === "textarea" && (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort" className="md:col-span-2" rows={2} />
        )}
        {question.type === "number" && (
          <Input type="number" value={num} onChange={(e) => setNum(e.target.value)} placeholder="0" />
        )}
        {question.type === "date" && (
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        {question.type === "bool" && (
          <div className="flex items-center gap-2">
            <Switch checked={bool} onCheckedChange={setBool} />
            <span className="text-sm text-muted-foreground">{bool ? "Ja" : "Nein"}</span>
          </div>
        )}
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notiz (optional)" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Speichern
        </Button>
        {question.apply && (
          <Button size="sm" onClick={handleApply} disabled={applying}>
            {applying && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Übernehmen
          </Button>
        )}
      </div>
    </div>
  );
};
