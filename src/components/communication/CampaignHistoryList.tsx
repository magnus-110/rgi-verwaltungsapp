import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Mail, Download, AlertCircle, CheckCircle2, Clock, RefreshCcw, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { buildingId: string; }

export const CampaignHistoryList = ({ buildingId }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["comm-campaigns", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comm_campaigns")
        .select("*").eq("building_id", buildingId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("comm-assets").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) { toast({ title: "Download fehlgeschlagen", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const retry = async (c: any) => {
    if (!confirm(`Fehlgeschlagene Empfänger (${c.failed_count}) erneut anschreiben?`)) return;
    const { error } = await supabase.functions.invoke("comm-send-bulk-email", {
      body: { campaign_id: c.id, retry_failed_only: true },
    });
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Wiederholung gestartet" });
    qc.invalidateQueries({ queryKey: ["comm-campaigns", buildingId] });
  };

  const cancelScheduled = async (c: any) => {
    if (!confirm("Geplanten Versand abbrechen?")) return;
    await supabase.from("comm_campaigns").update({ status: "draft", scheduled_at: null }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["comm-campaigns", buildingId] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Laden...</p>;
  if (campaigns.length === 0) {
    return <p className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded">Noch keine Kampagnen erstellt.</p>;
  }

  return (
    <div className="space-y-2">
      {campaigns.map((c: any) => {
        const dt = new Date(c.created_at).toLocaleString("de-DE");
        const isLetter = c.type === "letter";
        return (
          <Card key={c.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg flex-shrink-0">
                {isLetter ? <FileText className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{c.name}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {dt} · {c.recipient_count} Empfänger · {c.sent_count} ok · {c.failed_count} fehlgeschlagen
                </div>
                {c.error_message && (
                  <div className="text-xs text-destructive mt-1 truncate">{c.error_message}</div>
                )}
                {c.scheduled_at && c.status === "scheduled" && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> Geplant: {new Date(c.scheduled_at).toLocaleString("de-DE")}
                  </div>
                )}
              </div>
              {isLetter && c.result_zip_path && c.status === "done" && (
                <Button variant="outline" size="sm" onClick={() => download(c.result_zip_path)}>
                  <Download className="h-4 w-4 mr-1" /> ZIP
                </Button>
              )}
              {!isLetter && c.failed_count > 0 && (c.status === "sent" || c.status === "failed") && (
                <Button variant="outline" size="sm" onClick={() => retry(c)}>
                  <RefreshCcw className="h-4 w-4 mr-1" /> Wiederholen
                </Button>
              )}
              {c.status === "scheduled" && (
                <Button variant="outline" size="sm" onClick={() => cancelScheduled(c)}>Abbrechen</Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; v: any; icon: any }> = {
    draft:      { label: "Entwurf",     v: "secondary", icon: Clock },
    scheduled:  { label: "Geplant",     v: "secondary", icon: CalendarClock },
    generating: { label: "Erstelle...", v: "secondary", icon: Clock },
    done:       { label: "Erstellt",    v: "default",   icon: CheckCircle2 },
    sending:    { label: "Sende...",    v: "secondary", icon: Clock },
    sent:       { label: "Versendet",   v: "default",   icon: CheckCircle2 },
    failed:     { label: "Fehler",      v: "destructive", icon: AlertCircle },
  };
  const m = map[status] || map.draft;
  const Icon = m.icon;
  return (
    <Badge variant={m.v} className="text-[10px] gap-1"><Icon className="h-3 w-3" />{m.label}</Badge>
  );
}
