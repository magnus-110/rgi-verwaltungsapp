import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Landmark, Droplets, Flame, Package, FileClock, TrendingUp } from "lucide-react";
import { getEffectiveClosingBalance, sumForAccount, amountOnAccount } from "./lib/bookingAggregation";

interface AssetReportSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

interface AccountWithBalance {
  id: string;
  account_number: string;
  account_name: string;
  closing_balance: number;
  opening_balance: number;
  movements: number;
}

export function AssetReportSection({ buildingId, periodId, fiscalYear }: AssetReportSectionProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // 1) Alle relevanten Konten + alle Buchungen + alle account_balances einmalig laden,
  //    dann die Salden via Helper (Eröffnungsbuchung 4000 + Bewegungen) ableiten.
  const { data: ctx, isLoading } = useQuery({
    queryKey: ["asset-report-ctx", buildingId, fiscalYear, periodId],
    queryFn: async () => {
      const [{ data: accounts, error: accErr }, { data: bookings, error: bkErr }, { data: balances, error: balErr }, fuelRes] = await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select("id, account_number, account_name, category, settlement_section")
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
          .select("end_value_eur")
          .eq("building_id", buildingId)
          .eq("billing_period_id", periodId)
          .maybeSingle(),
      ]);
      if (accErr) throw accErr;
      if (bkErr) throw bkErr;
      if (balErr) throw balErr;

      return {
        accounts: accounts || [],
        bookings: bookings || [],
        balances: balances || [],
        fuelValue: Number((fuelRes.data as any)?.end_value_eur ?? 0),
      };
    },
  });

  const accounts = ctx?.accounts ?? [];
  const bookings = ctx?.bookings ?? [];
  const balances = ctx?.balances ?? [];
  const fuelValue = ctx?.fuelValue ?? 0;

  const opening4000 = accounts.find((a: any) => a.account_number === "4000");
  const opening4000Id = opening4000?.id || null;

  const computeAccount = (acc: any): AccountWithBalance => {
    const eff = getEffectiveClosingBalance(acc.id, bookings as any, balances as any, fiscalYear, opening4000Id);
    const manual = balances.find((b: any) => b.account_id === acc.id);
    // Manueller closing_balance als Override, falls explizit gesetzt
    const closing =
      manual && manual.closing_balance !== null && manual.closing_balance !== undefined && Number(manual.closing_balance) !== 0
        ? Number(manual.closing_balance)
        : eff.amount;
    return {
      id: acc.id,
      account_number: acc.account_number,
      account_name: acc.account_name,
      closing_balance: closing,
      opening_balance: eff.opening,
      movements: eff.movements,
    };
  };

  // Bankkonten: settlement_section='bank' ODER 1800–1899
  const bankAccs = accounts.filter((a: any) => {
    if (a.settlement_section === "bank") return true;
    const num = Number(a.account_number);
    return num >= 1800 && num < 1900;
  });
  const bankAccounts: AccountWithBalance[] = bankAccs.map(computeAccount);

  // Erhaltungsrücklage: settlement_section='reserve', category='ruecklage' oder Name-Match
  const reserveAccs = accounts.filter((a: any) =>
    a.settlement_section === "reserve" ||
    a.category === "ruecklage" ||
    a.account_name?.toLowerCase().includes("rücklage") ||
    a.account_name?.toLowerCase().includes("erhaltung"),
  );
  const reserveAccounts: AccountWithBalance[] = reserveAccs.map(computeAccount);
  const reserveIds = new Set(reserveAccs.map((a: any) => a.id));

  // Zinszuwachs Rücklage = Buchungen, deren Gegenseite ein Rücklagenkonto ist
  // (z. B. 1840 an 1810). Wir summieren den Betrag auf dem Rücklagenkonto.
  const reserveInterestBookings = bookings.filter((b: any) => {
    const onReserve = reserveIds.has(b.account_id) || reserveIds.has(b.counter_account_id);
    if (!onReserve) return false;
    // Heuristik: Buchung mit "Zins" in der Beschreibung ODER Gegenkonto = Zinsertrag
    const otherId = reserveIds.has(b.account_id) ? b.counter_account_id : b.account_id;
    const other = accounts.find((a: any) => a.id === otherId);
    const isInterest = /zins|ertrag/i.test(other?.account_name || "");
    return isInterest;
  });
  const reserveInterestTotal = reserveInterestBookings.reduce((s: number, b: any) => {
    const reserveId = reserveIds.has(b.account_id) ? b.account_id : b.counter_account_id;
    return s + amountOnAccount(reserveId, b);
  }, 0);

  // VZ/Abgrenzungen 1470–1473 (Bilanz)
  const accrualAccs = accounts.filter((a: any) => ["1470", "1471", "1472", "1473"].includes(a.account_number));
  const accrualAccounts: AccountWithBalance[] = accrualAccs.map(computeAccount);

  // ARAP/PRAP (4110/4130) als Bilanzposten
  const arapAcc = accounts.find((a: any) => a.account_number === "4110");
  const prapAcc = accounts.find((a: any) => a.account_number === "4130");
  const arapBalance = arapAcc ? Math.abs(sumForAccount(arapAcc.id, bookings as any)) : 0;
  const prapBalance = prapAcc ? Math.abs(sumForAccount(prapAcc.id, bookings as any)) : 0;

  const bankTotal = bankAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const reserveTotal = reserveAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const accrualTotal = accrualAccounts.reduce((s, a) => s + a.closing_balance, 0);
  const grandTotal = bankTotal + accrualTotal + fuelValue + reserveTotal + arapBalance - prapBalance;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Übersicht über das Vermögen der WEG zum Stichtag des Geschäftsjahres {fiscalYear}.
        Salden werden automatisch aus Eröffnungsbuchungen (Konto 4000) und allen Bewegungen abgeleitet.
      </p>

      {/* Bankkonten */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Bankkonten
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right hidden md:table-cell">Anfang</TableHead>
                <TableHead className="text-right hidden md:table-cell">Bewegung</TableHead>
                <TableHead className="text-right">Endsaldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankAccounts.map(acc => (
                <TableRow key={acc.id}>
                  <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                  <TableCell className="text-sm">{acc.account_name}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground hidden md:table-cell">{formatCurrency(acc.opening_balance)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground hidden md:table-cell">{formatCurrency(acc.movements)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                </TableRow>
              ))}
              {bankAccounts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground text-center">Keine Bankkonten gefunden</TableCell></TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-medium text-sm">Summe Bankkonten</TableCell>
                <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(bankTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Rücklagen */}
      {reserveAccounts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Erhaltungsrücklage
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Konto</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Anfang</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Bewegung</TableHead>
                  <TableHead className="text-right">Endsaldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reserveAccounts.map(acc => (
                  <TableRow key={acc.id}>
                    <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground hidden md:table-cell">{formatCurrency(acc.opening_balance)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground hidden md:table-cell">{formatCurrency(acc.movements)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                  </TableRow>
                ))}
                {reserveInterestTotal !== 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-xs text-muted-foreground italic">
                      <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> davon Zinszuwachs Rücklage (informativ)</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground italic">{formatCurrency(reserveInterestTotal)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-medium text-sm">Summe Rücklagen</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(reserveTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Vorauszahlungen / Abgrenzungen 1470er */}
      {accrualAccounts.some(a => a.closing_balance !== 0) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Droplets className="h-4 w-4" /> Vorauszahlungen Versorger (1470–1473)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {accrualAccounts.map(acc => (
                  <TableRow key={acc.id}>
                    <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.closing_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">Summe Vorauszahlungen</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(accrualTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ARAP / PRAP — Rechnungsabgrenzungsposten als Bilanzposten */}
      {(arapBalance !== 0 || prapBalance !== 0) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileClock className="h-4 w-4" /> Rechnungsabgrenzung (Bilanzposten)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Periodenfremde Beträge — werden nicht als laufender Aufwand umgelegt, sondern im Folgejahr aufgelöst.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {arapBalance !== 0 && arapAcc && (
                  <TableRow>
                    <TableCell className="text-xs font-mono">{arapAcc.account_number}</TableCell>
                    <TableCell className="text-sm">Aktive Rechnungsabgrenzung (ARAP)</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(arapBalance)}</TableCell>
                  </TableRow>
                )}
                {prapBalance !== 0 && prapAcc && (
                  <TableRow>
                    <TableCell className="text-xs font-mono">{prapAcc.account_number}</TableCell>
                    <TableCell className="text-sm">Passive Rechnungsabgrenzung (PRAP)</TableCell>
                    <TableCell className="text-right font-mono text-sm">−{formatCurrency(prapBalance)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">Saldo Rechnungsabgrenzung</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(arapBalance - prapBalance)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Brennstoff */}
      {fuelValue > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4" /> Brennstoffbestand
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-sm">Restbestand Brennstoff</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(fuelValue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Gesamtvermögen der WEG</span>
            <span className="text-lg font-bold font-mono">{formatCurrency(grandTotal)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
