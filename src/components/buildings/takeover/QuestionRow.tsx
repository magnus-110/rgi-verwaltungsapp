import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Circle, CheckCircle2 } from "lucide-react";
import { applyAnswer } from "./applyHandlers";
import { VoiceInputButton } from "@/components/shared/VoiceInputButton";
import { cn } from "@/lib/utils";
import type { TakeoverQuestion } from "./questions";

interface Props {
  buildingId: string;
  section: string;
  question: TakeoverQuestion;
  existing: any | null;
}

const OTHER = "__other__";

export const QuestionRow = ({ buildingId, section, question, existing }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState<string>(existing?.value_text ?? "");
  const [num, setNum] = useState<string>(existing?.value_number?.toString() ?? "");
  const [date, setDate] = useState<string>(existing?.value_date ?? "");
  const [bool, setBool] = useState<boolean | null>(existing?.value_bool ?? null);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setText(existing?.value_text ?? "");
    setNum(existing?.value_number?.toString() ?? "");
    setDate(existing?.value_date ?? "");
    setBool(existing?.value_bool ?? null);
    setNotes(existing?.notes ?? "");
  }, [existing?.id]);

  const status: "open" | "answered" | "applied" = existing?.status ?? "open";

  const buildValues = (overrides?: { text?: string | null; bool?: boolean | null }) => {
    const t = overrides?.text !== undefined ? overrides.text : text;
    const b = overrides?.bool !== undefined ? overrides.bool : bool;
    const isTextLike = question.type === "text" || question.type === "textarea" || question.type === "select" || question.type === "multiselect";
    return {
      value_text: isTextLike ? ((t ?? "").toString().trim() || null) : null,
      value_number: question.type === "number" ? (num.trim() === "" ? null : Number(num)) : null,
      value_date: question.type === "date" ? (date || null) : null,
      value_bool: question.type === "bool" ? b : null,
      notes: notes.trim() || null,
    };
  };

  const upsert = async (
    nextStatus: "answered" | "applied",
    applied_to?: string,
    overrides?: { text?: string | null; bool?: boolean | null },
  ) => {
    const { data: user } = await supabase.auth.getUser();
    const payload: any = {
      building_id: buildingId,
      section,
      question_key: question.key,
      ...buildValues(overrides),
      status: nextStatus,
      applied_to: applied_to ?? existing?.applied_to ?? null,
      applied_at: nextStatus === "applied" ? new Date().toISOString() : existing?.applied_at ?? null,
      created_by: existing?.created_by ?? user.user?.id ?? null,
    };
    const { error } = await supabase
      .from("building_takeover_answers" as any)
      .upsert(payload, { onConflict: "building_id,question_key" });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["takeover-answers", buildingId] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert("answered");
      toast({ title: "Gespeichert" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!existing?.id) return;
    setClearing(true);
    try {
      const { error } = await supabase
        .from("building_takeover_answers" as any)
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      setText(""); setNum(""); setDate(""); setBool(null); setNotes("");
      toast({ title: "Geleert" });
      qc.invalidateQueries({ queryKey: ["takeover-answers", buildingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  const handleApply = async () => {
    if (!question.apply) return;
    setApplying(true);
    try {
      const applied_to = await applyAnswer(buildingId, question, buildValues());
      await upsert("applied", applied_to);
      toast({ title: "Übernommen", description: applied_to });
    } catch (e: any) {
      toast({ title: "Übernahme fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  // Auto-save handlers for click-based inputs
  const handleBoolClick = async (v: boolean) => {
    setBool(v);
    try {
      await upsert("answered", undefined, { bool: v });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleSelectClick = async (opt: string) => {
    if (opt === OTHER) {
      setText("");
      return;
    }
    setText(opt);
    try {
      await upsert("answered", undefined, { text: opt });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleMultiToggle = async (opt: string) => {
    const current = (() => {
      try { return JSON.parse(text || "[]"); } catch { return []; }
    })() as string[];
    const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
    const value = JSON.stringify(next);
    setText(value);
    try {
      await upsert("answered", undefined, { text: value });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const multiSelected: string[] = (() => {
    if (question.type !== "multiselect") return [];
    try { return JSON.parse(text || "[]"); } catch { return []; }
  })();

  const isClickType = question.type === "bool" || question.type === "select" || question.type === "multiselect";
  const showOtherInput = question.type === "select" && question.allowOther && text && !(question.options ?? []).includes(text);

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
          <div className="flex items-center gap-1">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort" className="flex-1" />
            <VoiceInputButton contextHint={question.label} appendMode currentValue={text} onResult={setText} />
          </div>
        )}
        {question.type === "textarea" && (
          <div className="md:col-span-2 flex items-start gap-1">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort" rows={2} className="flex-1" />
            <VoiceInputButton contextHint={question.label} appendMode currentValue={text} onResult={setText} />
          </div>
        )}
        {question.type === "number" && (
          <Input type="number" value={num} onChange={(e) => setNum(e.target.value)} placeholder="0" />
        )}
        {question.type === "date" && (
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        {question.type === "bool" && (
          <div className="md:col-span-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={bool === true ? "default" : "outline"}
              className={cn("flex-1", bool === true && "bg-green-600 hover:bg-green-700")}
              onClick={() => handleBoolClick(true)}
            >
              Ja
            </Button>
            <Button
              type="button"
              size="sm"
              variant={bool === false ? "default" : "outline"}
              className={cn("flex-1", bool === false && "bg-red-600 hover:bg-red-700")}
              onClick={() => handleBoolClick(false)}
            >
              Nein
            </Button>
          </div>
        )}
        {question.type === "select" && (
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(question.options ?? []).map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  size="sm"
                  variant={text === opt ? "default" : "outline"}
                  onClick={() => handleSelectClick(opt)}
                >
                  {opt}
                </Button>
              ))}
              {question.allowOther && (
                <Button
                  type="button"
                  size="sm"
                  variant={showOtherInput ? "default" : "outline"}
                  onClick={() => handleSelectClick(OTHER)}
                >
                  Anderes…
                </Button>
              )}
            </div>
            {showOtherInput && (
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Bitte angeben"
                onBlur={handleSave}
              />
            )}
          </div>
        )}
        {question.type === "multiselect" && (
          <div className="md:col-span-2 flex flex-wrap gap-1.5">
            {(question.options ?? []).map((opt) => (
              <Button
                key={opt}
                type="button"
                size="sm"
                variant={multiSelected.includes(opt) ? "default" : "outline"}
                onClick={() => handleMultiToggle(opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 md:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notiz (optional)" className="flex-1" />
          <VoiceInputButton contextHint={`Notiz zu: ${question.label}`} appendMode currentValue={notes} onResult={setNotes} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {existing?.id && (
          <Button size="sm" variant="ghost" onClick={handleClear} disabled={clearing} className="text-muted-foreground">
            {clearing && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Leeren
          </Button>
        )}
        {!isClickType && (
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Speichern
          </Button>
        )}
        {isClickType && notes.trim() && notes !== (existing?.notes ?? "") && (
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Notiz speichern
          </Button>
        )}
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
