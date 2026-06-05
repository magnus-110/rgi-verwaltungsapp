import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Circle, MinusCircle, Loader2, Landmark, FileText } from "lucide-react";
import { toast } from "sonner";
import { signedTotalForAccount } from "./lib/bookingAggregation";

interface Props {
  sharedBuildingId?: string | null;
  onBuildingChange?: (id: string | null) => void;
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_FULL = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const fmtEur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v));

const parseNum = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

export function BankReconciliationTab({ sharedBuildingId, onBuildingChange }: Props) {
  const queryClient = useQueryClient();
  const [internalBuilding, setInternalBuilding] = useState<string>("");
  const buildingId = sharedBuildingId || internalBuilding;
  const setBuildingId = (id: string) => {
    setInternalBuilding(id);
    onBuildingChange?.(id);
  };
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  // buildings query removed — building is selected at the page level

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-recon", buildingId],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .or("account_number.like.18%,account_number.like.10%")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      // Filter to bank-like accounts (Giro, Rücklagen, Festgeld, Sparbuch, Kasse)
      return (data ?? []).filter((a: any) => {
        const n = a.account_name?.toLowerCase() ?? "";
        return /bank|giro|rücklagen|festgeld|sparbuch|kasse|tagesgeld/.test(n);
      });
    },
  });

  // Auto-pick first bank account
  if (bankAccounts.length > 0 && !bankAccountId) {
    setBankAccountId(bankAccounts[0].id);
  }

  const { data: reconciliations = [], refetch } = useQuery({
    queryKey: ["bank-reconciliations", buildingId, bankAccountId, year],
    enabled: !!buildingId && !!bankAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("*")
        .eq("building_id", buildingId)
        .eq("bank_account_id", bankAccountId)
        .eq("period_year", year);
      if (error) throw error;
      return data;
    },
  });

  // Months that have at least one booking on this account
  const { data: monthsWithBookings = [] } = useQuery({
    queryKey: ["recon-months-with-bookings", buildingId, bankAccountId, year],
    enabled: !!buildingId && !!bankAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("booking_date")
        .eq("building_id", buildingId)
        .eq("fiscal_year", year)
        .or(`account_id.eq.${bankAccountId},counter_account_id.eq.${bankAccountId}`)
        .neq("status", "cancelled");
      if (error) throw error;
      const set = new Set<number>();
      data.forEach((b) => {
        const m = new Date(b.booking_date).getMonth() + 1;
        set.add(m);
      });
      return Array.from(set);
    },
  });

  // Bank-Auszüge dieser Liegenschaft / dieses Jahres — für Prefill und Monatskachel-Markierung
  const { data: statements = [] } = useQuery({
    queryKey: ["recon-bank-statements", buildingId, year],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statements")
        .select("id, file_name, account_iban, statement_date_from, statement_date_to, opening_balance, closing_balance, source_format, created_at")
        .eq("building_id", buildingId)
        .eq("fiscal_year", year)
        .order("statement_date_to", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // IBAN des gewählten Bankkontos (aus chart_of_accounts)
  const { data: bankIban } = useQuery({
    queryKey: ["recon-bank-iban", bankAccountId, buildingId],
    enabled: !!bankAccountId && !!buildingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("building_bank_accounts" as any)
        .select("iban")
        .eq("building_id", buildingId)
        .eq("coa_account_id", bankAccountId)
        .maybeSingle();
      return ((data as any)?.iban as string | null) ?? null;
    },
  });

  // Map: month -> Auszüge, die diesen Monat berühren (gefiltert nach IBAN wenn vorhanden)
  const statementsByMonth = useMemo(() => {
    const map = new Map<number, any[]>();
    const cleanIban = (bankIban || "").replace(/\s/g, "").toUpperCase();
    for (const s of statements) {
      if (!s.statement_date_to) continue;
      if (cleanIban) {
        const sIban = (s.account_iban || "").replace(/\s/g, "").toUpperCase();
        if (sIban && sIban !== cleanIban) continue;
      }
      const dStart = new Date(s.statement_date_from || s.statement_date_to);
      const dEnd = new Date(s.statement_date_to);
      let y = dStart.getFullYear(), m = dStart.getMonth() + 1;
      const endY = dEnd.getFullYear(), endM = dEnd.getMonth() + 1;
      while (y < endY || (y === endY && m <= endM)) {
        if (y === year) {
          if (!map.has(m)) map.set(m, []);
          map.get(m)!.push(s);
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    return map;
  }, [statements, bankIban, year]);


  const reconByMonth = useMemo(() => {
    const m = new Map<number, any>();
    reconciliations.forEach((r) => m.set(r.period_month, r));
    return m;
  }, [reconciliations]);

  const summary = useMemo(() => {
    const open = monthsWithBookings.filter((m) => {
      const r = reconByMonth.get(m);
      return !r || r.status === "open";
    }).length;
    const mismatch = reconciliations.filter((r) => r.status === "mismatch").length;
    const confirmed = reconciliations.filter((r) => r.status === "confirmed").length;
    return { open, mismatch, confirmed };
  }, [monthsWithBookings, reconByMonth, reconciliations]);

  const getStatusInfo = (m: number) => {
    const r = reconByMonth.get(m);
    const hasBookings = monthsWithBookings.includes(m);
    if (!hasBookings && !r) return { color: "bg-muted text-muted-foreground", icon: MinusCircle, label: "Keine Buchungen" };
    if (!r) return { color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Circle, label: "Offen" };
    if (r.status === "confirmed") return { color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2, label: "Bestätigt" };
    if (r.status === "mismatch") return { color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: AlertTriangle, label: "Differenz" };
    if (r.status === "matched") return { color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: CheckCircle2, label: "Stimmt überein" };
    return { color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Circle, label: "Offen" };
  };

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 2, cur - 1, cur, cur + 1];
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-5 w-5" /> Kontenabgleich
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Bankkonto</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={!buildingId}>
                <SelectTrigger><SelectValue placeholder="Bankkonto wählen" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_number} {a.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Label className="text-xs">Jahr</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {buildingId && bankAccountId && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950">{summary.confirmed} bestätigt</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950">{summary.open} offen</Badge>
                {summary.mismatch > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950">{summary.mismatch} Differenz</Badge>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                {MONTHS.map((label, i) => {
                  const m = i + 1;
                  const info = getStatusInfo(m);
                  const Icon = info.icon;
                  const r = reconByMonth.get(m);
                  const hasStatement = (statementsByMonth.get(m)?.length ?? 0) > 0;
                  return (
                    <button
                      key={m}
                      onClick={() => setOpenMonth(m)}
                      className={`relative p-3 rounded-lg border transition hover:scale-105 hover:shadow-md flex flex-col items-center gap-1 ${info.color}`}
                      title={hasStatement ? `${info.label} · Auszug verfügbar` : info.label}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{label}</span>
                      {hasStatement && (
                        <FileText className="absolute top-1 right-1 h-3 w-3 opacity-70" />
                      )}
                      {r?.difference != null && r.status === "mismatch" && (
                        <span className="text-[10px] font-mono">{Number(r.difference).toFixed(2)} €</span>
                      )}
                    </button>
                  );
                })}
              </div>


              <p className="text-xs text-muted-foreground">
                Klicke auf einen Monat, um Anfangs-/Endsaldo lt. Kontoauszug einzutragen und mit der Buchhaltung zu vergleichen.
              </p>
            </>
          )}

          {!buildingId && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Bitte wähle eine Liegenschaft aus.
            </p>
          )}
        </CardContent>
      </Card>

      {openMonth && buildingId && bankAccountId && (
        <ReconciliationDialog
          open={!!openMonth}
          onClose={() => setOpenMonth(null)}
          buildingId={buildingId}
          bankAccountId={bankAccountId}
          bankAccountLabel={bankAccounts.find(a => a.id === bankAccountId)?.account_number + " " + bankAccounts.find(a => a.id === bankAccountId)?.account_name}
          year={year}
          month={openMonth}
          existing={reconByMonth.get(openMonth)}
          previousMonthRecon={openMonth > 1 ? reconByMonth.get(openMonth - 1) : null}
          monthStatements={statementsByMonth.get(openMonth) ?? []}
          onSaved={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["bank-reconciliations"] }); }}
        />
      )}
    </div>
  );
}


