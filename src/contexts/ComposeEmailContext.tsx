import React, { createContext, useContext, useState, useCallback } from "react";

export type ComposeMode = "minimized" | "docked" | "fullscreen";

export interface ComposeState {
  id: string;
  mode: ComposeMode;
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  forwardHtml?: string;
  attachments: { file: File; name: string; size: number }[];
  scheduledAt?: string | null; // ISO string when set
  /** When editing an existing scheduled email row, its id. */
  editingScheduledId?: string | null;
  /** Existing attachments from a scheduled email being edited (already base64 in DB). */
  existingAttachments?: any[];
  replyTo?: {
    id?: string;
    message_id?: string | null;
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

interface OpenOpts {
  replyTo?: ComposeState["replyTo"];
  forward?: ComposeState["forward"];
  prefill?: { to?: string; cc?: string; bcc?: string; subject?: string; bodyText?: string; accountId?: string };
}

interface ComposeEmailContextType {
  composes: ComposeState[];
  openCompose: (opts?: OpenOpts) => string;
  closeCompose: (id: string) => void;
  setMode: (id: string, mode: ComposeMode) => void;
  /** Backwards compat: toggles between docked/minimized for a single id (or the first compose) */
  toggleMinimize: (id?: string) => void;
  updateCompose: (id: string, updates: Partial<ComposeState>) => void;
}

const ComposeEmailContext = createContext<ComposeEmailContextType | null>(null);

export const useComposeEmail = () => {
  const ctx = useContext(ComposeEmailContext);
  if (!ctx) throw new Error("useComposeEmail must be used within ComposeEmailProvider");
  return ctx;
};

const stripHtml = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const buildInitial = (id: string, opts?: OpenOpts): ComposeState => {
  const replyTo = opts?.replyTo || null;
  const forward = opts?.forward || null;
  const prefill = opts?.prefill;
  return {
    id,
    mode: "docked",
    accountId: prefill?.accountId || replyTo?.account_id || forward?.account_id || "",
    to: prefill?.to ?? (replyTo?.from_address || ""),
    cc: prefill?.cc ?? "",
    bcc: prefill?.bcc ?? "",
    subject:
      prefill?.subject ?? (replyTo ? `Re: ${replyTo.subject}` : forward ? `Fwd: ${forward.subject}` : ""),
    bodyText:
      prefill?.bodyText ??
      (replyTo
        ? `\n\n--- Ursprüngliche Nachricht ---\nVon: ${replyTo.from_name} <${replyTo.from_address}>\nDatum: ${replyTo.date ? new Date(replyTo.date).toLocaleString("de-DE") : ""}\n\n${replyTo.body_text || stripHtml((replyTo as any).body_html || "")}`
        : forward
          ? `\n\n--- Weitergeleitete Nachricht ---\n${forward.body_text || stripHtml(forward.body_html || "")}`
          : ""),
    forwardHtml: forward?.body_html || undefined,
    attachments: [],
    scheduledAt: null,
    replyTo,
    forward,
  };
};

export const ComposeEmailProvider = ({ children }: { children: React.ReactNode }) => {
  const [composes, setComposes] = useState<ComposeState[]>([]);

  const openCompose = useCallback((opts?: OpenOpts) => {
    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setComposes((prev) => {
      // Gmail-style: if a new compose opens docked, minimize any other docked/fullscreen window.
      const adjusted = prev.map((c) => (c.mode === "minimized" ? c : { ...c, mode: "minimized" as ComposeMode }));
      return [...adjusted, buildInitial(id, opts)];
    });
    return id;
  }, []);

  const closeCompose = useCallback((id: string) => {
    setComposes((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const setMode = useCallback((id: string, mode: ComposeMode) => {
    setComposes((prev) =>
      prev.map((c) => {
        if (c.id !== id) {
          // If the target becomes docked/fullscreen, minimize others (Gmail-Verhalten)
          if (mode !== "minimized" && c.mode !== "minimized") {
            return { ...c, mode: "minimized" };
          }
          return c;
        }
        return { ...c, mode };
      }),
    );
  }, []);

  const toggleMinimize = useCallback((id?: string) => {
    setComposes((prev) => {
      const target = id ? prev.find((c) => c.id === id) : prev[0];
      if (!target) return prev;
      const newMode: ComposeMode = target.mode === "minimized" ? "docked" : "minimized";
      return prev.map((c) => {
        if (c.id !== target.id) {
          if (newMode !== "minimized" && c.mode !== "minimized") return { ...c, mode: "minimized" };
          return c;
        }
        return { ...c, mode: newMode };
      });
    });
  }, []);

  const updateCompose = useCallback((id: string, updates: Partial<ComposeState>) => {
    setComposes((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  return (
    <ComposeEmailContext.Provider value={{ composes, openCompose, closeCompose, setMode, toggleMinimize, updateCompose }}>
      {children}
    </ComposeEmailContext.Provider>
  );
};
