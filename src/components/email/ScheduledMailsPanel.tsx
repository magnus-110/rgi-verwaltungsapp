import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Mail, Users, Trash2, ExternalLink, AlertTriangle, Loader2, Pencil, X, Eye, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

export interface ScheduledRecipient {
  contact_id: string;
  display_name: string;
  email: string | null;
}

export interface ScheduledItem {
  id: string;
  kind: "single" | "campaign";
  ref_id: string;
  subject: string;
  recipients: string[];
  recipient_count: number;
  scheduled_at: string | null;
  account_id: string | null;
  campaign_type?: string;
  error_message?: string | null;
  resolved_recipients?: ScheduledRecipient[];
}

interface Props {
  items: ScheduledItem[];
  accounts: Array<{ id: string; email_address?: string; display_name?: string | null }>;
  onChanged: () => void;
  onOpenCampaign: (id: string) => void;
}

export function ScheduledMailsPanel({ items, accounts, onChanged, onOpenCampaign }: Props) {
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    | {
        campaignId: string;
        contactId: string;
        recipientName: string;
        recipientEmail: string | null;
        subject: string;
        body: string;
        format: "html" | "plain";
        hasOverride: boolean;
      }
    | null
  >(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const { openCompose } = useComposeEmail();

  const openPreview = async (item: ScheduledItem, r: ScheduledRecipient, startInEdit = false) => {
    const key = `${item.id}:${r.contact_id}`;
    setPreviewLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke("comm-preview-recipients", {
        body: { campaign_id: item.ref_id, include_body: true },
      });
      if (error) throw error;
      const list = (data as any)?.recipients || [];
      const match = list.find((x: any) => x.contact_id === r.contact_id);
      if (!match) throw new Error("Empfänger nicht gefunden");
      setPreview({
        campaignId: item.ref_id,
        contactId: r.contact_id,
        recipientName: r.display_name,
        recipientEmail: r.email,
        subject: match.rendered_subject || "",
        body: match.rendered_body || "",
        format: (match.body_format as "html" | "plain") || "html",
        hasOverride: !!match.has_override,
      });
      setEditMode(startInEdit);
    } catch (e: any) {
      toast.error("Vorschau fehlgeschlagen: " + (e.message || ""));
    } finally {
      setPreviewLoading(null);
    }
  };

  const savePreviewOverride = async () => {
    if (!preview) return;
    setSavingPreview(true);
    try {
      const { error } = await supabase
        .from("comm_recipient_overrides")
        .upsert(
          {
            campaign_id: preview.campaignId,
            contact_id: preview.contactId,
            subject: preview.subject,
            body_html: preview.body,
          },
          { onConflict: "campaign_id,contact_id" },
        );
      if (error) throw error;
      toast.success("Empfänger-Mail gespeichert");
      setPreview({ ...preview, hasOverride: true });
      setEditMode(false);
      onChanged();
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e.message || ""));
    } finally {
      setSavingPreview(false);
    }
  };

  const resetPreviewOverride = async () => {
    if (!preview) return;
    if (!confirm("Individuelle Änderungen verwerfen und Vorlage verwenden?")) return;
    setSavingPreview(true);
    try {
      const { error } = await supabase
        .from("comm_recipient_overrides")
        .delete()
        .eq("campaign_id", preview.campaignId)
        .eq("contact_id", preview.contactId);
      if (error) throw error;
      toast.success("Auf Vorlage zurückgesetzt");
      setPreview(null);
      onChanged();
    } catch (e: any) {
      toast.error("Zurücksetzen fehlgeschlagen: " + (e.message || ""));
    } finally {
      setSavingPreview(false);
    }
  };


  const editScheduled = async (item: ScheduledItem) => {
    if (item.kind !== "single") return;
    setEditingId(item.id);
    try {
      const { data, error } = await supabase
        .from("scheduled_emails")
        .select("id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text, body_html, scheduled_at, attachments")
        .eq("id", item.ref_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Geplante Mail nicht gefunden");
      openCompose({
        editScheduled: {
          id: data.id,
          accountId: data.account_id || "",
          to: (data.to_addresses || []).join(", "),
          cc: (data.cc_addresses || []).join(", "),
          bcc: (data.bcc_addresses || []).join(", "),
          subject: data.subject || "",
          bodyText: data.body_text || "",
          bodyHtml: data.body_html,
          scheduledAt: data.scheduled_at,
          attachments: Array.isArray(data.attachments) ? (data.attachments as any[]) : [],
        },
      });
    } catch (e: any) {
      toast.error("Bearbeiten fehlgeschlagen: " + (e.message || ""));
    } finally {
      setEditingId(null);
    }
  };

  const accountLabel = (id: string | null) => {
    if (!id) return "—";
    const a = accounts.find((x) => x.id === id);
    return a?.display_name || a?.email_address || "—";
  };

  const cancel = async (item: ScheduledItem) => {
    if (!confirm(`"${item.subject}" wirklich abbrechen?`)) return;
    setCancelingId(item.id);
    try {
      if (item.kind === "single") {
        const { error } = await supabase
          .from("scheduled_emails")
          .update({ status: "cancelled" })
          .eq("id", item.ref_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comm_campaigns")
          .update({ status: "draft", scheduled_at: null })
          .eq("id", item.ref_id);
        if (error) throw error;
      }
      toast.success("Geplanter Versand abgebrochen");
      onChanged();
    } catch (e: any) {
      toast.error("Abbrechen fehlgeschlagen: " + (e.message || ""));
    } finally {
      setCancelingId(null);
    }
  };

  const removeRecipient = async (item: ScheduledItem, contactId: string) => {
    if (item.kind !== "campaign") return;
    if (!confirm("Empfänger aus dieser Rundmail entfernen?")) return;
    try {
      const { data: c, error: gErr } = await supabase
        .from("comm_campaigns")
        .select("recipient_filter")
        .eq("id", item.ref_id)
        .maybeSingle();
      if (gErr) throw gErr;
      const filter = ((c?.recipient_filter as any) || {}) as Record<string, any>;
      const remaining = (item.resolved_recipients || [])
        .filter((r) => r.contact_id !== contactId)
        .map((r) => r.contact_id);
      // Explicit contact_ids override role-based filter to lock the set after edits.
      filter.contact_ids = remaining;
      // Drop assignment_ids if any — explicit contact list takes priority.
      delete filter.assignment_ids;
      const { error: uErr } = await supabase
        .from("comm_campaigns")
        .update({ recipient_filter: filter, recipient_count: remaining.length })
        .eq("id", item.ref_id);
      if (uErr) throw uErr;
      toast.success("Empfänger entfernt");
      onChanged();
    } catch (e: any) {
      toast.error("Entfernen fehlgeschlagen: " + (e.message || ""));
    }
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b px-4 py-3 flex items-center gap-2 shrink-0">
        <CalendarClock className="h-5 w-5 text-amber-600" />
        <h2 className="font-semibold">Geplante E-Mails</h2>
        <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-300">
          {items.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Keine geplanten E-Mails</p>
            <p className="text-xs text-muted-foreground mt-1">
              Geplante Einzel- und Rundmails erscheinen hier bis zum Versand.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                    item.kind === "campaign"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  )}>
                    {item.kind === "campaign" ? <Users className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{item.subject}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.kind === "campaign" ? `Rundmail (${item.campaign_type || "email"})` : "Einzelmail"}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3 w-3" />
                        <span>{fmt(item.scheduled_at)}</span>
                      </div>
                      <div>
                        Von: <span className="text-foreground">{accountLabel(item.account_id)}</span>
                        {" · "}
                        Empfänger:{" "}
                        <span className="text-foreground">
                          {item.kind === "campaign"
                            ? `${item.recipient_count} Kontakte`
                            : item.recipients.slice(0, 3).join(", ") +
                              (item.recipients.length > 3 ? ` +${item.recipients.length - 3}` : "")}
                        </span>
                      </div>
                      {item.error_message && (
                        <div className="flex items-start gap-1 text-destructive mt-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{item.error_message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.kind === "single" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={editingId === item.id}
                        onClick={() => editScheduled(item)}
                        title="Bearbeiten"
                      >
                        {editingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Pencil className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {item.kind === "campaign" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onOpenCampaign(item.ref_id)}
                        title="In Kommunikation öffnen"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive"
                      disabled={cancelingId === item.id}
                      onClick={() => cancel(item)}
                      title="Versand abbrechen"
                    >
                      {cancelingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {item.kind === "campaign" && (
                  <div className="mt-3 ml-12 border-l-2 border-purple-200 dark:border-purple-900/40 pl-3">
                    {item.resolved_recipients === undefined ? (
                      <div className="space-y-1.5 py-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-4 w-2/3 bg-muted/60 rounded animate-pulse" />
                        ))}
                      </div>
                    ) : item.resolved_recipients.length === 0 ? (
                      <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5 py-1">
                        <AlertTriangle className="h-3 w-3" />
                        Keine Empfänger aufgelöst — Versand wird fehlschlagen.
                      </div>
                    ) : (
                      <ul className="space-y-0.5 py-0.5">
                        {item.resolved_recipients.map((r) => {
                          const hasEmail = !!r.email;
                          return (
                            <li
                              key={r.contact_id}
                              className="flex items-center gap-2 text-xs group/row py-0.5"
                            >
                              <Mail className={cn(
                                "h-3 w-3 shrink-0",
                                hasEmail ? "text-muted-foreground" : "text-destructive"
                              )} />
                              <span className="truncate flex-1">
                                <span className="text-foreground">{r.display_name || "(Unbekannt)"}</span>
                                {" "}
                                <span className={cn(
                                  hasEmail ? "text-muted-foreground" : "text-destructive italic"
                                )}>
                                  {hasEmail ? `<${r.email}>` : "(keine E-Mail)"}
                                </span>
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover/row:opacity-100"
                                onClick={() => openPreview(item, r)}
                                title="E-Mail-Vorschau anzeigen"
                                disabled={previewLoading === `${item.id}:${r.contact_id}`}
                              >
                                {previewLoading === `${item.id}:${r.contact_id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover/row:opacity-100 hover:text-destructive"
                                onClick={() => removeRecipient(item, r.contact_id)}
                                title="Aus Versand entfernen"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.subject}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 text-xs">
              <Mail className="h-3 w-3" />
              An: <span className="text-foreground">{preview?.recipientName}</span>
              {preview?.recipientEmail && (
                <span className="text-muted-foreground">&lt;{preview.recipientEmail}&gt;</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md bg-background">
            {preview?.format === "plain" ? (
              <pre className="text-sm whitespace-pre-wrap p-4 font-sans">{preview.body}</pre>
            ) : (
              <iframe
                title="E-Mail-Vorschau"
                srcDoc={preview?.body || ""}
                className="w-full h-[60vh] border-0 bg-white"
                sandbox=""
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
