// Rechnungen als Ablauf statt als flache Liste.
//
// Vier Stapel bilden den Weg ab, den eine Leistung nimmt:
//
//   Abzurechnen  →  Entwürfe  →  Offen  →  Bezahlt
//
// Der erste Stapel war früher ein eigener Menüpunkt „Abrechnung“.
// Ihn getrennt zu führen hieß, mitten im Vorgang den Bereich zu
// wechseln und den Objektbezug zu verlieren. Jetzt ist er der
// Einstieg in denselben Ablauf.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, ChevronRight, FileWarning, Plus, CircleDot, Clock, Wallet,
} from "lucide-react";
import { useBillingOverview } from "@/hooks/useRgiBilling";
import { useRgiInvoices, useRgiClients } from "@/hooks/useRgi";
import {
  type BillingOverviewRow, feeYearBilled, hasOpenWork, openWorkNet,
} from "@/types/rgiBilling";
import { formatDate, formatEur } from "@/types/rgiContracts";
import { BuildingBillingSheet } from "../billing/BuildingBillingSheet";
import { InvoiceEditorDialog } from "./InvoiceEditorDialog";
import { InvoiceDetailDialog } from "./InvoiceDetailDialog";

type StackKey = "todo" | "draft" | "open" | "paid";

const today = () => new Date().toISOString().slice(0, 10);

/** Überfällig ist nur, was auch wirklich überwiesen werden muss. */
function isOverdue(inv: any): boolean {
  if (inv.paid_by_withdrawal) return false;
  if (!inv.due_date) return false;
  return inv.due_date < today() && Number(inv.paid_amount) < Number(inv.total_gross);
}

