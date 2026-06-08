import { useState, useRef, useMemo, useEffect } from "react";
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
import { Send, Loader2, Paperclip, X, Users, Search, ArrowLeft, ChevronDown, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmailTemplatePicker } from "./EmailTemplatePicker";
import { VoiceDictationButton } from "./VoiceDictationButton";
import { AttachmentPreviewDialog } from "./AttachmentPreviewDialog";
import { DmsFilePickerDialog, type DmsPickerItem } from "@/components/meetings/DmsFilePickerDialog";

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ name: string; mimeType: string | null }>({ name: "", mimeType: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [ccContactPickerOpen, setCcContactPickerOpen] = useState(false);
  const [bccContactPickerOpen, setBccContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [dmsPickerOpen, setDmsPickerOpen] = useState(false);
  const [dmsLoading, setDmsLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  const handleDmsSelect = async (items: DmsPickerItem[]) => {
    if (!items.length) return;
    setDmsLoading(true);
    const MAX_SIZE = 20 * 1024 * 1024;
    try {
      const added: AttachmentFile[] = [];
      for (const item of items) {
        try {
          if (typeof item.size === "number" && item.size > MAX_SIZE) {
            toast.error(`${item.name} ist zu groß (max. 20MB)`);
            continue;
          }
          const { data: signed, error: signErr } = await supabase.storage
            .from("building-files")
            .createSignedUrl(item.path, 300);
          if (signErr || !signed?.signedUrl) {
            toast.error(`${item.name}: konnte nicht geladen werden`);
            continue;
          }
          const res = await fetch(signed.signedUrl);
          if (!res.ok) {
            toast.error(`${item.name}: Download fehlgeschlagen`);
            continue;
          }
          const blob = await res.blob();
          if (blob.size > MAX_SIZE) {
            toast.error(`${item.name} ist zu groß (max. 20MB)`);
            continue;
          }
          const file = new File([blob], item.name, {
            type: item.mimeType || blob.type || "application/octet-stream",
          });
          added.push({ file, name: item.name, size: file.size });
        } catch (e: any) {
          console.error("DMS attach failed", e);
          toast.error(`${item.name}: ${e?.message ?? "Fehler"}`);
        }
      }
      if (added.length) {
        setAttachments(prev => [...prev, ...added]);
        toast.success(`${added.length} Datei(en) aus DMS angehängt`);
      }
    } finally {
      setDmsLoading(false);
    }
  };


  const openAttachment = (att: AttachmentFile) => {
    const url = URL.createObjectURL(att.file);
    setPreviewMeta({ name: att.name, mimeType: att.file.type || null });
    setPreviewUrl(url);
    setPreviewOpen(true);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewOpen(open);
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

  const handleInsertTemplate = ({ subject: ts, body: tb }: { subject: string; body: string; subjectReplaced: boolean }) => {
    if (ts && !subject.trim()) setSubject(ts);
    const QUOTE_RE = /\n*--- (?:Ursprüngliche|Weitergeleitete) Nachricht ---/;
    const m = bodyText.match(QUOTE_RE);
    const head = m && m.index !== undefined ? bodyText.slice(0, m.index) : bodyText;
    const tail = m && m.index !== undefined ? bodyText.slice(m.index) : "";
    const sep = head && !head.endsWith("\n") ? "\n\n" : "";
    setBodyText(head + sep + tb + (tail ? "\n\n" + tail : ""));
  };

  const handleVoiceAccept = (vb: string, vSubject?: string) => {
    if (vSubject && !subject.trim()) setSubject(vSubject);
    const QUOTE_RE = /\n*--- (?:Ursprüngliche|Weitergeleitete) Nachricht ---/;
    const m = bodyText.match(QUOTE_RE);
    const head = m && m.index !== undefined ? bodyText.slice(0, m.index) : bodyText;
    const tail = m && m.index !== undefined ? bodyText.slice(m.index) : "";
    const sep = head && !head.endsWith("\n") ? "\n\n" : "";
    setBodyText(head + sep + vb + (tail ? "\n\n" + tail : ""));
  };

  const voiceCtx = {
    recipientEmail: to,
    subject,
    existingBody: bodyText,
    senderName: accounts.find((a) => a.id === accountId)?.display_name,
    isReply: !!replyTo,
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

      // Large attachments are uploaded directly to storage to avoid edge
      // function payload limits (~6MB after base64). Threshold: 1MB raw.
      const INLINE_LIMIT = 1024 * 1024;
      const attachmentData = await Promise.all(
        attachments.map(async (att) => {
          const contentType = att.file.type || "application/octet-stream";
          if (att.file.size > INLINE_LIMIT) {
            const safeName = att.name.replace(/[^\w.\-]+/g, "_");
            const path = `outgoing/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("email-attachments")
              .upload(path, att.file, { contentType, upsert: false });
            if (upErr) throw new Error(`Upload fehlgeschlagen (${att.name}): ${upErr.message}`);
            return { filename: att.name, storage_path: path, contentType };
          }
          return {
            filename: att.name,
            content: await fileToBase64(att.file),
            contentType,
          };
        })
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

  const title = replyTo ? "Antworten" : forward ? "Weiterleiten" : "Neue E-Mail";
  const fromAccount = accounts.find((a) => a.id === accountId);

  // ===== MOBILE: Gmail/Outlook-Style Vollbildansicht =====
  if (isMobile && open) {
    return (
      <>
        <div
          className="fixed inset-0 z-[60] bg-background flex flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {/* App-Bar */}
          <div className="h-14 flex items-center justify-between px-2 border-b bg-background shrink-0">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => onOpenChange(false)}
                aria-label="Schließen"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="text-base font-medium">{title}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Anhang hinzufügen"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setDmsPickerOpen(true)}
                disabled={dmsLoading}
                aria-label="Aus DMS anhängen"
                title="Aus DMS anhängen"
              >
                {dmsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
              </Button>
              <EmailTemplatePicker
                context={{ to, accountId }}
                currentSubject={subject}
                onInsert={handleInsertTemplate}
              />
              <VoiceDictationButton context={voiceCtx} onAccept={handleVoiceAccept} />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full text-primary"
                onClick={handleSend}
                disabled={isSending || !accountId || !to.trim()}
                aria-label="Senden"
              >
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Body scrollbereich */}
          <div className="flex-1 overflow-y-auto">
            {/* Von */}
            <div className="px-4 py-2 border-b">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-10 border-0 px-0 shadow-none focus:ring-0 text-sm">
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xs text-muted-foreground w-10 shrink-0">Von</span>
                    <SelectValue placeholder="Absender wählen…">
                      {fromAccount ? `${fromAccount.display_name} <${fromAccount.email_address}>` : "Absender wählen…"}
                    </SelectValue>
                  </div>
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

            {/* An */}
            <div className="px-4 py-1 border-b flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-10 shrink-0">An</span>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Empfänger"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                className="h-10 border-0 px-0 shadow-none focus-visible:ring-0 text-sm flex-1"
              />
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Kontakte">
                    <Users className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="end">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Kontakt suchen..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="h-9 pl-8 text-sm"
                      />
                    </div>
                  </div>
                  <ScrollArea className="max-h-72">
                    {filteredContacts.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                    ) : (
                      filteredContacts.map((contact) => (
                        <div key={contact.id} className="border-b last:border-0">
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-sm font-medium">{contact.displayName}</span>
                          </div>
                          {contact.emails.map((ce) => (
                            <button
                              key={ce.email}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                              onClick={() => {
                                addEmailToField(ce.email, "to");
                                if (contact.emails.length === 1) setContactPickerOpen(false);
                              }}
                            >
                              <Checkbox
                                checked={to.split(",").map((e) => e.trim()).includes(ce.email)}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-sm text-muted-foreground truncate">{ce.email}</span>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="text-muted-foreground p-2 -mr-2"
                aria-label="CC/BCC"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showCcBcc ? "rotate-180" : ""}`} />
              </button>
            </div>

            {showCcBcc && (
              <>
                <div className="px-4 py-1 border-b flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">Cc</span>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    className="h-10 border-0 px-0 shadow-none focus-visible:ring-0 text-sm flex-1"
                  />
                </div>
                <div className="px-4 py-1 border-b flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">Bcc</span>
                  <Input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    className="h-10 border-0 px-0 shadow-none focus-visible:ring-0 text-sm flex-1"
                  />
                </div>
              </>
            )}

            {/* Betreff */}
            <div className="px-4 py-1 border-b">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Betreff"
                className="h-11 border-0 px-0 shadow-none focus-visible:ring-0 text-base"
              />
            </div>

            {/* Anhänge */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 space-y-1.5 border-b bg-muted/30">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-background rounded-md px-2.5 py-2 border cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openAttachment(att)}>
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAttachment(idx); }}
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                      aria-label="Anhang entfernen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Nachricht */}
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="E-Mail verfassen"
              className="min-h-[40vh] w-full border-0 rounded-none px-4 py-3 shadow-none focus-visible:ring-0 text-base resize-none"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
        <AttachmentPreviewDialog
          open={previewOpen}
          onOpenChange={handlePreviewOpenChange}
          url={previewUrl}
          fileName={previewMeta.name}
          mimeType={previewMeta.mimeType}
        />
        <DmsFilePickerDialog
          open={dmsPickerOpen}
          onOpenChange={setDmsPickerOpen}
          onSelectItems={handleDmsSelect}
        />
      </>
    );
  }

  // ===== DESKTOP =====
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setDmsPickerOpen(true)}
                disabled={dmsLoading}
              >
                {dmsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                Aus DMS
              </Button>
              <EmailTemplatePicker
                context={{ to, accountId }}
                currentSubject={subject}
                onInsert={handleInsertTemplate}
              />
              <VoiceDictationButton context={voiceCtx} onAccept={handleVoiceAccept} />
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
                    className="flex items-center gap-2 text-sm bg-muted rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => openAttachment(att)}
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAttachment(idx); }}
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
        <AttachmentPreviewDialog
          open={previewOpen}
          onOpenChange={handlePreviewOpenChange}
          url={previewUrl}
          fileName={previewMeta.name}
          mimeType={previewMeta.mimeType}
        />
        <DmsFilePickerDialog
          open={dmsPickerOpen}
          onOpenChange={setDmsPickerOpen}
          onSelectItems={handleDmsSelect}
        />
      </DialogContent>
    </Dialog>
  );
};
