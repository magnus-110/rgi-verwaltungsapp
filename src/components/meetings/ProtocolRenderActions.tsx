import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad } from "@/components/buildings/keys/SignaturePad";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, FileText, PenLine, CheckCircle2, Archive } from "lucide-react";
import { toast } from "sonner";

interface Props { meetingId: string; }

const ROLES = [
  { key: "leiter", label: "Versammlungsleiter" },
  { key: "protokollant", label: "Protokollführer" },
  { key: "eigentuemer", label: "Eigentümer" },
] as const;

export function ProtocolRenderActions({ meetingId }: Props) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState<string>("");
  const [signOpen, setSignOpen] = useState(false);
  const [signRole, setSignRole] = useState<"leiter" | "protokollant" | "eigentuemer">("leiter");
  const [signerName, setSignerName] = useState("");
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["etv-protocol-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("etv_protocol_templates").select("id,name,is_default").order("is_default", { ascending: false });
      return data || [];
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ["etv-protocol-signatures", meetingId],
    queryFn: async () => {
      const { data } = await supabase.from("etv_protocol_signatures").select("*").eq("meeting_id", meetingId);
      return data || [];
    },
  });

  // Versammlungsleiter / Protokollführer aus der Versammlung vorbelegen
  const { data: meetingInfo } = useQuery({
    queryKey: ["etv-meeting-signer-names", meetingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("etv_meetings")
        .select("meeting_chair, minutes_taker")
        .eq("id", meetingId)
        .maybeSingle();
      return data as { meeting_chair: string | null; minutes_taker: string | null } | null;
    },
  });

  const render = useMutation({
    mutationFn: async (format: "docx" | "pdf") => {
      const { data, error } = await supabase.functions.invoke("etv-render-protocol", {
        body: { meeting_id: meetingId, template_id: templateId || undefined, output_format: format },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error + (data.details ? " — " + JSON.stringify(data.details) : ""));
      return data as { signed_url: string };
    },
    onSuccess: (d) => { if (d.signed_url) window.open(d.signed_url, "_blank"); toast.success("Protokoll generiert"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSignature = useMutation({
    mutationFn: async () => {
      if (!signerName.trim() || !signaturePng) throw new Error("Name und Unterschrift erforderlich");
      // ggf. existierende Unterschrift für diese Rolle ersetzen
      await supabase.from("etv_protocol_signatures").delete().eq("meeting_id", meetingId).eq("role", signRole);
      const { error } = await supabase.from("etv_protocol_signatures").insert({
        meeting_id: meetingId, role: signRole, signer_name: signerName.trim(), signature_png: signaturePng,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unterschrift gespeichert");
      setSignOpen(false); setSignerName(""); setSignaturePng(null);
      qc.invalidateQueries({ queryKey: ["etv-protocol-signatures", meetingId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("etv-finalize-signed-protocol", {
        body: { meeting_id: meetingId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { signed_url: string; dms_file_id: string | null };
    },
    onSuccess: (d) => {
      toast.success(d.dms_file_id ? "Unterschriebenes Protokoll im DMS abgelegt" : "Unterschriebenes Protokoll erstellt");
      if (d.signed_url) window.open(d.signed_url, "_blank");
      setFinalizeConfirm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openSignDialog = (role: "leiter" | "protokollant" | "eigentuemer") => {
    setSignRole(role);
    const existing = signatures.find((s: any) => s.role === role);
    setSignerName(existing?.signer_name || (role === "leiter" ? (meetingInfo?.meeting_chair || "") : role === "protokollant" ? (meetingInfo?.minutes_taker || "") : ""));
    setSignaturePng(null);
    setSignOpen(true);
  };

  const allSigned = ROLES.every((r) => signatures.some((s: any) => s.role === r.key));

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Vorlage</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder={templates.find((t: any) => t.is_default)?.name || "Standardvorlage"} /></SelectTrigger>
            <SelectContent>
              {templates.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " (Standard)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => render.mutate("docx")} disabled={render.isPending} variant="outline" className="gap-2">
          {render.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Als DOCX
        </Button>
        <Button onClick={() => render.mutate("pdf")} disabled={render.isPending} variant="outline" className="gap-2">
          {render.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Als PDF
        </Button>
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="text-sm font-medium flex items-center gap-2"><PenLine className="h-4 w-4" /> Unterschriften (Tablet-fähig)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {ROLES.map((r) => {
            const s = signatures.find((x: any) => x.role === r.key);
            return (
              <Button key={r.key} variant={s ? "secondary" : "outline"} onClick={() => openSignDialog(r.key)} className="justify-between h-auto py-2">
                <div className="text-left">
                  <div className="text-xs font-medium">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{s ? `✓ ${s.signer_name}` : "noch nicht unterschrieben"}</div>
                </div>
                {s && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-2">
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{signatures.length} / 3 unterschrieben</Badge>
          <Button onClick={() => setFinalizeConfirm(true)} disabled={!allSigned || finalize.isPending} className="gap-2">
            {finalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Final signieren & im DMS ablegen
          </Button>
        </div>
      </div>

      {/* Signatur-Dialog */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{ROLES.find((r) => r.key === signRole)?.label} unterschreiben</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name des Unterzeichners</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Vor- und Nachname" />
            </div>
            <div>
              <Label className="text-xs">Unterschrift (mit Stift/Finger)</Label>
              <SignaturePad value={signaturePng} onChange={setSignaturePng} height={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveSignature.mutate()} disabled={saveSignature.isPending || !signerName.trim() || !signaturePng}>
              {saveSignature.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize-Bestätigung */}
      <Dialog open={finalizeConfirm} onOpenChange={setFinalizeConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Protokoll final unterschreiben und im DMS ablegen?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Das aktuelle PDF-Protokoll wird mit allen Unterschriften versiegelt und im Dokumentenmanagement (Kategorie „Versammlungs-Protokolle") abgelegt — dort ist es auch für Eigentümer sichtbar.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFinalizeConfirm(false)}>Abbrechen</Button>
            <Button onClick={() => finalize.mutate()} disabled={finalize.isPending}>
              {finalize.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Ja, im DMS ablegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
