import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, AlertTriangle, Check, RefreshCw, Trash2, Upload, Users, Split, Plus, X } from "lucide-react";
import { sumForAccount } from "./lib/bookingAggregation";
import { computeFifoConsumption, findFuelAccountPairs, type FuelInventoryEntry } from "./lib/fuelFifo";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface HeatingRebookingSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function HeatingRebookingSection({ buildingId, periodId, fiscalYear }: HeatingRebookingSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [targetAccountId, setTargetAccountId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [distributionValues, setDistributionValues] = useState<Record<string, number>>({});
  const csvInputRef = useRef<HTMLInputElement>(null);
  // Strom-Splitt: 1400 → 1050 (oder andere Konten) für nicht-heizungsrelevante Anteile
  const [splitRows, setSplitRows] = useState<Array<{ targetAccountId: string; amount: string; description: string }>>([
    { targetAccountId: "", amount: "", description: "Allgemeinstrom-Anteil aus 1472 (lt. Brunata)" },
  ]);
  const [isSplitting, setIsSplitting] = useState(false);

  // All accounts for this building (target selection)
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["accounts-for-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Heating-relevant accounts
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

  // Current bookings for totals — include counter_account_id for bank-centric aggregation
  const { data: bookings = [] } = useQuery({
    queryKey: ["heating-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_category")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Existing rebookings
  const { data: existingRebookings = [] } = useQuery({
    queryKey: ["heating-rebookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, chart_of_accounts!bookings_account_id_fkey(account_number, account_name)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("booking_category", "heating_repost")
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Existing splits (1400 → 1050 etc.)
  const { data: existingSplits = [] } = useQuery({
    queryKey: ["heating-splits", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, target:chart_of_accounts!bookings_account_id_fkey(account_number, account_name), source:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("booking_category", "heating_split")
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });
  const { data: ownerAssignments = [] } = useQuery({
    queryKey: ["owner-assignments-heating", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`*, contacts(first_name, last_name, company_name)`)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "eigentuemer");
      if (error) throw error;
      return data;
    },
  });

  // Existing heating distribution values
  const { data: existingDistValues = [] } = useQuery({
    queryKey: ["heating-dist-values", buildingId, periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heating_distribution_values")
        .select("*")
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId);
      if (error) throw error;
      return data;
    },
  });

  // Bank-zentrisch: Heizkonten können auf account_id ODER counter_account_id liegen.
  // sumForAccount summiert beide Seiten korrekt; Reposts UND Splitt-Buchungen ausschließen,
  // damit beim erneuten Generieren keine Doppelzählung entsteht.
  const getAccountTotal = (accountId: string) => {
    const filtered = bookings.filter(
      (b) => b.booking_category !== "heating_repost" && b.booking_category !== "heating_split"
    );
    return Math.abs(sumForAccount(accountId, filtered as any));
  };

  // Aktueller Saldo des Ziel-Sammelkontos (z. B. 1400) NACH Repost, VOR/NACH Splitt.
  // Hier wollen wir alle Bewegungen sehen — auch Reposts (gehen rein) und Splitts (gehen raus).
  const getTargetAccountBalance = (accountId: string) => {
    if (!accountId) return 0;
    return Math.abs(sumForAccount(accountId, bookings as any));
  };

  const totalHeating = heatingAccounts.reduce((s, a) => s + getAccountTotal(a.id), 0);
  const totalRebooked = existingRebookings.reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
  const isBalanced = Math.abs(totalHeating - totalRebooked) < 0.01 && existingRebookings.length > 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const getOwnerName = (assignment: any) => {
    const c = assignment.contacts;
    return c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unbekannt";
  };

  // Distribution values logic
  const totalDistributed = Object.values(distributionValues).reduce((s, v) => s + (v || 0), 0);
  const distributionDiff = totalRebooked - totalDistributed;
  const isDistributionBalanced = Math.abs(distributionDiff) < 0.01 && totalDistributed > 0;

  const initDistributionValues = () => {
    const values: Record<string, number> = {};
    ownerAssignments.forEach((a: any) => {
      const existing = existingDistValues.find((d: any) => d.assignment_id === a.id);
      values[a.id] = existing ? Number(existing.amount) : 0;
    });
    setDistributionValues(values);
    setShowDistribution(true);
  };

  const saveDistributionValues = async () => {
    try {
      // Upsert all values
      const rows = Object.entries(distributionValues).map(([assignmentId, amount]) => ({
        building_id: buildingId,
        billing_period_id: periodId,
        assignment_id: assignmentId,
        amount,
      }));

      // Delete existing first, then insert
      await supabase
        .from("heating_distribution_values")
        .delete()
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId);

      const { error } = await supabase.from("heating_distribution_values").insert(rows);
      if (error) throw error;

      toast.success("Heizkosten-Verteilung gespeichert");
      queryClient.invalidateQueries({ queryKey: ["heating-dist-values"] });
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      const newValues = { ...distributionValues };
      let matched = 0;

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/[;,\t]/).map(p => p.trim());
        if (parts.length < 2) continue;

        // Try to match by unit_number (first column) or name
        const identifier = parts[0];
        const amount = parseFloat(parts[parts.length - 1].replace(",", "."));
        if (isNaN(amount)) continue;

        const match = ownerAssignments.find((a: any) =>
          a.unit_number === identifier ||
          getOwnerName(a).toLowerCase().includes(identifier.toLowerCase())
        );

        if (match) {
          newValues[match.id] = amount;
          matched++;
        }
      }

      setDistributionValues(newValues);
      toast.success(`${matched} von ${lines.length - 1} Zeilen zugeordnet`);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const generateRebookings = async () => {
    if (!targetAccountId) {
      toast.error("Bitte Zielkonto für Umbuchung wählen");
      return;
    }
    setIsGenerating(true);
    try {
      if (existingRebookings.length > 0) {
        const { error: delError } = await supabase
          .from("bookings")
          .delete()
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear)
          .eq("booking_category", "heating_repost");
        if (delError) throw delError;
      }

      const rebookings = heatingAccounts
        .map((acc) => {
          // Zielkonto darf sich nicht selbst umbuchen (sonst doppelte Zählung in der Abrechnung)
          if (acc.id === targetAccountId) return null;
          const total = getAccountTotal(acc.id);
          if (total <= 0) return null;
          return {
            building_id: buildingId,
            account_id: acc.id,
            counter_account_id: targetAccountId,
            booking_date: `${fiscalYear}-12-31`,
            amount: total,
            description: `HK-Umbuchung: ${acc.account_name} → Heizkostenkonto`,
            fiscal_year: fiscalYear,
            booking_type: "expense",
            booking_category: "heating_repost",
            source: "manual",
            status: "pending",
            created_by: user?.id,
          };
        })
        .filter(Boolean);

      if (rebookings.length === 0) {
        toast.error("Keine Beträge zum Umbuchen vorhanden");
        return;
      }

      const { error } = await supabase.from("bookings").insert(rebookings);
      if (error) throw error;

      toast.success(`${rebookings.length} Umbuchungen erstellt`);
      queryClient.invalidateQueries({ queryKey: ["heating-rebookings"] });
      queryClient.invalidateQueries({ queryKey: ["heating-bookings"] });
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteRebookings = async () => {
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .eq("booking_category", "heating_repost");
    if (error) toast.error("Fehler beim Löschen");
    else {
      toast.success("Umbuchungen gelöscht");
      queryClient.invalidateQueries({ queryKey: ["heating-rebookings"] });
    }
  };

  // ── Strom-Splitt: Buchungen 1400 → 1050 (oder andere Konten) erstellen ──
  const totalSplit = existingSplits.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);
  const targetBalanceBeforeSplit = targetAccountId ? getTargetAccountBalance(targetAccountId) + totalSplit : 0;
  const targetBalanceAfterSplit = targetAccountId ? getTargetAccountBalance(targetAccountId) : 0;
  const splitSum = splitRows.reduce((s, r) => s + (parseFloat(r.amount.replace(",", ".")) || 0), 0);

  const addSplitRow = () =>
    setSplitRows((prev) => [...prev, { targetAccountId: "", amount: "", description: "" }]);

  const removeSplitRow = (idx: number) =>
    setSplitRows((prev) => prev.filter((_, i) => i !== idx));

  const updateSplitRow = (idx: number, field: "targetAccountId" | "amount" | "description", value: string) =>
    setSplitRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const generateSplits = async () => {
    if (!targetAccountId) {
      toast.error("Erst Heizkostenkonto (oben) wählen — von dort wird abgesplittet");
      return;
    }
    const validRows = splitRows.filter((r) => {
      const amt = parseFloat(r.amount.replace(",", "."));
      return r.targetAccountId && amt > 0;
    });
    if (validRows.length === 0) {
      toast.error("Mindestens ein Zielkonto und Betrag erforderlich");
      return;
    }
    setIsSplitting(true);
    try {
      // Bestehende Splits dieses Jahres löschen (idempotent)
      if (existingSplits.length > 0) {
        const { error: delError } = await supabase
          .from("bookings")
          .delete()
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear)
          .eq("booking_category", "heating_split");
        if (delError) throw delError;
      }

      const splits = validRows.map((r) => {
        const amt = parseFloat(r.amount.replace(",", "."));
        return {
          building_id: buildingId,
          // ZIEL = Konto, das den Anteil bekommt (z. B. 1050)
          account_id: r.targetAccountId,
          // QUELLE = Heizkostenkonto (z. B. 1400) — wird entlastet
          counter_account_id: targetAccountId,
          booking_date: `${fiscalYear}-12-31`,
          amount: amt,
          description: r.description || "Splitt aus Heizkostenkonto",
          fiscal_year: fiscalYear,
          booking_type: "expense",
          booking_category: "heating_split",
          source: "manual",
          status: "pending",
          created_by: user?.id,
        };
      });

      const { error } = await supabase.from("bookings").insert(splits);
      if (error) throw error;

      toast.success(`${splits.length} Splitt-Buchung(en) erstellt`);
      queryClient.invalidateQueries({ queryKey: ["heating-splits"] });
      queryClient.invalidateQueries({ queryKey: ["heating-bookings"] });
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    } finally {
      setIsSplitting(false);
    }
  };

  const deleteSplits = async () => {
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .eq("booking_category", "heating_split");
    if (error) toast.error("Fehler beim Löschen");
    else {
      toast.success("Splitt-Buchungen gelöscht");
      queryClient.invalidateQueries({ queryKey: ["heating-splits"] });
      queryClient.invalidateQueries({ queryKey: ["heating-bookings"] });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Heizkosten-Umbuchungen
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Einzelne HK-Konten auf ein zentrales Heizkostenkonto umbuchen
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workflow-Hinweis */}
        {!isBalanced && totalHeating > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Heizkostenabrechnung der Ablesefirma fehlt noch
                </p>
                <p className="text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
                  Die Heiz-Vorauszahlungen ({formatCurrency(totalHeating)}) werden in der Jahresabrechnung
                  <strong> nur informativ</strong> angezeigt und <strong>nicht umgelegt</strong>, bis du sie
                  hier auf das Heizkostenkonto (z.&nbsp;B. 1400) umbuchst. Erst nach Vorliegen der
                  Heizkostenabrechnung von Brunata/ista/Techem den Repost erstellen — dann erfolgt die
                  Verteilung über die unten eingetragenen Verteilungswerte.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <Badge className="bg-green-100 text-green-800">
              <Check className="h-3 w-3 mr-1" /> Ausgeglichen — {formatCurrency(totalRebooked)}
            </Badge>
          ) : existingRebookings.length > 0 ? (
            <Badge className="bg-amber-100 text-amber-800">
              <AlertTriangle className="h-3 w-3 mr-1" /> Differenz: {formatCurrency(totalHeating - totalRebooked)}
            </Badge>
          ) : (
            <Badge variant="outline">Noch keine Umbuchungen</Badge>
          )}
        </div>

        {/* Zielkonto-Auswahl */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-sm">Zielkonto (Heizkostenkonto)</Label>
            <Select value={targetAccountId} onValueChange={setTargetAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Zielkonto wählen..." />
              </SelectTrigger>
              <SelectContent>
                {allAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_number} — {a.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generateRebookings} disabled={isGenerating || !targetAccountId}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isGenerating ? "animate-spin" : ""}`} />
            {existingRebookings.length > 0 ? "Neu generieren" : "Umbuchungen erstellen"}
          </Button>
          {existingRebookings.length > 0 && (
            <Button variant="outline" size="icon" onClick={deleteRebookings}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>

        {/* Vorschau / bestehende Umbuchungen */}
        {existingRebookings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Von Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {existingRebookings.map((rb: any) => (
                <TableRow key={rb.id}>
                  <TableCell className="font-mono text-xs">
                    {rb.chart_of_accounts?.account_number || "–"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rb.chart_of_accounts?.account_name || rb.description}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(Math.abs(Number(rb.amount)))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rb.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                      {rb.status === "confirmed" ? "Bestätigt" : "Offen"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium border-t-2">
                <TableCell></TableCell>
                <TableCell>Gesamt umgebucht</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalRebooked)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4">
            Wähle ein Zielkonto und klicke "Umbuchungen erstellen", um die HK-Einzelkonten ({formatCurrency(totalHeating)}) umzubuchen.
          </div>
        )}

        {/* ─── Strom-/Splitt-Buchungen vom Heizkostenkonto ─────────────────── */}
        {existingRebookings.length > 0 && targetAccountId && (
          <Card className="border-dashed">
            <CardHeader className="py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Split className="h-4 w-4" /> Splitt vom Heizkostenkonto (z. B. Allgemeinstrom-Anteil)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Falls Brunata einen Teil des Stromverbrauchs als Allgemeinstrom (nicht heizungsrelevant)
                    ausweist, hier vom Heizkostenkonto auf z. B. <strong>1050 Allgemeinstrom</strong> umbuchen.
                    Konto bleibt am Ende = Brunata-Gesamtsumme.
                  </p>
                </div>
                <div className="text-right text-xs space-y-0.5 font-mono">
                  <div className="text-muted-foreground">Vor Splitt: {formatCurrency(targetBalanceBeforeSplit)}</div>
                  <div className="font-semibold">Nach Splitt: {formatCurrency(targetBalanceAfterSplit)}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {splitRows.map((row, idx) => (
                <div key={idx} className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    {idx === 0 && <Label className="text-xs">Zielkonto</Label>}
                    <Select
                      value={row.targetAccountId}
                      onValueChange={(v) => updateSplitRow(idx, "targetAccountId", v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Konto wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allAccounts
                          .filter((a) => a.id !== targetAccountId)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.account_number} — {a.account_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    {idx === 0 && <Label className="text-xs">Beschreibung</Label>}
                    <Input
                      className="h-9"
                      value={row.description}
                      onChange={(e) => updateSplitRow(idx, "description", e.target.value)}
                      placeholder="z. B. Allgemeinstrom-Anteil lt. Brunata"
                    />
                  </div>
                  <div className="w-[140px]">
                    {idx === 0 && <Label className="text-xs">Betrag (€)</Label>}
                    <Input
                      className="h-9 text-right font-mono"
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => updateSplitRow(idx, "amount", e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeSplitRow(idx)}
                    disabled={splitRows.length === 1}
                    className="h-9 w-9"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={addSplitRow}>
                  <Plus className="h-3 w-3 mr-1" /> Weitere Zeile
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    Σ Splitt: {formatCurrency(splitSum)}
                  </span>
                  {existingSplits.length > 0 && (
                    <Button size="sm" variant="outline" onClick={deleteSplits}>
                      <Trash2 className="h-3 w-3 mr-1 text-destructive" /> Splitts löschen
                    </Button>
                  )}
                  <Button size="sm" onClick={generateSplits} disabled={isSplitting || splitSum <= 0}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${isSplitting ? "animate-spin" : ""}`} />
                    {existingSplits.length > 0 ? "Neu generieren" : "Splitt-Buchung(en) erstellen"}
                  </Button>
                </div>
              </div>

              {existingSplits.length > 0 && (
                <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                  <div className="font-medium text-foreground">Bestehende Splitt-Buchungen ({fiscalYear}):</div>
                  {existingSplits.map((s: any) => (
                    <div key={s.id} className="flex justify-between font-mono">
                      <span>
                        {s.source?.account_number} → {s.target?.account_number} {s.target?.account_name}
                      </span>
                      <span>{formatCurrency(Math.abs(Number(s.amount)))}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
