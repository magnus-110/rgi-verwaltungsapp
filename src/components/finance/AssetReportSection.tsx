import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Wallet, Flame } from "lucide-react";
import { getEffectiveOpeningBalance, signedTotalForAccount } from "./lib/bookingAggregation";
import { getAccrualDisplaySign } from "./lib/accrualSign";
import { AssetReportItemsCard } from "./AssetReportItemsCard";

interface AssetReportSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

interface SectionLine {
  key: string;
  label: string;
  account_number?: string;
  amount: number;
}

interface Section {
  title: string;
  lines: SectionLine[];
}

export function AssetReportSection({ buildingId, periodId, fiscalYear }: AssetReportSectionProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["asset-report-ctx", buildingId, fiscalYear, periodId],
    queryFn: async () => {
      const [accRes, bkRes, balRes, fuelRes, itemsRes] = await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select("id, account_number, account_name, category, settlement_section, is_asset_report_relevant")
          .or(`building_id.is.null,building_id.eq.${buildingId}`),
        supabase
          .from("bookings")
          .select("account_id, counter_account_id, amount, booking_date")
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear)
          .neq("status", "cancelled"),
        supabase
          .from("account_balances")
          .select("account_id, opening_balance, closing_balance")
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear),
        supabase
          .from("fuel_inventory" as any)
          .select("fuel_type, entry_type, quantity, total_price, end_value_eur")
          .eq("building_id", buildingId)
          .or(`billing_period_id.eq.${periodId},billing_period_id.is.null`),
        supabase
          .from("asset_report_items" as any)
          .select("id, label, amount")
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear)
          .order("sort_order")
          .order("created_at"),
      ]);
      if (accRes.error) throw accRes.error;
      if (bkRes.error) throw bkRes.error;
      if (balRes.error) throw balRes.error;
      return {
        accounts: accRes.data || [],
        bookings: bkRes.data || [],
        balances: balRes.data || [],
        fuelEntries: (fuelRes.data as any[]) || [],
        manualItems: ((itemsRes.data as any[]) || []) as { id: string; label: string; amount: number }[],
      };
    },
  });

  const accounts: any[] = ctx?.accounts ?? [];
  const bookings: any[] = ctx?.bookings ?? [];
  const balances: any[] = ctx?.balances ?? [];
  const fuelEntries: any[] = ctx?.fuelEntries ?? [];
  const manualItems = ctx?.manualItems ?? [];

  const opening4000Id = accounts.find((a: any) => a.account_number === "4000")?.id || null;

  const closingFor = (acc: any): number => {
    const eff = getEffectiveClosingBalance(acc.id, bookings as any, balances as any, fiscalYear, opening4000Id);
    const manual = balances.find((b: any) => b.account_id === acc.id);
    if (manual && manual.closing_balance !== null && manual.closing_balance !== undefined && Number(manual.closing_balance) !== 0) {
      return Number(manual.closing_balance);
    }
    return eff.amount;
  };

  // Brennstoffrestbestand-Wert (closing_balance Einträge)
  const fuelClosingValue = fuelEntries
    .filter(e => e.entry_type === "closing_balance")
    .reduce((s, e) => s + (Number(e.total_price ?? e.end_value_eur) || 0), 0);

  // Nur Konten mit Flag berücksichtigen
  const relevantAccs = accounts.filter((a: any) => a.is_asset_report_relevant === true);

  const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
  const accNum = (a: any) => parseInt(String(a.account_number), 10);

  const isLiquide = (a: any) => {
    const n = accNum(a);
    return inRange(n, 1800, 1899) || a.settlement_section === "bank";
  };
  const isVorauszahlung = (a: any) => {
    const n = accNum(a);
    return inRange(n, 1470, 1473);
  };
  const isAbrSpitze = (a: any) => {
    const n = accNum(a);
    return n === 1700 || n === 1710;
  };
  const isAbgrenzung = (a: any) => {
    const n = accNum(a);
    return inRange(n, 4100, 4119) || inRange(n, 4120, 4139) || inRange(n, 4160, 4179) || inRange(n, 4180, 4199);
  };
  const accrualLabel = (a: any): string => {
    const n = accNum(a);
    if (inRange(n, 4100, 4119)) return "Ausg. im lfd. J. für Vorjahr";
    if (inRange(n, 4120, 4139)) return "Einn. im lfd. J. für Vorjahr";
    if (inRange(n, 4160, 4179)) return "Ausg. im Folgejahr für lfd. J.";
    if (inRange(n, 4180, 4199)) return "Einn. im Folgejahr für lfd. J.";
    return a.account_name;
  };

  // Sektion 1: Liquide Mittel aus Bankkonten und Kasse
  const liquideAccs = relevantAccs.filter(isLiquide).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const liquideLines: SectionLine[] = [];
  if (fuelClosingValue !== 0) {
    liquideLines.push({ key: "fuel", label: "Heizölrestbestand", amount: fuelClosingValue });
  }
  liquideAccs.forEach(a => {
    liquideLines.push({ key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a) });
  });

  // Sektion 2: Guth. und Nachz. aus Abrechnung
  const abrAccs = relevantAccs.filter(isAbrSpitze).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const abrLines: SectionLine[] = abrAccs.map(a => ({
    key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a),
  }));

  // Sektion 3: Vorauszahlungen Versorger
  const vzAccs = relevantAccs.filter(isVorauszahlung).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const vzLines: SectionLine[] = vzAccs.map(a => ({
    key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a),
  }));

  // Sektion 4: Zu- und Abflüsse aus Jahresabgrenzung (Vorzeichen-Konvention)
  const abgAccs = relevantAccs.filter(isAbgrenzung).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const abgLines: SectionLine[] = abgAccs.map(a => {
    const raw = closingFor(a);
    const signed = Math.abs(raw) * getAccrualDisplaySign(a.account_number);
    return { key: a.id, label: accrualLabel(a), account_number: a.account_number, amount: signed };
  });

  // Sektion 5: Sonstige Vermögensposten — alle weiteren Flag-Konten + manuelle Items
  const handledIds = new Set([
    ...liquideAccs.map(a => a.id), ...abrAccs.map(a => a.id),
    ...vzAccs.map(a => a.id), ...abgAccs.map(a => a.id),
  ]);
  const sonstigeAccs = relevantAccs
    .filter(a => !handledIds.has(a.id))
    .sort((a, b) => a.account_number.localeCompare(b.account_number));
  const sonstigeLines: SectionLine[] = [
    ...sonstigeAccs.map(a => ({
      key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a),
    })),
    ...manualItems
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "de"))
      .map(i => ({ key: `manual-${i.id}`, label: i.label, amount: Number(i.amount) || 0 })),
  ];

  const sections: Section[] = [
    { title: "Liquide Mittel aus Bankkonten und Kasse", lines: liquideLines },
    { title: "Guth. und Nachz. aus Abrechnung incl. Altschulden", lines: abrLines },
    { title: "Vorauszahlungen Versorger", lines: vzLines },
    { title: "Zu- und Abflüsse aus Jahresabgrenzung", lines: abgLines },
    { title: "Sonstige Vermögensposten", lines: sonstigeLines },
  ].filter(s => s.lines.length > 0);

  const sectionTotal = (s: Section) => s.lines.reduce((sum, l) => sum + l.amount, 0);
  const grandTotal = sections.reduce((sum, s) => sum + sectionTotal(s), 0);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Lade Vermögensbericht …</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Vermögensstand zum 31.12.{fiscalYear}. Es werden ausschließlich Konten ausgewiesen, die als
        <strong> Vermögensbericht-relevant (VB)</strong> markiert sind, sowie manuell erfasste Posten.
        Abgrenzungskonten (4100/4120/4160/4180) fließen mit dem für das Wirtschaftsjahr korrekten Vorzeichen ein.
      </p>

      {sections.map((sec) => {
        const total = sectionTotal(sec);
        return (
          <Card key={sec.title}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {sec.title === "Liquide Mittel aus Bankkonten und Kasse" ? <Wallet className="h-4 w-4" /> : null}
                {sec.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Konto</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="text-right w-[160px]">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sec.lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{l.account_number || ""}</TableCell>
                      <TableCell className="text-sm">{l.label}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-medium text-sm">Zwischensumme</TableCell>
                    <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {/* Manuelle Vermögensposten – Edit-UI */}
      <AssetReportItemsCard buildingId={buildingId} fiscalYear={fiscalYear} />

      {/* Brennstoff-Hinweis */}
      {fuelClosingValue !== 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            Heizölrestbestand wird automatisch aus der Brennstoff-Inventur (closing_balance) übernommen.
          </CardContent>
        </Card>
      )}

      {/* Vermögensstand */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Vermögensstand zum 31.12.{fiscalYear}</span>
            <span className="text-lg font-bold font-mono">{formatCurrency(grandTotal)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
