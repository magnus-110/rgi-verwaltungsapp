import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Mail, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

export interface DraftRow {
  id: string;
  account_id: string | null;
  to_addresses: string[];
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string;
  body_text: string;
  attachments: any;
  updated_at: string;
}

interface Props {
  items: DraftRow[];
  accounts: Array<{ id: string; email_address?: string; display_name?: string | null }>;
  onChanged: () => void;
}

export function DraftsPanel({ items, accounts, onChanged }: Props) {
  const { openCompose } = useComposeEmail();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const accountLabel = (id: string | null) => {
    if (!id) return "—";
    const a = accounts.find((x) => x.id === id);
    return a?.display_name || a?.email_address || "—";
  };

  const editDraft = (d: DraftRow) => {
    openCompose({
      editDraft: {
        id: d.id,
        accountId: d.account_id || "",
        to: (d.to_addresses || []).join(", "),
        cc: (d.cc_addresses || []).join(", "),
        bcc: (d.bcc_addresses || []).join(", "),
        subject: d.subject || "",
        bodyText: d.body_text || "",
        attachments: Array.isArray(d.attachments) ? (d.attachments as any[]) : [],
      },
    });
  };

  const removeDraft = async (d: DraftRow) => {
    if (!confirm(`Entwurf "${d.subject || "(ohne Betreff)"}" wirklich löschen?`)) return;
    setDeletingId(d.id);
    try {
      const { error } = await supabase.from("email_drafts").delete().eq("id", d.id);
      if (error) throw error;
      toast.success("Entwurf gelöscht");
      onChanged();
    } catch (e: any) {
      toast.error("Löschen fehlgeschlagen: " + (e.message || ""));
    } finally {
      setDeletingId(null);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b px-4 py-3 flex items-center gap-2 shrink-0">
        <FileText className="h-5 w-5 text-blue-600" />
        <h2 className="font-semibold">Entwürfe</h2>
        <Badge variant="outline" className="ml-2">
          {items.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Keine Entwürfe</p>
            <p className="text-xs text-muted-foreground mt-1">
              Beim Schließen einer unfertigen E-Mail wirst du gefragt, ob du sie als Entwurf speichern möchtest.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((d) => (
              <div
                key={d.id}
                className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => editDraft(d)}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Mail className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {d.subject || <span className="italic text-muted-foreground">(ohne Betreff)</span>}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>
                        Von: <span className="text-foreground">{accountLabel(d.account_id)}</span>
                        {" · "}
                        An:{" "}
                        <span className="text-foreground">
                          {(d.to_addresses || []).slice(0, 3).join(", ") || "—"}
                          {(d.to_addresses || []).length > 3 ? ` +${d.to_addresses.length - 3}` : ""}
                        </span>
                      </div>
                      <div>Zuletzt geändert: {fmt(d.updated_at)}</div>
                      {d.body_text && (
                        <div className="line-clamp-2 text-foreground/70 mt-1">{d.body_text.slice(0, 200)}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => editDraft(d)}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive"
                      disabled={deletingId === d.id}
                      onClick={() => removeDraft(d)}
                      title="Löschen"
                    >
                      {deletingId === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
