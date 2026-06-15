import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Wallet, Flame } from "lucide-react";
import { signedTotalForAccount } from "./lib/bookingAggregation";
import { AssetReportItemsCard } from "./AssetReportItemsCard";

interface OwnerResultLike {
  result: number; // >0 = Guthaben Eigentümer, <0 = Nachzahlung Eigentümer
}

interface AssetReportSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
  /** Optional: Wenn aus BillingSettlement übergeben, wird Guth./Nachz. korrekt befüllt. */
  ownerResults?: OwnerResultLike[];
}

interface SectionLine {
  key: string;
  label: string;
  account_number?: string;
  amount: number;
  /** true = Zeile auch bei 0 anzeigen (Excel-Vorlage erwartet feste Zeilen) */
  keepZero?: boolean;
}

interface Section {
  title: string;
  icon?: "wallet" | "flame";
  lines: SectionLine[];
  /** true = Sektion auch ohne Zeilen mit "Keine Posten" einblenden */
  alwaysShow?: boolean;
}

export function AssetReportSection({ buildingId, periodId, fiscalYear, ownerResults }: AssetReportSectionProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["asset-report-ctx-v2", buildingId, fiscalYear, periodId],
    queryFn: async () => {
      // Periode laden, um booking_date-basiert zu filtern (statt blind nach fiscal_year)
      const periodRes = await supabase
        .from("billing_periods")
        .select("period_from, period_to")
        .eq("id", periodId)
        .maybeSingle();
      const periodFrom = periodRes.data?.period_from || `${fiscalYear}-01-01`;
      const periodTo = periodRes.data?.period_to || `${fiscalYear}-12-31`;

      const [accRes, bkRes, balRes, fuelRes, itemsRes] = await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select("id, account_number, account_name, category, settlement_section, is_asset_report_relevant")
          .or(`building_id.is.null,building_id.eq.${buildingId}`),
        supabase
          .from("bookings")
          .select("account_id, counter_account_id, amount, booking_date, booking_type")
          .eq("building_id", buildingId)
          .gte("booking_date", periodFrom)
          .lte("booking_date", periodTo)
          .neq("status", "cancelled"),
        supabase
          .from("account_balances")
          .select("account_id, opening_balance, closing_balance")
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear),
        supabase
          .from("fuel_inventory")
          .select("entry_type, quantity, total_price, billing_period_id")
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

  // ============================================================
  //  Saldo-Berechnung — IDENTISCH zur Doppik im Kontenrahmen
  //  signedTotalForAccount summiert über ALLE Periodenbuchungen
  //  inkl. Eröffnungsbuchung 4000 (booking_type-aware).
  // ============================================================
  const closingFor = (acc: any): number => {
    const signed = signedTotalForAccount(acc.id, bookings as any);
    if (Math.abs(signed) >= 0.005) return signed;
    // Fallback: manueller Eintrag in account_balances (z. B. Altbestände
    // ohne Buchungen). closing_balance hat Vorrang vor opening_balance.
    const manual = balances.find((b: any) => b.account_id === acc.id);
    if (manual?.closing_balance != null && Number(manual.closing_balance) !== 0) {
      return Number(manual.closing_balance);
    }
    if (manual?.opening_balance != null && Number(manual.opening_balance) !== 0) {
      return Number(manual.opening_balance);
    }
    return 0;
  };

  // Heizöl-Endbestand (closing_balance Einträge)
  const fuelClosingValue = fuelEntries
    .filter(e => e.entry_type === "closing_balance")
    .reduce((s, e) => s + (Number(e.total_price) || 0), 0);

  // Nur Konten mit Flag berücksichtigen
  const relevantAccs = accounts.filter((a: any) => a.is_asset_report_relevant === true);

  const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
  const accNum = (a: any) => parseInt(String(a.account_number), 10);

  const isBank = (a: any) => {
    const n = accNum(a);
    return inRange(n, 1800, 1899) || a.settlement_section === "bank";
  };
  const isVorauszahlung = (a: any) => inRange(accNum(a), 1470, 1473);
  const isFuelStock = (a: any) => accNum(a) === 1450;
  // Forderungen zum Jahresende = Vorjahres-Bezug (4100–4139)
  const isForderung = (a: any) => {
    const n = accNum(a);
    return inRange(n, 4100, 4119) || inRange(n, 4120, 4139);
  };
  // Zu-/Abflüsse aus Jahresabgrenzung = Folgejahr-Bezug (4140–4199)
  const isAbgrenzungFolgejahr = (a: any) => {
    const n = accNum(a);
    return inRange(n, 4140, 4159) || inRange(n, 4160, 4179) || inRange(n, 4180, 4199);
  };

  // Primär den echten account_name aus dem COA verwenden — damit UI und
  // generierte Vorlage exakt dieselben Bezeichnungen zeigen. Nur als
  // Fallback (z. B. fehlender Name) eine generische Beschreibung.
  const accrualLabel = (a: any): string => {
    if (a.account_name && String(a.account_name).trim()) return a.account_name;
    const n = accNum(a);
    if (inRange(n, 4100, 4119)) return "Ausgaben im lfd. Jahr für Vorjahr";
    if (inRange(n, 4120, 4139)) return "Einnahmen im lfd. Jahr für Vorjahr";
    if (inRange(n, 4140, 4159)) return "Einnahmen im lfd. Jahr für Folgejahr";
    if (inRange(n, 4160, 4179)) return "Ausgaben im Folgejahr für lfd. Jahr";
    if (inRange(n, 4180, 4199)) return "Einnahmen im Folgejahr für lfd. Jahr";
    return a.account_name || "";
  };

  // ============================================================
  //  Sektion 1: Liquide Mittel aus Bankkonten und Kasse
  //  inkl. Heizölrestbestand (Excel-Konvention)
  // ============================================================
  const bankAccs = relevantAccs.filter(isBank).sort((a, b) => a.account_number.localeCompare(b.account_number));
  // Konto 1450 wird durch fuel_inventory abgebildet — wenn vorhanden, COA-Konto unterdrücken.
  const fuelStockAccs = relevantAccs.filter(isFuelStock);
  const liquideLines: SectionLine[] = [];
  if (fuelClosingValue !== 0) {
    liquideLines.push({ key: "fuel", label: "Heizölrestbestand", amount: fuelClosingValue });
  } else {
    fuelStockAccs.forEach(a => {
      liquideLines.push({ key: a.id, label: "Heizölrestbestand", account_number: a.account_number, amount: closingFor(a) });
    });
  }
  bankAccs.forEach(a => {
    liquideLines.push({ key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a) });
  });

  // ============================================================
  //  Sektion 2: Guth. und Nachz. aus Abrechnung
  //  Quelle: ownerResults aus BillingSettlement (sonst leer)
  // ============================================================
  const sumGuthabenOwner = (ownerResults || []).reduce((s, o) => s + Math.max(0, o.result), 0);
  const sumNachzahlungOwner = (ownerResults || []).reduce((s, o) => s + Math.max(0, -o.result), 0);
  const guthabenLines: SectionLine[] = ownerResults
    ? [
        { key: "guthaben", label: "Guthaben aus Abr.", amount: -sumGuthabenOwner, keepZero: true },
        { key: "nachzahlung", label: "Nachzahlung aus Abr.", amount: sumNachzahlungOwner, keepZero: true },
      ]
    : [];

  // ============================================================
  //  Sektion 3: Vorauszahlungen Versorger (1470–1473)
  // ============================================================
  const vzAccs = relevantAccs.filter(isVorauszahlung).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const vzLines: SectionLine[] = vzAccs.map(a => ({
    key: a.id, label: a.account_name, account_number: a.account_number, amount: closingFor(a),
  }));

  // ============================================================
  //  Sektion 4: Zu- und Abflüsse aus Jahresabgrenzung (Folgejahr-Bezug)
  //  Vorzeichendrehung aus Vermögenssicht:
  //    4160 (Ausg. im Folgejahr für lfd. J., PRA-Bildung) → Verbindlichkeit ggü. Folgejahr → −
  //    4180 (Einn. im Folgejahr für lfd. J., ARA-Bildung) → Forderung an Folgejahr → +
  // ============================================================
  const abgFolgeAccs = relevantAccs.filter(isAbgrenzungFolgejahr).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const abgFolgeLines: SectionLine[] = abgFolgeAccs.map(a => ({
    key: a.id, label: accrualLabel(a), account_number: a.account_number, amount: -closingFor(a),
  }));

  // ============================================================
  //  Sektion 5: Forderungen zum Jahresende (Vorjahres-Bezug)
  // ============================================================
  const forderungAccs = relevantAccs.filter(isForderung).sort((a, b) => a.account_number.localeCompare(b.account_number));
  const forderungLines: SectionLine[] = forderungAccs.map(a => {
    // 4120–4139 (Einnahmen lfd. J. für Vorjahr) sind Verbindlichkeiten/Minderungen
    // → in der Abrechnung negativ, daher auch im Vermögensbericht mit gedrehtem Vorzeichen
    const n = accNum(a);
    const flip = n >= 4120 && n <= 4139 ? -1 : 1;
    return { key: a.id, label: accrualLabel(a), account_number: a.account_number, amount: flip * closingFor(a) };
  });

  // ============================================================
  //  Sektion 6: Sonstige Vermögensposten — alle weiteren Flag-Konten
  //  + manuelle Items aus asset_report_items
  // ============================================================
  const handledIds = new Set([
    ...bankAccs.map(a => a.id),
    ...fuelStockAccs.map(a => a.id),
    ...vzAccs.map(a => a.id),
    ...abgFolgeAccs.map(a => a.id),
    ...forderungAccs.map(a => a.id),
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
      .map(i => ({ key: `manual-${i.id}`, label: i.label, amount: Number(i.amount) || 0, keepZero: true })),
  ];

  const isNonZero = (n: number) => Math.abs(n) >= 0.005;
  const filterZero = (lines: SectionLine[]) => lines.filter(l => l.keepZero || isNonZero(l.amount));

  const sections: Section[] = [
    { title: "Liquide Mittel aus Bankkonten und Kasse", icon: "wallet" as const, lines: filterZero(liquideLines) },
    { title: "Guth. und Nachz. aus Abrechnung incl. Altschulden", lines: filterZero(guthabenLines) },
    { title: "Vorauszahlungen Versorger", lines: filterZero(vzLines) },
    { title: "Zu- und Abflüsse aus Jahresabgrenzung", lines: filterZero(abgFolgeLines) },
    { title: "Forderungen zum Jahresende", lines: filterZero(forderungLines) },
    { title: "Sonstige Vermögensposten", lines: filterZero(sonstigeLines) },
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
        Salden entsprechen 1:1 dem Kontenrahmen (signierter Saldo aus Eröffnungsbuchung 4000 + alle Bewegungen).
        {!ownerResults && (
          <> Hinweis: Guthaben/Nachzahlungen aus der Abrechnung werden nur in der Abrechnungs-Ansicht eingespeist.</>
        )}
      </p>

      {sections.map((sec) => {
        const total = sectionTotal(sec);
        return (
          <Card key={sec.title}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {sec.icon === "wallet" ? <Wallet className="h-4 w-4" /> : null}
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
            Heizölrestbestand wird aus <code>fuel_inventory</code> (closing_balance) übernommen und in „Liquide Mittel" ausgewiesen.
          </CardContent>
        </Card>
      )}

      {/* Vermögensstand-Endsumme */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">Vermögensstand zum 31.12.{fiscalYear}</span>
          <span className="font-mono font-semibold">{formatCurrency(grandTotal)}</span>
        </CardContent>
      </Card>
    </div>
  );
}
