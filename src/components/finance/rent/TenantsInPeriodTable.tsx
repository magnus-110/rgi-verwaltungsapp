import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  buildingId: string;
  fiscalYear: number | null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function TenantsInPeriodTable({ buildingId, fiscalYear }: Props) {
  const navigate = useNavigate();

  const periodStart = fiscalYear ? new Date(`${fiscalYear}-01-01`) : null;
  const periodEnd = fiscalYear ? new Date(`${fiscalYear}-12-31`) : null;
  const periodStartIso = periodStart ? `${fiscalYear}-01-01` : null;
  const periodEndIso = periodEnd ? `${fiscalYear}-12-31` : null;

  const { data, isLoading } = useQuery({
    queryKey: ["tenants-in-period", buildingId, fiscalYear],
    enabled: !!buildingId && !!fiscalYear,
    queryFn: async () => {
      const { data: assignments, error } = await supabase
        .from("contact_building_assignments")
        .select(
          "id, contact_id, unit_number, valid_from, valid_to, role_in_building, contacts(display_name)"
        )
        .eq("building_id", buildingId)
        .eq("role_in_building", "mieter")
        .or(
          `valid_from.is.null,valid_from.lte.${periodEndIso}`
        )
        .or(
          `valid_to.is.null,valid_to.gte.${periodStartIso}`
        );
      if (error) throw error;

      const ids = (assignments || []).map((a) => a.id);
      if (ids.length === 0) return [];

      const [{ data: costs }, { data: shares }] = await Promise.all([
        supabase
          .from("contact_building_costs")
          .select("assignment_id, cost_type, amount, interval, valid_from, valid_to")
          .in("assignment_id", ids),
        supabase
          .from("contact_building_shares")
          .select("assignment_id, share_type, share_value")
          .in("assignment_id", ids),
      ]);

      return (assignments || []).map((a) => {
        const aFrom = a.valid_from ? new Date(a.valid_from) : periodStart!;
        const aTo = a.valid_to ? new Date(a.valid_to) : periodEnd!;
        const overlapStart = aFrom > periodStart! ? aFrom : periodStart!;
        const overlapEnd = aTo < periodEnd! ? aTo : periodEnd!;
        const overlapDays = Math.max(0, daysBetween(overlapStart, overlapEnd));
        const monthsApprox = overlapDays / 30.4375;

        const myCosts = (costs || []).filter(
          (c) =>
            c.assignment_id === a.id &&
            (c.cost_type || "").toLowerCase().includes("nebenkosten") &&
            (c.interval || "").toLowerCase() === "monatlich"
        );

        // Day-accurate weighted period sum
        let periodSum = 0;
        let avgMonthly = 0;
        for (const c of myCosts) {
          const cFrom = c.valid_from ? new Date(c.valid_from) : periodStart!;
          const cTo = c.valid_to ? new Date(c.valid_to) : periodEnd!;
          const oStart = cFrom > overlapStart ? cFrom : overlapStart;
          const oEnd = cTo < overlapEnd ? cTo : overlapEnd;
          if (oEnd >= oStart) {
            const d = daysBetween(oStart, oEnd);
            periodSum += Number(c.amount || 0) * (d / 30.4375);
          }
          avgMonthly += Number(c.amount || 0);
        }

        const personenShare = (shares || []).find(
          (s) => s.assignment_id === a.id && (s.share_type || "").toLowerCase() === "personen"
        );

        return {
          id: a.id,
          name: (a.contacts as any)?.display_name || "—",
          unit: a.unit_number || "—",
          from: a.valid_from,
          to: a.valid_to,
          months: monthsApprox,
          personen: personenShare?.share_value ?? null,
          monthly: avgMonthly,
          periodSum: Math.round(periodSum * 100) / 100,
        };
      });
    },
  });

  const rows = data || [];
  const totalPeriod = useMemo(
    () => rows.reduce((s, r) => s + (r.periodSum || 0), 0),
    [rows]
  );

  if (!fiscalYear) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Mieter im Abrechnungszeitraum {fiscalYear}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Erkennt Mieter über Einzug/Auszug (valid_from/valid_to). NK-Vorz. wird aus
          den Kosten der Person (Typ „Nebenkosten", monatlich) tag-genau gewichtet.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine Mieter mit Zeitraumüberschneidung gefunden.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mieter</TableHead>
                <TableHead>Einheit</TableHead>
                <TableHead>Einzug</TableHead>
                <TableHead>Auszug</TableHead>
                <TableHead className="text-right">Monate</TableHead>
                <TableHead className="text-right">Personen</TableHead>
                <TableHead className="text-right">NK-Vorz./M</TableHead>
                <TableHead className="text-right">NK-Vorz. Periode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/buildings/${buildingId}?tab=people`)}
                >
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell>{fmtDate(r.from)}</TableCell>
                  <TableCell>{fmtDate(r.to)}</TableCell>
                  <TableCell className="text-right">{r.months.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{r.personen ?? "—"}</TableCell>
                  <TableCell className="text-right">{EUR.format(r.monthly)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {EUR.format(r.periodSum)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell colSpan={7} className="text-right font-semibold">
                  Summe NK-Vorauszahlungen Periode
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {EUR.format(totalPeriod)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
