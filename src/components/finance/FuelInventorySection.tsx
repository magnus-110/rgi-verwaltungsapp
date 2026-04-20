import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle, Check, Fuel } from "lucide-react";
import { toast } from "sonner";

const FUEL_TYPES = [
  { value: "oil", label: "Heizöl", unit: "l" },
  { value: "pellets", label: "Pellets", unit: "kg" },
  { value: "gas", label: "Gas", unit: "kWh" },
  { value: "district_heating", label: "Fernwärme", unit: "kWh" },
];

const ENTRY_TYPES = [
  { value: "opening_balance", label: "Anfangsbestand" },
  { value: "purchase", label: "Einkauf" },
  { value: "closing_balance", label: "Endbestand" },
];

interface FuelInventorySectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function FuelInventorySection({ buildingId, periodId, fiscalYear }: FuelInventorySectionProps) {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    fuel_type: "oil",
    entry_type: "purchase",
    entry_date: `${fiscalYear}-01-01`,
    quantity: "",
    unit: "l",
    total_price: "",
    co2_emissions_kg: "",
    co2_tax_amount: "",
    energy_content_kwh: "",
    notes: "",
  });

  const { data: entries = [] } = useQuery({
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

  // Plausibilitätsprüfung
  const fuelTypes = [...new Set(entries.map((e) => e.fuel_type))];
  const plausibilityChecks = fuelTypes.map((ft) => {
    const ftEntries = entries.filter((e) => e.fuel_type === ft);
    const opening = ftEntries.find((e) => e.entry_type === "opening_balance")?.quantity ?? 0;
    const closing = ftEntries.find((e) => e.entry_type === "closing_balance")?.quantity ?? 0;
    const purchases = ftEntries.filter((e) => e.entry_type === "purchase").reduce((s, e) => s + Number(e.quantity), 0);
    const consumption = Number(opening) + purchases - Number(closing);
    const label = FUEL_TYPES.find((f) => f.value === ft)?.label ?? ft;
    const unit = FUEL_TYPES.find((f) => f.value === ft)?.unit ?? "";
    const hasOpening = ftEntries.some((e) => e.entry_type === "opening_balance");
    const hasClosing = ftEntries.some((e) => e.entry_type === "closing_balance");

    return {
      fuelType: ft,
      label,
      unit,
      opening: Number(opening),
      purchases,
      closing: Number(closing),
      consumption,
      isPlausible: consumption >= 0 && hasOpening && hasClosing,
      hasOpening,
      hasClosing,
    };
  });

  const addEntry = async () => {
    const qty = parseFloat(newEntry.quantity);
    const price = parseFloat(newEntry.total_price);
    if (isNaN(qty) || qty <= 0) { toast.error("Bitte gültige Menge angeben"); return; }

    const fuelUnit = FUEL_TYPES.find((f) => f.value === newEntry.fuel_type)?.unit ?? "l";
    const isPurchase = newEntry.entry_type === "purchase";
    const showCo2 = isPurchase && ["oil", "gas", "district_heating"].includes(newEntry.fuel_type);

    const { error } = await supabase.from("fuel_inventory").insert({
      building_id: buildingId,
      billing_period_id: periodId,
      fuel_type: newEntry.fuel_type,
      entry_type: newEntry.entry_type,
      entry_date: newEntry.entry_date,
      quantity: qty,
      unit: fuelUnit,
      total_price: isNaN(price) ? 0 : price,
      co2_emissions_kg: showCo2 && newEntry.co2_emissions_kg ? parseFloat(newEntry.co2_emissions_kg) : null,
      co2_tax_amount: showCo2 && newEntry.co2_tax_amount ? parseFloat(newEntry.co2_tax_amount) : null,
      energy_content_kwh: isPurchase && newEntry.energy_content_kwh ? parseFloat(newEntry.energy_content_kwh) : null,
      notes: newEntry.notes || null,
    });

    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Eintrag hinzugefügt");
    setIsAddOpen(false);
    setNewEntry({ fuel_type: "oil", entry_type: "purchase", entry_date: `${fiscalYear}-01-01`, quantity: "", unit: "l", total_price: "", co2_emissions_kg: "", co2_tax_amount: "", energy_content_kwh: "", notes: "" });
    queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("fuel_inventory").delete().eq("id", id);
    if (error) toast.error("Fehler beim Löschen");
    else {
      toast.success("Eintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
    }
  };

  const formatNum = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
  const formatCurrency = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Brennstoffbestand
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Anfangsbestand, Einkäufe und Endbestand für {fiscalYear}</p>
        </div>
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Eintrag
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plausibilitäts-Badges */}
        {plausibilityChecks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plausibilityChecks.map((check) => (
              <Badge key={check.fuelType} variant="outline" className={check.isPlausible ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}>
                {check.isPlausible ? <Check className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                {check.label}: {formatNum(check.opening)} + {formatNum(check.purchases)} - {formatNum(check.closing)} = {formatNum(check.consumption)} {check.unit}
              </Badge>
            ))}
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Brennstoffdaten erfasst</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead>
                <TableHead>Brennstoff</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead className="text-right">Gesamtpreis</TableHead>
                <TableHead className="text-right">Stückpreis</TableHead>
                <TableHead>Notiz</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ENTRY_TYPES.find((t) => t.value === entry.entry_type)?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{FUEL_TYPES.find((f) => f.value === entry.fuel_type)?.label}</TableCell>
                  <TableCell className="text-sm">{new Date(entry.entry_date).toLocaleDateString("de-DE")}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNum(Number(entry.quantity))} {entry.unit}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(entry.total_price))}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(entry.unit_price))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{entry.notes || "–"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Brennstoff-Eintrag hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Brennstoffart</Label>
                <Select value={newEntry.fuel_type} onValueChange={(v) => setNewEntry((p) => ({ ...p, fuel_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Eintragstyp</Label>
                <Select value={newEntry.entry_type} onValueChange={(v) => setNewEntry((p) => ({ ...p, entry_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Datum</Label>
              <Input type="date" value={newEntry.entry_date} onChange={(e) => setNewEntry((p) => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Menge ({FUEL_TYPES.find((f) => f.value === newEntry.fuel_type)?.unit})</Label>
                <Input type="number" step="0.01" value={newEntry.quantity} onChange={(e) => setNewEntry((p) => ({ ...p, quantity: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Gesamtpreis (€)</Label>
                <Input type="number" step="0.01" value={newEntry.total_price} onChange={(e) => setNewEntry((p) => ({ ...p, total_price: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label>Notiz (optional)</Label>
              <Input value={newEntry.notes} onChange={(e) => setNewEntry((p) => ({ ...p, notes: e.target.value }))} placeholder="z.B. Lieferant, Lieferschein-Nr." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Abbrechen</Button>
            <Button onClick={addEntry}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
