import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo?: {
    subject: string;
    from_address: string;
    from_name: string;
    body_text: string;
    date: string;
    account_id: string;
  } | null;
  forward?: {
    subject: string;
    body_text: string;
    body_html: string;
    account_id: string;
  } | null;
}

export const ComposeEmailDialog = ({
  open,
  onOpenChange,
  replyTo,
  forward,
}: ComposeEmailDialogProps) => {
  const [accountId, setAccountId] = useState(replyTo?.account_id || forward?.account_id || "");
  const [to, setTo] = useState(replyTo?.from_address || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : forward ? `Fwd: ${forward.subject}` : ""
  );
  const [bodyText, setBodyText] = useState(
    replyTo
      ? `\n\n--- Ursprüngliche Nachricht ---\nVon: ${replyTo.from_name} <${replyTo.from_address}>\nDatum: ${replyTo.date ? new Date(replyTo.date).toLocaleString("de-DE") : ""}\n\n${replyTo.body_text || ""}`
      : forward
        ? `\n\n--- Weitergeleitete Nachricht ---\n${forward.body_text || ""}`
        : ""
  );
  const [isSending, setIsSending] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts-compose"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("id, display_name, email_address")
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Auto-select first account
  if (!accountId && accounts.length > 0) {
    setAccountId(accounts[0].id);
  }

  const handleSend = async () => {
    if (!accountId || !to.trim()) {
      toast.error("Bitte Absender und Empfänger angeben");
      return;
    }

    setIsSending(true);
    try {
      const toAddresses = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccAddresses = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : [];

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          account_id: accountId,
          to: toAddresses,
          cc: ccAddresses.length > 0 ? ccAddresses : undefined,
          subject,
          body_text: bodyText,
        },
      });

      if (error) throw error;

      toast.success("E-Mail gesendet!");
      onOpenChange(false);
      // Reset
      setTo("");
      setCc("");
      setSubject("");
      setBodyText("");
    } catch (err: any) {
      toast.error("Senden fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {replyTo ? "Antworten" : forward ? "Weiterleiten" : "Neue E-Mail"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs">Von</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Absender wählen..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.display_name} &lt;{acc.email_address}&gt;
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">An</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="empfaenger@email.de"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CC</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@email.de (optional)"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Betreff</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Betreff"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nachricht</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Ihre Nachricht..."
              className="min-h-[200px] resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSend} disabled={isSending} className="gap-1.5">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Senden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
