import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Key, KeyRound, Upload, FileText, History, Trash2, Send, RotateCcw, AlertTriangle, Camera } from "lucide-react";
import { KeyTag, KeyStorageLocation, KeyType, KeyEvent } from "./types";
import { KeyTagDialog } from "./KeyTagDialog";
import { KeyTagDetail } from "./KeyTagDetail";
import { KeyLoanDialog } from "./KeyLoanDialog";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Props { buildingId: string; }

export const BuildingKeysTab = ({ buildingId }: Props) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag?: KeyTag }>({ open: false });
  const [loanDialog, setLoanDialog] = useState<{ open: boolean; tag?: KeyTag }>({ open: false });
  const [detailTag, setDetailTag] = useState<KeyTag | null>(null);
  const [historyKeyFilter, setHistoryKeyFilter] = useState<string>("all");
  const [historyEventFilter, setHistoryEventFilter] = useState<string>("all");

  // Settings
  const { data: settings } = useQuery({
    queryKey: ["key-settings", buildingId],
    queryFn: async () => {
      const { data } = await supabase.from("key_property_settings").select("*").eq("building_id", buildingId).maybeSingle();
      return data;
    },
  });

  const { data: locations = [] } = useQuery<KeyStorageLocation[]>({
    queryKey: ["key-storage-locations"],
    queryFn: async () => (await supabase.from("key_storage_locations").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
  const { data: types = [] } = useQuery<KeyType[]>({
    queryKey: ["key-types"],
    queryFn: async () => (await supabase.from("key_types").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });

  const { data: tags = [] } = useQuery<KeyTag[]>({
    queryKey: ["key-tags", buildingId],
    queryFn: async () => (await supabase.from("key_tags").select("*").eq("building_id", buildingId).order("tag_number")).data ?? [],
  });

  const { data: activeLoans = [] } = useQuery({
    queryKey: ["key-loans-active", buildingId],
    queryFn: async () => (await supabase.from("key_loans").select("*").eq("building_id", buildingId).eq("status", "open")).data ?? [],
  });
  const loanByTag = useMemo(() => Object.fromEntries(activeLoans.map((l: any) => [l.tag_id, l])), [activeLoans]);

  const { data: events = [] } = useQuery<KeyEvent[]>({
    queryKey: ["key-events", buildingId],
    queryFn: async () => (await supabase.from("key_events").select("*").eq("building_id", buildingId).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  const eventTypes = useMemo(() => Array.from(new Set(events.map(e => e.event_type))), [events]);
  const filteredEvents = events.filter(e =>
    (historyKeyFilter === "all" || e.tag_id === historyKeyFilter) &&
    (historyEventFilter === "all" || e.event_type === historyEventFilter)
  );

  const saveSettings = async (patch: any) => {
    const { error } = await supabase.from("key_property_settings").upsert({ building_id: buildingId, ...patch });
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["key-settings", buildingId] }); toast.success("Gespeichert"); }
  };

  const uploadClosingPlan = async (file: File) => {
    const path = `${buildingId}/closing-plan-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("key-files").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    await saveSettings({
      closing_plan_path: path,
      closing_plan_name: file.name,
      closing_plan_uploaded_at: new Date().toISOString(),
      closing_plan_uploaded_by: user?.id,
    });
  };

  const downloadClosingPlan = async () => {
    if (!settings?.closing_plan_path) return;
    const { data } = await supabase.storage.from("key-files").createSignedUrl(settings.closing_plan_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const markReturned = async (loanId: string) => {
    const { error } = await supabase.from("key_loans").update({
      status: "returned",
      returned_at: new Date().toISOString(),
      returned_confirmed_by_user_id: user?.id,
    }).eq("id", loanId);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["key-loans-active", buildingId] });
      qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
      qc.invalidateQueries({ queryKey: ["key-events", buildingId] });
      qc.invalidateQueries({ queryKey: ["outstanding-keys"] });
      toast.success("Rückgabe bestätigt");
    }
  };

  const markLost = async (loanId: string) => {
    if (!confirm("Schlüssel als verloren markieren?")) return;
    const { error } = await supabase.from("key_loans").update({ status: "lost", returned_at: new Date().toISOString(), returned_confirmed_by_user_id: user?.id }).eq("id", loanId);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["key-loans-active", buildingId] });
      qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
      qc.invalidateQueries({ queryKey: ["outstanding-keys"] });
    }
  };

  const deleteTag = async (id: string) => {
    if (!confirm("Anhänger inkl. Schlüssel löschen?")) return;
    const { error } = await supabase.from("key_tags").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
  };

  if (detailTag) {
    return (
      <KeyTagDetail
        tag={detailTag}
        onBack={() => setDetailTag(null)}
        onEdit={() => setTagDialog({ open: true, tag: detailTag })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Liegenschaftsnummer + Schließplan */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Stammdaten</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Liegenschaftsnummer (3-stellig)</Label>
            <Input
              defaultValue={settings?.property_number ?? ""}
              maxLength={3}
              placeholder="004"
              onBlur={(e) => {
                const v = e.target.value.replace(/\D/g, "").padStart(3, "0").slice(0, 3);
                if (v !== settings?.property_number) saveSettings({ property_number: v });
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">Fließt in die Anhängernummer ein.</p>
          </div>
          <div>
            <Label>Schließplan</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && uploadClosingPlan(e.target.files[0])} />
              {settings?.closing_plan_path && (
                <Button variant="outline" size="sm" onClick={downloadClosingPlan}>Öffnen</Button>
              )}
            </div>
            {settings?.closing_plan_name && (
              <p className="text-xs text-muted-foreground mt-1">{settings.closing_plan_name}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Anhänger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Schlüsselanhänger ({tags.length})</CardTitle>
          <Button size="sm" onClick={() => setTagDialog({ open: true })}><Plus className="h-4 w-4 mr-1" /> Anhänger</Button>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Noch keine Anhänger angelegt.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tags.map(tag => {
                const loan = loanByTag[tag.id];
                const type = types.find(t => t.id === tag.key_type_id);
                const overdue = loan && isPast(new Date(loan.due_at));
                return (
                  <Card key={tag.id} className="hover:shadow-md transition cursor-pointer" onClick={() => setDetailTag(tag)}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-8 rounded-full" style={{ background: type?.color_hex ?? "#999" }} />
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-sm truncate">{tag.tag_number}</div>
                            <div className="text-xs text-muted-foreground truncate">{type?.name}</div>
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 -mt-1 -mr-1" onClick={(e) => { e.stopPropagation(); deleteTag(tag.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {tag.photo_path && (
                        <KeyTagPhoto path={tag.photo_path} />
                      )}
                      {loan ? (
                        <div className="space-y-1">
                          <Badge variant={overdue ? "destructive" : "secondary"} className="w-full justify-center">
                            {overdue ? <><AlertTriangle className="h-3 w-3 mr-1" /> Überfällig</> : "Verliehen"}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            an {loan.borrower_name ?? "—"} · bis {format(new Date(loan.due_at), "dd.MM.yyyy", { locale: de })}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); markReturned(loan.id); }}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Zurück
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={(e) => { e.stopPropagation(); markLost(loan.id); }}>
                              Verloren
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={(e) => { e.stopPropagation(); setLoanDialog({ open: true, tag }); }}>
                          <Send className="h-3 w-3 mr-1" /> Ausgeben
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verlauf */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Verlauf</CardTitle>
          <div className="flex gap-2 pt-2">
            <Select value={historyKeyFilter} onValueChange={setHistoryKeyFilter}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Anhänger</SelectItem>
                {tags.map(t => <SelectItem key={t.id} value={t.id}>{t.tag_number}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={historyEventFilter} onValueChange={setHistoryEventFilter}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Events</SelectItem>
                {eventTypes.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Keine Einträge.</div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredEvents.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">{e.event_type}</Badge>
                  <span className="text-muted-foreground shrink-0">{format(new Date(e.created_at), "dd.MM.yy HH:mm", { locale: de })}</span>
                  <span className="truncate flex-1">
                    {e.payload?.tag_number && <span className="font-mono">{e.payload.tag_number} </span>}
                    {e.payload?.borrower && <>→ {e.payload.borrower} </>}
                    {e.payload?.key_number && <>· Nr. {e.payload.key_number}</>}
                  </span>
                  <span className="text-muted-foreground shrink-0">{e.actor_label ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <KeyTagDialog
        open={tagDialog.open}
        onClose={() => setTagDialog({ open: false })}
        buildingId={buildingId}
        tag={tagDialog.tag}
      />
      {loanDialog.tag && (
        <KeyLoanDialog
          open={loanDialog.open}
          onClose={() => setLoanDialog({ open: false })}
          tag={loanDialog.tag}
          buildingId={buildingId}
        />
      )}
    </div>
  );
};

const KeyTagPhoto = ({ path }: { path: string }) => {
  const { data: url } = useQuery({
    queryKey: ["key-photo", path],
    queryFn: async () => (await supabase.storage.from("key-files").createSignedUrl(path, 600)).data?.signedUrl,
    staleTime: 5 * 60 * 1000,
  });
  if (!url) return null;
  return <img src={url} alt="" className="w-full h-24 object-cover rounded" />;
};
