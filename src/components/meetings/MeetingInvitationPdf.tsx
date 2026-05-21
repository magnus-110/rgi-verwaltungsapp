import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Upload, HelpCircle, Loader2, Download, FolderArchive, CalendarDays,
  MapPin, Clock, Users, Sparkles, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TemplateUploadDialog } from "@/components/communication/TemplateUploadDialog";
import { VariableHelpSheet } from "@/components/communication/VariableHelpSheet";

interface MeetingInvitationPdfProps {
  meetingId: string;
  buildingId: string;
}

export const MeetingInvitationPdf = ({ meetingId, buildingId }: MeetingInvitationPdfProps) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [busy, setBusy] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [resultStats, setResultStats] = useState<{ ok: number; failed: number } | null>(null);

  const { data: meeting } = useQuery({
    queryKey: ["etv-meeting-summary", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("title, meeting_date, location")
        .eq("id", meetingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const { data: ownerCount = 0 } = useQuery({
    queryKey: ["etv-owner-count", buildingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contact_building_assignments")
        .select("id", { count: "exact", head: true })
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer");
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["comm-templates", buildingId, "letter", "etv_invitation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comm_templates")
        .select("*")
        .eq("type", "letter")
        .eq("template_kind", "etv_invitation")
        .or(`building_id.eq.${buildingId},is_global.eq.true`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });


  const handleDelete = async (t: any) => {
    if (!confirm(`Vorlage "${t.name}" löschen?`)) return;
    if (t.docx_path) await supabase.storage.from("comm-assets").remove([t.docx_path]);
    await supabase.from("comm_templates").delete().eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["comm-templates", buildingId, "letter"] });
    toast({ title: "Vorlage gelöscht" });
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const { data: campaign, error: cErr } = await supabase.from("comm_campaigns").insert({
        name: `Einladung ETV: ${selected.name}`,
        type: "letter",
        template_id: selected.id,
        building_id: buildingId,
        recipient_filter: { roles: ["eigentuemer"], contact_ids: [], assignment_ids: [] },
        status: "draft",
        created_by: userId,
      }).select().single();
      if (cErr) throw cErr;

      const { data: result, error: rErr } = await supabase.functions.invoke("comm-render-letters", {
        body: { campaign_id: campaign.id, output_format: format, meeting_id: meetingId },
      });
      if (rErr) throw rErr;
      const r = result as any;
      if (r?.error) throw new Error(r.error);

      setResultPath(r.zip_path);
      setResultStats({ ok: r.ok, failed: r.failed });
      toast({ title: "Einladungen erstellt", description: `${r.ok} erfolgreich, ${r.failed} fehlgeschlagen` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!resultPath) return;
    const { data, error } = await supabase.storage.from("comm-assets").createSignedUrl(resultPath, 600);
    if (error || !data?.signedUrl) { toast({ title: "Download-Fehler", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const closeDialog = () => {
    setSelected(null);
    setResultPath(null);
    setResultStats(null);
    setFormat("docx");
  };

  return (
    <div className="space-y-4">
      {/* ETV Kontext-Karte */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Einladung zur Eigentümerversammlung
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString("de-DE") : "—"}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{meeting?.location || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {ownerCount} Eigentümer
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Word-Vorlagen</h4>
          <p className="text-xs text-muted-foreground">
            Wählen Sie eine Vorlage – sie wird pro Eigentümer befüllt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-1" /> Platzhalter
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Vorlage hochladen
          </Button>
        </div>
      </div>

      {/* Vorlagen-Liste */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Noch keine Vorlage vorhanden. Laden Sie eine .docx-Vorlage hoch.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <Card key={t.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{t.name}</span>
                  </div>
                  {t.is_global && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                </div>
                {Array.isArray(t.variables) && t.variables.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t.variables.length} Platzhalter erkannt
                  </p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <Button size="sm" onClick={() => setSelected(t)} className="h-8">
                    Einladung erstellen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(t)}
                    className="h-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generieren-Dialog (ETV-spezifisch, schlank) */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Einladung versenden
            </DialogTitle>
            <DialogDescription>
              Vorlage <strong>{selected?.name}</strong> wird für alle Eigentümer befüllt.
            </DialogDescription>
          </DialogHeader>

          {!resultPath ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <strong>{ownerCount}</strong> Eigentümer als Empfänger
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  ETV-Daten ({meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString("de-DE") : "—"},{" "}
                  {meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}, {meeting?.location}) werden automatisch eingesetzt.
                </p>

              </div>

              <div>
                <p className="text-sm font-medium mb-2">Ausgabeformat</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat("docx")}
                    className={`rounded-md border p-3 text-left text-sm transition-colors ${
                      format === "docx" ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium">DOCX</div>
                    <div className="text-xs text-muted-foreground">In Word weiter bearbeitbar</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("pdf")}
                    className={`rounded-md border p-3 text-left text-sm transition-colors ${
                      format === "pdf" ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium">PDF</div>
                    <div className="text-xs text-muted-foreground">Druckfertig (CloudConvert)</div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Einladungen erstellt</h3>
                {resultStats && (
                  <p className="text-sm text-muted-foreground">
                    {resultStats.ok} erfolgreich · {resultStats.failed} fehlgeschlagen
                  </p>
                )}
              </div>
              <div className="mx-auto max-w-sm rounded-md border bg-muted/40 p-3 text-left text-xs flex items-start gap-2">
                <FolderArchive className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>
                  Das ZIP-Bundle wurde im <strong>Dokumentenarchiv (Serienbriefe)</strong> abgelegt.
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            {!resultPath ? (
              <>
                <Button variant="outline" onClick={closeDialog} disabled={busy}>Abbrechen</Button>
                <Button onClick={handleGenerate} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {ownerCount} Einladungen erstellen
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeDialog}>Schließen</Button>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" /> ZIP herunterladen
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        buildingId={buildingId}
        defaultType="letter"
      />

      <VariableHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};
