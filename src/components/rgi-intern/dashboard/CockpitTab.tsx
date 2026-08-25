import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Euro, FileText, AlertTriangle, Clock, CalendarClock, ArrowRight } from "lucide-react";
import { useRgiInvoices, useRgiTimeEntries } from "@/hooks/useRgi";
import { useManagementContracts, useBuildingsWithoutContract } from "@/hooks/useManagementContracts";
import { contractWarnings, formatEur, monthlyNet, monthsUntil } from "@/types/rgiContracts";

interface Props {
  onNavigate?: (area: string) => void;
}

export function CockpitTab({ onNavigate }: Props) {
  const { data: contracts, isLoading: cLoading } = useManagementContracts();
  const { data: missing } = useBuildingsWithoutContract();
  const { data: invoices, isLoading: iLoading } = useRgiInvoices();
  const { data: openTime } = useRgiTimeEntries({ onlyOpen: true });

  const contractStats = useMemo(() => {
    const active = (contracts ?? []).filter((c) => c.status === "active");
    const monthly = active.reduce((s, c) => s + monthlyNet(c.fees), 0);
    const expiring = active.filter((c) => {
      const m = monthsUntil(c.appointed_until);
      return m !== null && m >= 0 && m <= 12;
    });
    const apartments = active.reduce((s, c) => s + (c.units_apartment ?? 0), 0);
    return { count: active.length, monthly, yearly: monthly * 12, expiring, apartments };
  }, [contracts]);

  const invoiceStats = useMemo(() => {
    let open = 0;
    let overdue = 0;
    for (const inv of invoices ?? []) {
      if (inv.status === "cancelled" || inv.status === "draft") continue;
      const remaining = Number(inv.total_gross) - Number(inv.paid_amount);
      if (remaining > 0.01) {
        open += remaining;
        if (inv.status === "overdue") overdue += remaining;
      }
    }
    return { open, overdue };
  }, [invoices]);

  const openHours = useMemo(
    () => (openTime ?? []).reduce((s, e) => s + e.minutes, 0) / 60,
    [openTime]
  );

  /** Was eine Entscheidung braucht — nach Dringlichkeit sortiert. */
  const actions = useMemo(() => {
    const out: { level: "crit" | "warn"; text: string; meta: string; area: string }[] = [];

    for (const c of contracts ?? []) {
      for (const w of contractWarnings(c)) {
        out.push({
          level: w.level,
          text: `${c.building?.name ?? "Objekt"} · ${w.text}`,
          meta: c.appointed_until ? `bis ${c.appointed_until.slice(0, 10).split("-").reverse().join(".")}` : "",
          area: "contracts",
        });
      }
    }
    for (const b of missing ?? []) {
      out.push({
        level: "warn",
        text: `${b.name} · kein Vertrag erfasst`,
        meta: b.management_mode === "weg" ? "WEG" : "Miete",
        area: "contracts",
      });
    }
    if (invoiceStats.overdue > 0) {
      out.push({
        level: "crit",
        text: "Überfällige Rechnungen offen",
        meta: formatEur(invoiceStats.overdue),
        area: "invoices",
      });
    }
    if (openHours > 0) {
      out.push({
        level: "warn",
        text: "Abrechenbare Stunden noch nicht in Rechnung",
        meta: `${openHours.toFixed(2)} h`,
        area: "time",
      });
    }
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "crit" ? -1 : 1));
  }, [contracts, missing, invoiceStats, openHours]);

  if (cLoading || iLoading) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Euro className="w-4 h-4" />}
          label="Honorarbestand netto / Jahr"
          value={formatEur(contractStats.yearly)}
          sub={`${formatEur(contractStats.monthly)} im Monat · ${contractStats.count} Verträge`}
          accent
        />
        <Kpi
          icon={<CalendarClock className="w-4 h-4" />}
          label="Bestellung läuft aus"
          value={String(contractStats.expiring.length)}
          sub="in den nächsten 12 Monaten"
          warn={contractStats.expiring.length > 0}
        />
        <Kpi
          icon={<FileText className="w-4 h-4" />}
          label="Offene Forderungen"
          value={formatEur(invoiceStats.open)}
          sub={invoiceStats.overdue > 0 ? `davon ${formatEur(invoiceStats.overdue)} überfällig` : "nichts überfällig"}
          warn={invoiceStats.overdue > 0}
        />
        <Kpi
          icon={<Clock className="w-4 h-4" />}
          label="Offene abrechenbare Stunden"
          value={`${openHours.toFixed(2)} h`}
          sub="noch nicht in Rechnung"
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-sm">Was eine Entscheidung braucht</h3>
            <p className="text-xs text-muted-foreground">
              Hinweise aus Verträgen, Rechnungen und offenen Stunden. Kritisches zuerst.
            </p>
          </div>
          {actions.length > 0 && (
            <Badge variant="secondary" className="shrink-0">{actions.length}</Badge>
          )}
        </div>

        {actions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nichts offen. Sobald Verträge erfasst sind, erscheinen hier auslaufende Bestellungen,
            fällige Indexanpassungen und unvollständige Vertragsdaten.
          </div>
        ) : (
          <div className="divide-y">
            {actions.slice(0, 12).map((a, i) => (
              <div key={i} className="py-2.5 flex items-center gap-3">
                {a.level === "crit" ? (
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 ml-1" />
                )}
                <span className="text-sm flex-1 min-w-0 truncate">{a.text}</span>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{a.meta}</span>
                {onNavigate && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onNavigate(a.area)}>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {actions.length > 12 && (
              <div className="pt-2 text-xs text-muted-foreground">
                und {actions.length - 12} weitere
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Letzte Rechnungen</h3>
        <div className="divide-y">
          {(invoices ?? []).slice(0, 5).map((inv) => (
            <div key={inv.id} className="py-2 flex items-center gap-3 text-sm">
              <span className="font-mono text-xs w-24 shrink-0">{inv.invoice_number ?? "ENTWURF"}</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground">
                {inv.client_name_snapshot ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">{inv.issue_date}</span>
              <span className="tabular-nums">{formatEur(Number(inv.total_gross))}</span>
            </div>
          ))}
          {(invoices ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">Noch keine Rechnungen.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon, label, value, sub, accent, warn,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <Card className={`p-4 ${warn ? "border-destructive/40" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-semibold mt-1.5 tabular-nums ${accent ? "text-primary" : warn ? "text-destructive" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
