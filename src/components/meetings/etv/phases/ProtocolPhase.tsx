import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProtocolReadableView } from "../../ProtocolReadableView";
import { bisherigeUmsetzungen, umsetzungFelder } from "@/lib/beschlussUebertragung";
import { ProtocolDownloadButtons } from "../../ProtocolDownloadButtons";
import { EmailCampaignWizard } from "@/components/communication/EmailCampaignWizard";
import { EtvCard, EtvSectionTitle } from "../ui";
import { SignaturePanel } from "../SignaturePanel";

interface Props { meeting: any }

const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b py-3.5 last:border-0">
    <span className={cn("flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] font-bold",
      done ? "bg-emerald-700 text-white" : "border-[1.5px] border-muted-foreground/40 text-muted-foreground")}>
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
    </span>
    <div className="space-y-1.5">
      <div className="text-[15px] font-semibold">{title}</div>
      {children}
    </div>
  </div>
);

export const ProtocolPhase = ({ meeting }: Props) => {
  const meetingId = meeting.id as string;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fullscreen, setFullscreen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["etv-agenda-protocol", meetingId],
    queryFn: async () => (await supabase.from("etv_agenda_items")
      .select("id, status, resolution_text, result, yes_count, no_count, abstain_count, voting_principle, is_actionable, requires_resolution, case_id")
      .eq("meeting_id", meetingId).order("sort_order")).data || [],
  });
  const { data: resolutionCount = 0 } = useQuery({
    queryKey: ["etv-resolutions-count", meetingId],
    queryFn: async () => {
      const { count } = await supabase.from("etv_resolutions").select("id", { count: "exact", head: true }).eq("meeting_id", meetingId);
      return count || 0;
    },
  });
  const { data: signedRender } = useQuery({
    queryKey: ["etv-signed-render", meetingId, meeting.protocol_filed_at],
    queryFn: async () => (await supabase.from("etv_protocol_renders").select("storage_path, created_at").eq("meeting_id", meetingId).eq("is_signed", true).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  const decided = items.filter((i: any) => i.status === "voted" && i.requires_resolution !== false && i.resolution_text);
  const ended = meeting.status === "completed" || !!meeting.ended_at;

  const transferResolutions = async () => {
    setBusy("res");
    try {
      const year = meeting.meeting_date ? new Date(meeting.meeting_date).getFullYear() : new Date().getFullYear();
      const bisher = await bisherigeUmsetzungen(meetingId);
      const rows = decided.map((item: any, idx: number) => ({
        meeting_id: meetingId, agenda_item_id: item.id, building_id: meeting.building_id,
        resolution_number: `${year}-${idx + 1}`, resolution_text: item.resolution_text, result: item.result || "failed",
        yes_count: item.yes_count || 0, no_count: item.no_count || 0, abstain_count: item.abstain_count || 0,
        voting_principle: item.voting_principle, resolved_at: meeting.meeting_date, published: !!meeting.protocol_published,
        ...umsetzungFelder(item, bisher.get(item.id)),
      }));
      await supabase.from("etv_resolutions").delete().eq("meeting_id", meetingId);
      if (rows.length) {
        const { error } = await supabase.from("etv_resolutions").insert(rows as any);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["etv-resolutions-count", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-resolutions"] });
      toast({ title: "Beschluss-Sammlung aktualisiert", description: `${rows.length} Beschlüsse übertragen.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const setPublished = async (on: boolean) => {
    setBusy("pub");
    const { error } = await supabase.from("etv_meetings").update({ protocol_published: on }).eq("id", meetingId);
    if (!error) await supabase.from("etv_resolutions").update({ published: on }).eq("meeting_id", meetingId);
    setBusy(null);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
    toast({ title: on ? "Im Eigentümerportal sichtbar" : "Aus dem Portal entfernt" });
  };

  const downloadSigned = async () => {
    if (!signedRender?.storage_path) return;
    const { data } = await supabase.storage.from("building-files").createSignedUrl(signedRender.storage_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <EtvCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
          <span className="text-[13px] text-muted-foreground">
            {ended ? "Automatisch aus der Durchführung erstellt" : "Vorschau – die Versammlung ist noch nicht beendet"} · {items.filter((i: any) => i.status === "voted").length} von {items.length} Punkten entschieden
          </span>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setFullscreen(true)}><Maximize2 className="h-3.5 w-3.5" /> Vollbild</Button>
            <ProtocolDownloadButtons meetingId={meetingId} />
          </span>
        </div>
        <ProtocolReadableView meetingId={meetingId} compact showSignatures={false} />
      </EtvCard>

      <div className="space-y-5 xl:sticky xl:top-4">
        <EtvCard className="space-y-3.5 p-5">
          <EtvSectionTitle title="Unterschriften" sub="Versammlungsleitung, Protokollführung und ein Eigentümer (§ 24 Abs. 6 WEG). Sobald alle unterschrieben haben, wird das Protokoll automatisch abgelegt." />
          <SignaturePanel meeting={meeting} />
        </EtvCard>

        <EtvCard className="p-5">
          <EtvSectionTitle title="Abschluss" />
          <div className="mt-1">
            <Step n={1} done={resolutionCount > 0 && resolutionCount === decided.length} title="Beschluss-Sammlung">
              <p className="text-[13px] leading-snug text-muted-foreground">Unverzüglich nach der Versammlung eintragen (§ 24 Abs. 7, 8 WEG). {resolutionCount ? `${resolutionCount} eingetragen.` : "Noch nichts eingetragen."}</p>
              <Button size="sm" variant="outline" className="h-8" disabled={busy === "res" || decided.length === 0} onClick={transferResolutions}>
                {busy === "res" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {resolutionCount ? "Erneut übertragen" : `${decided.length} Beschlüsse übertragen`}
              </Button>
            </Step>
            <Step n={2} done={!!meeting.protocol_filed_at} title="Ablage in den Gebäude-Dokumenten">
              <p className="text-[13px] leading-snug text-muted-foreground">
                {meeting.protocol_filed_at
                  ? `Unterschriebenes Protokoll abgelegt am ${new Date(meeting.protocol_filed_at).toLocaleDateString("de-DE")}.`
                  : "Passiert automatisch, sobald alle unterschrieben haben."}
              </p>
              {!meeting.protocol_filed_at && (
                <button
                  type="button"
                  className="block text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    if (!confirm("Protokoll ohne Ablage in der App als erledigt markieren (z. B. außerhalb der App unterschrieben)?")) return;
                    await (supabase as any).from("etv_meetings").update({ protocol_filed_at: new Date().toISOString() }).eq("id", meetingId);
                    qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
                    qc.invalidateQueries({ queryKey: ["etv-meetings"] });
                  }}
                >
                  Außerhalb der App erledigt? Als erledigt markieren
                </button>
              )}
              {signedRender?.storage_path && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={downloadSigned}><Download className="h-3.5 w-3.5" /> Unterschriebenes PDF</Button>
              )}
            </Step>
            <Step n={3} done={!!meeting.protocol_published} title="An die Eigentümer">
              <p className="text-[13px] leading-snug text-muted-foreground">Per Rundmail mit dem Protokoll im Anhang – oder als PDF über dein E-Mail-Programm.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="h-8" onClick={() => setMailOpen(true)}>Rundmail an Eigentümer</Button>
              </div>
              <label className="flex items-center gap-2.5 pt-1 text-[13px]">
                <Switch checked={!!meeting.protocol_published} disabled={busy === "pub"} onCheckedChange={setPublished} />
                Im Eigentümerportal anzeigen
              </label>
            </Step>
          </div>
        </EtvCard>
        <p className="px-1 text-[13px] leading-relaxed text-muted-foreground">Danach ist die Versammlung abgeschlossen und liegt im Archiv. Die Umsetzung der Beschlüsse läuft in der Liegenschaft.</p>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="flex h-[95dvh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b p-4 pb-2"><DialogTitle>Protokoll</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto"><ProtocolReadableView meetingId={meetingId} showSignatures={false} /></div>
        </DialogContent>
      </Dialog>
      <EmailCampaignWizard open={mailOpen} onOpenChange={setMailOpen} buildingId={meeting.building_id} />
    </div>
  );
};
