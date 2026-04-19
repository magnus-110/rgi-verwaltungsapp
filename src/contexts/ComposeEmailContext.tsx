import React, { createContext, useContext, useState, useCallback } from "react";

export interface ComposeState {
  isOpen: boolean;
  isMinimized: boolean;
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  forwardHtml?: string;
  attachments: { file: File; name: string; size: number }[];
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

const defaultState: ComposeState = {
  isOpen: false,
  isMinimized: false,
  accountId: "",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  bodyText: "",
  attachments: [],
  replyTo: null,
  forward: null,
};

interface ComposeEmailContextType {
  compose: ComposeState;
  openCompose: (opts?: { replyTo?: ComposeState["replyTo"]; forward?: ComposeState["forward"]; prefill?: { to?: string; cc?: string; bcc?: string; subject?: string; bodyText?: string; accountId?: string } }) => void;
  closeCompose: () => void;
  toggleMinimize: () => void;
  updateCompose: (updates: Partial<ComposeState>) => void;
}

const ComposeEmailContext = createContext<ComposeEmailContextType | null>(null);

export const useComposeEmail = () => {
  const ctx = useContext(ComposeEmailContext);
  if (!ctx) throw new Error("useComposeEmail must be used within ComposeEmailProvider");
  return ctx;
};

export const ComposeEmailProvider = ({ children }: { children: React.ReactNode }) => {
  const [compose, setCompose] = useState<ComposeState>(defaultState);

  const openCompose = useCallback((opts?: { replyTo?: ComposeState["replyTo"]; forward?: ComposeState["forward"]; prefill?: { to?: string; cc?: string; bcc?: string; subject?: string; bodyText?: string; accountId?: string } }) => {
    const replyTo = opts?.replyTo || null;
    const forward = opts?.forward || null;
    const prefill = opts?.prefill;

    setCompose({
      isOpen: true,
      isMinimized: false,
      accountId: prefill?.accountId || replyTo?.account_id || forward?.account_id || "",
      to: prefill?.to ?? (replyTo?.from_address || ""),
      cc: prefill?.cc ?? "",
      bcc: prefill?.bcc ?? "",
      subject: prefill?.subject ?? (replyTo ? `Re: ${replyTo.subject}` : forward ? `Fwd: ${forward.subject}` : ""),
      bodyText: prefill?.bodyText ?? (replyTo
        ? `\n\n--- Ursprüngliche Nachricht ---\nVon: ${replyTo.from_name} <${replyTo.from_address}>\nDatum: ${replyTo.date ? new Date(replyTo.date).toLocaleString("de-DE") : ""}\n\n${replyTo.body_text || ""}`
        : forward
          ? `\n\n--- Weitergeleitete Nachricht ---\n${forward.body_text || ""}`
          : ""),
      forwardHtml: forward?.body_html || undefined,
      attachments: [],
      replyTo,
      forward,
    });
  }, []);

  const closeCompose = useCallback(() => {
    setCompose(defaultState);
  }, []);

  const toggleMinimize = useCallback(() => {
    setCompose(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  const updateCompose = useCallback((updates: Partial<ComposeState>) => {
    setCompose(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <ComposeEmailContext.Provider value={{ compose, openCompose, closeCompose, toggleMinimize, updateCompose }}>
      {children}
    </ComposeEmailContext.Provider>
  );
};