interface DialogProps {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  bankAccountId: string;
  bankAccountLabel?: string;
  year: number;
  month: number;
  existing?: any;
  previousMonthRecon?: any;
  monthStatements?: any[];
  onSaved: () => void;
}

function ReconciliationDialog({ open, onClose, buildingId, bankAccountId, bankAccountLabel, year, month, existing, previousMonthRecon, monthStatements = [], onSaved }: DialogProps) {
  const [openingBank, setOpeningBank] = useState<string>(
    existing?.opening_balance_bank != null
      ? String(existing.opening_balance_bank).replace(".", ",")
      : (previousMonthRecon?.closing_balance_bank != null ? String(previousMonthRecon.closing_balance_bank).replace(".", ",") : "")
  );
  const [closingBank, setClosingBank] = useState<string>(
    existing?.closing_balance_bank != null ? String(existing.closing_balance_bank).replace(".", ",") : ""
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Compute period dates
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  // local-date formatter (avoid UTC shift from toISOString())
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Saldo lt. Buchhaltung — bank-zentrisch via signedTotalForAccount.
  // Eröffnungsbuchungen gegen Konto 4000 (SKR-Standard, oft am 01.01. datiert)
  // werden IMMER dem Anfangsbestand zugerechnet, auch wenn ihr Datum innerhalb
  // des betrachteten Monats liegt — sonst fehlt der Anfangssaldo im Januar.
  const { data: balances } = useQuery({
    queryKey: ["recon-balances-v4", bankAccountId, buildingId, year, month],
    queryFn: async () => {
      const { data: openingAcc } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_number", "4000")
        .is("building_id", null)
        .maybeSingle();
      const openingAccountId = openingAcc?.id ?? null;

      const { data, error } = await supabase
        .from("bookings")
        .select("amount, account_id, counter_account_id, booking_date, booking_type")
        .eq("building_id", buildingId)
        .lte("booking_date", fmtDate(lastDay))
        .neq("status", "cancelled")
        .or(`account_id.eq.${bankAccountId},counter_account_id.eq.${bankAccountId}`);
      if (error) throw error;
      const firstStr = fmtDate(firstDay);
      const lastStr = fmtDate(lastDay);
      const isOpening = (b: any) =>
        openingAccountId &&
        (b.account_id === openingAccountId || b.counter_account_id === openingAccountId) &&
        b.booking_date && b.booking_date.startsWith(`${year}-01-`);
      const before = (data ?? []).filter((b: any) => b.booking_date < firstStr || isOpening(b));
      const upToEnd = (data ?? []).filter((b: any) => b.booking_date <= lastStr);
      return {
        opening: signedTotalForAccount(bankAccountId, before as any),
        closing: signedTotalForAccount(bankAccountId, upToEnd as any),
      };
    },
  });

  const openingBook = balances?.opening ?? null;
  const closingBook = balances?.closing ?? null;

  const closingBankNum = parseNum(closingBank);
  const openingBankNum = parseNum(openingBank);

  const closingDiff = closingBankNum != null && closingBook != null ? Number((closingBook - closingBankNum).toFixed(2)) : null;
  const openingDiff = openingBankNum != null && openingBook != null ? Number((openingBook - openingBankNum).toFixed(2)) : null;

  const isMatched = closingDiff != null && Math.abs(closingDiff) < 0.01;
  const canConfirm = isMatched;

  const save = async (confirm: boolean) => {
    setSaving(true);
    try {
      const status = confirm ? "confirmed" : (closingDiff == null ? "open" : (isMatched ? "matched" : "mismatch"));
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        building_id: buildingId,
        bank_account_id: bankAccountId,
        period_year: year,
        period_month: month,
        opening_balance_bank: openingBankNum,
        closing_balance_bank: closingBankNum,
        opening_balance_book: openingBook ?? null,
        closing_balance_book: closingBook ?? null,
        difference: closingDiff,
        status,
        notes: notes || null,
        confirmed_at: confirm ? new Date().toISOString() : null,
        confirmed_by: confirm ? user?.id : null,
      };
      const { error } = await supabase
        .from("bank_reconciliations")
        .upsert(payload, { onConflict: "building_id,bank_account_id,period_year,period_month" });
      if (error) throw error;
      toast.success(confirm ? "Monat bestätigt" : "Gespeichert");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{MONTH_FULL[month - 1]} {year} — {bankAccountLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Anfangssaldo lt. Kontoauszug (€)</Label>
              <Input
                value={openingBank}
                onChange={(e) => setOpeningBank(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Endsaldo lt. Kontoauszug (€)</Label>
              <Input
                value={closingBank}
                onChange={(e) => setClosingBank(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground">Vergleich mit Buchhaltung</div>
            <div className="flex justify-between text-sm">
              <span>Anfangssaldo lt. Buchhaltung:</span>
              <span className="font-mono flex items-center gap-2">
                {fmtEur(openingBook)}
                {openingDiff != null && Math.abs(openingDiff) < 0.01 && <CheckCircle2 className="h-3 w-3 text-green-600" />}
              </span>
            </div>
            {openingDiff != null && Math.abs(openingDiff) >= 0.01 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Differenz Anfangssaldo:</span>
                <span className="font-mono flex items-center gap-2 text-destructive">
                  {`${openingDiff >= 0 ? "+" : ""}${openingDiff.toFixed(2)} €`}
                  <AlertTriangle className="h-3 w-3" />
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Endsaldo lt. Buchhaltung:</span>
              <span className="font-mono">{fmtEur(closingBook)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-2 border-t">
              <span>Differenz Endsaldo:</span>
              <span className={`font-mono flex items-center gap-2 ${
                closingDiff == null ? "text-muted-foreground" :
                Math.abs(closingDiff) < 0.01 ? "text-green-600" : "text-destructive"
              }`}>
                {closingDiff != null ? `${closingDiff >= 0 ? "+" : ""}${closingDiff.toFixed(2)} €` : "—"}
                {closingDiff != null && (Math.abs(closingDiff) < 0.01
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <AlertTriangle className="h-4 w-4" />)}
              </span>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notiz</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optionale Notiz..." />
          </div>

          {existing?.confirmed_at && (
            <div className="text-xs text-green-700 dark:text-green-400">
              ✓ Bestätigt am {new Date(existing.confirmed_at).toLocaleDateString("de-DE")}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Speichern
          </Button>
          <Button onClick={() => save(true)} disabled={!canConfirm || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Als geprüft markieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