export function InvoicesTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const [stack, setStack] = useState<StackKey>("todo");
  const [search, setSearch] = useState("");

  const { data: overview, isLoading: loadingObjects } = useBillingOverview();
  const { data: invoices, isLoading: loadingInvoices } = useRgiInvoices();
  const { data: clients } = useRgiClients();

  const [sheetFor, setSheetFor] = useState<{ id: string; name: string } | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";
  const buildingName = (id: string | null) =>
    (overview ?? []).find((o) => o.building_id === id)?.building_name ?? null;

  // ---------------- Stapel füllen ----------------

  const todo = useMemo(
    () => (overview ?? [])
      .filter((r) => hasOpenWork(r, year))
      .sort((a, b) => openWorkNet(b, year) - openWorkNet(a, year)),
    [overview, year],
  );

  const buckets = useMemo(() => {
    const all = invoices ?? [];
    const drafts = all.filter((i) => i.status === "draft");
    const paid = all.filter(
      (i) => i.status === "paid" ||
        (i.invoice_number && Number(i.paid_amount) >= Number(i.total_gross) && Number(i.total_gross) > 0),
    );
    const paidIds = new Set(paid.map((i) => i.id));
    const open = all.filter(
      (i) => i.invoice_number && i.status !== "cancelled" && !paidIds.has(i.id),
    );
    return { drafts, open, paid, overdue: open.filter(isOverdue).length };
  }, [invoices]);

  const stacks = [
    {
      key: "todo" as const, label: "Abzurechnen", icon: CircleDot,
      big: `${todo.length}`,
      unit: todo.length === 1 ? "Objekt" : "Objekte",
      meta: formatEur(todo.reduce((s, r) => s + openWorkNet(r, year), 0)) + " offen",
    },
    {
      key: "draft" as const, label: "Entwürfe", icon: FileWarning,
      big: `${buckets.drafts.length}`, unit: "", meta: "noch ohne Nummer",
    },
    {
      key: "open" as const, label: "Offen", icon: Clock,
      big: `${buckets.open.length}`, unit: "",
      meta: buckets.overdue > 0 ? `${buckets.overdue} überfällig` : "nichts überfällig",
      alert: buckets.overdue > 0,
    },
    {
      key: "paid" as const, label: "Bezahlt", icon: Wallet,
      big: `${buckets.paid.length}`, unit: "", meta: "erledigt",
    },
  ];

  // ---------------- Suche ----------------

  const q = search.trim().toLowerCase();
  const matchObject = (r: BillingOverviewRow) =>
    !q || r.building_name.toLowerCase().includes(q) ||
    (r.building_code ?? "").toLowerCase().includes(q) ||
    (r.city ?? "").toLowerCase().includes(q);
  const matchInvoice = (i: any) =>
    !q || (i.invoice_number ?? "").toLowerCase().includes(q) ||
    clientName(i.client_id).toLowerCase().includes(q) ||
    (buildingName(i.building_id) ?? "").toLowerCase().includes(q);

  const isLoading = stack === "todo" ? loadingObjects : loadingInvoices;

  // ---------------- Darstellung ----------------

  const objectRow = (r: BillingOverviewRow) => {
    const parts: string[] = [];
    if (!feeYearBilled(r, year) && Number(r.base_monthly_net) > 0) parts.push(`Honorar ${year}`);
    if (Number(r.open_hours) > 0) parts.push(`${Number(r.open_hours).toLocaleString("de-DE")} Std`);
    if (r.open_count > 0) parts.push(`${r.open_count} Posten`);
    return (
      <div
        key={r.building_id}
        className="px-4 py-3 flex items-center gap-3 border-t first:border-t-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setSheetFor({ id: r.building_id, name: r.building_name })}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium">{r.building_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
            {r.building_code && <span className="font-mono">{r.building_code}</span>}
            {r.city && <span>· {r.city}</span>}
            {Number(r.base_monthly_net) > 0 && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal font-mono">
                {formatEur(Number(r.base_monthly_net))} / Monat
              </Badge>
            )}
            {!r.contract_id && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal gap-1">
                <FileWarning className="w-3 h-3" />kein Vertrag
              </Badge>
            )}
          </div>
        </div>
        {parts.length > 0 && (
          <Badge variant="secondary" className="font-normal whitespace-nowrap">{parts.join(" · ")}</Badge>
        )}
        <div className="text-right whitespace-nowrap">
          <div className="font-mono text-sm">{formatEur(openWorkNet(r, year))}</div>
          <div className="text-[11px] text-muted-foreground">
            {r.last_invoice_number
              ? `zuletzt ${r.last_invoice_number} · ${formatDate(r.last_invoice_date)}`
              : "noch nie abgerechnet"}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  };

  const invoiceRow = (inv: any) => {
    const overdue = isOverdue(inv);
    const open = Number(inv.total_gross) - Number(inv.paid_amount);
    return (
      <div
        key={inv.id}
        className="px-4 py-3 flex items-center gap-3 border-t first:border-t-0 cursor-pointer hover:bg-muted/40"
        onClick={() => {
          if (inv.status === "draft") { setEditorId(inv.id); setEditorOpen(true); }
          else setDetailId(inv.id);
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium font-mono">{inv.invoice_number ?? "ohne Nummer"}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
            <span>{buildingName(inv.building_id) ?? clientName(inv.client_id)}</span>
            <span>· {formatDate(inv.issue_date)}</span>
            {inv.service_period_from && (
              <span>· Leistung {formatDate(inv.service_period_from)}–{formatDate(inv.service_period_to)}</span>
            )}
          </div>
        </div>
        {overdue ? (
          <Badge variant="destructive" className="font-normal whitespace-nowrap">
            überfällig seit {formatDate(inv.due_date)}
          </Badge>
        ) : inv.paid_by_withdrawal && stack === "open" ? (
          <Badge variant="outline" className="font-normal whitespace-nowrap gap-1">
            <Wallet className="w-3 h-3" />Selbstentnahme
          </Badge>
        ) : stack === "paid" ? (
          <Badge variant="secondary" className="font-normal whitespace-nowrap">bezahlt</Badge>
        ) : stack === "open" && inv.due_date ? (
          <Badge variant="outline" className="font-normal whitespace-nowrap">
            fällig {formatDate(inv.due_date)}
          </Badge>
        ) : null}
        <div className="text-right whitespace-nowrap">
          <div className="font-mono text-sm">{formatEur(Number(inv.total_gross))}</div>
          {stack === "open" && Number(inv.paid_amount) > 0 && (
            <div className="text-[11px] text-muted-foreground font-mono">
              noch {formatEur(open)}
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  };

  const list = () => {
    if (stack === "todo") {
      const rows = todo.filter(matchObject);
      if (!rows.length) return empty("Aktuell ist bei keinem Objekt etwas offen.");
      return (
        <Card className="overflow-hidden">
          <ListHead title="Offene Leistungen je Objekt" count={rows.length}
            note="Klick öffnet das Abrechnungsblatt" />
          {rows.map(objectRow)}
        </Card>
      );
    }
    const set = (stack === "draft" ? buckets.drafts : stack === "open" ? buckets.open : buckets.paid)
      .filter(matchInvoice);
    const title = stack === "draft" ? "Entwürfe"
      : stack === "open" ? "Versendet, noch nicht bezahlt" : "Bezahlt";
    const note = stack === "draft" ? "Klick öffnet den Entwurf zum Bearbeiten" : undefined;
    if (!set.length) {
      return empty(
        stack === "draft" ? "Keine Entwürfe offen."
          : stack === "open" ? "Nichts unbezahlt."
            : "Noch keine bezahlte Rechnung.",
      );
    }
    return (
      <Card className="overflow-hidden">
        <ListHead title={title} count={set.length} note={note} />
        {set.map(invoiceRow)}
      </Card>
    );
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Kopfzeile */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Honorarjahr</span>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-[92px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button variant="outline" className="gap-1.5"
            onClick={() => { setEditorId(null); setEditorOpen(true); }}>
            <Plus className="w-4 h-4" />Freie Rechnung
          </Button>
        </div>
      </div>

      {/* Die vier Stapel — zugleich Filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stacks.map((s) => {
          const Icon = s.icon;
          const active = stack === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => setStack(s.key)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                active ? "border-primary bg-primary/5 shadow-sm" : "hover:border-primary/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Icon className="w-3.5 h-3.5" />{s.label}
              </span>
              <span className="block text-2xl font-semibold tabular-nums mt-0.5">
                {s.big}
                {s.unit && <span className="text-sm font-normal text-muted-foreground ml-1.5">{s.unit}</span>}
              </span>
              <span className={`block text-xs tabular-nums ${s.alert ? "text-destructive" : "text-muted-foreground"}`}>
                {s.meta}
              </span>
            </button>
          );
        })}
      </div>

      {/* Suche */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={stack === "todo" ? "Objekt, Kürzel oder Ort suchen…" : "Rechnungsnummer, Objekt oder Kunde suchen…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? <Skeleton className="h-72" /> : list()}

      {/* Abrechnungsblatt der Liegenschaft */}
      <BuildingBillingSheet
        open={!!sheetFor}
        onOpenChange={(v) => !v && setSheetFor(null)}
        buildingId={sheetFor?.id ?? null}
        buildingName={sheetFor?.name ?? ""}
        onDraftCreated={(id) => {
          // Kein Suchen mehr in einer zweiten Liste: der frische
          // Entwurf geht direkt auf.
          setSheetFor(null);
          setEditorId(id);
          setEditorOpen(true);
        }}
      />

      <InvoiceEditorDialog open={editorOpen} onOpenChange={setEditorOpen} invoiceId={editorId} />

      <InvoiceDetailDialog
        open={!!detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        invoiceId={detailId}
        buildingName={buildingName}
        clientName={clientName}
      />
    </div>
  );
}

function ListHead({ title, count, note }: { title: string; count: number; note?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">· {count}</span>
      {note && <span className="text-xs text-muted-foreground ml-auto">{note}</span>}
    </div>
  );
}

function empty(text: string) {
  return (
    <Card className="p-10 text-center text-sm text-muted-foreground">
      <CircleDot className="w-9 h-9 mx-auto mb-3 opacity-25" />
      {text}
    </Card>
  );
}
