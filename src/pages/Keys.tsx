import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Edit,
  FileDown,
  History,
  KeyRound,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { KeyTagDialog } from "@/components/buildings/keys/KeyTagDialog";
import { KeyLoanDialog } from "@/components/buildings/keys/KeyLoanDialog";
import { EditKeyLoanDialog } from "@/components/buildings/keys/EditKeyLoanDialog";
import { HouseIcon } from "@/components/buildings/keys/IconPicker";
import { downloadFilledTagTemplate } from "@/components/buildings/keys/tagTemplate";
import { KeyQuickFind } from "@/components/keys/KeyQuickFind";
import { KeysSettingsTab } from "@/components/keys/KeysSettingsTab";
import {
  GlobalKeyTag,
  useGlobalKeyEvents,
  useGlobalKeyTags,
  useGlobalOpenLoans,
  useGlobalPropertySettings,
  useInvalidateGlobalKeys,
  useKeyBuildings,
  useKeyGlobalSettings,
  useKeyManufacturers,
  useKeyStorageLocations,
  useKeySubjectTypes,
  useKeyTypes,
} from "@/components/keys/useGlobalKeys";

export const Keys = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidateGlobal = useInvalidateGlobalKeys();

  const [tab, setTab] = useState("alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag?: any; buildingId?: string }>({ open: false });
  const [loanDialog, setLoanDialog] = useState<{ open: boolean; tag?: any; buildingId?: string }>({ open: false });
  const [editLoanDialog, setEditLoanDialog] = useState<{ open: boolean; loan?: any; buildingId?: string; tagNumber?: string }>({ open: false });
  const [buildingChooser, setBuildingChooser] = useState(false);
  const [chosenBuilding, setChosenBuilding] = useState<string>("");

  const { data: tags = [], isLoading } = useGlobalKeyTags();
  const { data: loans = [] } = useGlobalOpenLoans();
  const { data: events = [] } = useGlobalKeyEvents();
  const { data: propertySettings = [] } = useGlobalPropertySettings();
  const { data: buildings = [] } = useKeyBuildings();
  const { data: types = [] } = useKeyTypes();
  const { data: locations = [] } = useKeyStorageLocations();
  const { data: subjectTypes = [] } = useKeySubjectTypes();
  const { data: manufacturers = [] } = useKeyManufacturers();
  const { data: globalSettings } = useKeyGlobalSettings();

  const loanByTag = useMemo(
    () => Object.fromEntries(loans.map((l: any) => [l.tag_id, l])),
    [loans],
  );
  const settingsByBuilding = useMemo(
    () => Object.fromEntries(propertySettings.map((s: any) => [s.building_id, s])),
    [propertySettings],
  );
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const locationById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);

  const closeAndRefresh = () => {
    setTagDialog({ open: false });
    setLoanDialog({ open: false });
    setEditLoanDialog({ open: false });
    invalidateGlobal();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tags.filter((t) => {
      if (tab === "verliehen" && !loanByTag[t.id]) return false;
      if (buildingFilter !== "all" && t.building_id !== buildingFilter) return false;
      if (locationFilter !== "all" && t.storage_location_id !== locationFilter) return false;
      if (typeFilter && t.key_type_id !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        t.tag_number,
        t.buildings?.name ?? "",
        t.notes ?? "",
        locationById[t.storage_location_id]?.name ?? "",
        ...(t.keys ?? []).map((k) => `${k.key_number ?? ""} ${k.notes ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tags, tab, search, buildingFilter, locationFilter, typeFilter, loanByTag, locationById]);

  const selected = useMemo(() => tags.find((t) => t.id === selectedId) ?? null, [tags, selectedId]);
  const selectedLoan = selected ? loanByTag[selected.id] : null;

  const overdueCount = loans.filter((l: any) => l.due_at && isPast(new Date(l.due_at))).length;
  const buildingsWithTags = new Set(tags.map((t) => t.building_id)).size;

  // ───── Aktionen ─────

  const markReturned = async (loanId: string) => {
    const { data: loan } = await supabase
      .from("key_loans")
      .select("send_confirmation_email")
      .eq("id", loanId)
      .maybeSingle();
    const { error } = await supabase
      .from("key_loans")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        returned_confirmed_by_user_id: user?.id,
      })
      .eq("id", loanId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateGlobal();
    qc.invalidateQueries({ queryKey: ["key-tags"] });
    qc.invalidateQueries({ queryKey: ["key-loans-active"] });
    toast.success("Rückgabe bestätigt");
    if (loan?.send_confirmation_email) {
      supabase.functions
        .invoke("send-key-email", { body: { loan_id: loanId, event: "returned" } })
        .then(({ error: e }) => {
          if (e) toast.warning("Rückgabe-Webhook fehlgeschlagen: " + e.message);
        });
    }
  };

  const markLost = async (loanId: string) => {
    if (!confirm("Schlüssel als verloren markieren?")) return;
    const { data: loan } = await supabase
      .from("key_loans")
      .select("send_confirmation_email")
      .eq("id", loanId)
      .maybeSingle();
    const { error } = await supabase
      .from("key_loans")
      .update({ status: "lost", returned_at: new Date().toISOString(), returned_confirmed_by_user_id: user?.id })
      .eq("id", loanId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateGlobal();
    qc.invalidateQueries({ queryKey: ["key-tags"] });
    qc.invalidateQueries({ queryKey: ["key-loans-active"] });
    if (loan?.send_confirmation_email) {
      supabase.functions
        .invoke("send-key-email", { body: { loan_id: loanId, event: "lost" } })
        .then(({ error: e }) => {
          if (e) toast.warning("Verlust-Webhook fehlgeschlagen: " + e.message);
        });
    }
  };

  const deleteTag = async (tag: GlobalKeyTag) => {
    if (!confirm(`Anhänger ${tag.tag_number} inkl. Schlüssel löschen?`)) return;
    const { error } = await supabase.from("key_tags").delete().eq("id", tag.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (selectedId === tag.id) setSelectedId(null);
    invalidateGlobal();
    qc.invalidateQueries({ queryKey: ["key-tags"] });
  };

  const printTag = async (tag: GlobalKeyTag) => {
    if (!globalSettings?.tag_template_path) {
      toast.error("Es ist noch keine Anhänger-Vorlage hinterlegt (Tab Einstellungen).");
      return;
    }
    const type = typeById[tag.key_type_id];
    const s = settingsByBuilding[tag.building_id];
    try {
      await downloadFilledTagTemplate({
        templatePath: globalSettings.tag_template_path,
        templateName: globalSettings.tag_template_name,
        tagNumber: tag.tag_number,
        typeName: type?.name,
        typeColorHex: type?.color_hex,
        closingPlanNumber: s?.closing_plan_number,
        notes: tag.notes,
        propertyNumber: s?.property_number,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Fehler beim Erzeugen");
    }
  };

  const issue = (tag: GlobalKeyTag) =>
    setLoanDialog({ open: true, tag: tag as any, buildingId: tag.building_id });

  // ───── Render ─────

  const statusCell = (tag: GlobalKeyTag) => {
    const loan = loanByTag[tag.id];
    if (!loan) return <span className="text-sm text-emerald-600">Im Haus</span>;
    const overdue = loan.due_at && isPast(new Date(loan.due_at));
    return (
      <div className="min-w-0">
        <Badge variant={overdue ? "destructive" : "secondary"} className="mb-0.5">
          {overdue ? (
            <>
              <AlertTriangle className="h-3 w-3 mr-1" /> Überfällig
            </>
          ) : loan.due_at ? (
            "Verliehen"
          ) : (
            "Verliehen (offen)"
          )}
        </Badge>
        <div className="truncate text-xs text-muted-foreground">an {loan.borrower_name ?? "—"}</div>
      </div>
    );
  };

  const tagTable = (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche: Nummer, Gebäude, Schlüsselnummer, Notiz …"
            className="h-9 min-w-[220px] flex-1"
          />
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              {buildings.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Aufbewahrungsorte</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            {types.map((t) => {
              const active = typeFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(active ? null : t.id)}
                  className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: t.color_hex ?? "#999" }}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Wird geladen …</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Keine Anhänger gefunden.</div>
          )}
          {filtered.map((t) => {
            const type = typeById[t.key_type_id];
            const loan = loanByTag[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 ${
                  selectedId === t.id ? "bg-muted/70" : ""
                }`}
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ background: type?.color_hex ?? "#999" }}
                />
                <span className="w-[110px] shrink-0 font-mono text-sm font-semibold">{t.tag_number}</span>
                <span className="min-w-[150px] flex-1 truncate text-sm">{t.buildings?.name ?? "—"}</span>
                <span className="w-[150px] shrink-0 truncate text-sm text-muted-foreground">
                  {locationById[t.storage_location_id]?.name ?? "—"}
                </span>
                <span className="w-[80px] shrink-0 text-sm text-muted-foreground">
                  {(t.keys ?? []).length} Schl.
                </span>
                <span className="w-[170px] shrink-0">{statusCell(t)}</span>
                <span
                  className="ml-auto shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  {loan ? (
                    <Button size="sm" variant="outline" onClick={() => markReturned(loan.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Zurück
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => issue(t)}>
                      <Send className="h-3 w-3 mr-1" /> Ausgeben
                    </Button>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          {filtered.length} von {tags.length} Anhängern
        </div>
      </CardContent>
    </Card>
  );

  const detailPanel = selected && (
    <Card className="sticky top-4 self-start">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
        <div
          className="h-12 w-2 shrink-0 rounded-full"
          style={{ background: typeById[selected.key_type_id]?.color_hex ?? "#999" }}
        />
        <div className="min-w-0 flex-1">
          <CardTitle className="font-mono text-2xl">{selected.tag_number}</CardTitle>
          <div className="text-xs text-muted-foreground">
            {typeById[selected.key_type_id]?.name ?? "—"} ·{" "}
            {locationById[selected.storage_location_id]?.name ?? "—"}
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelectedId(null)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Gebäude</div>
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => navigate(`/buildings/${selected.building_id}`)}
          >
            {selected.buildings?.name ?? "—"}
          </button>
          <div className="text-xs text-muted-foreground">
            Liegenschaft {settingsByBuilding[selected.building_id]?.property_number ?? "—"}
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 text-sm ${
            selectedLoan ? "border-destructive/30 bg-destructive/5" : "border-emerald-600/30 bg-emerald-600/5"
          }`}
        >
          {selectedLoan ? (
            <>
              <div className="font-medium">Verliehen an {selectedLoan.borrower_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                seit {format(new Date(selectedLoan.issued_at), "dd.MM.yyyy", { locale: de })} ·{" "}
                {selectedLoan.due_at
                  ? `bis ${format(new Date(selectedLoan.due_at), "dd.MM.yyyy", { locale: de })}`
                  : "offene Rückgabe"}
              </div>
            </>
          ) : (
            <div className="font-medium">Im Haus</div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            Schlüssel am Anhänger ({(selected.keys ?? []).length})
          </div>
          <div className="space-y-1">
            {(selected.keys ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">Noch kein Schlüssel erfasst.</div>
            )}
            {(selected.keys ?? []).map((k) => {
              const st = subjectTypes.find((s) => s.id === k.subject_type_id);
              const mf = manufacturers.find((m) => m.id === k.manufacturer_id);
              return (
                <div key={k.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5">
                  <HouseIcon name={(st as any)?.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      {st?.name ?? "Schlüssel"}
                      {k.key_number && <span className="font-mono text-muted-foreground"> · {k.key_number}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{mf?.name ?? "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selected.notes && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Notiz</div>
            <div className="whitespace-pre-line text-sm text-muted-foreground">{selected.notes}</div>
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          {selectedLoan ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => markReturned(selectedLoan.id)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Zurücknehmen
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setEditLoanDialog({
                    open: true,
                    loan: selectedLoan,
                    buildingId: selected.building_id,
                    tagNumber: selected.tag_number,
                  })
                }
              >
                <Edit className="h-4 w-4 mr-1" /> Leihe bearbeiten
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={() => issue(selected)}>
              <Send className="h-4 w-4 mr-1" /> Ausgeben
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => printTag(selected)}>
              <FileDown className="h-4 w-4 mr-1" /> Etikett
            </Button>
            <Button
              variant="outline"
              onClick={() => setTagDialog({ open: true, tag: selected as any, buildingId: selected.building_id })}
            >
              <Edit className="h-4 w-4 mr-1" /> Bearbeiten
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {selectedLoan && (
              <Button variant="ghost" className="text-destructive" onClick={() => markLost(selectedLoan.id)}>
                Als verloren
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={() => deleteTag(selected)}>
              <Trash2 className="h-4 w-4 mr-1" /> Löschen
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Verlauf</div>
          <div className="space-y-1">
            {events.filter((e: any) => e.tag_id === selected.id).length === 0 && (
              <div className="text-sm text-muted-foreground">Keine Einträge.</div>
            )}
            {events
              .filter((e: any) => e.tag_id === selected.id)
              .slice(0, 12)
              .map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="w-[92px] shrink-0 text-muted-foreground">
                    {format(new Date(e.created_at), "dd.MM.yy HH:mm", { locale: de })}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {e.event_type}
                  </Badge>
                  <span className="truncate">{e.payload?.borrower ?? e.actor_label ?? ""}</span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="heading-primary text-2xl font-bold">Schlüssel</h1>
          <p className="text-sm text-muted-foreground">Alle Schlüsselanhänger über sämtliche Objekte hinweg</p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => {
            if (buildingFilter !== "all") setTagDialog({ open: true, buildingId: buildingFilter });
            else {
              setChosenBuilding("");
              setBuildingChooser(true);
            }
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Neuer Anhänger
        </Button>
      </div>

      <KeyQuickFind
        tags={tags}
        types={types}
        loanByTag={loanByTag}
        onOpen={(t) => {
          setSelectedId(t.id);
          setTab("alle");
        }}
        onIssue={(t) => issue(t)}
        onReturn={(t, loan) => markReturned(loan.id)}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Anhänger gesamt</div>
            <div className="text-2xl font-bold">{tags.length}</div>
            <div className="text-xs text-muted-foreground">über {buildingsWithTags} Objekte</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Aktuell verliehen</div>
            <div className="text-2xl font-bold">{loans.length}</div>
            <div className="text-xs text-muted-foreground">offene Leihen</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Überfällig</div>
            <div className={`text-2xl font-bold ${overdueCount ? "text-destructive" : ""}`}>{overdueCount}</div>
            <div className="text-xs text-muted-foreground">Rückgabedatum überschritten</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Objekte ohne Anhänger</div>
            <div className="text-2xl font-bold">{Math.max(buildings.length - buildingsWithTags, 0)}</div>
            <div className="text-xs text-muted-foreground">noch nicht erfasst</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="alle">
            <KeyRound className="h-4 w-4 mr-1" /> Alle Anhänger ({tags.length})
          </TabsTrigger>
          <TabsTrigger value="verliehen">
            <Send className="h-4 w-4 mr-1" /> Verliehen ({loans.length})
          </TabsTrigger>
          <TabsTrigger value="verlauf">
            <History className="h-4 w-4 mr-1" /> Verlauf
          </TabsTrigger>
          <TabsTrigger value="einstellungen">
            <Settings2 className="h-4 w-4 mr-1" /> Einstellungen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alle" className="mt-4">
          <div className={selected ? "grid gap-4 xl:grid-cols-[1fr_380px]" : ""}>
            {tagTable}
            {detailPanel}
          </div>
        </TabsContent>

        <TabsContent value="verliehen" className="mt-4">
          <div className={selected ? "grid gap-4 xl:grid-cols-[1fr_380px]" : ""}>
            {tagTable}
            {detailPanel}
          </div>
        </TabsContent>

        <TabsContent value="verlauf" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Keine Einträge.</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {events.map((e: any) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-[120px] shrink-0 text-xs text-muted-foreground">
                        {format(new Date(e.created_at), "dd.MM.yy HH:mm", { locale: de })}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px] font-mono">
                        {e.event_type}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate">
                        {e.payload?.tag_number && <span className="font-mono">{e.payload.tag_number} </span>}
                        {e.payload?.borrower && <>→ {e.payload.borrower} </>}
                        {e.payload?.key_number && <>· Nr. {e.payload.key_number}</>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.actor_label ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="einstellungen" className="mt-4">
          <KeysSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Gebäudeauswahl für einen neuen Anhänger */}
      <Dialog open={buildingChooser} onOpenChange={setBuildingChooser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Für welches Gebäude?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Gebäude</Label>
            <Select value={chosenBuilding} onValueChange={setChosenBuilding}>
              <SelectTrigger>
                <SelectValue placeholder="Gebäude wählen …" />
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuildingChooser(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!chosenBuilding}
              onClick={() => {
                setBuildingChooser(false);
                setTagDialog({ open: true, buildingId: chosenBuilding });
              }}
            >
              Weiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tagDialog.buildingId && (
        <KeyTagDialog
          open={tagDialog.open}
          onClose={closeAndRefresh}
          buildingId={tagDialog.buildingId}
          tag={tagDialog.tag}
        />
      )}
      {loanDialog.tag && loanDialog.buildingId && (
        <KeyLoanDialog
          open={loanDialog.open}
          onClose={closeAndRefresh}
          tag={loanDialog.tag}
          buildingId={loanDialog.buildingId}
        />
      )}
      {editLoanDialog.loan && editLoanDialog.buildingId && (
        <EditKeyLoanDialog
          open={editLoanDialog.open}
          onClose={closeAndRefresh}
          loan={editLoanDialog.loan}
          buildingId={editLoanDialog.buildingId}
          tagNumber={editLoanDialog.tagNumber}
        />
      )}
    </div>
  );
};

export default Keys;
