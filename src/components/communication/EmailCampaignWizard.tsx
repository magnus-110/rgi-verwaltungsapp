import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { HelpCircle, Loader2, Mail, Send, Eye, Paperclip, X, CalendarClock, Code, Type, FileEdit, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplateList } from "./TemplateList";
import { RecipientPicker, RecipientFilterValue } from "./RecipientPicker";
import { VariableHelpSheet } from "./VariableHelpSheet";
import { FriendlyVariablePalette } from "./FriendlyVariablePalette";
import { usePlaceholderStats } from "./usePlaceholderStats";
import { usePlaceholderSamples } from "./usePlaceholderSamples";
import { EmailPreviewPane } from "./EmailPreviewPane";
import { WysiwygPlaceholderEditor, type WysiwygPlaceholderEditorHandle } from "./WysiwygPlaceholderEditor";
import { ConfirmSendDialog } from "./ConfirmSendDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
}

export const EmailCampaignWizard = ({ open, onOpenChange, buildingId }: Props) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<any>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [testEmail, setTestEmail] = useState("");
  const [filter, setFilter] = useState<RecipientFilterValue>({ roles: [], contact_ids: [], assignment_ids: [], require_email: true });
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultStats, setResultStats] = useState<{ ok: number; failed: number } | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [bodyFormat, setBodyFormat] = useState<"html" | "plain">("plain");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingScheduled, setPendingScheduled] = useState(false);
  const bodyRef = useRef<WysiwygPlaceholderEditorHandle>(null);
  const subjectRef = useRef<WysiwygPlaceholderEditorHandle>(null);
  const lastFocused = useRef<"subject" | "body">("body");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: placeholderStats } = usePlaceholderStats(buildingId, filter.contact_ids);
  const { data: placeholderSamples } = usePlaceholderSamples(buildingId, filter.contact_ids);
  const recipientCount = (filter.assignment_ids || []).filter((id) => id !== "__none__").length
    || (filter.contact_ids || []).filter((id) => id !== "__none__").length;

  const insertAtCursor = (placeholder: string) => {
    const target = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    target?.insert(placeholder);
  };

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_accounts")
        .select("id, display_name, email_address")
        .eq("is_active", true).order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  const reset = () => {
    setStep(1); setName(""); setTemplate(null);
    setSubject(""); setBody(""); setAccountId(""); setTestEmail("");
    setFilter({ roles: [], contact_ids: [], assignment_ids: [], require_email: true });
    setResultStats(null); setAttachments([]); setScheduledAt("");
    setBodyFormat("plain");
    setConfirmOpen(false);
    setPendingScheduled(false);
  };

  const useTemplate = (t: any) => {
    setTemplate(t);
    setName(`Rundmail: ${t.name}`);
    setSubject(t.subject || "");
    setBody(t.body_html || "");
    // Only switch to HTML if the template explicitly defines it; otherwise keep plain default
    if (t.body_format === "html") setBodyFormat("html");
    else setBodyFormat("plain");
    setStep(2);
  };

  const skipTemplate = () => { setTemplate(null); setName(""); setSubject(""); setBody(""); setStep(2); };

  const uploadAttachments = async (campaignId: string): Promise<string[]> => {
    const paths: string[] = [];
    for (const f of attachments) {
      const path = `campaigns/${campaignId}/attachments/${Date.now()}_${f.name}`;
      const { error } = await supabase.storage.from("comm-assets").upload(path, f, { upsert: true });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  };

  const createCampaign = async (status: "draft" | "scheduled") => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error("Nicht angemeldet");
    const recipientIds = filter.contact_ids.includes("__none__") ? [] : filter.contact_ids;
    const assignmentIds = (filter.assignment_ids || []).includes("__none__") ? ["__none__"] : (filter.assignment_ids || []);

    const { data, error } = await supabase.from("comm_campaigns").insert({
      name: name.trim() || "Rundmail",
      type: "email",
      template_id: template?.id || null,
      building_id: buildingId,
      email_account_id: accountId || null,
      recipient_filter: { roles: filter.roles, contact_ids: recipientIds, assignment_ids: assignmentIds },
      subject_override: subject || null,
      body_html_override: body || null,
      body_format: bodyFormat,
      status,
      scheduled_at: status === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      created_by: userId,
    }).select().single();
    if (error) throw error;
    if (attachments.length > 0) {
      const paths = await uploadAttachments(data.id);
      await supabase.from("comm_campaigns").update({ attachment_paths: paths }).eq("id", data.id);
    }
    return data;
  };

  const handleSendTest = async () => {
    if (!accountId) { toast({ title: "Konto wählen", variant: "destructive" }); return; }
    if (!testEmail) { toast({ title: "Test-Adresse fehlt", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const c = await createCampaign("draft");
      const { error } = await supabase.functions.invoke("comm-send-bulk-email", {
        body: { campaign_id: c.id, test_email: testEmail },
      });
      if (error) throw error;
      toast({ title: "Test gesendet", description: testEmail });
      // delete the test draft
      await supabase.from("comm_campaigns").delete().eq("id", c.id);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Test fehlgeschlagen", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const requestSend = () => {
    if (!accountId) { toast({ title: "E-Mail-Konto wählen", variant: "destructive" }); return; }
    if (!subject.trim() || !body.trim()) { toast({ title: "Betreff und Inhalt erforderlich", variant: "destructive" }); return; }

    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (isNaN(when.getTime()) || when <= new Date()) {
        toast({ title: "Geplanter Zeitpunkt muss in der Zukunft liegen", variant: "destructive" });
        return;
      }
      setPendingScheduled(true);
    } else {
      setPendingScheduled(false);
    }
    setConfirmOpen(true);
  };

  const executeSend = async () => {
    if (pendingScheduled) {
      setBusy(true);
      try {
        await createCampaign("scheduled");
        toast({ title: "Versand geplant" });
        qc.invalidateQueries({ queryKey: ["comm-campaigns", buildingId] });
        onOpenChange(false);
      } catch (e: any) {
        toast({ title: "Fehler", description: e?.message || "Planung fehlgeschlagen", variant: "destructive" });
      } finally { setBusy(false); }
      return;
    }

    setBusy(true);
    try {
      const c = await createCampaign("draft");
      const { data: result, error } = await supabase.functions.invoke("comm-send-bulk-email", {
        body: { campaign_id: c.id },
      });
      if (error) throw error;
      const r = result as any;
      if (r?.error) throw new Error(r.error);
      setResultStats({ ok: r.ok, failed: r.failed });
      setStep(3);
      qc.invalidateQueries({ queryKey: ["comm-campaigns", buildingId] });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Versand fehlgeschlagen", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Neue Rundmail</DialogTitle>
          <DialogDescription>Vorlage wählen oder direkt schreiben, Empfänger filtern, versenden.</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Vorlage wählen</h3>
              <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
                <HelpCircle className="h-4 w-4 mr-1" /> Platzhalter-Hilfe
              </Button>
            </div>
            <TemplateList buildingId={buildingId} type="email" onUse={useTemplate} />
            <Button variant="outline" className="w-full" onClick={skipTemplate}>Ohne Vorlage starten</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Kampagnenname</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label>Absender-Konto *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="E-Mail-Konto wählen" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.display_name} ({a.email_address})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
              <div className="space-y-4 min-w-0">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>Format</Label>
                  </div>
                  <RadioGroup
                    value={bodyFormat}
                    onValueChange={(v) => setBodyFormat(v as "html" | "plain")}
                    className="flex gap-2"
                  >
                    <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "plain" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                      <RadioGroupItem value="plain" />
                      <Type className="h-4 w-4" /> Klartext
                      <span className="text-xs text-muted-foreground ml-auto">Empfohlen</span>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "html" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                      <RadioGroupItem value="html" />
                      <Code className="h-4 w-4" /> HTML
                      <span className="text-xs text-muted-foreground ml-auto">Formatiert</span>
                    </label>
                  </RadioGroup>
                </div>

                <div className="space-y-4 mt-2">
                  <div>
                    <Label>Betreff *</Label>
                    <WysiwygPlaceholderEditor
                      ref={subjectRef}
                      value={subject}
                      onChange={setSubject}
                      onFocus={() => { lastFocused.current = "subject"; }}
                      samples={placeholderSamples}
                      singleLine
                      ariaLabel="Betreff"
                      placeholder="z. B. Wichtige Information zur Hausversammlung"
                    />
                  </div>
                  <div>
                    <Label>Inhalt {bodyFormat === "html" ? "(HTML)" : ""} *</Label>
                    <WysiwygPlaceholderEditor
                      ref={bodyRef}
                      value={body}
                      onChange={setBody}
                      onFocus={() => { lastFocused.current = "body"; }}
                      samples={placeholderSamples}
                      monospace={bodyFormat === "html"}
                      minHeight={320}
                      ariaLabel="Inhalt"
                      placeholder=""
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Platzhalter werden direkt mit den Daten der ersten ausgewählten Person angezeigt (grau hinterlegt).
                    </p>
                  </div>
                </div>
              </div>

              <aside className="border rounded-md bg-muted/30 p-2 md:sticky md:top-0 self-start">
                <h4 className="text-xs font-semibold mb-1 px-1">Platzhalter einfügen</h4>
                <FriendlyVariablePalette
                  onInsert={insertAtCursor}
                  stats={placeholderStats}
                  samples={placeholderSamples}
                />
                <div className="mt-2 px-1 space-y-0.5 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Keine Daten</div>
                  <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Teilweise leer</div>
                </div>
              </aside>
            </div>

            <div>
              <Label className="mb-2 block">Empfänger (nur mit E-Mail)</Label>
              <RecipientPicker buildingId={buildingId} requireEmail value={filter} onChange={setFilter} excludeRoles={["dienstleister"]} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anhänge</Label>
                <Input
                  type="file"
                  multiple
                  onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                  className="text-xs"
                />
                {attachments.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {attachments.map((f, i) => (
                      <div key={i} className="text-xs flex items-center gap-1 text-muted-foreground">
                        <span className="truncate">{f.name}</span>
                        <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Geplanter Versand (optional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                />
                {scheduledAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">Wird automatisch um {new Date(scheduledAt).toLocaleString("de-DE")} versendet.</p>
                )}
              </div>
            </div>

            <Card className="p-3 bg-muted/40">
              <Label className="text-xs">Test-Mail an mich (optional)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@beispiel.de" />
                <Button variant="outline" size="sm" onClick={handleSendTest} disabled={busy}>
                  <Eye className="h-4 w-4 mr-1" /> Test senden
                </Button>
              </div>
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8 space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Versand abgeschlossen</h3>
            {resultStats && (
              <p className="text-sm text-muted-foreground">
                {resultStats.ok} erfolgreich, {resultStats.failed} fehlgeschlagen
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 2 && <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>Zurück</Button>}
          {step === 2 && (
            <Button onClick={requestSend} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : (scheduledAt ? <CalendarClock className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />)}
              {scheduledAt ? "Versand planen" : "Jetzt senden"}
            </Button>
          )}
          {step === 3 && <Button onClick={() => onOpenChange(false)}>Schließen</Button>}
        </DialogFooter>

        <VariableHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
        <ConfirmSendDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          recipientCount={recipientCount}
          scheduledAt={pendingScheduled ? scheduledAt : undefined}
          onConfirm={executeSend}
        />
      </DialogContent>
    </Dialog>
  );
};
