import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mails, Pause, Play, Plus, Trash2 } from "lucide-react";
import { BulkMailEditor } from "./BulkMailEditor";
import { isBulkSendStalled, resumeBulkSend, stopBulkSend, watchBulkSend } from "@/lib/bulkSendWatch";

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  scheduled: { label: "Geplant", variant: "outline" },
  sending: { label: "Wird gesendet", variant: "outline" },
  sent: { label: "Gesendet", variant: "default" },
  failed: { label: "Fehlgeschlagen", variant: "destructive" },
};

export const BulkMailPanel = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newBuilding, setNewBuilding] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["bulk-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comm_campaigns")
        .select("id, name, status, building_id, recipient_count, sent_count, failed_count, scheduled_at, updated_at, error_message, buildings(name)")
        .eq("type", "email")
        .in("status", ["draft", "scheduled", "sending", "failed"])
        .order("updated_at", { ascending: false })
        .limit(100);


      if (error) throw error;
      return data || [];
    },
    enabled: !openId,
    // Während ein Versand läuft, Fortschritt regelmäßig nachladen
    refetchInterval: (query) =>
      ((query.state.data as any[]) || []).some((c) => c.status === "sending") ? 5000 : false,
  });

  const [actionId, setActionId] = useState<string | null>(null);

  const stopSending = async (c: any) => {
    if (!confirm(`Versand von „${c.name}“ anhalten?\n\nBereits verschickte E-Mails bleiben verschickt. Beim erneuten Senden werden nur noch die übrigen Empfänger angeschrieben.`)) return;
    setActionId(c.id);
    try {
      await stopBulkSend(c.id);
      toast({ title: "Versand angehalten" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setActionId(null);
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
    }
  };

  const resumeSending = async (c: any) => {
    setActionId(c.id);
    try {
      const res = await resumeBulkSend(c.id);
      if (res?.continued) {
        watchBulkSend(c.id);
        toast({ title: "Versand wird fortgesetzt" });
      } else if (res?.skipped === "running") {
        toast({ title: "Versand läuft noch", description: "Es wurde gerade eben noch eine E-Mail verschickt." });
      } else {
        toast({ title: "Versand ist nicht mehr aktiv" });
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setActionId(null);
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
    }
  };

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const createCampaign = async () => {
    if (!newBuilding) return toast({ title: "Bitte Gebäude wählen", variant: "destructive" });
    setCreating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { data, error } = await supabase
        .from("comm_campaigns")
        .insert({
          name: newName.trim() || "Neue Rundmail",
          type: "email",
          building_id: newBuilding,
          status: "draft",
          recipient_filter: { roles: [], contact_ids: [], assignment_ids: [], recipient_keys: [] },
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      setNewOpen(false);
      setNewName("");
      setNewBuilding("");
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      setOpenId(data.id);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Diese Rundmail wirklich löschen?")) return;
    const { error } = await supabase.from("comm_campaigns").delete().eq("id", id);
    if (error) return toast({ title: "Fehler", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
  };

  if (openId) {
    return <BulkMailEditor campaignId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-3 border-b shrink-0">
        <Mails className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium text-sm flex-1">Rundmails</h2>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Neue Rundmail
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Lade...</p>}
          {!isLoading && campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Rundmails. Mit „Neue Rundmail“ starten.
            </p>
          )}
          {campaigns.map((c: any) => {
            const st = STATUS_LABEL[c.status] || { label: c.status, variant: "secondary" as const };
            const sending = c.status === "sending";
            const done = (c.sent_count || 0) + (c.failed_count || 0);
            const stalled = isBulkSendStalled(c);
            return (
              <Card
                key={c.id}
                className={`p-3 flex items-center gap-3 ${sending ? "" : "cursor-pointer hover:bg-muted/40"}`}
                onClick={() => {
                  if (sending) return; // während des Versands nicht bearbeiten
                  setOpenId(c.id);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.buildings?.name || "—"}
                    {c.recipient_count ? ` · ${c.recipient_count} Empfänger` : ""}
                    {c.status === "sent" || c.status === "failed"
                      ? done > 0
                        ? ` · ${c.sent_count} gesendet${c.failed_count ? `, ${c.failed_count} Fehler` : ""}`
                        : ""
                      : ""}
                    {c.scheduled_at && c.status === "scheduled" ? ` · geplant: ${new Date(c.scheduled_at).toLocaleString("de-DE")}` : ""}
                  </div>
                  {sending && (
                    <div className="mt-1.5 space-y-1">
                      <Progress value={c.recipient_count ? (done / c.recipient_count) * 100 : 0} className="h-1.5" />
                      <div className="text-xs text-muted-foreground">
                        {done} von {c.recipient_count || "?"} verschickt
                        {c.failed_count ? ` (${c.failed_count} fehlgeschlagen)` : ""}
                        {stalled ? " · stockt – bitte „Fortsetzen“" : " · läuft im Hintergrund"}
                      </div>
                    </div>
                  )}
                  {c.status === "failed" && c.error_message && (
                    <div className="text-xs text-destructive truncate mt-0.5">{c.error_message}</div>
                  )}
                </div>
                {sending && stalled && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeSending(c);
                    }}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" /> Fortsetzen
                  </Button>
                )}
                {sending && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={actionId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      stopSending(c);
                    }}
                  >
                    <Pause className="h-3.5 w-3.5 mr-1" /> Anhalten
                  </Button>
                )}
                <Badge variant={st.variant}>{st.label}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={sending}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCampaign(c.id);
                  }}
                  aria-label="Löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Rundmail</DialogTitle>
            <DialogDescription>Gebäude wählen — danach Empfänger, Text und Anhänge festlegen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Gebäude</Label>
              <Select value={newBuilding} onValueChange={setNewBuilding}>
                <SelectTrigger>
                  <SelectValue placeholder="Gebäude wählen" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bezeichnung (optional)</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Einladung ETV 2026" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={createCampaign} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
