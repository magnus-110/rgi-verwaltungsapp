import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Loader2, Paperclip, X, Users, Search, Minus, Maximize2, ExternalLink, Wand2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { cn } from "@/lib/utils";

export const FloatingComposeWindow = () => {
  const { compose, closeCompose, toggleMinimize, updateCompose, openCompose } = useComposeEmail();
  // Detect fullscreen mode via URL parameter (?compose=fullscreen)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("compose") === "fullscreen";
  });

  // On first mount in fullscreen mode, hydrate compose state from URL parameters
  // and clean the params from the address bar.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!isFullscreen || hydratedRef.current) return;
    hydratedRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    openCompose({
      prefill: {
        to: sp.get("to") || "",
        cc: sp.get("cc") || "",
        bcc: sp.get("bcc") || "",
        subject: sp.get("subject") || "",
        bodyText: sp.get("body") || "",
        accountId: sp.get("accountId") || "",
      },
    });
    // Strip params so a refresh doesn't re-hydrate
    const url = new URL(window.location.href);
    ["compose", "to", "cc", "bcc", "subject", "body", "accountId"].forEach(k => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
  }, [isFullscreen, openCompose]);

  const [isSending, setIsSending] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiSuggestionRef = useRef<HTMLDivElement>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [ccContactPickerOpen, setCcContactPickerOpen] = useState(false);
  const [bccContactPickerOpen, setBccContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  
  // Drag state
  const [position, setPosition] = useState({ x: window.innerWidth - 660, y: window.innerHeight - 580 });
  const [size, setSize] = useState({ width: 620, height: 520 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>("");
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts-compose"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("id, display_name, email_address, signature_html")
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return data;
    },
    enabled: compose.isOpen,
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
    enabled: compose.isOpen,
  });

  // Auto-set account
  useEffect(() => {
    if (!compose.accountId && accounts.length > 0) {
      updateCompose({ accountId: accounts[0].id });
    }
  }, [accounts, compose.accountId, updateCompose]);

  // Append signature when account changes (only for new compose, not reply/forward)
  const prevAccountRef = useRef<string>("");
  useEffect(() => {
    if (!compose.accountId || compose.accountId === prevAccountRef.current) return;
    const account = accounts.find(a => a.id === compose.accountId);
    if (!account?.signature_html) { prevAccountRef.current = compose.accountId; return; }
    
    const sig = `\n\n--\n${account.signature_html}`;
    // Remove old signature if switching accounts
    const oldAccount = accounts.find(a => a.id === prevAccountRef.current);
    let currentBody = compose.bodyText;
    if (oldAccount?.signature_html) {
      const oldSig = `\n\n--\n${oldAccount.signature_html}`;
      if (currentBody.endsWith(oldSig)) {
        currentBody = currentBody.slice(0, -oldSig.length);
      }
    }
    // Only append if not already present
    if (!currentBody.endsWith(sig)) {
      updateCompose({ bodyText: currentBody + sig });
    }
    prevAccountRef.current = compose.accountId;
  }, [compose.accountId, accounts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contactsWithEmails;
    const s = contactSearch.toLowerCase();
    return contactsWithEmails.filter(c =>
      c.displayName.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s) ||
      c.emails.some(e => e.email.toLowerCase().includes(s))
    );
  }, [contactsWithEmails, contactSearch]);

  const addEmailToField = (email: string, field: "to" | "cc" | "bcc" = "to") => {
    const currentVal = compose[field];
    const current = currentVal.split(",").map(e => e.trim()).filter(Boolean);
    if (!current.includes(email)) {
      updateCompose({ [field]: current.length > 0 ? `${currentVal}, ${email}` : email });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 10 * 1024 * 1024;
    const newAttachments = [...compose.attachments];
    for (const file of files) {
      if (file.size > maxSize) { toast.error(`${file.name} ist zu groß (max. 10MB)`); continue; }
      newAttachments.push({ file, name: file.name, size: file.size });
    }
    updateCompose({ attachments: newAttachments });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    updateCompose({ attachments: compose.attachments.filter((_, i) => i !== index) });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { resolve((reader.result as string).split(",")[1]); };
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
    if (!compose.accountId || !compose.to.trim()) {
      toast.error("Bitte Absender und Empfänger angeben");
      return;
    }
    setIsSending(true);
    try {
      const toAddresses = compose.to.split(",").map(e => e.trim()).filter(Boolean);
      const ccAddresses = compose.cc ? compose.cc.split(",").map(e => e.trim()).filter(Boolean) : [];
      const bccAddresses = compose.bcc ? compose.bcc.split(",").map(e => e.trim()).filter(Boolean) : [];
      const attachmentData = await Promise.all(
        compose.attachments.map(async att => ({
          filename: att.name,
          content: await fileToBase64(att.file),
          contentType: att.file.type || "application/octet-stream",
        }))
      );
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          account_id: compose.accountId,
          to: toAddresses,
          cc: ccAddresses.length > 0 ? ccAddresses : undefined,
          bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
          subject: compose.subject,
          body_text: compose.bodyText,
          body_html: compose.forwardHtml || undefined,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        },
      });
      if (error) throw error;
      toast.success("E-Mail gesendet!");
      closeCompose();
    } catch (err: any) {
      toast.error("Senden fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsSending(false);
    }
  };

  const handleImproveText = async () => {
    if (!compose.bodyText || compose.bodyText.trim().length < 10) return;
    setIsImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("improve-email-text", {
        body: { bodyText: compose.bodyText, subject: compose.subject },
      });
      if (error) throw error;
      if (data?.improvedText) {
        setAiSuggestion(data.improvedText);
        setTimeout(() => aiSuggestionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
      }
    } catch (err: any) {
      toast.error("KI-Verbesserung fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsImproving(false);
    }
  };
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, textarea, select, [role=combobox]")) return;
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  // Resize handlers
  const onResizeStart = useCallback((dir: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(dir);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
  }, [size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    
    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
        });
      }
      if (isResizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        const d = resizeDirection;

        setSize(prev => ({
          width: Math.max(400, d.includes("e") ? resizeStart.current.w + dx : d.includes("w") ? resizeStart.current.w - dx : prev.width),
          height: Math.max(300, d.includes("s") ? resizeStart.current.h + dy : d.includes("n") ? resizeStart.current.h - dy : prev.height),
        }));
        setPosition(prev => ({
          x: d.includes("w") ? prev.x + (e.clientX - resizeStart.current.x) : prev.x,
          y: d.includes("n") ? prev.y + (e.clientY - resizeStart.current.y) : prev.y,
        }));
        if (d.includes("w")) resizeStart.current.x = e.clientX;
        if (d.includes("n")) resizeStart.current.y = e.clientY;
      }
    };
    const onUp = () => { setIsDragging(false); setIsResizing(false); setResizeDirection(""); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging, isResizing, resizeDirection]);

  const handlePopOut = () => {
    const params = new URLSearchParams({
      compose: "fullscreen",
      to: compose.to,
      cc: compose.cc,
      bcc: compose.bcc,
      subject: compose.subject,
      body: compose.bodyText,
      accountId: compose.accountId,
    });
    const url = `${window.location.origin}/postfach?${params.toString()}`;
    // No size args -> opens as a real new tab in modern browsers
    window.open(url, "_blank", "noopener,noreferrer");
    closeCompose();
  };

  if (!compose.isOpen) return null;

  // Minimized bar
  if (compose.isMinimized) {
    return (
      <div
        className="fixed bottom-0 right-4 z-50 w-72 bg-card border border-border rounded-t-lg shadow-lg cursor-pointer"
        onClick={toggleMinimize}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium truncate">
            {compose.replyTo ? "Antworten" : compose.forward ? "Weiterleiten" : "Neue E-Mail"}
            {compose.subject && ` - ${compose.subject}`}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); closeCompose(); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card flex flex-col overflow-hidden",
        isFullscreen
          ? "fixed inset-0 z-50 border-0 rounded-none shadow-none"
          : "fixed z-50 border border-border rounded-lg shadow-2xl"
      )}
      style={
        isFullscreen
          ? undefined
          : { left: position.x, top: position.y, width: size.width, height: size.height }
      }
    >
      {/* Resize handles - only in floating mode */}
      {!isFullscreen && (
        <>
          <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10" onMouseDown={onResizeStart("nw")} />
          <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10" onMouseDown={onResizeStart("ne")} />
          <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10" onMouseDown={onResizeStart("sw")} />
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" onMouseDown={onResizeStart("se")} />
          <div className="absolute top-0 left-3 right-3 h-1 cursor-n-resize z-10" onMouseDown={onResizeStart("n")} />
          <div className="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize z-10" onMouseDown={onResizeStart("s")} />
          <div className="absolute left-0 top-3 bottom-3 w-1 cursor-w-resize z-10" onMouseDown={onResizeStart("w")} />
          <div className="absolute right-0 top-3 bottom-3 w-1 cursor-e-resize z-10" onMouseDown={onResizeStart("e")} />
        </>
      )}

      {/* Title bar - draggable only in floating mode */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground select-none shrink-0",
          isFullscreen ? "rounded-none" : "cursor-move rounded-t-lg"
        )}
        onMouseDown={isFullscreen ? undefined : onDragStart}
      >
        <span className="text-sm font-medium">
          {compose.replyTo ? "Antworten" : compose.forward ? "Weiterleiten" : "Neue E-Mail"}
          {isFullscreen && compose.subject ? ` – ${compose.subject}` : ""}
        </span>
        <div className="flex items-center gap-0.5">
          {!isFullscreen && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20" onClick={handlePopOut} title="In neuem Tab öffnen">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isFullscreen && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20" onClick={toggleMinimize} title="Minimieren">
              <Minus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => {
              closeCompose();
              if (isFullscreen) window.close();
            }}
            title="Schließen"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-xs">Von</Label>
            <Select value={compose.accountId} onValueChange={v => updateCompose({ accountId: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Absender wählen..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.display_name} &lt;{acc.email_address}&gt;
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">An</Label>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCcBcc(!showCcBcc)}
              >
                {showCcBcc ? "CC/BCC ausblenden" : "CC/BCC"}
              </button>
            </div>
            <div className="flex gap-1">
              <Input
                value={compose.to}
                onChange={e => updateCompose({ to: e.target.value })}
                placeholder="empfaenger@email.de"
                className="h-8 text-sm flex-1"
              />
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    <Users className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="h-7 pl-7 text-sm" />
                    </div>
                  </div>
                  <ScrollArea className="max-h-48">
                    {filteredContacts.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                    ) : (
                      filteredContacts.map(contact => (
                        <div key={contact.id} className="border-b last:border-0">
                          <div className="px-3 pt-1.5 pb-0.5">
                            <span className="text-xs font-medium">{contact.displayName}</span>
                            {contact.company_name && contact.first_name && (
                              <span className="text-[10px] text-muted-foreground ml-1">({contact.company_name})</span>
                            )}
                          </div>
                          {contact.emails.map(ce => (
                            <button
                              key={ce.email}
                              className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => { addEmailToField(ce.email, "to"); if (contact.emails.length === 1) setContactPickerOpen(false); }}
                            >
                              <Checkbox checked={compose.to.split(",").map(e => e.trim()).includes(ce.email)} className="h-3 w-3" />
                              <span className="text-xs text-muted-foreground truncate">{ce.email}</span>
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
              <div className="space-y-1">
                <Label className="text-xs">CC</Label>
                <div className="flex gap-1">
                  <Input value={compose.cc} onChange={e => updateCompose({ cc: e.target.value })} placeholder="cc@email.de (optional)" className="h-8 text-sm flex-1" />
                  <Popover open={ccContactPickerOpen} onOpenChange={setCcContactPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="h-7 pl-7 text-sm" />
                        </div>
                      </div>
                      <ScrollArea className="max-h-48">
                        {filteredContacts.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                        ) : (
                          filteredContacts.map(contact => (
                            <div key={contact.id} className="border-b last:border-0">
                              <div className="px-3 pt-1.5 pb-0.5">
                                <span className="text-xs font-medium">{contact.displayName}</span>
                                {contact.company_name && contact.first_name && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({contact.company_name})</span>
                                )}
                              </div>
                              {contact.emails.map(ce => (
                                <button
                                  key={ce.email}
                                  className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-muted/50 transition-colors"
                                  onClick={() => { addEmailToField(ce.email, "cc"); if (contact.emails.length === 1) setCcContactPickerOpen(false); }}
                                >
                                  <Checkbox checked={compose.cc.split(",").map(e => e.trim()).includes(ce.email)} className="h-3 w-3" />
                                  <span className="text-xs text-muted-foreground truncate">{ce.email}</span>
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

              <div className="space-y-1">
                <Label className="text-xs">BCC</Label>
                <div className="flex gap-1">
                  <Input value={compose.bcc} onChange={e => updateCompose({ bcc: e.target.value })} placeholder="bcc@email.de (optional)" className="h-8 text-sm flex-1" />
                  <Popover open={bccContactPickerOpen} onOpenChange={setBccContactPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="h-7 pl-7 text-sm" />
                        </div>
                      </div>
                      <ScrollArea className="max-h-48">
                        {filteredContacts.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                        ) : (
                          filteredContacts.map(contact => (
                            <div key={contact.id} className="border-b last:border-0">
                              <div className="px-3 pt-1.5 pb-0.5">
                                <span className="text-xs font-medium">{contact.displayName}</span>
                                {contact.company_name && contact.first_name && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({contact.company_name})</span>
                                )}
                              </div>
                              {contact.emails.map(ce => (
                                <button
                                  key={ce.email}
                                  className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-muted/50 transition-colors"
                                  onClick={() => { addEmailToField(ce.email, "bcc"); if (contact.emails.length === 1) setBccContactPickerOpen(false); }}
                                >
                                  <Checkbox checked={compose.bcc.split(",").map(e => e.trim()).includes(ce.email)} className="h-3 w-3" />
                                  <span className="text-xs text-muted-foreground truncate">{ce.email}</span>
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

          <div className="space-y-1">
            <Label className="text-xs">Betreff</Label>
            <Input value={compose.subject} onChange={e => updateCompose({ subject: e.target.value })} placeholder="Betreff" className="h-8 text-sm" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Nachricht</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-primary"
                onClick={handleImproveText}
                disabled={isImproving || compose.bodyText.trim().length < 10}
                title="Text mit KI verbessern"
              >
                {isImproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              </Button>
            </div>
            <Textarea
              value={compose.bodyText}
              onChange={e => updateCompose({ bodyText: e.target.value })}
              placeholder="Ihre Nachricht..."
              className="min-h-[140px] resize-y text-sm"
            />
            {aiSuggestion !== null && (
              <div ref={aiSuggestionRef} className="border border-primary/30 bg-primary/5 rounded-md p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-primary flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    KI-Vorschlag
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => { updateCompose({ bodyText: aiSuggestion }); setAiSuggestion(null); }}
                      title="Übernehmen"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:bg-destructive/10"
                      onClick={() => setAiSuggestion(null)}
                      title="Verwerfen"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={aiSuggestion}
                  onChange={e => setAiSuggestion(e.target.value)}
                  className="min-h-[100px] resize-y text-sm bg-transparent border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3 w-3" />
              Anhang
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            {compose.attachments.length > 0 && (
              <div className="space-y-0.5">
                {compose.attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                    <button onClick={() => removeAttachment(idx)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex justify-between items-center gap-2 px-3 py-2 border-t shrink-0">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={closeCompose}>Verwerfen</Button>
        <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={handleSend} disabled={isSending}>
          {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Senden
        </Button>
      </div>
    </div>
  );
};
