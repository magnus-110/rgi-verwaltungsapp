import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServicePricing, formatPrice } from "@/hooks/useServicePricing";
import {
  loadFinalizedPeriods,
  getOwnerBillingPositions,
  type FinalizedPeriod,
  type AutoPosition,
  type HeatingPosition,
} from "@/lib/services/nebenkosten";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal";
import { HeizkostenHilfeWizard } from "./HeizkostenHilfeWizard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Lock,
  Plus,
  Trash2,
  AlertCircle,
  ArrowLeft,
  HelpCircle,
  Flame,
  Home as HomeIcon,
  Users,
  Receipt,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

type Assignment = {
  id: string;
  unit_number: string | null;
  building_id: string;
  building_name?: string;
  building_address?: string;
};

type ExtraCost = {
  id?: string;
  cost_type: string;
  label: string;
  amount: number;
  prorata_exempt?: boolean;
};

const DEFAULT_EXTRA_COST_TYPES = [
  { type: "grundsteuer", label: "Grundsteuer" },
  { type: "kabel_tv", label: "Kabel / TV" },
  { type: "wartung_se", label: "Wartung Sondereigentum" },
];

// RGI Look – lokal im Tool, ohne globale Token-Änderung
const RGI = {
  primary: "#ee7202",
  primaryDark: "#c95e02",
  bg: "#faf8f5",
  card: "#ffffff",
  border: "#e7e0d8",
  text: "#1f1a14",
  muted: "#7a6f63",
  green: "#22863a",
  greenBg: "#e8f5ec",
  amber: "#a86b00",
  amberBg: "#fdf3dc",
  orange: "#c2410c",
  orangeBg: "#fff7ed",
};

const headingFont = "Century Gothic, Arial, sans-serif";
const bodyFont = "'Work Sans', system-ui, sans-serif";

