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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [activeUnitId, setActiveUnitId] = useState<string>("__all__");
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
    heating_unit_id: "",
  });

  const { data: heatingUnits = [] } = useQuery({
    queryKey: ["heating-units", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heating_units")
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: allEntries = [] } = useQuery({
    queryKey: ["fuel-inventory", buildingId, periodId, fiscalYear],
    queryFn: async () => {
      // Heizjahr-Logik: Einträge gehören zur Periode, wenn entweder die billing_period_id passt
      // ODER der Verbrauchszeitraum (consumption_year) im Wirtschaftsjahr liegt (Gas/Fernwärme-Jahresabrechnungen).
      const { data, error } = await supabase
        .from("fuel_inventory")
        .select("*")
        .eq("building_id", buildingId)
        .or(`billing_period_id.eq.${periodId},consumption_year.eq.${fiscalYear}`)
        .order("entry_date");
      if (error) throw error;
      return data;
    },
  });

  // Buchungen auf Brennstoffkonten (1410), die noch keinen Inventar-Eintrag haben
  const { data: fuelBookings = [] } = useQuery({
    queryKey: ["fuel-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, building_id")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .like("account_number", "1410");
      const ids = (accounts || []).map((a: any) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, amount, description, invoice_id, account_id, counter_account_id")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .or(`account_id.in.(${ids.join(",")}),counter_account_id.in.(${ids.join(",")})`)
        .order("booking_date");
      if (error) throw error;
      return data;
    },
  });

  // Buchungen ohne korrespondierenden Inventar-Eintrag (Match: Datum + Betrag oder invoice_id)
  const unmatchedFuelBookings = fuelBookings.filter((b: any) => {
    return !allEntries.some((e: any) => {
      if (e.invoice_id && b.invoice_id && e.invoice_id === b.invoice_id) return true;
      const sameDate = e.entry_date === b.booking_date;
      const sameAmount = Math.abs(Number(e.total_price) - Math.abs(Number(b.amount))) < 0.01;
      return sameDate && sameAmount && e.entry_type === "purchase";
    });
  });

  const hasMultipleUnits = heatingUnits.length >= 2;
  const entries = hasMultipleUnits && activeUnitId !== "__all__"
    ? allEntries.filter((e: any) => e.heating_unit_id === activeUnitId || (activeUnitId === "__none__" && !e.heating_unit_id))
    : allEntries;

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

  const openAddDialog = () => {
    // Heizkreis vorausgewählt
    let preselectedUnit = "";
    let preselectedFuelType = "oil";
    if (hasMultipleUnits && activeUnitId !== "__all__" && activeUnitId !== "__none__") {
      preselectedUnit = activeUnitId;
      const u = heatingUnits.find((h: any) => h.id === activeUnitId);
      if (u) preselectedFuelType = u.fuel_type;
    } else if (heatingUnits.length === 1) {
      preselectedUnit = heatingUnits[0].id;
      preselectedFuelType = heatingUnits[0].fuel_type;
    }
    setNewEntry({
      fuel_type: preselectedFuelType,
      entry_type: "purchase",
      entry_date: `${fiscalYear}-01-01`,
      quantity: "",
      unit: FUEL_TYPES.find(f => f.value === preselectedFuelType)?.unit ?? "l",
      total_price: "",
      co2_emissions_kg: "",
      co2_tax_amount: "",
      energy_content_kwh: "",
      notes: "",
      heating_unit_id: preselectedUnit,
    });
    setIsAddOpen(true);
  };

  const addEntry = async () => {
    const qty = parseFloat(newEntry.quantity);
    const price = parseFloat(newEntry.total_price);
    if (isNaN(qty) || qty <= 0) { toast.error("Bitte gültige Menge angeben"); return; }
    if (hasMultipleUnits && !newEntry.heating_unit_id) {
      toast.error("Bitte Heizkreis auswählen"); return;
    }

    const fuelUnit = FUEL_TYPES.find((f) => f.value === newEntry.fuel_type)?.unit ?? "l";
    const isPurchase = newEntry.entry_type === "purchase";
    const showCo2 = isPurchase && ["oil", "gas", "district_heating"].includes(newEntry.fuel_type);

    const { error } = await supabase.from("fuel_inventory").insert({
      building_id: buildingId,
      billing_period_id: periodId,
      heating_unit_id: newEntry.heating_unit_id || null,
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

  const unitName = (id: string | null) => {
    if (!id) return "—";
    return heatingUnits.find((u: any) => u.id === id)?.name ?? "?";
  };

  const updateEntry = async (id: string, patch: Record<string, any>) => {
    const { error } = await supabase.from("fuel_inventory").update(patch).eq("id", id);
    if (error) { toast.error("Speichern fehlgeschlagen: " + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
  };

  const createFromBooking = async (b: any) => {
    // OCR-Daten aus verknüpfter Rechnung laden
    let ocr: any = null;
    if (b.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("ocr_extracted_data")
        .eq("id", b.invoice_id)
        .maybeSingle();
      ocr = inv?.ocr_extracted_data ?? null;
    }

    let preselectedUnit: string | null = null;
    let preselectedFuelType: string = ocr?.fuel_type || "oil";
    if (heatingUnits.length === 1) {
      preselectedUnit = heatingUnits[0].id;
      if (!ocr?.fuel_type) preselectedFuelType = heatingUnits[0].fuel_type;
    } else if (hasMultipleUnits && activeUnitId !== "__all__" && activeUnitId !== "__none__") {
      preselectedUnit = activeUnitId;
      const u = heatingUnits.find((h: any) => h.id === activeUnitId);
      if (u && !ocr?.fuel_type) preselectedFuelType = u.fuel_type;
    }
    if (hasMultipleUnits && !preselectedUnit) {
      toast.error("Bitte zuerst Heizkreis-Tab wählen");
      return;
    }
    const fuelUnit = ocr?.fuel_unit || FUEL_TYPES.find((f) => f.value === preselectedFuelType)?.unit || "l";
    const showCo2 = ["oil", "gas", "district_heating"].includes(preselectedFuelType);

    const { error } = await supabase.from("fuel_inventory").insert({
      building_id: buildingId,
      billing_period_id: periodId,
      heating_unit_id: preselectedUnit,
      fuel_type: preselectedFuelType,
      entry_type: "purchase",
      entry_date: b.booking_date,
      quantity: ocr?.fuel_quantity ? Number(ocr.fuel_quantity) : 0,
      unit: fuelUnit,
      total_price: Math.abs(Number(b.amount)),
      co2_emissions_kg: showCo2 && ocr?.co2_emissions_kg != null ? Number(ocr.co2_emissions_kg) : null,
      co2_tax_amount: showCo2 && ocr?.co2_tax_amount_eur != null ? Number(ocr.co2_tax_amount_eur) : null,
      energy_content_kwh: ocr?.energy_content_kwh != null ? Number(ocr.energy_content_kwh) : null,
      invoice_id: b.invoice_id || null,
      notes: `Aus Buchung: ${b.description || ""}`.slice(0, 250),
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    const filled = ocr?.fuel_quantity ? "Menge & CO₂-Daten aus Rechnung übernommen" : "Bitte Menge & ggf. CO₂-Daten ergänzen";
    toast.success(`Eintrag aus Buchung erstellt – ${filled}`);
    queryClient.invalidateQueries({ queryKey: ["fuel-inventory"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Brennstoffbestand
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Anfangsbestand, Einkäufe und Endbestand für {fiscalYear}
            {hasMultipleUnits && ` · ${heatingUnits.length} Heizkreise`}
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-1" /> Eintrag
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Heizkreis-Filter */}
        {hasMultipleUnits && (
          <Tabs value={activeUnitId} onValueChange={setActiveUnitId}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="__all__">Alle</TabsTrigger>
              {heatingUnits.map((u: any) => (
                <TabsTrigger key={u.id} value={u.id}>{u.name}</TabsTrigger>
              ))}
              {allEntries.some((e: any) => !e.heating_unit_id) && (
                <TabsTrigger value="__none__">Ohne Zuordnung</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}

        {/* Hinweis: Buchungen auf 1410 ohne Inventar-Eintrag */}
        {unmatchedFuelBookings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              {unmatchedFuelBookings.length} Brennstoff-Buchung{unmatchedFuelBookings.length > 1 ? "en" : ""} ohne Bestandseintrag
            </div>
            <p className="text-xs text-amber-800">
              Diese Buchungen auf Konto 1410 (Brennstoffkauf) sind noch nicht im Brennstoffbestand erfasst. Bitte ergänze nach dem Anlegen die Menge und ggf. die CO₂-Daten aus der Rechnung.
            </p>
            <div className="space-y-1">
              {unmatchedFuelBookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-xs bg-white/60 rounded px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono">{new Date(b.booking_date).toLocaleDateString("de-DE")}</span>
                    <span className="ml-2 font-mono font-semibold">{formatCurrency(Math.abs(Number(b.amount)))}</span>
                    <span className="ml-2 text-muted-foreground truncate">{b.description}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => createFromBooking(b)}>
                    <Plus className="h-3 w-3 mr-1" />Als Einkauf erfassen
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                {hasMultipleUnits && <TableHead>Heizkreis</TableHead>}
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead className="text-right">Gesamtpreis</TableHead>
                <TableHead className="text-right">CO₂ (kg)</TableHead>
                <TableHead className="text-right">CO₂-Steuer (€)</TableHead>
                <TableHead className="text-right">Brennwert (kWh)</TableHead>
                <TableHead>Notiz</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry: any) => {
                const parseNum = (s: string) => {
                  const v = s.trim().replace(/\./g, "").replace(",", ".");
                  if (v === "") return null;
                  const n = parseFloat(v);
                  return isNaN(n) ? null : n;
                };
                const numInput = (field: string, value: any, opts?: { allowNull?: boolean }) => (
                  <Input
                    type="text"
                    inputMode="decimal"
                    defaultValue={value != null ? String(value).replace(".", ",") : ""}
                    onBlur={(e) => {
                      const parsed = parseNum(e.target.value);
                      const current = value == null ? null : Number(value);
                      const next = parsed;
                      if (next === current) return;
                      if (next == null && !opts?.allowNull) return;
                      updateEntry(entry.id, { [field]: next });
                    }}
                    className="h-7 text-right font-mono text-xs px-1 w-24 ml-auto"
                  />
                );
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Select value={entry.entry_type} onValueChange={(v) => updateEntry(entry.id, { entry_type: v })}>
                        <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ENTRY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Select
                        value={entry.fuel_type}
                        onValueChange={(v) => updateEntry(entry.id, { fuel_type: v, unit: FUEL_TYPES.find(f => f.value === v)?.unit ?? entry.unit })}
                      >
                        <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FUEL_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {hasMultipleUnits && (
                      <TableCell className="text-xs text-muted-foreground">
                        <Select value={entry.heating_unit_id ?? "__none__"} onValueChange={(v) => updateEntry(entry.id, { heating_unit_id: v === "__none__" ? null : v })}>
                          <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— ohne —</SelectItem>
                            {heatingUnits.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        type="date"
                        defaultValue={entry.entry_date}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== entry.entry_date) {
                            updateEntry(entry.id, { entry_date: e.target.value });
                          }
                        }}
                        className="h-7 text-xs w-[140px]"
                      />
                    </TableCell>
                    <TableCell className="text-right">{numInput("quantity", entry.quantity)}</TableCell>
                    <TableCell className="text-right">{numInput("total_price", entry.total_price)}</TableCell>
                    <TableCell className="text-right">{numInput("co2_emissions_kg", entry.co2_emissions_kg, { allowNull: true })}</TableCell>
                    <TableCell className="text-right">{numInput("co2_tax_amount", entry.co2_tax_amount, { allowNull: true })}</TableCell>
                    <TableCell className="text-right">{numInput("energy_content_kwh", entry.energy_content_kwh, { allowNull: true })}</TableCell>
                    <TableCell>
                      <Input
                        defaultValue={entry.notes ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (entry.notes ?? "")) updateEntry(entry.id, { notes: v || null });
                        }}
                        className="h-7 text-xs w-[180px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
            {hasMultipleUnits && (
              <div>
                <Label>Heizkreis *</Label>
                <Select value={newEntry.heating_unit_id} onValueChange={(v) => {
                  const u = heatingUnits.find((h: any) => h.id === v);
                  setNewEntry((p) => ({
                    ...p,
                    heating_unit_id: v,
                    fuel_type: u?.fuel_type ?? p.fuel_type,
                    unit: FUEL_TYPES.find(f => f.value === (u?.fuel_type ?? p.fuel_type))?.unit ?? p.unit,
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Heizkreis auswählen" /></SelectTrigger>
                  <SelectContent>
                    {heatingUnits.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({FUEL_TYPES.find(f => f.value === u.fuel_type)?.label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            {newEntry.entry_type === "purchase" && (
              <>
                <div>
                  <Label>Brennwert / Energiegehalt (kWh) <span className="text-xs text-muted-foreground">– optional, aus Rechnung</span></Label>
                  <Input type="number" step="0.01" value={newEntry.energy_content_kwh} onChange={(e) => setNewEntry((p) => ({ ...p, energy_content_kwh: e.target.value }))} placeholder="z.B. 30000" />
                </div>
                {["oil", "gas", "district_heating"].includes(newEntry.fuel_type) && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-amber-900">CO₂-Daten (BEHG) – nur eintragen, was auf Rechnung steht</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">CO₂-Emissionen (kg)</Label>
                        <Input type="number" step="0.01" value={newEntry.co2_emissions_kg} onChange={(e) => setNewEntry((p) => ({ ...p, co2_emissions_kg: e.target.value }))} placeholder="aus Rechnung" />
                      </div>
                      <div>
                        <Label className="text-xs">CO₂-Steueranteil (€)</Label>
                        <Input type="number" step="0.01" value={newEntry.co2_tax_amount} onChange={(e) => setNewEntry((p) => ({ ...p, co2_tax_amount: e.target.value }))} placeholder="aus Rechnung" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
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
