import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Send, Loader2, Paperclip, X, Users, Search, Minus, Maximize2, Minimize2,
  ExternalLink, Wand2, Check, ChevronDown, ArrowLeft, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useComposeEmail, type ComposeState } from "@/contexts/ComposeEmailContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmailTemplatePicker } from "./EmailTemplatePicker";
import { VoiceDictationButton } from "./VoiceDictationButton";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// =====================================================================
// Container — renders one window per compose. Handles minimized stack
// at the bottom.
// =====================================================================
export const FloatingComposeWindow = () => {
  const { composes, openCompose } = useComposeEmail();
  const isMobile = useIsMobile();

  // Hydrate fullscreen mode from URL once on first mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("compose") !== "fullscreen") return;
    hydratedRef.current = true;
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
    const url = new URL(window.location.href);
    ["compose", "to", "cc", "bcc", "subject", "body", "accountId"].forEach((k) =>
      url.searchParams.delete(k),
    );
    window.history.replaceState({}, "", url.toString());
    // Mark this first one as fullscreen after creation.
    setTimeout(() => {
      // The just-created compose will be the last one. We rely on subsequent
      // rendering — see useEffect inside ComposeWindow which checks `?compose=fullscreen`
      // by reading the same param. To keep it simple we leave it docked here;
      // user can hit Maximize. (Full-tab usage is a power-user case.)
    }, 0);
  }, [openCompose]);

  if (composes.length === 0) return null;

  // Mobile: only show one at a time (the latest non-minimized, else last)
  if (isMobile) {
    const active = [...composes].reverse().find((c) => c.mode !== "minimized") || composes[composes.length - 1];
    const minimized = composes.filter((c) => c.id !== active.id || active.mode === "minimized");
    return (
      <>
        {composes.length > 0 && active.mode !== "minimized" && <ComposeWindow compose={active} />}
        {/* Minimized stack on mobile (single bar showing count) */}
        {minimized.length > 0 && (
          <MinimizedStack composes={composes.filter((c) => c.mode === "minimized")} />
        )}
      </>
    );
  }

  // Desktop: render docked/fullscreen window (at most one) + minimized stack
  const visible = composes.find((c) => c.mode === "docked" || c.mode === "fullscreen");
  const minimized = composes.filter((c) => c.mode === "minimized");
  // Shift minimized stack to the left of the docked window so action buttons don't get covered.
  const dockedVisible = visible?.mode === "docked";

  return (
    <>
      {visible && <ComposeWindow compose={visible} />}
      {minimized.length > 0 && (
        <MinimizedStack composes={minimized} offsetRight={dockedVisible ? 580 : 16} />
      )}
    </>
  );
};

