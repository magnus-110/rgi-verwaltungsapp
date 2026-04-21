import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, XCircle, Shield } from "lucide-react";

interface BillingValidationPanelProps {
  periodId: string;
  buildingId: string;
  fiscalYear: number;
}

export function BillingValidationPanel({ periodId, buildingId, fiscalYear }: BillingValidationPanelProps) {
  const { data: validations = [] } = useQuery({
    queryKey: ["billing-validations", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_validations")
        .select("*")
        .eq("billing_period_id", periodId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: fuelEntries = [] } = useQuery({
    queryKey: ["fuel-inventory", buildingId, periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuel_inventory")
        .select("*")
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId);
      if (error) throw error;
      return data;
    },
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["validation-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_category, booking_type")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  const { data: allAccounts = [] } = useQuery({
    queryKey: ["validation-all-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, is_heating_relevant, settlement_section, carry_forward_balance")
        .or(`building_id.is.null,building_id.eq.${buildingId}`);
      if (error) throw error;
      return data;
    },
  });
  const heatingAccounts = allAccounts.filter((a: any) => a.is_heating_relevant);

  const { data: shares = [] } = useQuery({
    queryKey: ["validation-shares", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_shares")
        .select("share_type, share_value, contact_building_assignments!inner(building_id)")
        .eq("contact_building_assignments.building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  const { data: reconciliations = [] } = useQuery({
    queryKey: ["bank-recon-validation", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("period_month, status")
        .eq("building_id", buildingId)
        .eq("period_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  // Live-Prüfungen
  type LiveCheck = { name: string; status: "passed" | "warning" | "failed"; message: string };
  const liveChecks: LiveCheck[] = [];

  // 1. Saldenübernahme
  const carriedCount = balances.filter((b) => b.is_carried_forward).length;
  liveChecks.push(carriedCount > 0
    ? { name: "Saldenübernahme", status: "passed", message: `${carriedCount} Salden übernommen` }
    : { name: "Saldenübernahme", status: "warning", message: "Noch keine Salden vom Vorjahr übernommen" }
  );

  // 2. Brennstoff-Plausibilität (pro Heizkreis × Brennstoff)
  type Bucket = { key: string; label: string; entries: any[] };
  const buckets: Bucket[] = [];
  const unitMap = new Map<string, any>();
  // Heizkreise aus Einträgen rekonstruieren (sofern gesetzt)
  fuelEntries.forEach((e: any) => {
    if (e.heating_unit_id && !unitMap.has(e.heating_unit_id)) {
      unitMap.set(e.heating_unit_id, true);
    }
  });
  const groupKeys = new Set<string>();
  fuelEntries.forEach((e: any) => {
    const k = `${e.heating_unit_id ?? "none"}::${e.fuel_type}`;
    groupKeys.add(k);
  });
  groupKeys.forEach((k) => {
    const [unitId, ft] = k.split("::");
    const entries = fuelEntries.filter((e: any) =>
      (e.heating_unit_id ?? "none") === unitId && e.fuel_type === ft
    );
    const unitLabel = unitId === "none" ? "" : ` · Heizkreis`;
    buckets.push({ key: k, label: `Brennstoff (${ft})${unitLabel}`, entries });
  });

  if (buckets.length === 0) {
    liveChecks.push({ name: "Brennstoffdaten", status: "warning", message: "Noch keine Brennstoffdaten erfasst" });
  }
  buckets.forEach(({ key, label, entries: bEntries }) => {
    const ft = key.split("::")[1];
    const opening = Number(bEntries.find((e) => e.entry_type === "opening_balance")?.quantity ?? 0);
    const closing = Number(bEntries.find((e) => e.entry_type === "closing_balance")?.quantity ?? 0);
    const purchases = bEntries.filter((e) => e.entry_type === "purchase").reduce((s, e) => s + Number(e.quantity), 0);
    const consumption = opening + purchases - closing;
    const hasOpening = bEntries.some((e) => e.entry_type === "opening_balance");
    const hasClosing = bEntries.some((e) => e.entry_type === "closing_balance");

    if (!hasOpening || !hasClosing) {
      liveChecks.push({ name: label, status: "warning", message: `${!hasOpening ? "Anfangsbestand" : "Endbestand"} fehlt` });
    } else if (consumption < 0) {
      liveChecks.push({ name: label, status: "failed", message: `Negativer Verbrauch (${consumption.toFixed(1)})` });
    } else {
      liveChecks.push({ name: label, status: "passed", message: `Verbrauch: ${consumption.toFixed(1)}` });
    }

    // CO₂-Check (BEHG, nur fossile Brennstoffe)
    if (["oil", "gas", "district_heating"].includes(ft)) {
      const purchaseEntries = bEntries.filter((e) => e.entry_type === "purchase");
      if (purchaseEntries.length > 0) {
        const missingCo2 = purchaseEntries.filter((e: any) => e.co2_emissions_kg == null || e.co2_tax_amount == null);
        if (missingCo2.length === purchaseEntries.length) {
          liveChecks.push({ name: `CO₂-Daten (${ft})`, status: "warning", message: `BEHG: Keine CO₂-Daten erfasst (${purchaseEntries.length} Einkäufe)` });
        } else if (missingCo2.length > 0) {
          liveChecks.push({ name: `CO₂-Daten (${ft})`, status: "warning", message: `${missingCo2.length} von ${purchaseEntries.length} Einkäufen ohne CO₂-Daten` });
        } else {
          const totalCo2 = purchaseEntries.reduce((s, e: any) => s + Number(e.co2_emissions_kg ?? 0), 0);
          liveChecks.push({ name: `CO₂-Daten (${ft})`, status: "passed", message: `${totalCo2.toFixed(0)} kg CO₂ erfasst` });
        }
      }
    }
  });

  // 3. HK-Umbuchungen — bank-zentrisch: Heizkonto kann account_id ODER counter_account_id sein
  if (heatingAccounts.length > 0) {
    const heatingTotal = heatingAccounts.reduce((s, a) => {
      const accTotal = bookings
        .filter((b) =>
          (b.account_id === a.id || (b as any).counter_account_id === a.id) &&
          b.booking_category !== "heating_repost"
        )
        .reduce((ss, b) => {
          const amt = Number(b.amount) || 0;
          if (b.account_id === a.id) return ss + amt;
          if ((b as any).counter_account_id === a.id) return ss - amt;
          return ss;
        }, 0);
      return s + Math.abs(accTotal);
    }, 0);
    const rebookingTotal = bookings
      .filter((b) => b.booking_category === "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);

    if (rebookingTotal === 0) {
      liveChecks.push({ name: "HK-Umbuchungen", status: "warning", message: "Noch keine Umbuchungen erstellt" });
    } else if (Math.abs(heatingTotal - rebookingTotal) < 0.01) {
      liveChecks.push({ name: "HK-Umbuchungen", status: "passed", message: `Ausgeglichen: ${heatingTotal.toFixed(2)} €` });
    } else {
      liveChecks.push({ name: "HK-Umbuchungen", status: "failed", message: `Differenz: ${(heatingTotal - rebookingTotal).toFixed(2)} €` });
    }
  }

  // 4. Einnahmen/Ausgaben
  const totalIncome = bookings.filter((b) => b.booking_type === "income").reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
  const totalExpense = bookings.filter((b) => b.booking_type === "expense").reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
  if (bookings.length > 0) {
    liveChecks.push({
      name: "Einnahmen/Ausgaben",
      status: totalIncome > 0 ? "passed" : "warning",
      message: `Einnahmen: ${totalIncome.toFixed(2)} € | Ausgaben: ${totalExpense.toFixed(2)} €`,
    });
  }

  // 5. Verteilerschlüssel
  const shareTypes = [...new Set(shares.map((s: any) => s.share_type))];
  shareTypes.forEach((st) => {
    const total = shares.filter((s: any) => s.share_type === st).reduce((sum: number, s: any) => sum + Number(s.share_value), 0);
    // MEA should sum to specific total, others just check > 0
    if (total <= 0) {
      liveChecks.push({ name: `Anteile (${st})`, status: "failed", message: "Summe = 0" });
    } else {
      liveChecks.push({ name: `Anteile (${st})`, status: "passed", message: `Summe: ${total.toFixed(2)}` });
    }
  });

  // 6. Abgrenzungen — Kategorie ODER 4xxx-Konto auf einer der beiden Buchungsseiten
  const accountById = new Map((allAccounts as any[]).map((a: any) => [a.id, a]));
  const isAccrualAccountId = (id?: string | null) => {
    if (!id) return false;
    const acc = accountById.get(id);
    const num = Number(acc?.account_number);
    return Number.isFinite(num) && num >= 4000 && num < 5000;
  };
  const accrualBookings = bookings.filter((b) =>
    b.booking_category === "accrual" ||
    isAccrualAccountId(b.account_id) ||
    isAccrualAccountId((b as any).counter_account_id)
  );
  if (accrualBookings.length > 0) {
    liveChecks.push({ name: "Abgrenzungen", status: "passed", message: `${accrualBookings.length} Abgrenzungsbuchungen` });
  }

  // 7. Bankkonten-Abgleich (monatliche Reconciliation)
  const today = new Date();
  const isCurrentYear = fiscalYear === today.getFullYear();
  const lastRelevantMonth = isCurrentYear ? today.getMonth() + 1 : 12;
  const reconMap = new Map<number, string>();
  reconciliations.forEach((r: any) => reconMap.set(r.period_month, r.status));
  const mismatchMonths: number[] = [];
  const openMonths: number[] = [];
  for (let m = 1; m <= lastRelevantMonth; m++) {
    const status = reconMap.get(m);
    if (status === "mismatch") mismatchMonths.push(m);
    else if (status !== "confirmed") openMonths.push(m);
  }
  if (mismatchMonths.length > 0) {
    liveChecks.push({ name: "Kontenabgleich Bank", status: "failed", message: `Differenz in Monat(en): ${mismatchMonths.join(", ")}` });
  } else if (openMonths.length > 0) {
    liveChecks.push({ name: "Kontenabgleich Bank", status: "warning", message: `${openMonths.length} Monat(e) noch nicht geprüft` });
  } else if (reconciliations.length > 0) {
    liveChecks.push({ name: "Kontenabgleich Bank", status: "passed", message: `Alle ${lastRelevantMonth} Monate bestätigt` });
  }

  // 8. Konten als 'bank' klassifiziert, aber mit Aufwandsbewegungen → wahrscheinlich falsch eingestellt
  const accountsWithMovement = new Set<string>();
  bookings.forEach((b: any) => {
    if (b.account_id) accountsWithMovement.add(b.account_id);
    if (b.counter_account_id) accountsWithMovement.add(b.counter_account_id);
  });
  const misclassifiedBank = (allAccounts as any[]).filter((a: any) =>
    a.settlement_section === "bank" &&
    accountsWithMovement.has(a.id) &&
    // Echte Bankkonten haben Nummer 1800–1899
    !(Number(a.account_number) >= 1800 && Number(a.account_number) < 1900)
  );
  if (misclassifiedBank.length > 0) {
    liveChecks.push({
      name: "Kontenklassifizierung",
      status: "warning",
      message: `${misclassifiedBank.length} Konto/Konten als 'Bank' klassifiziert, hat/haben aber Bewegungen: ${misclassifiedBank.map((a: any) => a.account_number).join(", ")}`,
    });
  }

  // 9. Anfangsbestände — entweder aus account_balances ODER aus Eröffnungsbuchung gegen 4000
  const opening4000 = (allAccounts as any[]).find((a: any) => a.account_number === "4000");
  const opening4000Id = opening4000?.id;
  const accountsWithOpeningBooking = new Set<string>();
  if (opening4000Id) {
    bookings.forEach((b: any) => {
      const date: string = b.booking_date || "";
      if (!date.startsWith(`${fiscalYear}-01-`)) return;
      const touchesOpening = b.account_id === opening4000Id || b.counter_account_id === opening4000Id;
      if (!touchesOpening) return;
      if (b.account_id && b.account_id !== opening4000Id) accountsWithOpeningBooking.add(b.account_id);
      if (b.counter_account_id && b.counter_account_id !== opening4000Id) accountsWithOpeningBooking.add(b.counter_account_id);
    });
  }
  const carryForwardAccounts = (allAccounts as any[]).filter((a: any) => a.carry_forward_balance);
  const accountsWithBalance = new Set(balances.map((b: any) => b.account_id));
  const missingOpenings = carryForwardAccounts.filter((a: any) =>
    !accountsWithBalance.has(a.id) &&
    !accountsWithOpeningBooking.has(a.id) &&
    accountsWithMovement.has(a.id)
  );
  if (missingOpenings.length > 0) {
    liveChecks.push({
      name: "Anfangsbestände",
      status: "warning",
      message: `${missingOpenings.length} Konto/Konten ohne Anfangsbestand: ${missingOpenings.map((a: any) => a.account_number).join(", ")}`,
    });
  } else if (accountsWithOpeningBooking.size > 0) {
    liveChecks.push({
      name: "Anfangsbestände",
      status: "passed",
      message: `${accountsWithOpeningBooking.size} Konto/Konten via Eröffnungsbuchung 4000 erkannt`,
    });
  }

  // 10. Heiz-Vorauszahlungen ohne Repost auf Heizkostenkonto
  const heatingPrepayAccounts = (allAccounts as any[]).filter((a: any) => a.settlement_section === "heating_prepayment");
  const prepayTotal = heatingPrepayAccounts.reduce((s, a) => {
    const t = bookings
      .filter((b: any) => (b.account_id === a.id || b.counter_account_id === a.id) && b.booking_category !== "heating_repost")
      .reduce((ss, b: any) => {
        const amt = Number(b.amount) || 0;
        if (b.account_id === a.id) return ss + amt;
        if (b.counter_account_id === a.id) return ss - amt;
        return ss;
      }, 0);
    return s + Math.abs(t);
  }, 0);
  const hasRepost = bookings.some((b: any) => b.booking_category === "heating_repost");
  if (prepayTotal > 0 && !hasRepost) {
    liveChecks.push({
      name: "Heiz-VZ ohne Repost",
      status: "warning",
      message: `${prepayTotal.toFixed(2)} € Vorauszahlungen erfasst — Heizkostenabrechnung der Ablesefirma noch nicht auf 1400 umgebucht (werden NICHT umgelegt)`,
    });
  }

  const allChecks = [
    ...liveChecks,
    ...validations.map((v) => ({ name: v.check_name, status: v.status as LiveCheck["status"], message: v.message || "" })),
  ];

  const passedCount = allChecks.filter((c) => c.status === "passed").length;
  const warningCount = allChecks.filter((c) => c.status === "warning").length;
  const failedCount = allChecks.filter((c) => c.status === "failed").length;

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "passed") return <Check className="h-4 w-4 text-green-600" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5" /> Kontrollcenter
        </CardTitle>
        <div className="flex gap-2 mt-1">
          {passedCount > 0 && <Badge className="bg-green-100 text-green-800">{passedCount} ✓</Badge>}
          {warningCount > 0 && <Badge className="bg-amber-100 text-amber-800">{warningCount} ⚠</Badge>}
          {failedCount > 0 && <Badge className="bg-red-100 text-red-800">{failedCount} ✗</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {allChecks.map((check, i) => (
            <div key={i} className={`flex items-center gap-3 p-2 rounded-md text-sm ${
              check.status === "failed" ? "bg-red-50" : check.status === "warning" ? "bg-amber-50" : "bg-green-50"
            }`}>
              <StatusIcon status={check.status} />
              <span className="font-medium min-w-[160px]">{check.name}</span>
              <span className="text-muted-foreground">{check.message}</span>
            </div>
          ))}
          {allChecks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Noch keine Prüfungen verfügbar</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
