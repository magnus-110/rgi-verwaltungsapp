import { useState } from "react";
import { Phone, StickyNote, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddCaseEvent } from "@/hooks/useCases";

export const CaseQuickAdd = ({ caseId }: { caseId: string }) => {
  const [text, setText] = useState("");
  const [type, setType] = useState<"note" | "phone">("note");
  const addEvent = useAddCaseEvent();

  const submit = async () => {
    if (!text.trim()) return;
    await addEvent.mutateAsync({
      case_id: caseId,
      event_type: type,
      title: type === "phone" ? "Telefonat" : undefined,
      body: text.trim(),
    });
    setText("");
    setType("note");
  };

  return (
    <div className="space-y-2 p-3 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={type === "note" ? "default" : "ghost"} onClick={() => setType("note")}>
          <StickyNote className="h-4 w-4 mr-1" /> Notiz
        </Button>
        <Button size="sm" variant={type === "phone" ? "default" : "ghost"} onClick={() => setType("phone")}>
          <Phone className="h-4 w-4 mr-1" /> Telefonat
        </Button>
      </div>
      <Textarea
        placeholder={type === "phone" ? "Was wurde besprochen?" : "Notiz zum Vorgang..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">⌘/Strg + Enter zum Speichern</span>
        <Button size="sm" onClick={submit} disabled={!text.trim() || addEvent.isPending}>
          {addEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
