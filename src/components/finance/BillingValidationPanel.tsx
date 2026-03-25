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

  // Live-Checks (clientseitig)
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

  // Live-Prüfungen
  type LiveCheck = { name: string; status: "passed" | "warning" | "failed"; message: string };
  const liveChecks: LiveCheck[] = [];

  // Saldenübernahme
  const carriedCount = balances.filter((b) => b.is_carried_forward).length;
  if (carriedCount > 0) {
    liveChecks.push({ name: "Saldenübernahme", status: "passed", message: `${carriedCount} Salden übernommen` });
  } else {
    liveChecks.push({ name: "Saldenübernahme", status: "warning", message: "Noch keine Salden vom Vorjahr übernommen" });
  }

  // Brennstoff-Plausibilität
  const fuelTypes = [...new Set(fuelEntries.map((e) => e.fuel_type))];
  fuelTypes.forEach((ft) => {
    const ftEntries = fuelEntries.filter((e) => e.fuel_type === ft);
    const opening = Number(ftEntries.find((e) => e.entry_type === "opening_balance")?.quantity ?? 0);
    const closing = Number(ftEntries.find((e) => e.entry_type === "closing_balance")?.quantity ?? 0);
    const purchases = ftEntries.filter((e) => e.entry_type === "purchase").reduce((s, e) => s + Number(e.quantity), 0);
    const consumption = opening + purchases - closing;
    const hasOpening = ftEntries.some((e) => e.entry_type === "opening_balance");
    const hasClosing = ftEntries.some((e) => e.entry_type === "closing_balance");

    if (!hasOpening || !hasClosing) {
      liveChecks.push({ name: `Brennstoff (${ft})`, status: "warning", message: `${!hasOpening ? "Anfangsbestand" : "Endbestand"} fehlt` });
    } else if (consumption < 0) {
      liveChecks.push({ name: `Brennstoff (${ft})`, status: "failed", message: `Negativer Verbrauch (${consumption.toFixed(1)})` });
    } else {
      liveChecks.push({ name: `Brennstoff (${ft})`, status: "passed", message: `Verbrauch: ${consumption.toFixed(1)}` });
    }
  });

  if (fuelTypes.length === 0) {
    liveChecks.push({ name: "Brennstoffdaten", status: "warning", message: "Noch keine Brennstoffdaten erfasst" });
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
