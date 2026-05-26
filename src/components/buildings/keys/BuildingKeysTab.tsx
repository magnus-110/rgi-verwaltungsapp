import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, KeyRound, FileText, History, Trash2, Send, RotateCcw, AlertTriangle, Edit, ChevronDown, ChevronRight } from "lucide-react";
import { KeyTag, KeyStorageLocation, KeyType, KeyEvent, KeyItem, KeySubjectType, KeyManufacturer } from "./types";
import { KeyTagDialog } from "./KeyTagDialog";
import { KeyLoanDialog } from "./KeyLoanDialog";
import { DropdownWithAdd } from "./DropdownWithAdd";
import { HouseIcon } from "./IconPicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface Props { buildingId: string; }

export const BuildingKeysTab = ({ buildingId }: Props) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag?: KeyTag }>({ open: false });
  const [loanDialog, setLoanDialog] = useState<{ open: boolean; tag?: KeyTag }>({ open: false });
  const [historyKeyFilter, setHistoryKeyFilter] = useState<string>("all");
  const [historyEventFilter, setHistoryEventFilter] = useState<string>("all");
  const [stammdatenOpen, setStammdatenOpen] = useState(false);
  const [planNumber, setPlanNumber] = useState<string>("");

  // Settings (auto-create row on first access → trigger assigns 3-digit number)
  const { data: settings } = useQuery({
    queryKey: ["key-settings", buildingId],
    queryFn: async () => {
      const { data } = await supabase.from("key_property_settings").select("*").eq("building_id", buildingId).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings === null) {
      (async () => {
        const { error } = await supabase.from("key_property_settings").insert({ building_id: buildingId } as any);
        if (!error) qc.invalidateQueries({ queryKey: ["key-settings", buildingId] });
      })();
    }
  }, [settings, buildingId, qc]);

  useEffect(() => {
    if ((settings as any)?.closing_plan_number !== undefined) setPlanNumber((settings as any)?.closing_plan_number ?? "");
  }, [(settings as any)?.closing_plan_number]);

  const savePlanNumber = async (val: string) => {
    setPlanNumber(val);
    const { error } = await supabase.from("key_property_settings").update({ closing_plan_number: val || null } as any).eq("building_id", buildingId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["key-settings", buildingId] });
  };

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

  const uploadClosingPlan = async (file: File) => {
    const path = `${buildingId}/closing-plan-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("key-files").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { error: e2 } = await supabase.from("key_property_settings").upsert({
      building_id: buildingId,
      closing_plan_path: path,
      closing_plan_name: file.name,
      closing_plan_uploaded_at: new Date().toISOString(),
      closing_plan_uploaded_by: user?.id,
    });
    if (e2) toast.error(e2.message);
    else { qc.invalidateQueries({ queryKey: ["key-settings", buildingId] }); toast.success("Schließplan hochgeladen"); }
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
      qc.invalidateQueries({ queryKey: ["outstanding-key-loans"] });
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
      qc.invalidateQueries({ queryKey: ["outstanding-key-loans"] });
    }
  };

  const deleteTag = async (id: string) => {
    if (!confirm("Anhänger inkl. Schlüssel löschen?")) return;
    const { error } = await supabase.from("key_tags").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="tags" className="w-full">
        <TabsList>
          <TabsTrigger value="tags"><KeyRound className="h-4 w-4 mr-1" /> Schlüsselanhänger</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Verlauf</TabsTrigger>
        </TabsList>

        <TabsContent value="tags" className="space-y-4 mt-4">
          {/* Stammdaten (einklappbar) */}
          <Collapsible open={stammdatenOpen} onOpenChange={setStammdatenOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/40 transition-colors">
                  <CardTitle className="text-base flex items-center gap-2">
                    {stammdatenOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <FileText className="h-4 w-4" /> Stammdaten
                    {!stammdatenOpen && settings?.property_number && (
                      <span className="ml-2 text-xs font-mono text-muted-foreground">Nr. {settings.property_number}</span>
                    )}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Liegenschaftsnummer</Label>
                    <Input value={settings?.property_number ?? "…"} readOnly className="font-mono bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">Wird automatisch vergeben.</p>
                  </div>
                  <div>
                    <Label>Schließplannummer</Label>
                    <Input
                      value={planNumber}
                      onChange={(e) => setPlanNumber(e.target.value)}
                      onBlur={(e) => savePlanNumber(e.target.value)}
                      placeholder="z.B. SP-2024-001"
                      className="font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Schließplan (Datei)</Label>
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
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Anhängerliste */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Schlüsselanhänger ({tags.length})</CardTitle>
              <Button size="sm" onClick={() => setTagDialog({ open: true })}><Plus className="h-4 w-4 mr-1" /> Anhänger</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {tags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Noch keine Anhänger angelegt.</div>
              ) : (
                tags.map(tag => (
                  <TagListRow
                    key={tag.id}
                    tag={tag}
                    type={types.find(t => t.id === tag.key_type_id)}
                    loan={loanByTag[tag.id]}
                    onEdit={() => setTagDialog({ open: true, tag })}
                    onDelete={() => deleteTag(tag.id)}
                    onLoan={() => setLoanDialog({ open: true, tag })}
                    onReturn={markReturned}
                    onLost={markLost}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Verlauf</CardTitle>
              <div className="flex flex-wrap gap-2 pt-2">
                <Select value={historyKeyFilter} onValueChange={setHistoryKeyFilter}>
                  <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Anhänger</SelectItem>
                    {tags.map(t => <SelectItem key={t.id} value={t.id}>{t.tag_number}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={historyEventFilter} onValueChange={setHistoryEventFilter}>
                  <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
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
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
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
        </TabsContent>
      </Tabs>

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

// ───────────────────── Sub-Component: Tag-Zeile mit eingeklappten Schlüsseln ─────────────────────

interface TagRowProps {
  tag: KeyTag;
  type?: KeyType;
  loan?: any;
  onEdit: () => void;
  onDelete: () => void;
  onLoan: () => void;
  onReturn: (id: string) => void;
  onLost: (id: string) => void;
}

const TagListRow = ({ tag, type, loan, onEdit, onDelete, onLoan, onReturn, onLost }: TagRowProps) => {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<KeyItem>>({});

  const { data: keys = [] } = useQuery<KeyItem[]>({
    queryKey: ["keys", tag.id],
    queryFn: async () => (await supabase.from("keys").select("*").eq("tag_id", tag.id)).data ?? [],
  });
  const { data: subjectTypes = [] } = useQuery<KeySubjectType[]>({
    queryKey: ["key-subject-types"],
    queryFn: async () => (await supabase.from("key_subject_types").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });
  const { data: manufacturers = [] } = useQuery<KeyManufacturer[]>({
    queryKey: ["key-manufacturers"],
    queryFn: async () => (await supabase.from("key_manufacturers").select("*").eq("is_active", true).order("name")).data ?? [],
  });

  const overdue = loan && isPast(new Date(loan.due_at));

  const addKey = async () => {
    const { error } = await supabase.from("keys").insert({ ...form, tag_id: tag.id });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["keys", tag.id] });
    setForm({}); setShowAdd(false);
  };
  const delKey = async (id: string) => {
    if (!confirm("Schlüssel löschen?")) return;
    const { error } = await supabase.from("keys").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["keys", tag.id] });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="p-3 flex items-center gap-3 bg-card">
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: type?.color_hex ?? "#999" }} />
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold text-sm">{tag.tag_number}</div>
          <div className="text-xs text-muted-foreground truncate">
            {type?.name ?? "—"}
            {tag.notes && <> · {tag.notes}</>}
          </div>
        </div>
        {loan && (
          <div className="hidden md:flex flex-col items-end text-xs">
            <Badge variant={overdue ? "destructive" : "secondary"}>
              {overdue ? <><AlertTriangle className="h-3 w-3 mr-1" /> Überfällig</> : "Verliehen"}
            </Badge>
            <span className="text-muted-foreground mt-0.5">
              an {loan.borrower_name ?? "—"} · bis {format(new Date(loan.due_at), "dd.MM.yyyy", { locale: de })}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {loan ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onReturn(loan.id)}><RotateCcw className="h-3 w-3 mr-1" /> Zurück</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onLost(loan.id)}>Verloren</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onLoan}><Send className="h-3 w-3 mr-1" /> Ausgeben</Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Anhänger bearbeiten"><Edit className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete} title="Löschen"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">Schlüssel ({keys.length})</div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdd(s => !s)}>
              <Plus className="h-3 w-3 mr-1" /> Schlüssel
            </Button>
          </div>

          {showAdd && (
            <div className="border border-border rounded p-3 space-y-2 bg-background">
              <div>
                <Label className="text-xs">Schlüsseltyp</Label>
                <DropdownWithAdd
                  value={form.subject_type_id ?? undefined}
                  onChange={(v) => setForm({ ...form, subject_type_id: v })}
                  options={subjectTypes}
                  table="key_subject_types"
                  label="Schlüsseltyp"
                  extraFields={[{ label: "Icon", key: "icon", type: "icon" }]}
                  renderOption={(o: any) => (
                    <span className="flex items-center gap-2">
                      <HouseIcon name={o.icon} className="h-4 w-4 text-muted-foreground" />
                      {o.name}
                    </span>
                  )}
                  queryKey={["key-subject-types"]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Schlüsselnummer</Label><Input value={form.key_number ?? ""} onChange={(e) => setForm({ ...form, key_number: e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Hersteller</Label>
                  <DropdownWithAdd
                    value={form.manufacturer_id ?? undefined}
                    onChange={(v) => setForm({ ...form, manufacturer_id: v })}
                    options={manufacturers}
                    table="key_manufacturers"
                    label="Hersteller"
                    queryKey={["key-manufacturers"]}
                  />
                </div>
              </div>
              <div><Label className="text-xs">Notiz</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setForm({}); }}>Abbrechen</Button>
                <Button size="sm" onClick={addKey}>Hinzufügen</Button>
              </div>
            </div>
          )}

          {keys.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">Noch keine Schlüssel hinterlegt.</div>
          ) : (
            <div className="space-y-1">
              {keys.map(k => {
                const st = subjectTypes.find(s => s.id === k.subject_type_id);
                const mf = manufacturers.find(m => m.id === k.manufacturer_id);
                return (
                  <div key={k.id} className="flex items-center gap-3 px-2 py-1.5 border border-border/60 rounded bg-background">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{st?.name ?? "Schlüssel"} {k.key_number && <span className="font-mono text-muted-foreground">· {k.key_number}</span>}</div>
                      <div className="text-xs text-muted-foreground truncate">{mf?.name ?? "—"}{k.notes ? ` · ${k.notes}` : ""}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delKey(k.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