// =====================================================================
// Minimized stack at the bottom-right (Gmail-style horizontal bars)
// =====================================================================
const MinimizedStack = ({ composes, offsetRight = 16 }: { composes: ComposeState[]; offsetRight?: number }) => {
  const { setMode, closeCompose } = useComposeEmail();
  return (
    <div
      className="fixed bottom-0 z-50 flex flex-row-reverse gap-2 pointer-events-none"
      style={{ right: `${offsetRight}px` }}
    >
      {composes.map((c) => (
        <div
          key={c.id}
          className="pointer-events-auto w-64 bg-card border border-border rounded-t-lg shadow-lg cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => setMode(c.id, "docked")}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium truncate flex-1">
              {c.replyTo ? "Antworten" : c.forward ? "Weiterleiten" : "Neue E-Mail"}
              {c.subject && ` – ${c.subject}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-1 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                closeCompose(c.id);
              }}
              aria-label="Verwerfen"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

// =====================================================================
// Main compose window — docked or fullscreen (and mobile fullscreen)
// =====================================================================
const ComposeWindow = ({ compose }: { compose: ComposeState }) => {
  const { closeCompose, setMode, updateCompose } = useComposeEmail();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

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
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const isFullscreen = compose.mode === "fullscreen";

  const update = useCallback(
    (u: Partial<ComposeState>) => updateCompose(compose.id, u),
    [updateCompose, compose.id],
  );

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
      return (contacts || [])
        .map((c) => ({
          ...c,
          emails: (emails || []).filter((e) => e.contact_id === c.id),
          displayName:
            [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Unbenannt",
        }))
        .filter((c) => c.emails.length > 0);
    },
  });

  // Auto-select account: prefer the one matching the logged-in user's email
  useEffect(() => {
    if (compose.accountId || accounts.length === 0) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userEmail = u?.user?.email?.toLowerCase();
      let matched: typeof accounts[number] | undefined;
      if (userEmail) {
        matched = accounts.find((a) => a.email_address?.toLowerCase() === userEmail);
        if (!matched) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, first_name, last_name")
            .eq("user_id", u!.user!.id)
            .maybeSingle();
          const profEmail = (profile as any)?.email?.toLowerCase();
          if (profEmail) matched = accounts.find((a) => a.email_address?.toLowerCase() === profEmail);
          if (!matched && profile) {
            const fullName = [(profile as any).first_name, (profile as any).last_name]
              .filter(Boolean).join(" ").toLowerCase();
            if (fullName) matched = accounts.find((a) => a.display_name?.toLowerCase().includes(fullName));
          }
        }
      }
      update({ accountId: (matched || accounts[0]).id });
    })();
  }, [accounts, compose.accountId, update]);

  // When forwarding an email, load its (non-inline) attachments once and stage
  // them as existingAttachments so they are visible in the UI and forwarded
  // along with the message.
  const forwardAttsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    const fwdId = compose.forward?.email_id;
    if (!fwdId) return;
    if (forwardAttsLoadedRef.current === fwdId) return;
    if ((compose.existingAttachments?.length || 0) > 0) {
      forwardAttsLoadedRef.current = fwdId;
      return;
    }
    forwardAttsLoadedRef.current = fwdId;
    (async () => {
      try {
        const { data: atts, error } = await supabase
          .from("email_attachments")
          .select("file_name, file_path, file_size, mime_type")
          .eq("email_id", fwdId)
          .eq("is_inline", false);
        if (error) throw error;
        if (!atts || atts.length === 0) return;
        // Copy original attachments to a new "outgoing/" path in storage so
        // the edge function can stream them without loading base64 into memory.
        // Avoids OOM when forwarding emails with large attachments.
        const loaded = await Promise.all(
          atts
            .filter((a) => a.file_path)
            .map(async (a) => {
              const safeName = String(a.file_name || "attachment").replace(/[^\w.\-]+/g, "_");
              const newPath = `outgoing/${crypto.randomUUID()}/${safeName}`;
              const { error: cpErr } = await supabase.storage
                .from("email-attachments")
                .copy(a.file_path!, newPath);
              if (cpErr) {
                console.error("Forward attachment copy failed:", cpErr.message);
                return null;
              }
              return {
                filename: a.file_name,
                storage_path: newPath,
                contentType: a.mime_type || "application/octet-stream",
                size: a.file_size || 0,
              };
            }),
        );
        const valid = loaded.filter((x): x is NonNullable<typeof x> => !!x);
        if (valid.length > 0) {
          update({ existingAttachments: valid });
        }
      } catch (err) {
        console.error("Failed to load forwarded attachments:", err);
        toast.error("Anhänge der Original-Mail konnten nicht geladen werden");
      }
    })();
  }, [compose.forward?.email_id, compose.existingAttachments?.length, update]);

  // Insert signature on account change (preserving quoted text after signature)
  const prevAccountRef = useRef<string>("");
  useEffect(() => {
    if (!compose.accountId || compose.accountId === prevAccountRef.current) return;
    const account = accounts.find((a) => a.id === compose.accountId);
    if (!account) return;
    if (!account.signature_html) {
      prevAccountRef.current = compose.accountId;
      return;
    }
    const sig = `\n\n${account.signature_html}`;
    const oldAccount = accounts.find((a) => a.id === prevAccountRef.current);
    const oldSig = oldAccount?.signature_html ? `\n\n${oldAccount.signature_html}` : null;
    const QUOTE_RE = /\n*---\s*(?:Ursprüngliche|Weitergeleitete)\s+Nachricht\s*---/;
    const body = compose.bodyText;
    const m = body.match(QUOTE_RE);
    let head: string;
    let tail: string;
    if (m && m.index !== undefined) {
      head = body.slice(0, m.index);
      tail = body.slice(m.index);
    } else {
      head = body;
      tail = "";
    }
    if (oldSig && head.endsWith(oldSig)) head = head.slice(0, -oldSig.length);
    if (head.endsWith(sig)) {
      prevAccountRef.current = compose.accountId;
      return;
    }
    const newBody = head + sig + tail;
    if (newBody !== body) update({ bodyText: newBody });
    prevAccountRef.current = compose.accountId;
  }, [compose.accountId, accounts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contactsWithEmails;
    const s = contactSearch.toLowerCase();
    return contactsWithEmails.filter(
      (c) =>
        c.displayName.toLowerCase().includes(s) ||
        c.company_name?.toLowerCase().includes(s) ||
        c.emails.some((e) => e.email.toLowerCase().includes(s)),
    );
  }, [contactsWithEmails, contactSearch]);

  const addEmailToField = (email: string, field: "to" | "cc" | "bcc" = "to") => {
    const currentVal = compose[field];
    const current = currentVal.split(",").map((e) => e.trim()).filter(Boolean);
    if (!current.includes(email)) {
      update({ [field]: current.length > 0 ? `${currentVal}, ${email}` : email } as Partial<ComposeState>);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 25 * 1024 * 1024;
    const newAttachments = [...compose.attachments];
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} ist zu groß (max. 25MB)`);
        continue;
      }
      newAttachments.push({ file, name: file.name, size: file.size });
    }
    update({ attachments: newAttachments });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    update({ attachments: compose.attachments.filter((_, i) => i !== index) });
  };

  const handleSend = async () => {
    if (!compose.accountId || !compose.to.trim()) {
      toast.error("Bitte Absender und Empfänger angeben");
      return;
    }
    setIsSending(true);
    try {
      const toAddresses = compose.to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccAddresses = compose.cc ? compose.cc.split(",").map((e) => e.trim()).filter(Boolean) : [];
      const bccAddresses = compose.bcc ? compose.bcc.split(",").map((e) => e.trim()).filter(Boolean) : [];
      // Upload almost all attachments to storage to avoid edge function memory limits.
      // Only tiny files (<128KB) may be sent inline as base64.
      const INLINE_LIMIT = 128 * 1024; // 128 KB
      const attachmentData = await Promise.all(
        compose.attachments.map(async (att) => {
          if (att.file.size > INLINE_LIMIT) {
            const safeName = att.name.replace(/[^\w.\-]+/g, "_");
            const storagePath = `outgoing/${crypto.randomUUID()}/${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("email-attachments")
              .upload(storagePath, att.file, {
                contentType: att.file.type || "application/octet-stream",
                upsert: false,
              });
            if (upErr) throw new Error(`Upload fehlgeschlagen (${att.name}): ${upErr.message}`);
            return {
              filename: att.name,
              storage_path: storagePath,
              contentType: att.file.type || "application/octet-stream",
              size: att.size,
            };
          }
          return {
            filename: att.name,
            content: await fileToBase64(att.file),
            contentType: att.file.type || "application/octet-stream",
            size: att.size,
          };
        }),
      );

      // Build combined HTML for forwards: user's new text on top + original HTML below
      const escapeHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const userTextHtml = compose.bodyText
        ? `<div style="white-space:pre-wrap;font-family:inherit">${escapeHtml(compose.bodyText)}</div>`
        : "";
      // Strip wrapper tags (<!DOCTYPE>, <html>, <head>...</head>, <body>) from forwarded HTML.
      // Otherwise mail clients render only the embedded <html> document and drop the user's prepended text.
      const sanitizeForwardHtml = (html: string): string => {
        let out = html;
        out = out.replace(/<!DOCTYPE[^>]*>/gi, "");
        out = out.replace(/<\/?html[^>]*>/gi, "");
        out = out.replace(/<head[\s\S]*?<\/head>/gi, "");
        out = out.replace(/<body[^>]*>/gi, "");
        out = out.replace(/<\/body>/gi, "");
        return out.trim();
      };
      const combinedHtml = compose.forwardHtml
        ? `<div>${userTextHtml}<br><hr><div><b>--- Weitergeleitete Nachricht ---</b></div>${sanitizeForwardHtml(compose.forwardHtml)}</div>`
        : null;

      // Scheduled send → store in scheduled_emails (insert or update on edit)
      if (compose.scheduledAt && new Date(compose.scheduledAt).getTime() > Date.now()) {
        const { data: u } = await supabase.auth.getUser();
        const userId = u?.user?.id;
        if (!userId) throw new Error("Nicht angemeldet");
        const mergedAttachments = [
          ...((compose.existingAttachments as any[]) || []),
          ...attachmentData,
        ];
        const payload = {
          account_id: compose.accountId,
          to_addresses: toAddresses,
          cc_addresses: ccAddresses.length ? ccAddresses : null,
          bcc_addresses: bccAddresses.length ? bccAddresses : null,
          subject: compose.subject,
          body_text: compose.bodyText,
          body_html: combinedHtml,
          attachments: mergedAttachments,
          scheduled_at: new Date(compose.scheduledAt).toISOString(),
        };
        if (compose.editingScheduledId) {
          const { error } = await supabase
            .from("scheduled_emails")
            .update({ ...payload, status: "scheduled", error_message: null })
            .eq("id", compose.editingScheduledId);
          if (error) throw error;
          toast.success(`Geplante E-Mail aktualisiert für ${new Date(compose.scheduledAt).toLocaleString("de-DE")}`);
        } else {
          const { error } = await supabase.from("scheduled_emails").insert({
            user_id: userId,
            ...payload,
          });
          if (error) throw error;
          toast.success(`E-Mail geplant für ${new Date(compose.scheduledAt).toLocaleString("de-DE")}`);
        }
        queryClient.invalidateQueries({ queryKey: ["scheduled-mails-virtual"] });
        closeCompose(compose.id);
        return;
      }

      // If user removed schedule on an editing row, cancel the original scheduled row
      if (compose.editingScheduledId && !compose.scheduledAt) {
        await supabase
          .from("scheduled_emails")
          .update({ status: "cancelled" })
          .eq("id", compose.editingScheduledId);
        queryClient.invalidateQueries({ queryKey: ["scheduled-mails-virtual"] });
      }

      const mergedSendAttachments = [
        ...((compose.existingAttachments as any[]) || []),
        ...attachmentData,
      ];
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          account_id: compose.accountId,
          to: toAddresses,
          cc: ccAddresses.length ? ccAddresses : undefined,
          bcc: bccAddresses.length ? bccAddresses : undefined,
          subject: compose.subject,
          body_text: compose.bodyText,
          body_html: combinedHtml || undefined,
          attachments: mergedSendAttachments.length ? mergedSendAttachments : undefined,
          in_reply_to: compose.replyTo?.message_id || compose.forward?.message_id || undefined,
          reply_to_email_id: compose.replyTo?.id || compose.forward?.email_id || undefined,
        },
      });
      if (error) throw error;
      toast.success("E-Mail gesendet!");
      // Refresh inbox so the green "replied" arrow appears immediately
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-replies"] });
      queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
      closeCompose(compose.id);
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
        setTimeout(
          () => aiSuggestionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
          100,
        );
      }
    } catch (err: any) {
      toast.error("KI-Verbesserung fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsImproving(false);
    }
  };

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
    window.open(`${window.location.origin}/postfach?${params.toString()}`, "_blank", "noopener,noreferrer");
    closeCompose(compose.id);
  };

  const handleInsertTemplate = ({ subject, body, subjectReplaced }: { subject: string; body: string; subjectReplaced: boolean }) => {
    const patch: Partial<ComposeState> = {};
    if (subject) {
      if (!compose.subject?.trim()) patch.subject = subject;
      else if (subjectReplaced) {
        // do not overwrite existing subject silently — leave it
      }
    }
    // Insert body at end of editable head (before quote), preserve signature/quote tail
    const QUOTE_RE = /\n*---\s*(?:Ursprüngliche|Weitergeleitete)\s+Nachricht\s*---/;
    const cur = compose.bodyText || "";
    const m = cur.match(QUOTE_RE);
    const head = m && m.index !== undefined ? cur.slice(0, m.index) : cur;
    const tail = m && m.index !== undefined ? cur.slice(m.index) : "";
    const sep = head && !head.endsWith("\n") ? "\n\n" : "";
    patch.bodyText = head + sep + body + (tail ? "\n\n" + tail : "");
    update(patch);
  };

  const handleVoiceAccept = (body: string, suggestedSubject?: string) => {
    const QUOTE_RE = /\n*---\s*(?:Ursprüngliche|Weitergeleitete)\s+Nachricht\s*---/;
    const cur = compose.bodyText || "";
    const m = cur.match(QUOTE_RE);
    const headFull = m && m.index !== undefined ? cur.slice(0, m.index) : cur;
    const tail = m && m.index !== undefined ? cur.slice(m.index) : "";

    // Split head into editable area + existing signature, so voice body lands ABOVE the signature.
    const account = accounts.find((a) => a.id === compose.accountId);
    const sig = account?.signature_html || "";
    let beforeSig = headFull;
    let signaturePart = "";
    if (sig) {
      const idx = headFull.lastIndexOf(sig);
      if (idx !== -1) {
        beforeSig = headFull.slice(0, idx).replace(/\s+$/, "");
        signaturePart = headFull.slice(idx);
      }
    }

    // Strip trailing closing/name lines from voice body so signature isn't duplicated.
    let cleanedBody = body.trimEnd();
    if (signaturePart) {
      // Remove "Mit freundlichen Grüßen ... <Name>" tail if AI included it despite instructions.
      const greetRe = /\n+\s*(Mit freundlichen Grüßen|Freundliche Grüße|Beste Grüße|Viele Grüße|Herzliche Grüße|Mit besten Grüßen|Hochachtungsvoll)[\s\S]*$/i;
      const beforeStrip = cleanedBody;
      cleanedBody = cleanedBody.replace(greetRe, "").trimEnd();
      // Safety: if we stripped everything, restore.
      if (!cleanedBody.trim()) cleanedBody = beforeStrip;
    }

    const sep = beforeSig && !beforeSig.endsWith("\n") ? "\n\n" : "";
    const sigJoin = signaturePart ? "\n\n" + signaturePart.replace(/^\s+/, "") : "";
    const newHead = beforeSig + sep + cleanedBody + sigJoin;

    const patch: Partial<ComposeState> = {
      bodyText: newHead + (tail ? "\n\n" + tail : ""),
    };
    if (suggestedSubject && !compose.subject?.trim()) patch.subject = suggestedSubject;
    update(patch);
  };

  const senderAccount = accounts.find((a) => a.id === compose.accountId);
  const voiceContext = {
    recipientEmail: compose.to,
    subject: compose.subject,
    existingBody: compose.bodyText,
    senderName: senderAccount?.display_name,
    isReply: !!compose.replyTo,
  };

  if (isMobile) {
    const title = compose.replyTo ? "Antworten" : compose.forward ? "Weiterleiten" : "Neue E-Mail";
    return (
      <div
        className="fixed inset-0 z-[60] bg-background flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Slim top bar: only back + title */}
        <div className="h-12 flex items-center gap-1 px-1 border-b bg-background shrink-0">
          <Button
            variant="ghost" size="icon" className="h-10 w-10 rounded-full shrink-0"
            onClick={() => setMode(compose.id, "minimized")}
            aria-label="Minimieren"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-base font-medium truncate flex-1">{title}</span>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          <FieldRow label="Von">
            <Select value={compose.accountId} onValueChange={(v) => update({ accountId: v })}>
              <SelectTrigger className="h-12 border-0 px-0 shadow-none focus:ring-0 text-sm flex-1 min-w-0">
                <SelectValue placeholder="Absender wählen…" />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name} &lt;{a.email_address}&gt;
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="An">
            <Input
              value={compose.to}
              onChange={(e) => update({ to: e.target.value })}
              placeholder="Empfänger (mehrere mit Komma)"
              type="email"
              className="h-12 border-0 px-0 shadow-none focus-visible:ring-0 text-sm flex-1 min-w-0"
            />
            <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Kontakt auswählen">
                  <Users className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[92vw] max-w-sm p-0 z-[80]" align="end">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Kontakt suchen..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <ScrollArea className="max-h-[50vh]">
                  {filteredContacts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
                  ) : (
                    filteredContacts.map((contact) => (
                      <div key={contact.id} className="border-b last:border-0">
                        <div className="px-3 pt-2 pb-0.5">
                          <span className="text-xs font-medium">{contact.displayName}</span>
                          {contact.company_name && contact.first_name && (
                            <span className="text-[10px] text-muted-foreground ml-1">({contact.company_name})</span>
                          )}
                        </div>
                        {contact.emails.map((ce) => (
                          <button
                            key={ce.email}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              addEmailToField(ce.email, "to");
                              if (contact.emails.length === 1) setContactPickerOpen(false);
                            }}
                          >
                            <Checkbox
                              checked={compose.to.split(",").map((e) => e.trim()).includes(ce.email)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs text-muted-foreground truncate">{ce.email}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </FieldRow>

          <FieldRow label="">
            <Input
              value={compose.subject}
              onChange={(e) => update({ subject: e.target.value })}
              placeholder="Betreff"
              className="h-12 border-0 px-0 shadow-none focus-visible:ring-0 text-base"
            />
          </FieldRow>

          {compose.scheduledAt && (
            <div className="px-4 py-2 border-b bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5" />
              Geplant für {new Date(compose.scheduledAt).toLocaleString("de-DE")}
              <button onClick={() => update({ scheduledAt: null })} className="ml-auto underline">aufheben</button>
            </div>
          )}

          {compose.attachments.length > 0 && (
            <div className="px-4 py-2 space-y-1.5 border-b bg-muted/30">
              {compose.attachments.map((att, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm bg-background rounded-md px-2.5 py-2 border">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{att.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                  <button onClick={() => removeAttachment(idx)} className="text-muted-foreground hover:text-destructive p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Textarea
            value={compose.bodyText}
            onChange={(e) => update({ bodyText: e.target.value })}
            placeholder="E-Mail verfassen"
            className="flex-1 min-h-[60vh] w-full border-0 rounded-none px-4 py-3 shadow-none focus-visible:ring-0 text-base resize-none"
          />
        </div>

        {/* Bottom action bar (moved from top) */}
        <div className="h-14 grid grid-cols-3 items-center gap-0.5 px-1 border-t bg-background shrink-0">
          <div className="flex items-center justify-start">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => closeCompose(compose.id)} aria-label="Verwerfen">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" onClick={() => fileInputRef.current?.click()} aria-label="Anhang">
              <Paperclip className="h-5 w-5" />
            </Button>
            <EmailTemplatePicker
              context={{ to: compose.to, accountId: compose.accountId }}
              currentSubject={compose.subject}
              onInsert={handleInsertTemplate}
            />
            <ScheduleButton compose={compose} update={update} open={scheduleOpen} setOpen={setScheduleOpen} />
            <VoiceDictationButton context={voiceContext} onAccept={handleVoiceAccept} />
          </div>
          <div className="flex items-center justify-end">
            <Button
              size="icon"
              className="h-11 w-11 rounded-full"
              onClick={handleSend}
              disabled={isSending || !compose.accountId || !compose.to.trim()}
              aria-label="Senden"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      </div>
    );
  }

  // ===== DESKTOP: docked block bottom-right OR fullscreen =====
  // Draggable position state (only used when docked, not fullscreen)
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);
  const WIN_W = 560;
  const WIN_H = 760;

  const onDragStart = (e: React.MouseEvent) => {
    if (isFullscreen) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const maxLeft = window.innerWidth - WIN_W;
      const maxTop = window.innerHeight - 40;
      const left = Math.max(0, Math.min(maxLeft, dragRef.current.origLeft + dx));
      const top = Math.max(0, Math.min(maxTop, dragRef.current.origTop + dy));
      setDragPos({ left, top });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 border-0 rounded-none shadow-none"
    : "fixed z-50 border border-border rounded-t-lg shadow-2xl";
  const containerStyle: React.CSSProperties = isFullscreen
    ? {}
    : dragPos
      ? { left: dragPos.left, top: dragPos.top, width: WIN_W, height: WIN_H }
      : { right: 16, bottom: 0, width: WIN_W, height: WIN_H };

  return (
    <div className={cn("bg-card flex flex-col overflow-hidden", containerClass)} style={containerStyle}>
      {/* Title bar (draggable when docked) */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground select-none shrink-0",
          !isFullscreen && "cursor-move",
        )}
        onMouseDown={onDragStart}
      >
        <span className="text-sm font-medium truncate">
          {compose.replyTo ? "Antworten" : compose.forward ? "Weiterleiten" : "Neue E-Mail"}
          {compose.subject ? ` – ${compose.subject}` : ""}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setMode(compose.id, "minimized")}
            title="Minimieren"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setMode(compose.id, isFullscreen ? "docked" : "fullscreen")}
            title={isFullscreen ? "Verkleinern" : "Vollbild"}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          {!isFullscreen && (
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={handlePopOut}
              title="In neuem Tab öffnen"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => closeCompose(compose.id)}
            title="Schließen"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-3">
        <div className={cn("space-y-2.5 mx-auto", isFullscreen ? "max-w-[1400px]" : "max-w-3xl")}>
          <div className="space-y-1">
            <Label className="text-xs">Von</Label>
            <Select value={compose.accountId} onValueChange={(v) => update({ accountId: v })}>
              <SelectTrigger className="h-8 text-sm">
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
            <RecipientField
              value={compose.to}
              onChange={(v) => update({ to: v })}
              placeholder="empfaenger@email.de"
              pickerOpen={contactPickerOpen}
              setPickerOpen={setContactPickerOpen}
              contactSearch={contactSearch}
              setContactSearch={setContactSearch}
              contacts={filteredContacts}
              addEmail={(e) => addEmailToField(e, "to")}
            />
          </div>

          {showCcBcc && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">CC</Label>
                <RecipientField
                  value={compose.cc}
                  onChange={(v) => update({ cc: v })}
                  placeholder="cc@email.de (optional)"
                  pickerOpen={ccContactPickerOpen}
                  setPickerOpen={setCcContactPickerOpen}
                  contactSearch={contactSearch}
                  setContactSearch={setContactSearch}
                  contacts={filteredContacts}
                  addEmail={(e) => addEmailToField(e, "cc")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">BCC</Label>
                <RecipientField
                  value={compose.bcc}
                  onChange={(v) => update({ bcc: v })}
                  placeholder="bcc@email.de (optional)"
                  pickerOpen={bccContactPickerOpen}
                  setPickerOpen={setBccContactPickerOpen}
                  contactSearch={contactSearch}
                  setContactSearch={setContactSearch}
                  contacts={filteredContacts}
                  addEmail={(e) => addEmailToField(e, "bcc")}
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Betreff</Label>
            <Input
              value={compose.subject}
              onChange={(e) => update({ subject: e.target.value })}
              placeholder="Betreff"
              className="h-8 text-sm"
            />
          </div>

          {compose.scheduledAt && (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs px-3 py-2 flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Geplant für {new Date(compose.scheduledAt).toLocaleString("de-DE")}</span>
              <button onClick={() => update({ scheduledAt: null })} className="ml-auto underline">aufheben</button>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Nachricht</Label>
              <Button
                type="button" variant="ghost" size="icon"
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
              onChange={(e) => update({ bodyText: e.target.value })}
              placeholder="Ihre Nachricht..."
              className={cn("resize-y text-sm", isFullscreen ? "min-h-[65vh]" : "min-h-[340px]")}
            />
            {aiSuggestion !== null && (
              <div ref={aiSuggestionRef} className="border border-primary/30 bg-primary/5 rounded-md p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-primary flex items-center gap-1">
                    <Wand2 className="h-3 w-3" /> KI-Vorschlag
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost" size="icon"
                      className="h-5 w-5 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => { update({ bodyText: aiSuggestion }); setAiSuggestion(null); }}
                      title="Übernehmen"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
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
                  onChange={(e) => setAiSuggestion(e.target.value)}
                  className="min-h-[100px] resize-y text-sm bg-transparent border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3 w-3" /> Anhang
              </Button>
              <EmailTemplatePicker
                context={{ to: compose.to, accountId: compose.accountId }}
                currentSubject={compose.subject}
                onInsert={handleInsertTemplate}
              />
              <VoiceDictationButton context={voiceContext} onAccept={handleVoiceAccept} buttonSize="sm" iconClassName="h-7 px-2 text-xs gap-1.5" />
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            {compose.existingAttachments && compose.existingAttachments.length > 0 && (
              <div className="space-y-0.5">
                {compose.existingAttachments.map((att: any, idx: number) => (
                  <div key={`ex-${idx}`} className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.filename || att.name}</span>
                    <span className="text-muted-foreground shrink-0">{att.size ? formatFileSize(att.size) : ""}</span>
                    <button
                      onClick={() => update({ existingAttachments: (compose.existingAttachments || []).filter((_: any, i: number) => i !== idx) })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {compose.attachments.length > 0 && (
              <div className="space-y-0.5">
                {compose.attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                    <button onClick={() => removeAttachment(idx)} className="text-muted-foreground hover:text-destructive">
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
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => closeCompose(compose.id)}>
          Verwerfen
        </Button>
        <div className="flex gap-1.5 items-center">
          <ScheduleButton compose={compose} update={update} open={scheduleOpen} setOpen={setScheduleOpen} />
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : compose.scheduledAt ? (
              <CalendarClock className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {compose.scheduledAt ? "Senden planen" : "Senden"}
          </Button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// Helpers
// =====================================================================
const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="px-4 border-b flex items-center gap-3">
    {label && <span className="text-xs text-muted-foreground w-10 shrink-0">{label}</span>}
    {children}
  </div>
);

const RecipientField = ({
  value, onChange, placeholder, pickerOpen, setPickerOpen,
  contactSearch, setContactSearch, contacts, addEmail,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  pickerOpen: boolean;
  setPickerOpen: (b: boolean) => void;
  contactSearch: string;
  setContactSearch: (s: string) => void;
  contacts: Array<{ id: string; displayName: string; company_name?: string | null; first_name?: string | null; emails: { email: string }[] }>;
  addEmail: (email: string) => void;
}) => {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const lastSegment = (value.split(",").pop() || "").trim();

  const suggestions = useMemo(() => {
    const q = lastSegment.toLowerCase();
    if (q.length < 1) return [];
    const already = new Set(value.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
    const out: { email: string; name: string; company?: string | null }[] = [];
    for (const c of contacts) {
      for (const e of c.emails) {
        const em = e.email.toLowerCase();
        if (already.has(em)) continue;
        const matches =
          em.includes(q) ||
          c.displayName.toLowerCase().includes(q) ||
          (c.company_name || "").toLowerCase().includes(q);
        if (matches) {
          out.push({ email: e.email, name: c.displayName, company: c.company_name });
          if (out.length >= 8) return out;
        }
      }
    }
    return out;
  }, [lastSegment, contacts, value]);

  const replaceLastSegment = (email: string) => {
    const parts = value.split(",");
    parts.pop();
    const prefix = parts.map((p) => p.trim()).filter(Boolean).join(", ");
    onChange((prefix ? prefix + ", " : "") + email + ", ");
    setSuggestionsOpen(false);
    setActiveIdx(0);
  };

  return (
    <div className="flex gap-1">
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value); setSuggestionsOpen(true); setActiveIdx(0); }}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
          onKeyDown={(e) => {
            if (!suggestionsOpen || suggestions.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" || e.key === "Tab") {
              const s = suggestions[activeIdx];
              if (s) { e.preventDefault(); replaceLastSegment(s.email); }
            } else if (e.key === "Escape") { setSuggestionsOpen(false); }
          }}
          placeholder={placeholder}
          className="h-8 text-sm w-full"
        />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-[70] bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
            {suggestions.map((s, idx) => (
              <button
                key={s.email + idx}
                type="button"
                className={cn(
                  "w-full flex flex-col items-start px-3 py-1.5 text-left hover:bg-muted/60 transition-colors",
                  idx === activeIdx && "bg-muted/60",
                )}
                onMouseDown={(e) => { e.preventDefault(); replaceLastSegment(s.email); }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <span className="text-xs font-medium truncate w-full">
                  {s.name}
                  {s.company && s.company !== s.name && (
                    <span className="text-muted-foreground font-normal ml-1">({s.company})</span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground truncate w-full">{s.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
            <Users className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Kontakt suchen..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} className="h-7 pl-7 text-sm" />
            </div>
          </div>
          <ScrollArea className="max-h-48">
            {contacts.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground text-center">Keine Kontakte gefunden</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="border-b last:border-0">
                  <div className="px-3 pt-1.5 pb-0.5">
                    <span className="text-xs font-medium">{contact.displayName}</span>
                    {contact.company_name && contact.first_name && (
                      <span className="text-[10px] text-muted-foreground ml-1">({contact.company_name})</span>
                    )}
                  </div>
                  {contact.emails.map((ce) => (
                    <button
                      key={ce.email}
                      className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        addEmail(ce.email);
                        if (contact.emails.length === 1) setPickerOpen(false);
                      }}
                    >
                      <Checkbox checked={value.split(",").map((e) => e.trim()).includes(ce.email)} className="h-3 w-3" />
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
  );
};

const ScheduleButton = ({
  compose, update, open, setOpen,
}: {
  compose: ComposeState;
  update: (u: Partial<ComposeState>) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
}) => {
  // Local datetime-local string ↔ ISO string
  const localValue = compose.scheduledAt
    ? new Date(new Date(compose.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
    : "";

  // Quick presets
  const presets: { label: string; minutes: number }[] = [
    { label: "In 1 Stunde", minutes: 60 },
    { label: "Morgen früh (08:00)", minutes: -1 }, // computed below
    { label: "Montag früh (08:00)", minutes: -2 }, // computed below
  ];

  const presetTime = (preset: typeof presets[number]): Date => {
    if (preset.minutes > 0) return new Date(Date.now() + preset.minutes * 60000);
    if (preset.minutes === -1) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d;
    }
    if (preset.minutes === -2) {
      const d = new Date();
      const dow = d.getDay();
      const add = dow === 0 ? 1 : 8 - dow; // next Monday
      d.setDate(d.getDate() + add);
      d.setHours(8, 0, 0, 0);
      return d;
    }
    return new Date();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={cn("h-7 px-2 text-xs gap-1", compose.scheduledAt && "border-amber-400 text-amber-700")}
          title="Sendezeit planen"
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 z-[80]" align="end">
        <div className="space-y-3">
          <div className="text-xs font-medium">Sendezeit planen</div>
          <div className="grid gap-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="ghost" size="sm" className="justify-start h-8 text-xs"
                onClick={() => {
                  update({ scheduledAt: presetTime(p).toISOString() });
                  setOpen(false);
                }}
              >
                {p.label}
                <span className="ml-auto text-muted-foreground">
                  {presetTime(p).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Eigene Zeit</Label>
            <Input
              type="datetime-local"
              value={localValue}
              onChange={(e) => {
                const v = e.target.value;
                update({ scheduledAt: v ? new Date(v).toISOString() : null });
              }}
              className="h-8 text-sm"
            />
          </div>
          {compose.scheduledAt && (
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">
                {new Date(compose.scheduledAt).toLocaleString("de-DE")}
              </span>
              <Button
                variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { update({ scheduledAt: null }); setOpen(false); }}
              >
                Zurücksetzen
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
