import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Loader2, Paperclip, X, Users, Search, ArrowLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

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

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
}

export const ComposeEmailDialog = ({
  open,
  onOpenChange,
  replyTo,
  forward,
}: ComposeEmailDialogProps) => {
  const isMobile = useIsMobile();
  const [accountId, setAccountId] = useState(replyTo?.account_id || forward?.account_id || "");
  const [to, setTo] = useState(replyTo?.from_address || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
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
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [ccContactPickerOpen, setCcContactPickerOpen] = useState(false);
  const [bccContactPickerOpen, setBccContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

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

  const { data: contactsWithEmails = [] } = useQuery({
    queryKey: ["contacts-with-emails-compose"],
    queryFn: async () => {
      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .order("last_name");
      if (error) throw error;

      const { data: emails, error: emailErr } = await supabase
        .from("contact_emails")
        .select("contact_id, email, label");
      if (emailErr) throw emailErr;

      return (contacts || []).map(c => ({
        ...c,
        emails: (emails || []).filter(e => e.contact_id === c.id),
        displayName: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Unbenannt",
      })).filter(c => c.emails.length > 0);
    },
  });

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contactsWithEmails;
    const s = contactSearch.toLowerCase();
    return contactsWithEmails.filter(c =>
      c.displayName.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s) ||
      c.emails.some(e => e.email.toLowerCase().includes(s))
    );
  }, [contactsWithEmails, contactSearch]);

  if (!accountId && accounts.length > 0) {
    setAccountId(accounts[0].id);
  }

  const addEmailToField = (email: string, field: "to" | "cc" | "bcc" = "to") => {
    const setters = { to: setTo, cc: setCc, bcc: setBcc };
    const values = { to, cc, bcc };
    const currentVal = values[field];
    const current = currentVal.split(",").map(e => e.trim()).filter(Boolean);
    if (!current.includes(email)) {
      setters[field](current.length > 0 ? `${currentVal}, ${email}` : email);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} ist zu groß (max. 10MB)`);
        continue;
      }
      setAttachments(prev => [...prev, { file, name: file.name, size: file.size }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if (!accountId || !to.trim()) {
      toast.error("Bitte Absender und Empfänger angeben");
      return;
    }

    setIsSending(true);
    try {
      const toAddresses = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccAddresses = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : [];
      const bccAddresses = bcc ? bcc.split(",").map((e) => e.trim()).filter(Boolean) : [];

      const attachmentData = await Promise.all(
        attachments.map(async (att) => ({
          filename: att.name,
          content: await fileToBase64(att.file),
          contentType: att.file.type || "application/octet-stream",
        }))
      );

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          account_id: accountId,
          to: toAddresses,
          cc: ccAddresses.length > 0 ? ccAddresses : undefined,
          bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
          subject,
          body_text: bodyText,
          body_html: forward?.body_html || undefined,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        },
      });

      if (error) throw error;

      toast.success("E-Mail gesendet!");
      onOpenChange(false);
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBodyText("");
      setAttachments([]);
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
            <div className="flex items-center justify-between">
              <Label className="text-xs">An</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCcBcc(!showCcBcc)}
              >
                {showCcBcc ? "CC/BCC ausblenden" : "CC/BCC"}
              </button>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="empfaenger@email.de"
                className="h-9 flex-1"
              />
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Aus Kontakten wählen">
                    <Users className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Kontakt suchen..."
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                        className="h-8 pl-8 text-sm"
                      />
                    </div>
                  </div>
                  <ScrollArea className="max-h-60">
                    {filteredContacts.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                    ) : (
                      filteredContacts.map(contact => (
                        <div key={contact.id} className="border-b last:border-0">
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-sm font-medium">{contact.displayName}</span>
                            {contact.company_name && contact.first_name && (
                              <span className="text-xs text-muted-foreground ml-1.5">({contact.company_name})</span>
                            )}
                          </div>
                          {contact.emails.map(ce => (
                            <button
                              key={ce.email}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                addEmailToField(ce.email, "to");
                                if (contact.emails.length === 1) setContactPickerOpen(false);
                              }}
                            >
                              <Checkbox
                                checked={to.split(",").map(e => e.trim()).includes(ce.email)}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-sm text-muted-foreground truncate">{ce.email}</span>
                              {ce.label && (
                                <span className="text-[10px] text-muted-foreground shrink-0">({ce.label})</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {showCcBcc && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">CC</Label>
                <div className="flex gap-1.5">
                  <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@email.de (optional)" className="h-9 flex-1" />
                  <Popover open={ccContactPickerOpen} onOpenChange={setCcContactPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Aus Kontakten wählen">
                        <Users className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="h-8 pl-8 text-sm" />
                        </div>
                      </div>
                      <ScrollArea className="max-h-60">
                        {filteredContacts.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                        ) : (
                          filteredContacts.map(contact => (
                            <div key={contact.id} className="border-b last:border-0">
                              <div className="px-3 pt-2 pb-1">
                                <span className="text-sm font-medium">{contact.displayName}</span>
                                {contact.company_name && contact.first_name && (
                                  <span className="text-xs text-muted-foreground ml-1.5">({contact.company_name})</span>
                                )}
                              </div>
                              {contact.emails.map(ce => (
                                <button key={ce.email} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                                  onClick={() => { addEmailToField(ce.email, "cc"); if (contact.emails.length === 1) setCcContactPickerOpen(false); }}>
                                  <Checkbox checked={cc.split(",").map(e => e.trim()).includes(ce.email)} className="h-3.5 w-3.5" />
                                  <span className="text-sm text-muted-foreground truncate">{ce.email}</span>
                                </button>
                              ))}
                            </div>
                          ))
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">BCC</Label>
                <div className="flex gap-1.5">
                  <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@email.de (optional)" className="h-9 flex-1" />
                  <Popover open={bccContactPickerOpen} onOpenChange={setBccContactPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Aus Kontakten wählen">
                        <Users className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="h-8 pl-8 text-sm" />
                        </div>
                      </div>
                      <ScrollArea className="max-h-60">
                        {filteredContacts.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                        ) : (
                          filteredContacts.map(contact => (
                            <div key={contact.id} className="border-b last:border-0">
                              <div className="px-3 pt-2 pb-1">
                                <span className="text-sm font-medium">{contact.displayName}</span>
                                {contact.company_name && contact.first_name && (
                                  <span className="text-xs text-muted-foreground ml-1.5">({contact.company_name})</span>
                                )}
                              </div>
                              {contact.emails.map(ce => (
                                <button key={ce.email} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                                  onClick={() => { addEmailToField(ce.email, "bcc"); if (contact.emails.length === 1) setBccContactPickerOpen(false); }}>
                                  <Checkbox checked={bcc.split(",").map(e => e.trim()).includes(ce.email)} className="h-3.5 w-3.5" />
                                  <span className="text-sm text-muted-foreground truncate">{ce.email}</span>
                                </button>
                              ))}
                            </div>
                          ))
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </>
          )}

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

          {/* Attachments */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anhang hinzufügen
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm bg-muted rounded-md px-2.5 py-1.5"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
