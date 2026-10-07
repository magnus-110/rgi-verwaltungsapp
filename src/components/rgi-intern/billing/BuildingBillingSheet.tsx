// Ebene 2 des Abrechnungsblatts: alles, was bei einer Liegenschaft
// abrechenbar ist — und ob es schon abgerechnet wurde.
//
// Herkünfte: Vertrag (Honorar + Zusatzleistungen), Stunden, Vorlage,
// Frei. Jede Position ist eine Karte: anklicken wählt sie aus,
// Bezeichnung, Menge und Einzelpreis lassen sich direkt ändern.
// Rechts steht live eine Vorschau der Rechnung(en) – je
// Zahlungspflichtigem eine eigene.

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Save, MoreVertical, Trash2, Ban, Calculator, FileStack, Receipt, Undo2, Info,
  FolderKanban, CheckCircle2, Landmark, User,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useManagementContracts } from "@/hooks/useManagementContracts";
import { useRgiItemPresets, type RgiPresetItem } from "@/hooks/useRgi";
import {
  useBuildingBillables, useOpenTimeForBuilding, useUpsertBillable,
  useSetBillableStatus, useDeleteBillable, useCreateInvoiceFromBillables,
} from "@/hooks/useRgiBilling";
import {
  type BillingRow, DEFAULT_INTRO, isOpenRow, rowNet, rowsNet,
  rowFromEvent, suggestionsFromContract, mergeSuggestions,
} from "@/types/rgiBilling";
import { type FeeDebtor, formatDate, formatEur } from "@/types/rgiContracts";
import { BillingRowDialog, PercentBaseDialog } from "./BillingRowDialogs";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId: string | null;
  buildingName: string;
  /**
   * Wird mit der ID des frisch angelegten Entwurfs aufgerufen. Ohne
   * das musste man den Entwurf in einer zweiten Liste wiederfinden -
   * genau die Naht, an der der Vorgang bisher abriss.
   */
  onDraftCreated?: (invoiceId: string) => void;
  /** Das oben in der Rechnungsübersicht gewählte Honorarjahr. */
  year?: number;
}

/** Lokale Änderungen an einer Zeile, bevor sie gespeichert werden. */
type Override = Partial<Pick<BillingRow, "label" | "quantity" | "unitPriceNet" | "vatRate">>;

type Tab = "open" | "done" | "dismissed";

const isDone = (r: BillingRow) => r.status === "invoiced" || r.status === "settled";

/** Für wen eine Rechnung ist – je Zahlungspflichtigem ein Entwurf. */
const DEBTOR_TITLE: Record<FeeDebtor, string> = {
  community: "Gemeinschaft",
  owner: "Einzelner Eigentümer",
  tenant: "Mieter",
};

const num = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

