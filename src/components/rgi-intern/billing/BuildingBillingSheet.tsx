// Ebene 2 des Abrechnungsblatts: alles, was bei einer Liegenschaft
// abrechenbar ist — und ob es schon abgerechnet wurde.
//
// Vier Herkünfte in einer Liste: Vertrag, Stunden, Vorlage, Frei.
// Jede Zeile ist an Ort und Stelle überschreibbar. Angehakte Zeilen
// werden zu einem Rechnungsentwurf.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Save, MoreVertical, Trash2, Ban, Calculator, FileStack, Receipt, Undo2, Info,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useManagementContracts } from "@/hooks/useManagementContracts";
import { useRgiItemPresets, useRgiTemplates, type RgiPresetItem } from "@/hooks/useRgi";
import {
  useBuildingBillables, useOpenTimeForBuilding, useUpsertBillable,
  useSetBillableStatus, useDeleteBillable, useCreateInvoiceFromBillables,
} from "@/hooks/useRgiBilling";
import {
  type BillingRow, ORIGIN_LABEL, ROW_STATUS_LABEL, isOpenRow, rowNet, rowsNet,
  rowFromEvent, suggestionsFromContract, mergeSuggestions,
} from "@/types/rgiBilling";
import { formatDate, formatEur } from "@/types/rgiContracts";
import { BillingRowDialog, PercentBaseDialog } from "./BillingRowDialogs";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId: string | null;
  buildingName: string;
}

/** Lokale Änderungen an einer Zeile, bevor sie gespeichert werden. */
type Override = Partial<Pick<BillingRow, "label" | "quantity" | "unitPriceNet" | "vatRate">>;

