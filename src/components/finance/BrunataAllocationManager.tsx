import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Flame, Save, Check, AlertTriangle, Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sumForAccount } from "./lib/bookingAggregation";

interface BrunataAllocationManagerProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

/**
 * BrunataAllocationManager
 * ------------------------
 * Manuelle Erfassung der individuellen Heizkostenwerte aus der externen
 * Brunata- (oder Techem-/ista-) Heizkostenabrechnung. Diese Werte ersetzen
 * die MEA-Verteilung für Konto 1400 (Heizung/Warmwasser) und sind die
 * wichtigste Voraussetzung für eine HV-Office-konforme Jahresabrechnung.
 *
 * Workflow:
 * 1. PDF der Brunata-Abrechnung als Beleg hochladen (bleibt im Bucket).
 * 2. Pro Eigentümer den Brunata-Einzelwert eintragen.
 * 3. Summen-Check gegen Konto 1400 (Toleranz ± 0,05 €).
 */
export function BrunataAllocationManager({ buildingId, periodId, fiscalYear }: BrunataAllocationManagerProps) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Owner assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ["brunata-assignments", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, contacts(first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer", "mieter"])
        .order("unit_number");
      if (error) throw error;
      return data;
    },
  });

  // Existing Brunata values
  const { data: hdv = [] } = useQuery({
    queryKey: ["brunata-values", buildingId, periodId],
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

  // Account 1400 booking total (target sum)
  const { data: account1400Total = 0 } = useQuery({
    queryKey: ["brunata-1400-total", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: acc } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_number", "1400")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .maybeSingle();
      if (!acc) return 0;
      const { data: bookings } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      return Math.abs(sumForAccount(acc.id, (bookings || []) as any));
    },
  });

  // Existing Brunata PDF beleg
  const { data: belegFile } = useQuery({
    queryKey: ["brunata-beleg", buildingId, periodId],
    queryFn: async () => {
      const { data } = await supabase
        .from("building_files")
        .select("id, display_name, file_path, created_at")
        .eq("building_id", buildingId)
        .eq("linked_billing_period_id", periodId)
        .ilike("display_name", "%brunata%")
        .is("deleted_at", null)
        .maybeSingle();
      return data;
    },
  });

  const valueByAssignment = useMemo(() => {
    const map: Record<string, number> = {};
    hdv.forEach((h: any) => { map[h.assignment_id] = Number(h.amount) || 0; });
    return map;
  }, [hdv]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const getDraftValue = (assignmentId: string): string => {
    if (drafts[assignmentId] !== undefined) return drafts[assignmentId];
    const v = valueByAssignment[assignmentId];
    return v ? v.toString().replace(".", ",") : "";
  };

  const sumOfValues = useMemo(() => {
    return assignments.reduce((s: number, a: any) => {
      const draft = drafts[a.id];
      const parsed = draft !== undefined
        ? parseFloat(draft.replace(",", "."))
        : valueByAssignment[a.id] || 0;
      return s + (isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [drafts, valueByAssignment, assignments]);

  const diff = sumOfValues - account1400Total;
  const diffOk = Math.abs(diff) < 0.05;

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = assignments
        .map((a: any) => {
          const draft = drafts[a.id];
          if (draft === undefined) return null;
          const parsed = parseFloat(draft.replace(",", "."));
          if (isNaN(parsed)) return null;
          const existing = hdv.find((h: any) => h.assignment_id === a.id);
          const row: any = {
            building_id: buildingId,
            billing_period_id: periodId,
            assignment_id: a.id,
            amount: parsed,
            note: existing?.note ?? `Brunata ${fiscalYear}`,
          };
          if (existing?.id) row.id = existing.id;
          return row;
        })
        .filter(Boolean);

      if (upserts.length === 0) {
        toast.info("Keine Änderungen zu speichern");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("heating_distribution_values")
        .upsert(upserts as any[], { onConflict: "billing_period_id,assignment_id" });
      if (error) throw error;

      toast.success(`${upserts.length} Werte gespeichert`);
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ["brunata-values"] });
      queryClient.invalidateQueries({ queryKey: ["heating-dist-values-settlement"] });
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${buildingId}/heating/brunata-${fiscalYear}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("building-files").upload(path, file);
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase.from("building_files").insert({
        building_id: buildingId,
        display_name: `Brunata Heizkostenabrechnung ${fiscalYear}`,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        linked_billing_period_id: periodId,
        management_mode: "weg",
        uploaded_by: user?.id,
        source: "manual_upload" as any,
      });
      if (dbErr) throw dbErr;

      toast.success("Beleg hochgeladen");
      queryClient.invalidateQueries({ queryKey: ["brunata-beleg"] });
    } catch (e: any) {
      toast.error("Upload-Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setUploading(false);
    }
  };

  const ownerName = (a: any) =>
    a.contacts?.company_name ||
    [a.contacts?.first_name, a.contacts?.last_name].filter(Boolean).join(" ") ||
    "Unbekannt";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Heizkosten-Verteilung {fiscalYear}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Trage die individuellen Heizkostenwerte aus der externen Brunata-Abrechnung ein. Diese Werte werden
          für die verbrauchsabhängige Verteilung von Konto 1400 verwendet.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gating: erst nach Umbuchung auf 1400 freigeben */}
        {account1400Total <= 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
            <div className="text-amber-900">
              <p className="font-medium">Bitte zuerst Heizkosten auf Konto 1400 umbuchen</p>
              <p className="text-xs mt-1 text-amber-800">
                Die Brunata-Werte können erst eingetragen werden, wenn die Brennstoff- und Wartungsrechnungen
                über die Umbuchung (vorheriger Abschnitt „Heizkosten umbuchen") auf das Sammelkonto 1400
                übertragen wurden. Aktueller Saldo Konto 1400: {formatCurrency(account1400Total)}.
              </p>
            </div>
          </div>
        )}

        {/* Beleg-Upload */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-dashed">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {belegFile ? (
              <span className="text-foreground">Beleg hinterlegt: <span className="font-medium">{belegFile.display_name}</span></span>
            ) : (
              <span className="text-muted-foreground">Noch kein Brunata-PDF hinterlegt</span>
            )}
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <Button size="sm" variant="outline" asChild disabled={uploading}>
              <span>
                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                {belegFile ? "Beleg ersetzen" : "PDF hochladen"}
              </span>
            </Button>
          </label>
        </div>

        {/* Werte-Tabelle */}
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Eigentümer/Mieter zugeordnet.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Einheit</TableHead>
                  <TableHead>Eigentümer / Mieter</TableHead>
                  <TableHead className="text-right w-[180px]">Brunata-Betrag (€)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.unit_number || "–"}</TableCell>
                    <TableCell className="text-sm">{ownerName(a)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        inputMode="decimal"
                        className="text-right font-mono h-8 w-32 ml-auto"
                        placeholder="0,00"
                        value={getDraftValue(a.id)}
                        disabled={account1400Total <= 0}
                        onChange={(e) => setDrafts({ ...drafts, [a.id]: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Summen-Check */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-muted/40 text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span>Σ Brunata-Werte: <span className="font-mono font-medium">{formatCurrency(sumOfValues)}</span></span>
                <span className="text-muted-foreground">/</span>
                <span>Konto 1400: <span className="font-mono font-medium">{formatCurrency(account1400Total)}</span></span>
                {account1400Total > 0 && (
                  diffOk ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Check className="h-3 w-3 mr-1" /> Stimmt überein
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Differenz: {formatCurrency(diff)}
                    </Badge>
                  )
                )}
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || account1400Total <= 0 || Object.keys(drafts).length === 0}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Speichern
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
