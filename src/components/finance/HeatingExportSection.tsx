import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Flame } from "lucide-react";
import { toast } from "sonner";

interface HeatingExportSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

const FUEL_LABELS: Record<string, string> = {
  oil: "Heizöl", pellets: "Pellets", gas: "Gas", district_heating: "Fernwärme",
};

export function HeatingExportSection({ buildingId, periodId, fiscalYear }: HeatingExportSectionProps) {
  const { data: building } = useQuery({
    queryKey: ["building-detail", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("name, building_code, address").eq("id", buildingId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: period } = useQuery({
    queryKey: ["billing-period-detail", periodId],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_periods").select("*").eq("id", periodId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: heatingAccounts = [] } = useQuery({
    queryKey: ["heating-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("is_heating_relevant", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["heating-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, booking_category")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
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
        .eq("billing_period_id", periodId)
        .order("entry_date");
      if (error) throw error;
      return data;
    },
  });

  const getAccountTotal = (accountId: string) =>
    bookings
      .filter((b) => b.account_id === accountId && b.booking_category !== "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);

  const totalHeating = heatingAccounts.reduce((s, a) => s + getAccountTotal(a.id), 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const formatNum = (n: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push("Heizkosten-Export für Ablesefirma");
    lines.push(`Liegenschaft;${building?.name || ""};${building?.building_code || ""}`);
    lines.push(`Adresse;${building?.address || ""}`);
    lines.push(`Abrechnungszeitraum;${period?.period_from || ""};${period?.period_to || ""}`);
    lines.push(`Ablesefirma;${period?.heating_provider || ""}`);
    lines.push("");

    // Konten
    lines.push("HEIZKOSTEN-RELEVANTE KONTEN");
    lines.push("Kontonummer;Kontoname;Jahressumme EUR");
    heatingAccounts.forEach((acc) => {
      const total = getAccountTotal(acc.id);
      lines.push(`${acc.account_number};${acc.account_name};${total.toFixed(2).replace(".", ",")}`);
    });
    lines.push(`;;${totalHeating.toFixed(2).replace(".", ",")}`);
    lines.push("");

    // Brennstoff
    const fuelTypes = [...new Set(fuelEntries.map((e) => e.fuel_type))];
    if (fuelTypes.length > 0) {
      lines.push("BRENNSTOFFDATEN");
      fuelTypes.forEach((ft) => {
        const ftEntries = fuelEntries.filter((e) => e.fuel_type === ft);
        const label = FUEL_LABELS[ft] || ft;
        const opening = ftEntries.find((e) => e.entry_type === "opening_balance");
        const closing = ftEntries.find((e) => e.entry_type === "closing_balance");
        const purchases = ftEntries.filter((e) => e.entry_type === "purchase");

        lines.push(`Brennstoffart;${label}`);
        if (opening) lines.push(`Anfangsbestand;${Number(opening.quantity).toFixed(2).replace(".", ",")};${opening.unit}`);
        lines.push(`Einkauf-Nr;Menge;Einheit;Gesamtpreis EUR;Datum;Brennwert kWh;CO2-Emissionen kg;CO2-Steuer EUR`);
        purchases.forEach((p: any, i) => {
          const co2 = p.co2_emissions_kg != null ? Number(p.co2_emissions_kg).toFixed(2).replace(".", ",") : "";
          const co2tax = p.co2_tax_amount != null ? Number(p.co2_tax_amount).toFixed(2).replace(".", ",") : "";
          const kwh = p.energy_content_kwh != null ? Number(p.energy_content_kwh).toFixed(2).replace(".", ",") : "";
          lines.push(`Einkauf ${i + 1};${Number(p.quantity).toFixed(2).replace(".", ",")};${p.unit};${Number(p.total_price).toFixed(2).replace(".", ",")};${p.entry_date};${kwh};${co2};${co2tax}`);
        });
        if (closing) lines.push(`Endbestand;${Number(closing.quantity).toFixed(2).replace(".", ",")};${closing.unit}`);

        // Aggregat pro Energieträger
        const totalCo2 = purchases.reduce((s, p: any) => s + Number(p.co2_emissions_kg ?? 0), 0);
        const totalCo2Tax = purchases.reduce((s, p: any) => s + Number(p.co2_tax_amount ?? 0), 0);
        const totalKwh = purchases.reduce((s, p: any) => s + Number(p.energy_content_kwh ?? 0), 0);
        if (totalCo2 > 0 || totalCo2Tax > 0 || totalKwh > 0) {
          lines.push(`Jahressumme;;;;;${totalKwh.toFixed(2).replace(".", ",")};${totalCo2.toFixed(2).replace(".", ",")};${totalCo2Tax.toFixed(2).replace(".", ",")}`);
        }
        lines.push("");
      });
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Heizkosten_${building?.building_code || "export"}_${fiscalYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV-Export heruntergeladen");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Export für Ablesefirma
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Einzelkonten + Brennstoffdaten als CSV für {period?.heating_provider || "die Ablesefirma"}
          </p>
        </div>
        <Button size="sm" onClick={exportCSV} disabled={heatingAccounts.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV Export
        </Button>
      </CardHeader>
      <CardContent>
        {heatingAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine heizkosten-relevanten Konten markiert.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Vorschau: {heatingAccounts.length} Konten, Gesamtsumme {formatCurrency(totalHeating)}
              {fuelEntries.length > 0 && `, ${fuelEntries.length} Brennstoff-Einträge`}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Konto</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heatingAccounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                    <TableCell className="text-sm">{acc.account_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(getAccountTotal(acc.id))}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium border-t-2">
                  <TableCell></TableCell>
                  <TableCell>Gesamt</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalHeating)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {fuelEntries.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Flame className="h-4 w-4" /> Brennstoffdaten im Export
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(fuelEntries.map((e) => e.fuel_type))].map((ft) => {
                    const entries = fuelEntries.filter((e) => e.fuel_type === ft);
                    const opening = entries.find((e) => e.entry_type === "opening_balance");
                    const closing = entries.find((e) => e.entry_type === "closing_balance");
                    const purchases = entries.filter((e) => e.entry_type === "purchase");
                    return (
                      <Badge key={ft} variant="outline" className="text-xs">
                        {FUEL_LABELS[ft] || ft}: {opening ? formatNum(Number(opening.quantity)) : "?"} →{" "}
                        {purchases.length} Käufe → {closing ? formatNum(Number(closing.quantity)) : "?"}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
