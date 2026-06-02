import { useMemo } from "react";
import { useRgiInvoices, useRgiTimeEntries, useRgiClients } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro, FileText, AlertTriangle, Clock } from "lucide-react";

export function DashboardTab() {
  const { data: invoices, isLoading: invLoading } = useRgiInvoices();
  const { data: time, isLoading: tLoading } = useRgiTimeEntries({ onlyOpen: true });
  const { data: clients } = useRgiClients();

  const stats = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    let revYear = 0, revMonth = 0, open = 0, overdue = 0;
    for (const inv of invoices ?? []) {
      if (inv.status === "cancelled" || inv.status === "draft") continue;
      const gross = Number(inv.total_gross);
      if (inv.issue_date >= yearStart) revYear += gross;
      if (inv.issue_date >= monthStart) revMonth += gross;
      const remaining = gross - Number(inv.paid_amount);
      if (remaining > 0.01) {
        open += remaining;
        if (inv.status === "overdue") overdue += remaining;
      }
    }
    const openMinutes = (time ?? []).reduce((s, e) => s + e.minutes, 0);
    return { revYear, revMonth, open, overdue, openHours: openMinutes / 60 };
  }, [invoices, time]);

  if (invLoading || tLoading) return <Skeleton className="h-64 mt-4" />;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Euro className="w-5 h-5" />} label="Umsatz Jahr" value={`${stats.revYear.toFixed(2)} €`} />
        <Kpi icon={<Euro className="w-5 h-5" />} label="Umsatz Monat" value={`${stats.revMonth.toFixed(2)} €`} />
        <Kpi icon={<FileText className="w-5 h-5" />} label="Offene Forderungen" value={`${stats.open.toFixed(2)} €`} />
        <Kpi icon={<AlertTriangle className="w-5 h-5 text-destructive" />} label="Davon überfällig" value={`${stats.overdue.toFixed(2)} €`} />
      </div>
      <Card className="p-4 flex items-center gap-3">
        <Clock className="w-6 h-6 text-primary" />
        <div>
          <div className="text-sm text-muted-foreground">Offene abrechenbare Stunden</div>
          <div className="text-2xl font-semibold">{stats.openHours.toFixed(2)} h</div>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold mb-2">Letzte Rechnungen</h3>
        <div className="divide-y">
          {(invoices ?? []).slice(0, 5).map((inv) => (
            <div key={inv.id} className="py-2 flex items-center gap-3">
              <span className="font-mono text-sm">{inv.invoice_number ?? "—"}</span>
              <span className="text-sm flex-1">{clients?.find((c) => c.id === inv.client_id)?.name}</span>
              <span className="text-xs text-muted-foreground">{inv.issue_date}</span>
              <span className="font-mono text-sm">{Number(inv.total_gross).toFixed(2)} €</span>
            </div>
          ))}
          {(invoices ?? []).length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Noch keine Rechnungen.</div>}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}
