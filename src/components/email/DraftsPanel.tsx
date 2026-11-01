import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Trash2, Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { useAuth } from "@/hooks/useAuth";
import { useMailboxAbos } from "@/hooks/useNotifications";

export interface DraftRow {
  id: string;
  user_id?: string | null;
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

export function DraftsPanel({ items: vorab, accounts, onChanged }: Props) {
  const { openCompose } = useComposeEmail();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  /**
   * Eigene Entwürfe plus die Entwürfe der angehakten Postfächer: Wer das Konto
   * einer Kollegin mit anhakt, sieht auch, was sie dort vorbereitet hat. Ist
   * kein Postfach angehakt, wird — wie im Posteingang — nicht gefiltert.
   */
  const { data: abos = [] } = useMailboxAbos();
  const gewaehlt = abos.filter((a) => a.an).map((a) => a.id);
  const { data: geladen } = useQuery({
    queryKey: ["email-drafts", "postfaecher", currentUserId, gewaehlt.join(",")],
    enabled: !!currentUserId,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DraftRow[]> => {
      let query = supabase
        .from("email_drafts")
        .select(
          "id, user_id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text, attachments, updated_at",
        )
        .order("updated_at", { ascending: false });
      if (gewaehlt.length > 0) {
        query = query.or(`user_id.eq.${currentUserId},account_id.in.(${gewaehlt.join(",")})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DraftRow[];
    },
  });
  const items = geladen ?? vorab;

  // Namen der Kollegen, deren Entwürfe hier mit auftauchen
  const fremdeIds = Array.from(
    new Set(items.map((d) => d.user_id).filter((id): id is string => !!id && id !== currentUserId)),
  ).sort();
  const { data: namen = {} } = useQuery({
    queryKey: ["draft-authors", fremdeIds.join(",")],
    enabled: fremdeIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", fremdeIds);
      const map: Record<string, string> = {};
      ((data || []) as any[]).forEach((p) => {
        map[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Kollege";
      });
      return map;
    },
  });
  const fremd = (d: DraftRow) => !!d.user_id && !!currentUserId && d.user_id !== currentUserId;

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

  const empfaenger = (d: DraftRow) => {
    const an = d.to_addresses || [];
    if (an.length === 0) return "noch kein Empfänger";
    return an.slice(0, 2).join(", ") + (an.length > 2 ? ` +${an.length - 2}` : "");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 p-3 border-b shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium text-sm flex-1">Entwürfe</h2>
        <Button size="sm" onClick={() => openCompose()}>
          <Plus className="h-4 w-4 mr-1" /> Neue E-Mail
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Entwürfe. Beim Schließen einer unfertigen E-Mail wirst du gefragt, ob du sie als Entwurf
              speichern möchtest.
            </p>
          )}
          {items.map((d) => (
            <Card
              key={d.id}
              className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40"
              onClick={() => editDraft(d)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {d.subject || <span className="italic text-muted-foreground">(ohne Betreff)</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  An {empfaenger(d)} · von {accountLabel(d.account_id)} · {fmt(d.updated_at)}
                </div>
              </div>
              <Badge variant="secondary">
                {fremd(d) ? `Entwurf von ${namen[d.user_id!] || "Kollege"}` : "Entwurf"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                disabled={deletingId === d.id}
                onClick={(e) => {
                  e.stopPropagation();
                  removeDraft(d);
                }}
                aria-label="Löschen"
              >
                {deletingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