export function BuildingBillingSheet({
  open, onOpenChange, buildingId, buildingName, onDraftCreated, year: initialYear,
}: Props) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data: contracts } = useManagementContracts();
  const { data: events, isLoading } = useBuildingBillables(open ? buildingId : null);
  const { data: time } = useOpenTimeForBuilding(open ? buildingId : null);
  const { data: presets } = useRgiItemPresets();

  const upsert = useUpsertBillable();
  const setStatus = useSetBillableStatus();
  const remove = useDeleteBillable();
  const createInvoice = useCreateInvoiceFromBillables();

  const [year, setYear] = useState(initialYear ?? currentYear - 1);
  const [tab, setTab] = useState<Tab>("open");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [extraRows, setExtraRows] = useState<BillingRow[]>([]);
  const [mergeTime, setMergeTime] = useState(true);
  const [editRow, setEditRow] = useState<BillingRow | null>(null);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [percentRow, setPercentRow] = useState<BillingRow | null>(null);
  const [creating, setCreating] = useState(false);

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
    setTab("open");
    // Das Honorarjahr aus der Übersicht übernehmen.
    if (initialYear) setYear(initialYear);
  }, [open, buildingId, initialYear]);

  // ---------------- Zeilen zusammenstellen ----------------

  const eventRows = useMemo(() => (events ?? []).map(rowFromEvent), [events]);

  const suggestionRows = useMemo(
    () => mergeSuggestions(eventRows, suggestionsFromContract(contract, year)),
    [eventRows, contract, year],
  );

  const timeRows: BillingRow[] = useMemo(() => {
    const entries = time?.entries ?? [];
    const projects = time?.projects ?? [];
    const clients = (time as any)?.clients ?? [];
    return entries.map((e: any) => {
      const proj = projects.find((p: any) => p.id === e.project_id);
      const client = clients.find((c: any) => c.id === proj?.client_id);
      // Stundensatz: am Eintrag, sonst am Projekt, sonst am Kunden.
      const rate =
        e.hourly_rate != null ? Number(e.hourly_rate)
        : proj?.default_hourly_rate != null ? Number(proj.default_hourly_rate)
        : client?.default_hourly_rate != null ? Number(client.default_hourly_rate)
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
        timeEntryIds: [e.id],
        projectId: proj?.id ?? null,
        projectName: proj?.name?.trim() || "Ohne Projekt",
      };
    });
  }, [time, contract]);

  /** Alle Zeilen mit angewendeten lokalen Änderungen. */
  const allRows: BillingRow[] = useMemo(() => {
    const merged = [...suggestionRows, ...timeRows, ...extraRows, ...eventRows];
    return merged.map((r) => ({ ...r, ...(overrides[r.key] ?? {}) }));
  }, [suggestionRows, timeRows, extraRows, eventRows, overrides]);

  const counts = useMemo(() => ({
    open: allRows.filter(isOpenRow).length,
    done: allRows.filter(isDone).length,
    dismissed: allRows.filter((r) => r.status === "dismissed").length,
  }), [allRows]);

  const visible = useMemo(
    () => allRows.filter((r) =>
      tab === "open" ? isOpenRow(r) : tab === "done" ? isDone(r) : r.status === "dismissed"),
    [allRows, tab],
  );

  const groups = useMemo(() => {
    const g = {
      fee: [] as BillingRow[], extra: [] as BillingRow[], time: [] as BillingRow[],
      preset: [] as BillingRow[], manual: [] as BillingRow[],
    };
    for (const r of visible) {
      if (r.origin === "contract") (r.periodKey ? g.fee : g.extra).push(r);
      else g[r.origin].push(r);
    }
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

  const isSelectable = (r: BillingRow) => isOpenRow(r) && !(r.needsInput && !r.unitPriceNet);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (rows: BillingRow[]) => {
    const open = rows.filter(isSelectable);
    const allOn = open.length > 0 && open.every((r) => selected.has(r.key));
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
    setTab("open");
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

  /**
   * Zusammenfassen geschieht je Projekt, nicht über alles hinweg:
   * auf der Rechnung soll „Eingangsplattform, 2,5 Std" stehen und
   * nicht ein anonymer Sammelposten über drei Baustellen.
   */
  const readyRows = useMemo(() => {
    if (!mergeTime) return chosen;
    const timeSel = chosen.filter((r) => r.origin === "time");
    if (!timeSel.length) return chosen;

    const byProject = new Map<string, BillingRow[]>();
    for (const r of timeSel) {
      const k = r.projectId ?? "none";
      byProject.set(k, [...(byProject.get(k) ?? []), r]);
    }

    const merged: BillingRow[] = [];
    for (const [projectId, rows] of byProject) {
      if (rows.length === 1) { merged.push(rows[0]); continue; }
      const hours = rows.reduce((s, r) => s + r.quantity, 0);
      const cost = rows.reduce((s, r) => s + rowNet(r), 0);
      const dates = rows.map((r) => r.occurredOn).filter(Boolean).sort();
      const name = rows[0].projectName ?? "Zeithonorar";
      merged.push({
        ...rows[0],
        key: `time:merged:${projectId}`,
        label: `${name} — Zeitaufwand ${formatDate(dates[0])} bis ${formatDate(dates[dates.length - 1])}`,
        quantity: Math.round(hours * 100) / 100,
        unitPriceNet: hours > 0 ? Math.round((cost / hours) * 100) / 100 : 0,
        hint: `${rows.length} Zeiterfassungen zusammengefasst`,
        timeEntryIds: rows.flatMap((r) => r.timeEntryIds ?? []),
      });
    }
    return [...chosen.filter((r) => r.origin !== "time"), ...merged];
  }, [chosen, mergeTime]);

  /** Je Zahlungspflichtigem eine Rechnung. Gemeinschaft zuerst. */
  const invoiceGroups = useMemo(() => {
    const order: FeeDebtor[] = ["community", "owner", "tenant"];
    return order
      .map((debtor) => {
        const rows = readyRows.filter((r) => r.debtor === debtor);
        const net = rowsNet(rows);
        const vatByRate = new Map<number, number>();
        for (const r of rows) {
          vatByRate.set(r.vatRate, (vatByRate.get(r.vatRate) ?? 0) + (rowNet(r) * r.vatRate) / 100);
        }
        const vat = [...vatByRate.values()].reduce((s, v) => s + Math.round(v * 100) / 100, 0);
        return {
          debtor,
          rows,
          net,
          vatLines: [...vatByRate.entries()]
            .filter(([rate]) => rate > 0)
            .sort((a, b) => b[0] - a[0])
            .map(([rate, v]) => ({ rate, amount: Math.round(v * 100) / 100 })),
          gross: Math.round((net + vat) * 100) / 100,
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [readyRows]);

  /**
   * Legt die Entwürfe direkt an und öffnet den ersten – ohne Zwischen-
   * dialog. Datum, Leistungszeitraum und Text werden vorbelegt und
   * lassen sich auf der Entwurfsseite noch ändern.
   *
   *   Rechnungsdatum     heute
   *   Überweisen bis     31.12. des Rechnungsjahres
   *   Leistungszeitraum  ganzes Honorarjahr, sonst Spanne der Posten
   */
  const createDrafts = async () => {
    if (!buildingId) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    setCreating(true);
    try {
      let firstId: string | null = null;
      for (const g of invoiceGroups) {
        const hasYearFee = g.rows.some((r) => r.periodKey);
        const dates = g.rows.map((r) => r.occurredOn).filter(Boolean).sort();
        const inv = await createInvoice.mutateAsync({
          buildingId,
          rows: g.rows,
          createdBy: user?.id,
          paidByWithdrawal: false,
          templateId: null,
          issueDate: todayIso,
          dueDate: `${todayIso.slice(0, 4)}-12-31`,
          servicePeriodFrom: hasYearFee ? `${year}-01-01` : (dates[0] ?? null),
          servicePeriodTo: hasYearFee ? `${year}-12-31` : (dates[dates.length - 1] ?? null),
          introText: DEFAULT_INTRO,
        });
        firstId ??= inv?.id ?? null;
      }
      setSelected(new Set());
      setOverrides({});
      setExtraRows([]);
      if (firstId) onDraftCreated?.(firstId);
    } finally {
      setCreating(false);
    }
  };

  // ---------------- Darstellung ----------------

  /** Klick auf die Karte wählt aus – außer auf Eingabefelder und Menüs. */
  const onCardClick = (e: MouseEvent<HTMLDivElement>, r: BillingRow) => {
    if (!isSelectable(r)) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, button, [role='menuitem'], [data-no-toggle]")) return;
    toggle(r.key);
  };

  function renderRow(r: BillingRow) {
    const selectable = isSelectable(r);
    const isSel = selected.has(r.key);
    const editable = isOpenRow(r);
    const edited = !!overrides[r.key];
    const needsAmount = r.needsInput && !r.unitPriceNet;

    return (
      <div
        key={r.key}
        onClick={(e) => onCardClick(e, r)}
        className={[
          "group relative rounded-xl border bg-card pl-4 pr-12 py-3 flex flex-wrap items-start gap-x-3 gap-y-2 transition-colors",
          selectable ? "cursor-pointer" : "",
          isSel ? "border-primary/50 bg-orange-50/60 dark:bg-primary/10 ring-1 ring-primary/30" : "hover:border-foreground/20",
          needsAmount ? "border-dashed" : "",
          !editable ? "opacity-80" : "",
        ].join(" ")}
      >
        <div className="pt-1.5 w-5 shrink-0">
          {selectable && (
            <Checkbox
              checked={isSel}
              onCheckedChange={() => toggle(r.key)}
              aria-label={`${r.label} auswählen`}
            />
          )}
          {!editable && isDone(r) && <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />}
        </div>

        {/* Bezeichnung und Herkunft */}
        <div className="flex-1 min-w-[220px]">
          <Input
            value={r.label}
            onChange={(e) => patch(r.key, { label: e.target.value })}
            disabled={!editable}
            aria-label="Bezeichnung"
            className="h-8 border-transparent bg-transparent shadow-none px-1.5 -ml-1.5 hover:border-input focus-visible:border-input text-sm font-medium disabled:opacity-100 disabled:cursor-default"
          />
          <div className="flex items-center gap-1.5 flex-wrap mt-1 pl-0.5">
            {r.hint && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r.hint}</span>
            )}
            {r.debtor !== "community" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200 inline-flex items-center gap-1">
                <User className="w-3 h-3" />{DEBTOR_TITLE[r.debtor]} · eigene Rechnung
              </span>
            )}
            {isDone(r) && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 inline-flex items-center gap-1">
                <Receipt className="w-3 h-3" />{r.invoiceNumber ? `Rechnung ${r.invoiceNumber}` : "abgerechnet"}
              </span>
            )}
            {r.dismissedReason && (
              <span className="text-[11px] text-muted-foreground italic">„{r.dismissedReason}“</span>
            )}
            {edited && (
              <button
                type="button"
                onClick={() => resetRow(r.key)}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Undo2 className="w-3 h-3" />geändert – zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* Menge × Einzelpreis = Betrag */}
        {needsAmount ? (
          <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={() => setPercentRow(r)}>
            <Calculator className="w-3.5 h-3.5" />Betrag berechnen
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <Input
              type="number" step="0.01" inputMode="decimal"
              value={r.quantity}
              disabled={!editable}
              aria-label="Menge"
              onChange={(e) => patch(r.key, { quantity: Number(e.target.value) })}
              className="h-9 w-[76px] text-right text-sm disabled:opacity-100"
            />
            <span className="text-xs text-muted-foreground w-[54px] truncate" title={r.unit}>{r.unit}</span>
            <span className="text-xs text-muted-foreground">×</span>
            <div className="relative">
              <Input
                type="number" step="0.01" inputMode="decimal"
                value={r.unitPriceNet ?? 0}
                disabled={!editable}
                aria-label="Einzelpreis netto"
                onChange={(e) => patch(r.key, { unitPriceNet: Number(e.target.value) })}
                className="h-9 w-[104px] text-right text-sm pr-6 disabled:opacity-100"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
            </div>
            <span className="text-sm font-semibold tabular-nums w-[104px] text-right">
              {formatEur(rowNet(r))}
            </span>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 absolute right-1.5 top-3" aria-label="Weitere Aktionen">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {editable && <DropdownMenuItem onClick={() => setEditRow(r)}>Im Detail bearbeiten</DropdownMenuItem>}
            {r.needsInput && editable && (
              <DropdownMenuItem onClick={() => setPercentRow(r)}>
                <Calculator className="w-4 h-4 mr-2" />Betrag neu berechnen
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuItem onClick={() => dismiss(r)}>
                <Ban className="w-4 h-4 mr-2" />Nicht abrechnen
              </DropdownMenuItem>
            )}
            {r.eventId && editable && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => remove.mutate({ id: r.eventId!, buildingId: buildingId! })}
              >
                <Trash2 className="w-4 h-4 mr-2" />Löschen
              </DropdownMenuItem>
            )}
            {(r.origin === "preset" || r.origin === "manual") && !r.eventId && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setExtraRows((prev) => prev.filter((x) => x.key !== r.key));
                  setSelected((prev) => { const n = new Set(prev); n.delete(r.key); return n; });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />Entfernen
              </DropdownMenuItem>
            )}
            {!editable && r.invoiceNumber && (
              <DropdownMenuItem disabled>Steht auf Rechnung {r.invoiceNumber}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const groupHeader = (title: string, rows: BillingRow[], note?: string, extra?: ReactNode) => {
    const selectable = rows.filter(isSelectable);
    const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.key));
    return (
      <div className="flex items-baseline gap-2.5 flex-wrap px-1">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        <div className="ml-auto flex items-center gap-4">
          {extra}
          {selectable.length > 1 && (
            <button
              type="button"
              onClick={() => toggleGroup(rows)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {allOn ? "Keine auswählen" : "Alle auswählen"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (title: string, rows: BillingRow[], note?: string) => {
    if (!rows.length) return null;
    return (
      <section className="space-y-2">
        {groupHeader(title, rows, note)}
        <div className="space-y-2">{rows.map(renderRow)}</div>
      </section>
    );
  };

  /** Stunden je Projekt, Projekte nach Aufwand sortiert. */
  const renderTimeGroup = (rows: BillingRow[]) => {
    if (!rows.length) return null;
    const projects = [...rows.reduce((m, r) => {
      const k = r.projectName ?? "Ohne Projekt";
      m.set(k, [...(m.get(k) ?? []), r]);
      return m;
    }, new Map<string, BillingRow[]>())].sort((a, b) => rowsNet(b[1]) - rowsNet(a[1]));

    return (
      <section className="space-y-2">
        {groupHeader(
          "Erfasste Stunden", rows, "noch keiner Rechnung zugeordnet",
          tab === "open" ? (
            <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
              <Switch checked={mergeTime} onCheckedChange={setMergeTime} />
              je Projekt als eine Zeile
            </label>
          ) : undefined,
        )}
        {projects.map(([name, projectRows]) => {
          const selectable = projectRows.filter(isSelectable);
          const hours = projectRows.reduce((s, r) => s + r.quantity, 0);
          return (
            <div key={name} className="space-y-2">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-muted/60 text-sm">
                {selectable.length > 0 ? (
                  <Checkbox
                    checked={selectable.every((r) => selected.has(r.key))}
                    onCheckedChange={() => toggleGroup(projectRows)}
                    aria-label={`Alle Stunden aus ${name} auswählen`}
                  />
                ) : <span className="w-4" />}
                <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {num(hours)} Std · {projectRows.length} {projectRows.length === 1 ? "Eintrag" : "Einträge"}
                </span>
                <span className="ml-auto font-semibold tabular-nums">{formatEur(rowsNet(projectRows))}</span>
              </div>
              <div className="space-y-2 pl-3 border-l-2 border-muted ml-2">{projectRows.map(renderRow)}</div>
            </div>
          );
        })}
      </section>
    );
  };

  const years = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, year])).sort((a, b) => a - b);
  const tabs: { key: Tab; label: string }[] = [
    { key: "open", label: "Offen" },
    { key: "done", label: "Abgerechnet" },
    { key: "dismissed", label: "Verworfen" },
  ];

  const emptyText =
    tab === "open"
      ? contract
        ? "Hier ist gerade nichts offen. Über „Freie Position“ kannst du jederzeit etwas ergänzen."
        : "Für dieses Objekt ist kein Verwaltervertrag erfasst — deshalb gibt es keine Vorschläge. Du kannst trotzdem freie Positionen anlegen."
      : tab === "done"
        ? "Für dieses Objekt wurde über das Abrechnungsblatt noch nichts abgerechnet."
        : "Nichts verworfen. Posten, die du bewusst nicht abrechnest, landen hier – mit Begründung.";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col border-0 bg-background [&>button]:top-4 [&>button]:right-4">
          {/* Kopf */}
          <DialogHeader className="px-4 sm:px-6 pt-4 pb-0 border-b bg-background shrink-0 space-y-0 text-left">
            <div className="mx-auto w-full max-w-7xl">
              <div className="flex flex-wrap items-end justify-between gap-3 pr-10">
                <div>
                  <DialogTitle className="text-xl font-semibold tracking-tight">{buildingName}</DialogTitle>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                    {contract ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />Verwaltervertrag hinterlegt
                      </span>
                    ) : (
                      <span>kein Verwaltervertrag erfasst</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Honorarjahr</span>
                  <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label="Honorarjahr">
                    {years.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setYear(y)}
                        aria-pressed={year === y}
                        className={`h-8 px-3.5 rounded-full text-xs transition-colors ${
                          year === y ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 mt-3">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`h-10 px-3 inline-flex items-center gap-2 text-sm border-b-2 -mb-px transition-colors ${
                      tab === t.key
                        ? "border-primary font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                    <span className={`text-[11px] px-1.5 rounded-full ${tab === t.key ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                      {counts[t.key]}
                    </span>
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2 pb-2">
                  {hasUnsaved && (
                    <Button size="sm" variant="secondary" className="h-9 gap-1.5 rounded-full" onClick={saveEdits}>
                      <Save className="w-3.5 h-3.5" />Änderungen speichern
                    </Button>
                  )}
                  <Select value="" onValueChange={applyPreset}>
                    <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full text-xs whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" />Vorlage einfügen</div>
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
                  <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => setNewRowOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />Freie Position
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Inhalt: Positionen links, Vorschau rechts */}
          <div className="flex-1 overflow-y-auto bg-muted/40">
            <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 flex flex-wrap items-start gap-6">
              <div className="flex-[999_1_560px] min-w-0 space-y-6">
                {isLoading ? (
                  <Skeleton className="h-64 rounded-xl" />
                ) : visible.length === 0 ? (
                  <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                    <Info className="w-8 h-8 mx-auto mb-3 opacity-25" />
                    {emptyText}
                  </div>
                ) : (
                  <>
                    {renderGroup("Honorar laut Vertrag", groups.fee, "einmal im Jahr")}
                    {renderGroup("Zusatzleistungen laut Vertrag", groups.extra,
                      tab === "open" ? "Vorschläge – nichts wird ohne dein Zutun abgerechnet" : undefined)}
                    {renderTimeGroup(groups.time)}
                    {renderGroup("Aus Positionsvorlagen", groups.preset)}
                    {renderGroup("Freie Positionen", groups.manual)}
                  </>
                )}
              </div>

              {/* Vorschau */}
              <aside className="flex-[1_1_320px] min-w-0 lg:max-w-[400px] lg:sticky lg:top-0">
                <div className="rounded-2xl border bg-card overflow-hidden">
                  <div className="h-1 bg-primary" />
                  <div className="px-5 pt-4 pb-2">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Vorschau</div>
                    <div className="text-lg font-semibold mt-0.5">
                      {chosen.length === 0
                        ? "Noch nichts ausgewählt"
                        : `${chosen.length} ${chosen.length === 1 ? "Position" : "Positionen"}, ${invoiceGroups.length} ${invoiceGroups.length === 1 ? "Rechnung" : "Rechnungen"}`}
                    </div>
                  </div>

                  {chosen.length === 0 && (
                    <p className="px-5 pb-5 text-sm text-muted-foreground">
                      Hake links an, was auf die Rechnung soll. Menge und Preis kannst du direkt in der Karte ändern.
                    </p>
                  )}

                  {invoiceGroups.map((g) => (
                    <div key={g.debtor} className="px-5 py-4 border-t">
                      <div className="text-xs text-muted-foreground">Rechnung an</div>
                      <div className="font-semibold mb-2.5">
                        {g.debtor === "community" ? `Gemeinschaft ${buildingName}` : DEBTOR_TITLE[g.debtor]}
                      </div>
                      <div className="space-y-1.5">
                        {g.rows.map((r) => (
                          <div key={r.key} className="flex gap-3 text-sm">
                            <span className="flex-1 min-w-0 text-muted-foreground">
                              {r.label}
                              <span className="block text-[11px]">{num(r.quantity)} {r.unit} × {formatEur(r.unitPriceNet ?? 0)}</span>
                            </span>
                            <span className="tabular-nums whitespace-nowrap">{formatEur(rowNet(r))}</span>
                          </div>
                        ))}
                      </div>
                      <dl className="mt-3 pt-2.5 border-t space-y-1 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                          <dt>Netto</dt><dd className="tabular-nums">{formatEur(g.net)}</dd>
                        </div>
                        {g.vatLines.map((v) => (
                          <div key={v.rate} className="flex justify-between text-muted-foreground">
                            <dt>{num(v.rate)} % USt.</dt><dd className="tabular-nums">{formatEur(v.amount)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between items-baseline pt-1">
                          <dt className="font-semibold">Gesamt</dt>
                          <dd className="tabular-nums text-xl font-bold">{formatEur(g.gross)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}

                  <div className="px-5 py-4 border-t space-y-3">
                    <div className="flex gap-2.5 items-start rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                      <Landmark className="w-4 h-4 shrink-0 text-primary" />
                      <span>Wird durch die Hausverwaltung vom Gemeinschaftskonto überwiesen und landet automatisch im Zahlungslauf.</span>
                    </div>
                    <Button
                      className="w-full h-11 rounded-full gap-2 text-[15px]"
                      disabled={chosen.length === 0 || creating}
                      onClick={createDrafts}
                    >
                      <Receipt className="w-4 h-4" />
                      {invoiceGroups.length > 1 ? `${invoiceGroups.length} Rechnungsentwürfe erstellen` : "Rechnungsentwurf erstellen"}
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground">
                      Wird als Entwurf angelegt – du kannst danach noch alles ändern.
                    </p>
                  </div>
                </div>
              </aside>
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
            setTab("open");
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

    </>
  );
}