export function WegOwnerNebenkostenTool() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pricing } = useServicePricing();
  const price = pricing?.nebenkosten;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<FinalizedPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [autoPositions, setAutoPositions] = useState<AutoPosition[]>([]);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, number>>({});
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(new Set());
  const [heating, setHeating] = useState<HeatingPosition | null>(null);
  const [heatingOverride, setHeatingOverride] = useState<number | "">("");
  const [loadingData, setLoadingData] = useState(false);

  // KI-Auslese Heizkostenabrechnung
  type HeatingExtraction = {
    found: boolean;
    anteil_gesamtkosten?: number | null;
    heizkosten?: number | null;
    warmwasserkosten?: number | null;
    co2_vermieteranteil?: number | null;
    suggested_value?: number | null;
    nutzungszeitraum_von?: string | null;
    nutzungszeitraum_bis?: string | null;
    mieterwechsel_verdacht?: boolean;
    confidence: "hoch" | "mittel" | "niedrig";
    source_quote?: string | null;
    warnings?: string[];
  };
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<HeatingExtraction | null>(null);
  const [aiAssisted, setAiAssisted] = useState<{
    used: boolean;
    confidence?: string;
    source_quote?: string | null;
    suggested_value?: number | null;
  }>({ used: false });

  // Mieter-Daten
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");
  const [persons, setPersons] = useState<number | "">("");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [tenantChanged, setTenantChanged] = useState(false);
  const [prepayMonthly, setPrepayMonthly] = useState<number | "">("");

  // Direkte Eigentümerkosten
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Kauf-Dialog
  const [buyOpen, setBuyOpen] = useState(false);
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId);
  const selectedPeriod = periods.find((p) => p.id === periodId);

  // 1. Wohnungen laden
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-owner-units");
        if (error) throw error;
        const units = (data?.units ?? []) as Assignment[];
        setAssignments(units);
        if (units.length === 1) setAssignmentId(units[0].id);
      } catch (e) {
        console.error("[NebenkostenTool] list-owner-units error", e);
        toast.error("Wohnungen konnten nicht geladen werden.");
      }
    })();
  }, [user]);

  // 2. Perioden laden
  useEffect(() => {
    if (!selectedAssignment) {
      setPeriods([]);
      setPeriodId(null);
      return;
    }
    loadFinalizedPeriods(selectedAssignment.building_id)
      .then((p) => {
        setPeriods(p);
        if (p.length === 1) setPeriodId(p[0].id);
        else setPeriodId(null);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Perioden konnten nicht geladen werden.");
      });
  }, [selectedAssignment?.building_id]);

  // 3. Positionen + Heizung + Mieter + Extra-Kosten laden
  useEffect(() => {
    if (!assignmentId || !periodId || !selectedPeriod || !user) return;
    setLoadingData(true);
    (async () => {
      try {
        const [result, tenancyRes, costsRes] = await Promise.all([
          getOwnerBillingPositions(assignmentId, periodId),
          supabase
            .from("service_tenancies")
            .select("*")
            .eq("assignment_id", assignmentId)
            .maybeSingle(),
          supabase
            .from("service_owner_costs")
            .select("*")
            .eq("assignment_id", assignmentId)
            .eq("fiscal_year", selectedPeriod.fiscal_year),
        ]);

        setAutoPositions(result.positions);
        setPositionOverrides({});
        setDisabledAccounts(new Set());
        setHeating(result.heating);
        // Nur vorbefüllen, wenn KEIN Mieterwechsel – sonst muss der Eigentümer
        // den anteiligen Wert aus der Heizkostenabrechnung manuell eintragen.
        setHeatingOverride(
          result.heating.source === "messdienst" && !tenantChanged
            ? result.heating.amount
            : "",
        );

        const t = tenancyRes.data;
        if (t) {
          setTenancyId(t.id);
          setTenantName(t.tenant_name ?? "");
          setTenantAddress(t.tenant_address ?? "");
          setPersons(t.persons ?? "");
          setMoveIn(t.move_in ?? "");
          setMoveOut(t.move_out ?? "");
          setTenantChanged(!!(t.move_in || t.move_out));
          setPrepayMonthly(t.nk_prepayment_monthly ?? "");
        } else {
          setTenancyId(null);
        }

        const ec = (costsRes.data ?? []).map((c: any) => ({
          id: c.id,
          cost_type: c.cost_type,
          label: c.label ?? c.cost_type,
          amount: Number(c.amount),
          prorata_exempt: !!c.prorata_exempt,
        }));
        setExtraCosts(ec);
      } catch (e) {
        console.error(e);
        toast.error("Daten konnten nicht geladen werden.");
      } finally {
        setLoadingData(false);
      }
    })();
  }, [assignmentId, periodId, selectedPeriod?.fiscal_year, user]);

  // Speicherfunktionen
  const saveTenancy = async () => {
    if (!assignmentId || !user) return;
    const payload = {
      assignment_id: assignmentId,
      user_id: user.id,
      tenant_name: tenantName || null,
      tenant_address: tenantAddress || null,
      persons: persons === "" ? null : Number(persons),
      move_in: moveIn || null,
      move_out: moveOut || null,
      nk_prepayment_monthly: prepayMonthly === "" ? null : Number(prepayMonthly),
    };
    if (tenancyId) {
      await supabase.from("service_tenancies").update(payload).eq("id", tenancyId);
    } else {
      const { data } = await supabase
        .from("service_tenancies")
        .insert(payload)
        .select()
        .single();
      if (data) setTenancyId(data.id);
    }
  };

  const addExtraCost = (type = "sonstige", label = "Neue Position") => {
    setExtraCosts((prev) => [
      ...prev,
      { cost_type: type, label, amount: 0, prorata_exempt: false },
    ]);
  };
  const removeExtraCost = async (idx: number) => {
    const ec = extraCosts[idx];
    if (ec.id) await supabase.from("service_owner_costs").delete().eq("id", ec.id);
    setExtraCosts((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateExtraCost = (idx: number, patch: Partial<ExtraCost>) => {
    setExtraCosts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };
  const saveExtraCost = async (idx: number) => {
    if (!assignmentId || !user || !selectedPeriod) return;
    const c = extraCosts[idx];
    const payload = {
      assignment_id: assignmentId,
      user_id: user.id,
      fiscal_year: selectedPeriod.fiscal_year,
      cost_type: c.cost_type,
      label: c.label,
      amount: c.amount,
      prorata_exempt: !!c.prorata_exempt,
    };
    if (c.id) {
      await supabase.from("service_owner_costs").update(payload).eq("id", c.id);
    } else {
      const { data } = await supabase
        .from("service_owner_costs")
        .insert(payload)
        .select()
        .single();
      if (data) updateExtraCost(idx, { id: data.id });
    }
  };

  // KI-Auslese der Heizkostenabrechnung
  const handleHeatingUpload = async (file: File) => {
    if (!assignmentId) {
      toast.error("Bitte zuerst eine Wohnung auswählen.");
      return;
    }
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("Datei zu groß (max. 15 MB).");
      return;
    }
    const allowed = /\.(pdf|jpe?g|png)$/i;
    if (!allowed.test(file.name)) {
      toast.error("Bitte PDF, JPG oder PNG hochladen.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const filePath = `service/heating-uploads/${assignmentId}/${ts}-${safeName}`;
    let uploaded = false;
    try {
      const { error: upErr } = await supabase.storage
        .from("building-files")
        .upload(filePath, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      uploaded = true;

      const { data, error } = await supabase.functions.invoke(
        "extract-heating-statement",
        { body: { assignment_id: assignmentId, file_path: filePath } },
      );
      if (error) throw error;
      setAiResult(data as HeatingExtraction);
    } catch (e: any) {
      console.error("[heating-ai]", e);
      toast.error(
        "Auslese nicht möglich. Bitte tragen Sie den Wert von Hand ein.",
      );
    } finally {
      if (uploaded) {
        // Datensparsamkeit: Datei nach Auslese wieder entfernen
        supabase.storage.from("building-files").remove([filePath]).catch(() => {});
      }
      setAiLoading(false);
    }
  };

  const acceptAiSuggestion = () => {
    if (!aiResult || typeof aiResult.suggested_value !== "number") return;
    setHeatingOverride(aiResult.suggested_value);
    setAiAssisted({
      used: true,
      confidence: aiResult.confidence,
      source_quote: aiResult.source_quote ?? null,
      suggested_value: aiResult.suggested_value,
    });
    setAiResult(null);
    toast.success("Vorschlag übernommen. Sie können den Wert weiterhin anpassen.");
  };

  // Tagesgenaue Pro-Rata bei Mieterwechsel
  const prorata = useMemo(
    () => computeProrata(moveIn, moveOut, tenantChanged, selectedPeriod),
    [moveIn, moveOut, tenantChanged, selectedPeriod],
  );

  // Heizungs-Vorbefüllung an Mieterwechsel koppeln:
  // Bei Mieterwechsel wird das Feld geleert, damit der Eigentümer den
  // anteiligen Wert aus der Heizkostenabrechnung manuell überträgt.
  useEffect(() => {
    if (!heating) return;
    if (tenantChanged) {
      setHeatingOverride("");
    } else if (heating.source === "messdienst") {
      setHeatingOverride(heating.amount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantChanged]);

  // Faktor für eine Auto-Position (verbrauchsabhängige bleiben ungekürzt)
  const factorForAuto = (p: AutoPosition) =>
    prorata.active && !p.consumption_based ? prorata.factor : 1;

  // Effektiver Betrag je Position: Override hat Vorrang, sonst share × Faktor
  const effectivePositionAmount = (p: AutoPosition) => {
    const ov = positionOverrides[p.account_number];
    if (ov !== undefined) return ov;
    return round2(p.share_amount * factorForAuto(p));
  };

  const effectiveExtraAmount = (c: ExtraCost) =>
    prorata.active ? round2(c.amount * prorata.factor) : c.amount;

  // Summen
  const totals = useMemo(() => {
    const autoSum = autoPositions
      .filter((p) => !disabledAccounts.has(p.account_number))
      .reduce((s, p) => s + effectivePositionAmount(p), 0);
    const heatingValue = Number(heatingOverride) || 0;
    const extraSum = extraCosts.reduce((s, c) => s + effectiveExtraAmount(c), 0);
    const costSum = autoSum + heatingValue + extraSum;
    // Vorauszahlung: 12 Monatsraten anteilig auf die Mietzeit (tagesgenau)
    const prepayFull = (Number(prepayMonthly) || 0) * 12;
    const prepaySum = prorata.active ? prepayFull * prorata.factor : prepayFull;
    const result = costSum - prepaySum;
    return {
      autoSum,
      heatingValue,
      extraSum,
      costSum,
      prepaySum: round2(prepaySum),
      result: round2(result),
      months: prorata.tenantDays / 30.42, // Info-Wert
      prorata,
    };
  }, [
    autoPositions,
    positionOverrides,
    disabledAccounts,
    heatingOverride,
    extraCosts,
    prepayMonthly,
    prorata,
  ]);

  const canBuy = !!(
    assignmentId &&
    periodId &&
    tenantName &&
    persons &&
    prepayMonthly !== "" &&
    Number(prepayMonthly) > 0 &&
    !loadingData
  );

  const handleBuy = async () => {
    if (!user || !selectedPeriod || !assignmentId || !waiverChecked) return;
    setSubmitting(true);
    try {
      await saveTenancy();
      for (let i = 0; i < extraCosts.length; i++) await saveExtraCost(i);

      const snapshot = {
        tenant: {
          name: tenantName,
          address: tenantAddress,
          persons: Number(persons) || 0,
          move_in: moveIn || null,
          move_out: moveOut || null,
          prepayment_monthly: Number(prepayMonthly) || 0,
          months_in_period: totals.months,
          prepayment_total: totals.prepaySum,
        },
        assignment_id: assignmentId,
        fiscal_year: selectedPeriod.fiscal_year,
        period: {
          from: selectedPeriod.period_from,
          to: selectedPeriod.period_to,
        },
        positions: autoPositions
          .filter((p) => !disabledAccounts.has(p.account_number))
          .map((p) => ({
            account_number: p.account_number,
            account_name: p.account_name,
            total_amount: p.total_amount,
            share_amount: effectivePositionAmount(p),
            full_share_amount: p.share_amount,
            distribution_key: p.distribution_key,
            consumption_based: !!p.consumption_based,
            user_adjusted:
              positionOverrides[p.account_number] !== undefined,
            prorata_factor: factorForAuto(p),
          })),
        heating: heating
          ? {
              label: heating.label,
              amount: Number(heatingOverride) || 0,
              source: heating.source,
              user_adjusted:
                heating.source !== "messdienst" ||
                Number(heatingOverride) !== heating.amount,
              ai_assisted: aiAssisted.used,
              ai_confidence: aiAssisted.used ? aiAssisted.confidence ?? null : null,
              ai_source_quote: aiAssisted.used ? aiAssisted.source_quote ?? null : null,
              ai_suggested_value: aiAssisted.used ? aiAssisted.suggested_value ?? null : null,
            }
          : null,
        extra_costs: extraCosts.map((c) => ({
          cost_type: c.cost_type,
          label: c.label,
          amount: effectiveExtraAmount(c),
          full_amount: c.amount,
          prorata_exempt: !!c.prorata_exempt,
          prorata_factor: prorata.active && !c.prorata_exempt ? prorata.factor : 1,
        })),
        prorata: {
          active: prorata.active,
          tenant_days: prorata.tenantDays,
          period_days: prorata.periodDays,
          factor: prorata.factor,
          from: prorata.fromISO,
          to: prorata.toISO,
        },
        totals,
      };

      const { data, error } = await supabase.functions.invoke(
        "create-service-checkout",
        {
          body: {
            service_type: "nebenkosten",
            assignment_id: assignmentId,
            fiscal_year: selectedPeriod.fiscal_year,
            agb_version: CURRENT_LEGAL_VERSION,
            privacy_version: CURRENT_LEGAL_VERSION,
            widerruf_waiver_confirmed: true,
            input_snapshot: snapshot,
          },
        },
      );
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Keine Checkout-URL erhalten.");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Bestellung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="min-h-screen pb-32"
        style={{ background: RGI.bg, color: RGI.text, fontFamily: bodyFont }}
      >
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/weg-owner/service-hub")}
            className="mb-3 -ml-2 h-11"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück zum Service-Hub
          </Button>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: headingFont }}
          >
            Nebenkostenabrechnung für Mieter
          </h1>
          <p className="text-sm mt-2" style={{ color: RGI.muted }}>
            Grüne Felder sind vorbefüllt, gelbe Felder bitte ergänzen. Wir nutzen
            Ihre WEG-Abrechnung und die Werte des Messdienstes.
          </p>

          {/* 1. Wohnung */}
          <SectionCard num={1} title="Wohnung & Abrechnungsjahr" icon={HomeIcon}>
            <div className="space-y-3">
              <Field label="Wohnung">
                <Select
                  value={assignmentId ?? ""}
                  onValueChange={(v) => setAssignmentId(v)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Bitte wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.building_name ?? "Gebäude"} — Whg. {a.unit_number ?? "?"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Abrechnungsjahr">
                <Select
                  value={periodId ?? ""}
                  onValueChange={(v) => setPeriodId(v)}
                  disabled={!assignmentId || periods.length === 0}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue
                      placeholder={
                        !assignmentId
                          ? "Erst Wohnung wählen"
                          : periods.length === 0
                            ? "Keine Periode verfügbar"
                            : "Bitte wählen"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fiscal_year} ({p.period_from} – {p.period_to})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {assignments.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    Für Ihren Account ist aktuell keine Wohnung hinterlegt. Bitte
                    kontaktieren Sie die Verwaltung
                    (info@rgi-immobilien.de / 08363&nbsp;960656).
                  </AlertDescription>
                </Alert>
              )}
              {assignmentId && periods.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    Für diese Wohnung ist noch keine WEG-Abrechnung finalisiert.
                    Bitte wenden Sie sich an die Verwaltung
                    (info@rgi-immobilien.de / 08363&nbsp;960656).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </SectionCard>

          {assignmentId && periodId && (
            <>
              {/* 2. Mieter */}
              <SectionCard num={2} title="Mieter" icon={Users}>
                <div className="space-y-3">
                  <Field
                    label="Name des Mieters"
                    badge={tenantName ? "auto" : "ergänzen"}
                  >
                    <Input
                      className="h-11"
                      style={fieldStyle(!!tenantName)}
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      onBlur={saveTenancy}
                    />
                  </Field>
                  <Field
                    label="Anzahl Personen"
                    badge={persons ? "auto" : "ergänzen"}
                  >
                    <Input
                      type="number"
                      className="h-11"
                      style={fieldStyle(!!persons)}
                      value={persons}
                      onChange={(e) =>
                        setPersons(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      onBlur={saveTenancy}
                    />
                  </Field>
                  <Field
                    label="NK-Vorauszahlung pro Monat (€)"
                    tooltip="Monatliche Nebenkosten-Vorauszahlung laut Mietvertrag. Pflichtfeld."
                    badge={prepayMonthly !== "" && Number(prepayMonthly) > 0 ? undefined : "Pflicht"}
                  >
                    <Input
                      type="number"
                      step="0.01"
                      className="h-11"
                      style={fieldStyle(prepayMonthly !== "" && Number(prepayMonthly) > 0)}
                      value={prepayMonthly}
                      onChange={(e) =>
                        setPrepayMonthly(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                      onBlur={saveTenancy}
                      required
                    />
                  </Field>

                  <div className="flex items-start gap-2 rounded-md border p-3" style={{ borderColor: "#e5e0d8" }}>
                    <Checkbox
                      id="tenant-changed"
                      checked={tenantChanged}
                      onCheckedChange={(c) => {
                        const v = !!c;
                        setTenantChanged(v);
                        if (!v) {
                          setMoveIn("");
                          setMoveOut("");
                          // sofort speichern (Felder zurücksetzen)
                          setTimeout(saveTenancy, 0);
                        }
                      }}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="tenant-changed" className="cursor-pointer text-sm font-medium">
                        Mieterwechsel im Wirtschaftsjahr
                      </Label>
                      <p className="text-xs" style={{ color: RGI.muted }}>
                        Aktivieren, falls der Mieter innerhalb des Abrechnungszeitraums ein- oder ausgezogen ist.
                      </p>
                    </div>
                  </div>

                  {tenantChanged && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Einzug">
                        <Input
                          type="date"
                          className="h-11"
                          value={moveIn}
                          onChange={(e) => setMoveIn(e.target.value)}
                          onBlur={saveTenancy}
                        />
                      </Field>
                      <Field label="Auszug">
                        <Input
                          type="date"
                          className="h-11"
                          value={moveOut}
                          onChange={(e) => setMoveOut(e.target.value)}
                          onBlur={saveTenancy}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* 3. Heizkosten */}
              <SectionCard num={3} title="Heizung / Warmwasser / Wasser" icon={Flame}>
                {loadingData ? (
                  <LoadingRow />
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: RGI.muted }}>
                      Dieser Wert kommt aus der Heizkostenabrechnung des
                      Messdienstes – inkl. der Heiz-Nebenkonten (Kaminkehrer,
                      Heizungswartung etc.).
                    </p>
                    {tenantChanged ? (
                      <Alert>
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-xs">
                          <strong>Mieterwechsel im Zeitraum:</strong> Bitte
                          tragen Sie hier die <strong>anteilige Summe</strong>{" "}
                          für diesen Mieter aus der Heizkostenabrechnung des
                          Messdienstes ein. Das Feld wird bei einem
                          Mieterwechsel <em>nicht</em> automatisch vorbefüllt,
                          da der Messdienst die Aufteilung verbrauchsgenau
                          ermittelt.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <Field
                      label={heating?.label ?? "Heizung / Warmwasser / Wasser"}
                      badge={
                        tenantChanged
                          ? "ergänzen"
                          : heating?.source === "messdienst"
                            ? "auto"
                            : "ergänzen"
                      }
                      tooltip="Ihr Anteil aus der Heizkostenabrechnung des Messdienstes (z. B. Brunata, Techem, ista)."
                    >
                      <Input
                        type="number"
                        step="0.01"
                        className="h-11"
                        style={fieldStyle(!tenantChanged && heating?.source === "messdienst")}
                        value={heatingOverride}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                        }}
                        placeholder={
                          tenantChanged
                            ? "Anteilige Summe aus Heizkostenabrechnung eintragen"
                            : heating?.source === "missing"
                              ? "Bitte Betrag aus der Heizkostenabrechnung eintragen"
                              : ""
                        }
                        onChange={(e) => {
                          if (aiAssisted.used) setAiAssisted({ used: false });
                          setHeatingOverride(
                            e.target.value === "" ? "" : Number(e.target.value),
                          );
                        }}
                      />
                    </Field>

                    {/* KI-Auslese Heizkostenabrechnung – Vorschlag, nie Auto-Eintrag */}
                    <div
                      className="rounded-xl px-4 py-3 text-xs"
                      style={{
                        border: `1px dashed ${RGI.border}`,
                        background: "#fbfaf7",
                        color: RGI.muted,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: RGI.primary }} />
                        <div className="flex-1">
                          <div className="font-medium" style={{ color: RGI.text }}>
                            Optional: Heizkostenabrechnung hochladen
                          </div>
                          <div className="mt-1">
                            Wir lesen den Betrag aus Ihrer Messdienst-Abrechnung
                            (Techem, ista, Brunata, Minol …) per KI aus und
                            schlagen Ihnen einen Wert vor. Übernommen wird nichts
                            automatisch – Sie bestätigen den Wert per Klick.
                          </div>
                          <div className="mt-2">
                            <input
                              id="heating-upload"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="hidden"
                              disabled={aiLoading || !assignmentId}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleHeatingUpload(f);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9"
                              disabled={aiLoading || !assignmentId}
                              onClick={() =>
                                document.getElementById("heating-upload")?.click()
                              }
                            >
                              {aiLoading ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Wird ausgelesen…
                                </>
                              ) : (
                                <>Abrechnung hochladen (PDF, JPG, PNG)</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {aiResult && (() => {
                        const r = aiResult;
                        const unsicher =
                          r.found &&
                          (r.confidence === "niedrig" || r.mieterwechsel_verdacht);
                        const fmt = (n?: number | null) =>
                          typeof n === "number"
                            ? n.toLocaleString("de-DE", {
                                style: "currency",
                                currency: "EUR",
                              })
                            : "—";
                        return (
                          <div
                            className="mt-3 rounded-lg p-3"
                            style={{
                              background: !r.found
                                ? "#f3efea"
                                : unsicher
                                  ? RGI.amberBg
                                  : RGI.greenBg,
                              color: !r.found
                                ? RGI.muted
                                : unsicher
                                  ? RGI.amber
                                  : RGI.green,
                              border: `1px solid ${RGI.border}`,
                            }}
                          >
                            {!r.found ? (
                              <div>
                                <strong>Nichts erkannt.</strong> Wir konnten in
                                diesem Dokument keinen eindeutigen
                                Heizkostenbetrag finden. Bitte tragen Sie den
                                Wert von Hand ein.
                                {r.warnings?.length ? (
                                  <ul className="list-disc ml-5 mt-1">
                                    {r.warnings.map((w, i) => (
                                      <li key={i}>{w}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : unsicher ? (
                              <div>
                                <strong>Bitte prüfen.</strong> Wir haben Beträge
                                gefunden, sind uns aber nicht sicher
                                {r.mieterwechsel_verdacht
                                  ? " (Nutzungszeitraum scheint nur ein Teilzeitraum / Mieterwechsel zu sein)"
                                  : ""}
                                . Tragen Sie den Wert bitte selbst ein.
                                <div className="mt-2" style={{ color: RGI.text }}>
                                  Anteil an den Gesamtkosten:{" "}
                                  <strong>{fmt(r.anteil_gesamtkosten)}</strong>
                                  {typeof r.co2_vermieteranteil === "number" && (
                                    <>
                                      {" "}
                                      · Vermieteranteil CO₂:{" "}
                                      <strong>
                                        −{fmt(r.co2_vermieteranteil)}
                                      </strong>
                                    </>
                                  )}
                                </div>
                                {r.warnings?.length ? (
                                  <ul className="list-disc ml-5 mt-1">
                                    {r.warnings.map((w, i) => (
                                      <li key={i}>{w}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : (
                              <div>
                                <div style={{ color: RGI.text }}>
                                  <strong>Gefunden in Ihrer Abrechnung:</strong>
                                  <ul className="list-disc ml-5 mt-1">
                                    <li>
                                      Anteil an den Gesamtkosten:{" "}
                                      <strong>
                                        {fmt(r.anteil_gesamtkosten)}
                                      </strong>
                                    </li>
                                    {typeof r.co2_vermieteranteil === "number" && (
                                      <li>
                                        abzüglich Vermieteranteil CO₂-Abgabe:{" "}
                                        <strong>
                                          −{fmt(r.co2_vermieteranteil)}
                                        </strong>
                                      </li>
                                    )}
                                    <li>
                                      Vorschlag:{" "}
                                      <strong>{fmt(r.suggested_value)}</strong>
                                    </li>
                                  </ul>
                                </div>
                                {r.warnings?.length ? (
                                  <ul
                                    className="list-disc ml-5 mt-2"
                                    style={{ color: RGI.amber }}
                                  >
                                    {r.warnings.map((w, i) => (
                                      <li key={i}>{w}</li>
                                    ))}
                                  </ul>
                                ) : null}
                                <div className="mt-3 flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-9"
                                    style={{
                                      background: RGI.primary,
                                      color: "white",
                                    }}
                                    onClick={acceptAiSuggestion}
                                    disabled={
                                      typeof r.suggested_value !== "number"
                                    }
                                  >
                                    Wert übernehmen
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9"
                                    onClick={() => setAiResult(null)}
                                  >
                                    Verwerfen
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {aiAssisted.used && !aiResult && (
                        <div
                          className="mt-3 rounded-lg p-2 text-xs"
                          style={{
                            background: RGI.greenBg,
                            color: RGI.green,
                            border: `1px solid ${RGI.border}`,
                          }}
                        >
                          KI-Vorschlag übernommen (Vertrauen:{" "}
                          {aiAssisted.confidence ?? "—"}). Sie können den Wert
                          oben weiterhin anpassen.
                        </div>
                      )}
                    </div>

                    {!tenantChanged && heating?.source === "missing" && (
                      <Alert>
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription className="text-xs">
                          Für diese Wohnung liegt noch keine Heizkostenabrechnung
                          vom Messdienst vor. Bitte tragen Sie den Betrag aus
                          Ihrer Abrechnung manuell ein.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Pro-Rata-Banner bei Mieterwechsel */}
              {prorata.active && (
                <div
                  className="mt-4 rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                  style={{ background: RGI.amberBg, color: RGI.amber, border: `1px solid ${RGI.border}` }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Zeitanteilige Abrechnung:</strong>{" "}
                    {prorata.fromISO && prorata.toISO && (
                      <>vom {formatDe(prorata.fromISO)} bis {formatDe(prorata.toISO)} – </>
                    )}
                    {prorata.tenantDays} von {prorata.periodDays} Tagen (
                    {(prorata.factor * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %).
                    Beträge sind tagesgenau gekürzt; verbrauchsabhängige Posten
                    und die Heizkostenabrechnung des Messdienstes bleiben unverändert.
                  </div>
                </div>
              )}

              {/* 4. Umlagefähige Kosten */}
              <SectionCard num={4} title="Umlagefähige Kosten" icon={Receipt}>
                <div
                  className="text-xs px-3 py-2 rounded mb-3"
                  style={{ background: RGI.amberBg, color: RGI.amber }}
                >
                  Wasser, das bereits in der Heizkostenabrechnung enthalten ist,
                  bitte nicht zusätzlich ansetzen.
                </div>
                {loadingData ? (
                  <LoadingRow />
                ) : autoPositions.length === 0 ? (
                  <p className="text-sm" style={{ color: RGI.muted }}>
                    Keine weiteren umlagefähigen Positionen gefunden.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {autoPositions.map((p) => {
                      const disabled = disabledAccounts.has(p.account_number);
                      const consumption = !!p.consumption_based;
                      const override = positionOverrides[p.account_number];
                      const autoValue = round2(p.share_amount * factorForAuto(p));
                      const value = override !== undefined ? override : autoValue;
                      const prorataApplied = prorata.active && !consumption;
                      return (
                        <div
                          key={p.account_number}
                          className="rounded-xl px-4 py-3 transition-all"
                          style={{
                            border: `1px solid ${disabled ? RGI.border : "transparent"}`,
                            background: disabled
                              ? "#f3efea"
                              : consumption
                                ? RGI.amberBg
                                : RGI.greenBg,
                            opacity: disabled ? 0.55 : 1,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={!disabled}
                              className="h-5 w-5 shrink-0"
                              onCheckedChange={(c) => {
                                setDisabledAccounts((prev) => {
                                  const n = new Set(prev);
                                  if (c) n.delete(p.account_number);
                                  else n.add(p.account_number);
                                  return n;
                                });
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm leading-tight truncate">
                                {p.account_name}
                              </div>
                              <div
                                className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"
                                style={{ color: RGI.muted }}
                              >
                                <span>Schlüssel {p.distribution_key.toUpperCase()}</span>
                                <span>·</span>
                                <span>Gesamt {p.total_amount.toFixed(2)} €</span>
                                {consumption && (
                                  <span
                                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium ml-1"
                                    style={{ background: "#fff", color: RGI.amber }}
                                  >
                                    nach Verbrauch
                                  </span>
                                )}
                                {prorataApplied && override === undefined && (
                                  <span
                                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium ml-1"
                                    style={{ background: "#fff", color: RGI.amber }}
                                  >
                                    zeitanteilig
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className="flex items-baseline gap-1 shrink-0 pl-2"
                              style={{ borderLeft: `1px solid ${disabled ? RGI.border : "rgba(0,0,0,0.08)"}` }}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={disabled}
                                aria-label={`Mieteranteil ${p.account_name}`}
                                className="w-24 bg-transparent border-0 outline-none text-right text-lg font-semibold tabular-nums focus:ring-0 disabled:cursor-not-allowed"
                                style={{ color: RGI.text }}
                                value={
                                  typeof value === "number"
                                    ? value.toLocaleString("de-DE", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })
                                    : ""
                                }
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                                  const num = raw === "" ? 0 : Number(raw);
                                  if (Number.isNaN(num)) return;
                                  setPositionOverrides((prev) => ({
                                    ...prev,
                                    [p.account_number]: num,
                                  }));
                                }}
                              />
                              <span className="text-sm font-medium" style={{ color: RGI.muted }}>
                                €
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* 5. Weitere Kosten */}
              <SectionCard num={5} title="Weitere Kosten" icon={Wrench}>
                <p className="text-xs mb-3" style={{ color: RGI.muted }}>
                  Direkt bei Ihnen angefallene umlagefähige Kosten (Grundsteuer,
                  Kabel-TV, Wartung Sondereigentum, einzelne Reparaturen …).
                  {prorata.active && (
                    <> Bei einem Mieterwechsel werden diese Beträge automatisch tagesgenau auf den Abrechnungszeitraum dieses Mieters umgelegt.</>
                  )}
                </p>
                <div className="space-y-2">
                  {extraCosts.map((c, idx) => {
                    const effective = effectiveExtraAmount(c);
                    const prorataApplied = prorata.active;
                    return (
                      <div
                        key={c.id ?? `new-${idx}`}
                        className="rounded-xl px-4 py-3 transition-all"
                        style={{
                          border: `1px solid transparent`,
                          background: RGI.amberBg,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            aria-label="Position entfernen"
                            className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/60 transition"
                            onClick={() => removeExtraCost(idx)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={c.label}
                              placeholder="Bezeichnung"
                              className="w-full bg-transparent border-0 outline-none font-semibold text-sm leading-tight focus:ring-0 placeholder:text-muted-foreground/60"
                              style={{ color: RGI.text }}
                              onChange={(e) =>
                                updateExtraCost(idx, { label: e.target.value })
                              }
                              onBlur={() => saveExtraCost(idx)}
                            />
                            <div
                              className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"
                              style={{ color: RGI.muted }}
                            >
                              <span>Schlüssel DIREKT</span>
                              {prorataApplied && (
                                <>
                                  <span>·</span>
                                  <span>
                                    Vollbetrag {c.amount.toFixed(2)} € → tagesanteilig{" "}
                                    {effective.toFixed(2)} €
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div
                            className="flex items-baseline gap-1 shrink-0 pl-2"
                            style={{ borderLeft: `1px solid rgba(0,0,0,0.08)` }}
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Betrag ${c.label}`}
                              className="w-24 bg-transparent border-0 outline-none text-right text-lg font-semibold tabular-nums focus:ring-0"
                              style={{ color: RGI.text }}
                              value={c.amount.toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              onChange={(e) => {
                                const raw = e.target.value
                                  .replace(/\./g, "")
                                  .replace(",", ".");
                                const num = raw === "" ? 0 : Number(raw);
                                if (Number.isNaN(num)) return;
                                updateExtraCost(idx, { amount: num });
                              }}
                              onBlur={() => saveExtraCost(idx)}
                            />
                            <span className="text-sm font-medium" style={{ color: RGI.muted }}>
                              €
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DEFAULT_EXTRA_COST_TYPES.map((d) => (
                    <Button
                      key={d.type}
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() => addExtraCost(d.type, d.label)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {d.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={() => addExtraCost("sonstige", "Sonstige")}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Freie Position
                  </Button>
                </div>
              </SectionCard>



              {/* Haftungs-Hinweis */}
              <div
                className="mt-4 rounded-lg p-3 text-xs"
                style={{
                  background: "#fff",
                  border: `1px solid ${RGI.border}`,
                  color: RGI.muted,
                }}
              >
                Dieses Dokument wird automatisiert erstellt und stellt keine
                Rechts- oder Steuerberatung dar. Die Verantwortung für die
                Richtigkeit der Eingaben liegt beim Nutzer. Für die Inhalte des
                erzeugten Dokuments wird keine Haftung übernommen.
              </div>
            </>
          )}
        </div>

        {/* Sticky Bottom Bar */}
        {assignmentId && periodId && (
          <div
            className="fixed bottom-0 left-0 right-0 z-40"
            style={{
              background: "#fff",
              borderTop: `1px solid ${RGI.border}`,
              boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
            }}
          >
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: RGI.muted }}>
                  Ergebnis (nach Kauf sichtbar)
                </div>
                <div
                  className="text-lg font-bold flex items-center gap-1"
                  style={{ fontFamily: headingFont }}
                >
                  <Lock className="w-4 h-4" style={{ color: RGI.muted }} />
                  *.*** €
                </div>
              </div>
              <Button
                className="h-12 px-5 font-semibold"
                style={{
                  background: canBuy ? RGI.primary : "#d4cfc8",
                  color: "#fff",
                }}
                disabled={!canBuy}
                onClick={() => setBuyOpen(true)}
              >
                {price ? formatPrice(price.price_cents, price.currency) : "Jetzt erstellen"}
                <span className="ml-2">›</span>
              </Button>
            </div>
          </div>
        )}

        <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle style={{ fontFamily: headingFont }}>
                Zahlungspflichtig bestellen
              </DialogTitle>
              <DialogDescription>
                Nach erfolgreicher Zahlung erstellen wir Ihre
                Nebenkostenabrechnung als PDF und stellen sie hier zum Download
                bereit.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="bg-muted p-3 rounded text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Nebenkostenabrechnung {selectedPeriod?.fiscal_year}</span>
                  <span className="font-bold">
                    {price && formatPrice(price.price_cents, price.currency)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wohnung Nr. {selectedAssignment?.unit_number}, Mieter:{" "}
                  {tenantName}
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm bg-amber-50 p-3 rounded cursor-pointer">
                <Checkbox
                  checked={waiverChecked}
                  onCheckedChange={(c) => setWaiverChecked(!!c)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Ich verlange ausdrücklich</strong>, dass mit der
                  Erstellung des Dokuments sofort nach Zahlungseingang begonnen
                  wird, und bestätige, dass mein Widerrufsrecht mit
                  vollständiger Ausführung erlischt.
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Mit dem Kauf akzeptieren Sie unsere{" "}
                <a href="/legal/agb" target="_blank" className="underline">
                  AGB
                </a>{" "}
                und die{" "}
                <a href="/legal/datenschutz" target="_blank" className="underline">
                  Datenschutzerklärung
                </a>{" "}
                (Version {CURRENT_LEGAL_VERSION}).
              </p>
              <p className="text-xs text-muted-foreground">
                Dieses Dokument wird automatisiert erstellt und stellt keine
                Rechts- oder Steuerberatung dar. Die Verantwortung für die
                Eingaben liegt beim Nutzer; für die Inhalte wird keine Haftung
                übernommen.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setBuyOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={handleBuy}
                disabled={!waiverChecked || submitting}
                style={{ background: RGI.primary, color: "#fff" }}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Zahlungspflichtig bestellen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ---------- Helper components ----------

function SectionCard({
  num,
  title,
  icon: Icon,
  children,
}: {
  num: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-4 rounded-2xl p-4"
      style={{
        background: RGI.card,
        border: `1px solid ${RGI.border}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm"
          style={{ background: RGI.primary, color: "#fff", fontFamily: headingFont }}
        >
          {num}
        </div>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <h2 className="font-semibold text-base" style={{ fontFamily: headingFont }}>
            {title}
          </h2>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  badge,
  tooltip,
  children,
}: {
  label: string;
  badge?: "auto" | "ergänzen" | "Pflicht";
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-sm flex items-center gap-1.5">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Erklärung">
                  <HelpCircle className="w-3.5 h-3.5" style={{ color: RGI.muted }} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </Label>
        {badge && (
          <span
            className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{
              background:
                badge === "auto"
                  ? RGI.greenBg
                  : badge === "Pflicht"
                    ? RGI.orangeBg
                    : RGI.amberBg,
              color:
                badge === "auto"
                  ? RGI.green
                  : badge === "Pflicht"
                    ? RGI.orange
                    : RGI.amber,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function fieldStyle(filled: boolean): React.CSSProperties {
  return {
    background: filled ? RGI.greenBg : RGI.orangeBg,
    borderColor: RGI.border,
  };
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: RGI.muted }}>
      <Loader2 className="w-4 h-4 animate-spin" /> Lade…
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}


function parseISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetweenInclusive(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

export type ProrataInfo = {
  active: boolean;
  factor: number;
  tenantDays: number;
  periodDays: number;
  fromISO: string | null;
  toISO: string | null;
};

function computeProrata(
  moveIn: string,
  moveOut: string,
  enabled: boolean,
  period?: FinalizedPeriod | undefined,
): ProrataInfo {
  const empty: ProrataInfo = {
    active: false,
    factor: 1,
    tenantDays: 0,
    periodDays: 0,
    fromISO: null,
    toISO: null,
  };
  if (!period) return empty;
  const pFrom = parseISODate(period.period_from);
  const pTo = parseISODate(period.period_to);
  if (!pFrom || !pTo) return empty;
  const periodDays = daysBetweenInclusive(pFrom, pTo);
  if (!enabled || (!moveIn && !moveOut)) {
    return { ...empty, periodDays, tenantDays: periodDays, factor: 1 };
  }
  const mIn = parseISODate(moveIn) ?? pFrom;
  const mOut = parseISODate(moveOut) ?? pTo;
  const from = mIn > pFrom ? mIn : pFrom;
  const to = mOut < pTo ? mOut : pTo;
  if (to < from) {
    return { ...empty, periodDays, tenantDays: 0, factor: 0, active: true };
  }
  const tenantDays = daysBetweenInclusive(from, to);
  const factor = periodDays > 0 ? tenantDays / periodDays : 1;
  return {
    active: factor < 1,
    factor,
    tenantDays,
    periodDays,
    fromISO: from.toISOString().slice(0, 10),
    toISO: to.toISOString().slice(0, 10),
  };
}

