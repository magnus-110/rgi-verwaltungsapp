import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, AlertTriangle, Check, RefreshCw, Trash2 } from "lucide-react";
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

  // Current bookings for totals
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

  const getAccountTotal = (accountId: string) =>
    bookings
      .filter((b) => b.account_id === accountId && b.booking_category !== "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);

  const totalHeating = heatingAccounts.reduce((s, a) => s + getAccountTotal(a.id), 0);
  const totalRebooked = existingRebookings.reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
  const isBalanced = Math.abs(totalHeating - totalRebooked) < 0.01 && existingRebookings.length > 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const generateRebookings = async () => {
    if (!targetAccountId) {
      toast.error("Bitte Zielkonto für Umbuchung wählen");
      return;
    }
    setIsGenerating(true);
    try {
      // Delete existing rebookings first
      if (existingRebookings.length > 0) {
        const { error: delError } = await supabase
          .from("bookings")
          .delete()
          .eq("building_id", buildingId)
          .eq("fiscal_year", fiscalYear)
          .eq("booking_category", "heating_repost");
        if (delError) throw delError;
      }

      // Create one rebooking per heating account
      const rebookings = heatingAccounts
        .map((acc) => {
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
        <div className="flex items-end gap-3">
          <div className="flex-1">
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
      </CardContent>
    </Card>
  );
}