export function BuildingBillingSheet({ open, onOpenChange, buildingId, buildingName }: Props) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data: contracts } = useManagementContracts();
  const { data: events, isLoading } = useBuildingBillables(open ? buildingId : null);
  const { data: time } = useOpenTimeForBuilding(open ? buildingId : null);
  const { data: presets } = useRgiItemPresets();
  const { data: templates } = useRgiTemplates();

  const upsert = useUpsertBillable();
  const setStatus = useSetBillableStatus();
  const remove = useDeleteBillable();
  const createInvoice = useCreateInvoiceFromBillables();

  const [year, setYear] = useState(currentYear - 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [extraRows, setExtraRows] = useState<BillingRow[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [mergeTime, setMergeTime] = useState(true);
  const [editRow, setEditRow] = useState<BillingRow | null>(null);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [percentRow, setPercentRow] = useState<BillingRow | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const contract = useMemo(
    () => (contracts ?? []).find((c) => c.building_id === buildingId) ?? null,
    [contracts, buildingId],
  );

  // Beim Öffnen alles zurücksetzen, damit nichts aus dem
  // vorherigen Objekt hängen bleibt.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setOverrides({});
    setExtraRows([]);
    setShowDone(false);
  }, [open, buildingId]);

  // ---------------- Zeilen zusammenstellen ----------------

  const eventRows = useMemo(() => (events ?? []).map(rowFromEvent), [events]);

  const suggestionRows = useMemo(
    () => mergeSuggestions(eventRows, suggestionsFromContract(contract, year)),
    [eventRows, contract, year],
  );

  const timeRows: BillingRow[] = useMemo(() => {
    const entries = time?.entries ?? [];
    const projects = time?.projects ?? [];
    return entries.map((e: any) => {
      const proj = projects.find((p: any) => p.id === e.project_id);
      const rate =
        e.hourly_rate != null ? Number(e.hourly_rate)
        : proj?.default_hourly_rate != null ? Number(proj.default_hourly_rate)
        : 0;
      return {
        key: `time:${e.id}`,
        origin: "time" as const,
        eventId: null,
        status: "suggested" as const,
        label: `${formatDate(e.date)} — ${e.description}`,
        quantity: Number((e.minutes / 60).toFixed(2)),
        unit: "Std",
        unitPriceNet: rate,
        vatRate: 19,
        debtor: "community" as const,
        feeId: null,
        contractId: contract?.id ?? null,
        periodKey: null,
        sourceKind: "time_entry" as const,
        sourceId: e.id,
        occurredOn: e.date,
        hint: proj?.name ? `Projekt ${proj.name}` : undefined,
        timeEntryIds: [e.id],
      };
    });
  }, [time, contract]);

  /** Alle Zeilen mit angewendeten lokalen Änderungen. */
  const allRows: BillingRow[] = useMemo(() => {
    const merged = [...suggestionRows, ...timeRows, ...extraRows, ...eventRows];
    return merged.map((r) => ({ ...r, ...(overrides[r.key] ?? {}) }));
  }, [suggestionRows, timeRows, extraRows, eventRows, overrides]);

  const visible = useMemo(
    () => allRows.filter((r) => (showDone ? true : isOpenRow(r))),
    [allRows, showDone],
  );

  const groups = useMemo(() => {
    const g: Record<string, BillingRow[]> = { contract: [], time: [], preset: [], manual: [] };
    for (const r of visible) g[r.origin].push(r);
    return g;
  }, [visible]);

  const chosen = useMemo(
    () => allRows.filter((r) => selected.has(r.key)),
    [allRows, selected],
  );

  const hasUnsaved = useMemo(
    () => Object.keys(overrides).some((k) => allRows.find((r) => r.key === k)?.eventId),
    [overrides, allRows],
  );

  // ---------------- Aktionen ----------------

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (rows: BillingRow[]) => {
    const open = rows.filter(isOpenRow).filter((r) => !r.needsInput || r.unitPriceNet);
    const allOn = open.every((r) => selected.has(r.key));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of open) (allOn ? next.delete(r.key) : next.add(r.key));
      return next;
    });
  };

  const patch = (key: string, p: Override) =>
    setOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...p } }));

  const resetRow = (key: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const saveEdits = async () => {
    if (!buildingId) return;
    const toSave = allRows.filter((r) => r.eventId && overrides[r.key]);
    for (const r of toSave) {
      await upsert.mutateAsync({
        id: r.eventId!,
        building_id: buildingId,
        label: r.label,
        quantity: r.quantity,
        unit: r.unit,
        amount_net: r.unitPriceNet ?? 0,
        vat_rate: r.vatRate,
      } as any);
    }
    setOverrides({});
  };

  const applyPreset = (presetId: string) => {
    const p = presets?.find((x) => x.id === presetId);
    if (!p) return;
    const items = ((p.items as any) ?? []) as RgiPresetItem[];
    const today = new Date().toISOString().slice(0, 10);
    const rows: BillingRow[] = items.map((it, i) => ({
      key: `preset:${p.id}:${i}:${Date.now()}`,
      origin: "preset",
      eventId: null,
      status: "suggested",
      label: it.description || p.name,
      quantity: Number(it.quantity ?? 1),
      unit: it.unit || "Stück",
      unitPriceNet: Number(it.unit_price_net ?? 0),
      vatRate: Number(it.vat_rate ?? 19),
      debtor: "community",
      feeId: null,
      contractId: contract?.id ?? null,
      periodKey: null,
      sourceKind: "preset",
      sourceId: null,
      occurredOn: today,
      hint: `aus Vorlage „${p.name}“`,
    }));
    setExtraRows((prev) => [...prev, ...rows]);
    setSelected((prev) => new Set([...prev, ...rows.map((r) => r.key)]));
    toast.success(`Vorlage „${p.name}“ übernommen`);
  };

  const dismiss = async (row: BillingRow) => {
    if (!buildingId) return;
    const reason = window.prompt("Warum wird dieser Posten nicht abgerechnet?");
    if (reason === null) return;
    if (row.eventId) {
      await setStatus.mutateAsync({
        id: row.eventId, buildingId, status: "dismissed", dismissed_reason: reason || null,
      });
    } else {
      // Vorschlag festschreiben, damit er nicht wieder auftaucht.
      await upsert.mutateAsync({
        building_id: buildingId,
        contract_id: row.contractId,
        fee_id: row.feeId,
        status: "dismissed",
        occurred_on: row.occurredOn,
        label: row.label,
        quantity: row.quantity,
        unit: row.unit,
        amount_net: row.unitPriceNet ?? 0,
        vat_rate: row.vatRate,
        debtor: row.debtor,
        source_kind: row.sourceKind,
        source_id: row.sourceId,
        period_key: row.periodKey,
        dismissed_reason: reason || null,
      } as any);
    }
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(row.key);
      return n;
    });
  };

  const readyRows = useMemo(() => {
    if (!mergeTime) return chosen;
    const timeSel = chosen.filter((r) => r.origin === "time");
    if (timeSel.length < 2) return chosen;
    const hours = timeSel.reduce((s, r) => s + r.quantity, 0);
    const cost = timeSel.reduce((s, r) => s + rowNet(r), 0);
    const dates = timeSel.map((r) => r.occurredOn).sort();
    const merged: BillingRow = {
      ...timeSel[0],
      key: "time:merged",
      label: `Zeithonorar ${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`,
      quantity: Math.round(hours * 100) / 100,
      unitPriceNet: hours > 0 ? Math.round((cost / hours) * 100) / 100 : 0,
      hint: `${timeSel.length} Zeiterfassungen zusammengefasst`,
      timeEntryIds: timeSel.flatMap((r) => r.timeEntryIds ?? []),
    };
    return [...chosen.filter((r) => r.origin !== "time"), merged];
  }, [chosen, mergeTime]);

  // ---------------- Darstellung ----------------

  const statusBadge = (r: BillingRow) => {
    if (r.status === "invoiced" || r.status === "settled") {
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Receipt className="w-3 h-3" />
          {r.invoiceNumber ?? ROW_STATUS_LABEL[r.status]}
        </Badge>
      );
    }
    if (r.status === "dismissed") {
      return <Badge variant="outline" className="font-normal text-muted-foreground">Verworfen</Badge>;
    }
    if (r.status === "suggested") {
      return <Badge variant="outline" className="font-normal">Vorschlag</Badge>;
    }
    return <Badge variant="outline" className="font-normal">{ROW_STATUS_LABEL[r.status]}</Badge>;
  };

  const renderGroup = (title: string, rows: BillingRow[], note?: string) => {
    if (!rows.length) return null;
    const openRows = rows.filter(isOpenRow);
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40">
          {openRows.length > 0 && (
            <Checkbox
              checked={openRows.every((r) => selected.has(r.key)) && openRows.length > 0}
              onCheckedChange={() => toggleGroup(rows)}
              aria-label={`Alle ${title} auswählen`}
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">· {rows.length}</span>
          {note && <span className="text-xs text-muted-foreground ml-auto">{note}</span>}
        </div>

        <div className="divide-y">
          {rows.map((r) => {
            const selectable = isOpenRow(r) && !(r.needsInput && !r.unitPriceNet);
            const edited = !!overrides[r.key];
            return (
              <div key={r.key} className={`px-4 py-2.5 flex items-start gap-3 ${selected.has(r.key) ? "bg-primary/5" : ""}`}>
                <div className="pt-1.5 w-4">
                  {selectable && (
                    <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <Input
                    value={r.label}
                    onChange={(e) => patch(r.key, { label: e.target.value })}
                    disabled={!isOpenRow(r)}
                    className="h-8 border-transparent bg-transparent px-1 -ml-1 hover:border-input focus:border-input text-sm font-medium"
                  />
                  <div className="flex items-center gap-2 flex-wrap mt-0.5 pl-1">
                    {statusBadge(r)}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                      {ORIGIN_LABEL[r.origin]}
                    </Badge>
                    {r.hint && <span className="text-xs text-muted-foreground">{r.hint}</span>}
                    {r.dismissedReason && (
                      <span className="text-xs text-muted-foreground italic">{r.dismissedReason}</span>
                    )}
                    {edited && (
                      <button
                        onClick={() => resetRow(r.key)}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" />geändert
                      </button>
                    )}
                  </div>
                </div>

                {r.needsInput && !r.unitPriceNet ? (
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => setPercentRow(r)}>
                    <Calculator className="w-3.5 h-3.5" />Betrag berechnen
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number" step="0.01"
                      value={r.quantity}
                      disabled={!isOpenRow(r)}
                      onChange={(e) => patch(r.key, { quantity: Number(e.target.value) })}
                      className="h-8 w-[74px] text-right text-sm"
                    />
                    <span className="text-xs text-muted-foreground w-[52px] truncate">{r.unit}</span>
                    <Input
                      type="number" step="0.01"
                      value={r.unitPriceNet ?? 0}
                      disabled={!isOpenRow(r)}
                      onChange={(e) => patch(r.key, { unitPriceNet: Number(e.target.value) })}
                      className="h-8 w-[92px] text-right text-sm"
                    />
                    <span className="text-sm font-mono font-semibold w-[96px] text-right">
                      {formatEur(rowNet(r))}
                    </span>
                  </div>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditRow(r)}>Im Detail bearbeiten</DropdownMenuItem>
                    {r.needsInput && (
                      <DropdownMenuItem onClick={() => setPercentRow(r)}>
                        <Calculator className="w-4 h-4 mr-2" />Betrag neu berechnen
                      </DropdownMenuItem>
                    )}
                    {isOpenRow(r) && (
                      <DropdownMenuItem onClick={() => dismiss(r)}>
                        <Ban className="w-4 h-4 mr-2" />Nicht abrechnen
                      </DropdownMenuItem>
                    )}
                    {r.eventId && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => remove.mutate({ id: r.eventId!, buildingId: buildingId! })}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />Löschen
                      </DropdownMenuItem>
                    )}
                    {r.origin === "preset" && !r.eventId && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setExtraRows((prev) => prev.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />Entfernen
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col border-0 [&>button]:top-4 [&>button]:right-4">
          <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
              Abrechnung · {buildingName}
              {contract ? (
                <Badge variant="outline" className="font-normal">Vertrag hinterlegt</Badge>
              ) : (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  kein Verwaltervertrag erfasst
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Werkzeugleiste */}
          <div className="px-6 py-2.5 border-b flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Honorarjahr</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-8 w-[92px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Select value="" onValueChange={applyPreset}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <span className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" />Vorlage übernehmen…</span>
              </SelectTrigger>
              <SelectContent>
                {(presets ?? []).length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Vorlagen</div>
                )}
                {presets?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setNewRowOpen(true)}>
              <Plus className="w-3.5 h-3.5" />Freie Position
            </Button>

            {hasUnsaved && (
              <Button size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={saveEdits}>
                <Save className="w-3.5 h-3.5" />Änderungen speichern
              </Button>
            )}

            <div className="ml-auto flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={mergeTime} onCheckedChange={setMergeTime} />
                Stunden zusammenfassen
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={showDone} onCheckedChange={setShowDone} />
                Erledigtes einblenden
              </label>
            </div>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : visible.length === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                <Info className="w-8 h-8 mx-auto mb-3 opacity-25" />
                {contract
                  ? "Hier ist gerade nichts offen. Über „Erledigtes einblenden“ siehst du, was bereits abgerechnet wurde."
                  : "Für dieses Objekt ist kein Verwaltervertrag erfasst — deshalb gibt es keine Vorschläge. Du kannst trotzdem freie Positionen anlegen."}
              </Card>
            ) : (
              <>
                {renderGroup(
                  "Aus dem Verwaltervertrag", groups.contract,
                  contract ? "Vorschläge — nichts wird ohne dein Zutun abgerechnet" : undefined,
                )}
                {renderGroup("Erfasste Stunden", groups.time, "abrechenbar, noch keiner Rechnung zugeordnet")}
                {renderGroup("Aus Positionsvorlagen", groups.preset)}
                {renderGroup("Freie Positionen", groups.manual)}
              </>
            )}
          </div>

          {/* Fußleiste */}
          <div className="px-6 py-3 border-t shrink-0 flex items-center gap-4 flex-wrap">
            <div className="text-sm">
              <span className="font-semibold">{chosen.length}</span>
              <span className="text-muted-foreground"> ausgewählt · </span>
              <span className="font-mono font-semibold">{formatEur(rowsNet(chosen))}</span>
              <span className="text-muted-foreground"> netto</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
              <Button disabled={chosen.length === 0} onClick={() => setInvoiceOpen(true)} className="gap-1.5">
                <Receipt className="w-4 h-4" />Rechnung erstellen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BillingRowDialog
        open={newRowOpen || !!editRow}
        onOpenChange={(v) => { if (!v) { setNewRowOpen(false); setEditRow(null); } }}
        row={editRow}
        contractId={contract?.id ?? null}
        onSave={(row) => {
          if (editRow) {
            patch(editRow.key, {
              label: row.label, quantity: row.quantity,
              unitPriceNet: row.unitPriceNet, vatRate: row.vatRate,
            });
          } else {
            setExtraRows((prev) => [...prev, row]);
            setSelected((prev) => new Set([...prev, row.key]));
          }
          setNewRowOpen(false);
          setEditRow(null);
        }}
      />

      <PercentBaseDialog
        open={!!percentRow}
        onOpenChange={(v) => !v && setPercentRow(null)}
        row={percentRow}
        fees={contract?.fees ?? []}
        onApply={(amount, note) => {
          if (percentRow) patch(percentRow.key, { unitPriceNet: amount, label: `${percentRow.label}${note ? ` (${note})` : ""}` });
          setPercentRow(null);
        }}
      />

      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        rows={readyRows}
        buildingName={buildingName}
        templates={templates ?? []}
        year={year}
        pending={createInvoice.isPending}
        onConfirm={async (opts) => {
          if (!buildingId) return;
          await createInvoice.mutateAsync({
            buildingId,
            rows: readyRows,
            createdBy: user?.id,
            ...opts,
          });
          setInvoiceOpen(false);
          setSelected(new Set());
          setOverrides({});
          setExtraRows([]);
        }}
      />
    </>
  );
}
