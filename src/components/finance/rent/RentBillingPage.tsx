import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import { computeRentSettlement } from "./lib/computeRentSettlement";

interface Props {
  buildingId: string | null;
  periodId: string | null;
  fiscalYear: number | null;
}

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function RentBillingPage({ buildingId, fiscalYear }: Props) {
  const enabled = !!buildingId && !!fiscalYear;
  const periodStart = fiscalYear ? `${fiscalYear}-01-01` : null;
  const periodEnd = fiscalYear ? `${fiscalYear}-12-31` : null;

  const { data, isLoading } = useQuery({
    queryKey: ["rent-billing", buildingId, fiscalYear],
    enabled,
    queryFn: async () => {
      const [accountsRes, bookingsRes, tenantsRes] = await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select(
            "id, account_number, account_name, is_billing_relevant, default_distribution_key, building_id"
          )
          .or(`building_id.eq.${buildingId},building_id.is.null`),
        supabase
          .from("bookings")
          .select(
            "id, account_id, counter_account_id, amount, booking_type, booking_date, building_id"
          )
          .eq("building_id", buildingId)
          .gte("booking_date", periodStart!)
          .lte("booking_date", periodEnd!),
        supabase
          .from("contact_building_assignments")
          .select(
            "id, contact_id, unit_number, valid_from, valid_to, role_in_building, contacts(display_name)"
          )
          .eq("building_id", buildingId)
          .eq("role_in_building", "mieter")
          .or(`valid_from.is.null,valid_from.lte.${periodEnd}`)
          .or(`valid_to.is.null,valid_to.gte.${periodStart}`),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      const ids = (tenantsRes.data || []).map((t) => t.id);
      const [sharesRes, costsRes] = await Promise.all([
        ids.length
          ? supabase
              .from("contact_building_shares")
              .select("assignment_id, share_type, share_value")
              .in("assignment_id", ids)
          : Promise.resolve({ data: [], error: null } as any),
        ids.length
          ? supabase
              .from("contact_building_costs")
              .select(
                "assignment_id, cost_type, amount, interval, valid_from, valid_to"
              )
              .in("assignment_id", ids)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (sharesRes.error) throw sharesRes.error;
      if (costsRes.error) throw costsRes.error;

      return {
        accounts: accountsRes.data || [],
        bookings: bookingsRes.data || [],
        tenants: (tenantsRes.data || []).map((t: any) => ({
          id: t.id,
          contact_id: t.contact_id,
          name: t.contacts?.display_name || "—",
          unit_number: t.unit_number,
          valid_from: t.valid_from,
          valid_to: t.valid_to,
        })),
        shares: sharesRes.data || [],
        costs: costsRes.data || [],
      };
    },
  });

  const result = useMemo(() => {
    if (!data || !fiscalYear) return null;
    return computeRentSettlement({
      accounts: data.accounts as any,
      bookings: data.bookings as any,
      tenants: data.tenants,
      shares: data.shares as any,
      costs: data.costs as any,
      fiscalYear,
    });
  }, [data, fiscalYear]);

  if (!enabled) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Bitte Liegenschaft und Wirtschaftsjahr wählen.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !result) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Lade Abrechnungsdaten…
        </CardContent>
      </Card>
    );
  }

  const { accountRows, tenants, warnings } = result;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Mieter-Nebenkostenabrechnung {fiscalYear}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Verteilt alle umlagefähigen Konten (
            <code>is_billing_relevant</code>) anhand des im Kontenrahmen
            hinterlegten Verteilerschlüssels auf die im Zeitraum aktiven Mieter.
            Read-only – keine Buchungen werden erzeugt.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Aktive Mieter im Zeitraum:</span>{" "}
            {tenants.length}
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900">
            Hinweise zur Verteilung ({warnings.length})
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-mono">{w.account_number}</span>{" "}
                  {w.account_name}: {w.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gesamtverteilung</CardTitle>
        </CardHeader>
        <CardContent>
          {accountRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine umlagefähigen Konten gefunden. Markiere Konten im
              Kontenrahmen als „abrechnungsrelevant".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Schlüssel</TableHead>
                  <TableHead className="text-right">Σ Anteile</TableHead>
                  <TableHead className="text-right">Saldo Periode</TableHead>
                  <TableHead className="text-right">davon umlagef.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountRows.map((r) => (
                  <TableRow key={r.account.id}>
                    <TableCell className="font-mono">
                      {r.account.account_number}
                    </TableCell>
                    <TableCell>{r.account.account_name}</TableCell>
                    <TableCell>
                      {r.distKey || (
                        <span className="text-amber-700">— fehlt —</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.totalShares.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {EUR.format(r.total)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {EUR.format(r.distributable)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mieter-Einzelabrechnungen</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Mieter mit Zeitraumüberschneidung im Wirtschaftsjahr.
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {tenants.map((t) => (
                <AccordionItem key={t.assignment_id} value={t.assignment_id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center justify-between pr-4 text-sm">
                      <div className="text-left">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Einheit {t.unit || "—"} ·{" "}
                          {fmtDate(t.from)} – {fmtDate(t.to)} ·{" "}
                          {t.months.toFixed(1)} M
                        </div>
                      </div>
                      <div
                        className={
                          t.saldo > 0
                            ? "font-semibold text-red-700"
                            : t.saldo < 0
                              ? "font-semibold text-emerald-700"
                              : "font-semibold"
                        }
                      >
                        {t.saldo > 0 ? "Nachzahlung " : t.saldo < 0 ? "Guthaben " : ""}
                        {EUR.format(Math.abs(t.saldo))}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {t.lines.length === 0 ? (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Keine umlagefähigen Positionen für diesen Mieter
                          (fehlende Anteile oder kein Schlüssel im
                          Kontenrahmen).
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Konto</TableHead>
                            <TableHead>Schlüssel</TableHead>
                            <TableHead className="text-right">
                              Sein Anteil
                            </TableHead>
                            <TableHead className="text-right">
                              Σ Anteile
                            </TableHead>
                            <TableHead className="text-right">
                              Kontosumme
                            </TableHead>
                            <TableHead className="text-right">
                              Zeitanteil
                            </TableHead>
                            <TableHead className="text-right">Umlage</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.lines.map((l, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono">
                                {l.account_number}{" "}
                                <span className="text-muted-foreground">
                                  {l.account_name}
                                </span>
                              </TableCell>
                              <TableCell>{l.distKey}</TableCell>
                              <TableCell className="text-right">
                                {l.myShare.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {l.totalShares.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {EUR.format(l.accountTotal)}
                              </TableCell>
                              <TableCell className="text-right">
                                {(l.timeFactor * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {EUR.format(l.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2">
                            <TableCell
                              colSpan={6}
                              className="text-right font-semibold"
                            >
                              Σ Umlage
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {EUR.format(t.totalUmlage)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={6} className="text-right">
                              − Σ NK-Vorauszahlungen
                            </TableCell>
                            <TableCell className="text-right">
                              {EUR.format(t.totalVorauszahlung)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-right font-semibold"
                            >
                              {t.saldo > 0
                                ? "Nachzahlung"
                                : t.saldo < 0
                                  ? "Guthaben"
                                  : "Ausgeglichen"}
                            </TableCell>
                            <TableCell
                              className={
                                "text-right font-semibold " +
                                (t.saldo > 0
                                  ? "text-red-700"
                                  : t.saldo < 0
                                    ? "text-emerald-700"
                                    : "")
                              }
                            >
                              {EUR.format(Math.abs(t.saldo))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
