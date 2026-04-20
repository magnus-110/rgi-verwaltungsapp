import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle, Loader2, Mail, Send, Eye, Paperclip, X, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TemplateList } from "./TemplateList";
import { RecipientPicker, RecipientFilterValue } from "./RecipientPicker";
import { VariableHelpSheet } from "./VariableHelpSheet";

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
  const [filter, setFilter] = useState<RecipientFilterValue>({ roles: [], contact_ids: [], require_email: true });
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultStats, setResultStats] = useState<{ ok: number; failed: number } | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const { toast } = useToast();
  const qc = useQueryClient();

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
    setFilter({ roles: [], contact_ids: [], require_email: true });
    setResultStats(null); setAttachments([]); setScheduledAt("");
  };

  const useTemplate = (t: any) => {
    setTemplate(t);
    setName(`Rundmail: ${t.name}`);
    setSubject(t.subject || "");
    setBody(t.body_html || "");
    setStep(2);
  };

  const skipTemplate = () => { setTemplate(null); setName(""); setSubject(""); setBody(""); setStep(2); };

  const createCampaign = async (status: "draft") => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error("Nicht angemeldet");
    const recipientIds = filter.contact_ids.includes("__none__") ? [] : filter.contact_ids;

    const { data, error } = await supabase.from("comm_campaigns").insert({
      name: name.trim() || "Rundmail",
      type: "email",
      template_id: template?.id || null,
      building_id: buildingId,
      email_account_id: accountId || null,
      recipient_filter: { roles: filter.roles, contact_ids: recipientIds },
      subject_override: subject || null,
      body_html_override: body || null,
      status,
      created_by: userId,
    }).select().single();
    if (error) throw error;
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

  const handleSend = async () => {
    if (!accountId) { toast({ title: "E-Mail-Konto wählen", variant: "destructive" }); return; }
    if (!subject.trim() || !body.trim()) { toast({ title: "Betreff und Inhalt erforderlich", variant: "destructive" }); return; }
    if (!confirm(`Wirklich an alle ausgewählten Empfänger senden?`)) return;

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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

            <div>
              <Label>Betreff *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Inhalt (HTML) *</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
            </div>

            <div>
              <Label className="mb-2 block">Empfänger (nur mit E-Mail)</Label>
              <RecipientPicker buildingId={buildingId} requireEmail value={filter} onChange={setFilter} />
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
            <Button onClick={handleSend} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Jetzt senden
            </Button>
          )}
          {step === 3 && <Button onClick={() => onOpenChange(false)}>Schließen</Button>}
        </DialogFooter>

        <VariableHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
      </DialogContent>
    </Dialog>
  );
};
