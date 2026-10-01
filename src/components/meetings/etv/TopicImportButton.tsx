import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEtvTopics, type Topic } from "./useEtvData";
import { adoptTopic } from "./topicActions";

interface Props {
  meetingId: string;
  buildingId: string;
  votingPrinciple?: string | null;
}

const SOURCE_LABEL: Record<Topic["source"], string> = { portal: "Portal-Antrag", email: "E-Mail", note: "Notiz" };

/** Offene Themen dieser WEG mit einem Klick als Tagesordnungspunkte übernehmen. */
export const TopicImportButton = ({ meetingId, buildingId, votingPrinciple }: Props) => {
  const { data: topics = [] } = useEtvTopics();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => topics.filter((t) => t.buildingId === buildingId && (t.status === "neu" || t.status === "zurueckgestellt" || (t.status === "eingeplant" && !t.meetingId))),
    [topics, buildingId],
  );

  const run = async () => {
    setBusy(true);
    try {
      for (const t of candidates.filter((c) => sel.includes(c.key))) {
        await adoptTopic(t, {
          meetingId,
          title: t.title.replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/i, ""),
          description: t.source === "email" ? "" : t.text,
          resolution: "",
          votingPrinciple: votingPrinciple || "headcount",
          bundled: topics.filter((x) => x.mergedInto === t.key),
        });
      }
      toast({ title: `${sel.length} ${sel.length === 1 ? "Punkt" : "Punkte"} übernommen`, description: "Titel und Beschlussantrag kannst du in der Tagesordnung anpassen." });
      qc.invalidateQueries({ queryKey: ["etv-topics"] });
      qc.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-agenda-items"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 border-primary/30 bg-primary/5"
        onClick={() => { setSel(candidates.filter((c) => c.status === "eingeplant").map((c) => c.key)); setOpen(true); }}
      >
        <Inbox className="h-4 w-4" /> Themenspeicher ({candidates.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Aus dem Themenspeicher übernehmen</DialogTitle>
            <DialogDescription>Offene, zurückgestellte und vorgemerkte Themen dieser WEG. Ausgewählte werden ans Ende der Tagesordnung gestellt.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {candidates.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Keine offenen Themen für diese WEG.</p>}
            {candidates.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                <Checkbox
                  className="mt-0.5"
                  checked={sel.includes(t.key)}
                  onCheckedChange={(v) => setSel((p) => (v ? [...p, t.key] : p.filter((k) => k !== t.key)))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {SOURCE_LABEL[t.source]} · {new Date(t.date).toLocaleDateString("de-DE")}
                    {t.status === "zurueckgestellt" && ` · zurückgestellt${t.reason ? `: ${t.reason}` : ""}`}
                    {t.status === "eingeplant" && " · vorgemerkt"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={run} disabled={busy || sel.length === 0}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
