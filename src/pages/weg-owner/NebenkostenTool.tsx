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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  CalendarDays,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
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
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Mieter-Daten
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");
  const [persons, setPersons] = useState<number | "">("");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [tenantChanged, setTenantChanged] = useState(false);
  const [prepayMonthly, setPrepayMonthly] = useState<number | "">("");
  // Verteilungsschlüssel: "weg" = wie WEG-Abrechnung (Standard), "qm" = nach Quadratmetern
  const [distributionMode, setDistributionMode] = useState<"weg" | "qm">("weg");
  const [ownQm, setOwnQm] = useState<number | "">("");
  const [totalQm, setTotalQm] = useState<number | "">("");
  const qmFactor = () => {
    const own = Number(ownQm) || 0;
    const total = Number(totalQm) || 0;
    return total > 0 ? own / total : 0;
  };
  // Basis-Anteil je Position: bei "qm" nach (bearbeitbaren) Quadratmetern, sonst wie geladen
  const baseShare = (p: AutoPosition) =>
    distributionMode === "qm" && !p.consumption_based ? round2(p.total_amount * qmFactor()) : p.share_amount;
  // Angezeigter/gespeicherter Schlüssel: bei "qm" -> "qm", sonst der WEG-Schlüssel
  const displayKey = (p: AutoPosition) =>
    distributionMode === "qm" && !p.consumption_based ? "qm" : p.distribution_key;
  // Weitere Mieter (bei Mieterwechsel) – dynamische Liste
  type AdditionalTenant = {
    id: string;
    name: string;
    persons: number | "";
    prepayMonthly: number | "";
    moveIn: string;
    moveOut: string;
    heatingOverride: number | "";
  };
  const makeEmptyTenant = (): AdditionalTenant => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    name: "",
    persons: "",
    prepayMonthly: "",
    moveIn: "",
    moveOut: "",
    heatingOverride: "",
  });
  const [additionalTenants, setAdditionalTenants] = useState<AdditionalTenant[]>([]);
  const updateAdditionalTenant = (id: string, patch: Partial<AdditionalTenant>) =>
    setAdditionalTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeAdditionalTenant = (id: string) => setAdditionalTenants((prev) => prev.filter((t) => t.id !== id));
  const addAdditionalTenant = () =>
    setAdditionalTenants((prev) => (prev.length >= 9 ? prev : [...prev, makeEmptyTenant()]));

  // Direkte Eigentümerkosten
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Kauf-Dialog
  const [buyOpen, setBuyOpen] = useState(false);
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  useEffect(() => {
    if (user?.email) setRecipientEmail((prev) => prev || (user.email ?? ""));
  }, [user]);
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
      } finally {
        setLoadingAssignments(false);
      }
    })();
  }, [user]);

  // 2. Perioden laden
  useEffect(() => {
    if (!selectedAssignment) {
      setPeriods([]);
      setPeriodId(null);
      setLoadingPeriods(false);
      return;
    }
    setLoadingPeriods(true);
    loadFinalizedPeriods(selectedAssignment.building_id)
      .then((p) => {
        setPeriods(p);
        if (p.length === 1) setPeriodId(p[0].id);
        else setPeriodId(null);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Perioden konnten nicht geladen werden.");
      })
      .finally(() => setLoadingPeriods(false));
  }, [selectedAssignment?.building_id]);

  // 3. Positionen + Heizung + Mieter + Extra-Kosten laden
  useEffect(() => {
    if (!assignmentId || !periodId || !selectedPeriod || !user) return;
    setLoadingData(true);
    (async () => {
      try {
        const [result, tenancyRes, costsRes] = await Promise.all([
          getOwnerBillingPositions(assignmentId, periodId),
          supabase.from("service_tenancies").select("*").eq("assignment_id", assignmentId).maybeSingle(),
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
        setOwnQm(result.own_qm || "");
        setTotalQm(result.total_qm || "");
        // Nur vorbefüllen, wenn KEIN Mieterwechsel – sonst muss der Eigentümer
        // den anteiligen Wert aus der Heizkostenabrechnung manuell eintragen.
        setHeatingOverride(result.heating.source === "messdienst" && !tenantChanged ? result.heating.amount : "");

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
      const { data } = await supabase.from("service_tenancies").insert(payload).select().single();
      if (data) setTenancyId(data.id);
    }
  };

  const addExtraCost = (type = "sonstige", label = "Neue Position") => {
    setExtraCosts((prev) => [...prev, { cost_type: type, label, amount: 0, prorata_exempt: false }]);
  };
  const removeExtraCost = async (idx: number) => {
    const ec = extraCosts[idx];
    if (ec.id) await supabase.from("service_owner_costs").delete().eq("id", ec.id);
    setExtraCosts((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateExtraCost = (idx: number, patch: Partial<ExtraCost>) => {
    setExtraCosts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
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
      const { data } = await supabase.from("service_owner_costs").insert(payload).select().single();
      if (data) updateExtraCost(idx, { id: data.id });
    }
  };

  // Baut den Snapshot für GENAU EINEN Mieter (anteilig nach seinem Zeitraum).
  const buildTenantSnapshot = (
    tName: string,
    tAddress: string,
    tPersons: number,
    tPrepayMonthly: number,
    pr: ProrataInfo,
    heatingValue: number,
    moveInVal: string | null,
    moveOutVal: string | null,
  ) => {
    const factorAuto = (p: AutoPosition) => (pr.active && !p.consumption_based ? pr.factor : 1);
    const posAmount = (p: AutoPosition) => round2(baseShare(p) * factorAuto(p));
    const activePositions = autoPositions.filter((p) => !disabledAccounts.has(p.account_number));
    const autoSum = round2(activePositions.reduce((s, p) => s + posAmount(p), 0));
    const extraEff = (c: ExtraCost) => (pr.active && !c.prorata_exempt ? round2(c.amount * pr.factor) : c.amount);
    const extraSum = round2(extraCosts.reduce((s, c) => s + extraEff(c), 0));
    const costSum = round2(autoSum + heatingValue + extraSum);
    const prepayFull = tPrepayMonthly; // Eingabe ist bereits die Jahressumme
    const prepaySum = round2(prepayFull); // eingetragene Summe wird 1:1 übernommen (nicht anteilig)
    const result = round2(costSum - prepaySum);
    const months = pr.periodDays > 0 ? pr.tenantDays / 30.42 : 0;
    return {
      tenant: {
        name: tName,
        address: tAddress,
        persons: tPersons,
        move_in: moveInVal,
        move_out: moveOutVal,
        prepayment_monthly: tPrepayMonthly,
        months_in_period: months,
        prepayment_total: prepaySum,
      },
      positions: activePositions.map((p) => ({
        account_number: p.account_number,
        account_name: p.account_name,
        total_amount: p.total_amount,
        share_amount: posAmount(p),
        full_share_amount: baseShare(p),
        distribution_key: displayKey(p),
        consumption_based: !!p.consumption_based,
        prorata_factor: factorAuto(p),
      })),
      heating: heating
        ? {
            label: heating.label,
            amount: heatingValue,
            source: heating.source,
            user_adjusted: true,
          }
        : null,
      extra_costs: extraCosts.map((c) => ({
        cost_type: c.cost_type,
        label: c.label,
        amount: extraEff(c),
        full_amount: c.amount,
        prorata_exempt: !!c.prorata_exempt,
        prorata_factor: pr.active && !c.prorata_exempt ? pr.factor : 1,
      })),
      totals: {
        autoSum,
        heatingValue,
        extraSum,
        costSum,
        prepaySum,
        result,
        months,
      },
      prorata: {
        active: pr.active,
        tenant_days: pr.tenantDays,
        period_days: pr.periodDays,
        factor: pr.factor,
        from: pr.fromISO,
        to: pr.toISO,
      },
    };
  };

  // Tagesgenaue Pro-Rata bei Mieterwechsel
  const prorata = useMemo(
    () => computeProrata(moveIn, moveOut, tenantChanged, selectedPeriod),
    [moveIn, moveOut, tenantChanged, selectedPeriod],
  );

  // Pro-Rata für jeden zusätzlichen Mieter
  const additionalProrata = useMemo(
    () => additionalTenants.map((t) => computeProrata(t.moveIn, t.moveOut, tenantChanged, selectedPeriod)),
    [additionalTenants, tenantChanged, selectedPeriod],
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
  const factorForAuto = (p: AutoPosition) => (prorata.active && !p.consumption_based ? prorata.factor : 1);

  // Effektiver Betrag je Position: Override hat Vorrang, sonst share × Faktor
  const effectivePositionAmount = (p: AutoPosition) => {
    const ov = positionOverrides[p.account_number];
    if (ov !== undefined) return ov;
    return round2(baseShare(p) * factorForAuto(p));
  };

  const effectiveExtraAmount = (c: ExtraCost) => (prorata.active ? round2(c.amount * prorata.factor) : c.amount);

  // Summen
  const totals = useMemo(() => {
    const autoSum = autoPositions
      .filter((p) => !disabledAccounts.has(p.account_number))
      .reduce((s, p) => s + effectivePositionAmount(p), 0);
    const heatingValue = Number(heatingOverride) || 0;
    const extraSum = extraCosts.reduce((s, c) => s + effectiveExtraAmount(c), 0);
    const costSum = autoSum + heatingValue + extraSum;
    // Vorauszahlung: 12 Monatsraten anteilig auf die Mietzeit (tagesgenau)
    const prepayFull = Number(prepayMonthly) || 0; // Eingabe ist bereits die Jahressumme
    const prepaySum = prepayFull; // eingetragene Summe wird 1:1 übernommen (nicht anteilig)
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
  }, [autoPositions, positionOverrides, disabledAccounts, heatingOverride, extraCosts, prepayMonthly, prorata]);

  const additionalTenantsValid =
    !tenantChanged ||
    (additionalTenants.length > 0 &&
      additionalTenants.every((t) => t.name.trim() && t.prepayMonthly !== "" && Number(t.prepayMonthly) > 0));

  const canBuy = !!(
    assignmentId &&
    periodId &&
    tenantName &&
    prepayMonthly !== "" &&
    Number(prepayMonthly) > 0 &&
    additionalTenantsValid &&
    !loadingData
  );

  // Anzahl der Abrechnungen (= Anzahl Produkte im Checkout)
  const quantity = tenantChanged ? 1 + additionalTenants.length : 1;

  const isInitialLoading =
    loadingAssignments || (!!assignmentId && loadingPeriods) || (!!assignmentId && !!periodId && loadingData);

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
        recipient_email: recipientEmail || user?.email || null,
        positions: autoPositions
          .filter((p) => !disabledAccounts.has(p.account_number))
          .map((p) => ({
            account_number: p.account_number,
            account_name: p.account_name,
            total_amount: p.total_amount,
            share_amount: effectivePositionAmount(p),
            full_share_amount: baseShare(p),
            distribution_key: displayKey(p),
            consumption_based: !!p.consumption_based,
            user_adjusted: positionOverrides[p.account_number] !== undefined,
            prorata_factor: factorForAuto(p),
          })),
        heating: heating
          ? {
              label: heating.label,
              amount: Number(heatingOverride) || 0,
              source: heating.source,
              user_adjusted: heating.source !== "messdienst" || Number(heatingOverride) !== heating.amount,
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

      const tenantsArr = tenantChanged
        ? [
            buildTenantSnapshot(
              tenantName,
              tenantAddress,
              Number(persons) || 0,
              Number(prepayMonthly) || 0,
              prorata,
              Number(heatingOverride) || 0,
              moveIn || null,
              moveOut || null,
            ),
            ...additionalTenants.map((t, i) =>
              buildTenantSnapshot(
                t.name,
                tenantAddress,
                Number(t.persons) || 0,
                Number(t.prepayMonthly) || 0,
                additionalProrata[i],
                Number(t.heatingOverride) || 0,
                t.moveIn || null,
                t.moveOut || null,
              ),
            ),
          ]
        : null;

      const finalSnapshot = tenantsArr ? { ...snapshot, tenants: tenantsArr } : snapshot;

      const { data, error } = await supabase.functions.invoke("create-service-checkout", {
        body: {
          service_type: "nebenkosten",
          assignment_id: assignmentId,
          fiscal_year: selectedPeriod.fiscal_year,
          agb_version: CURRENT_LEGAL_VERSION,
          privacy_version: CURRENT_LEGAL_VERSION,
          widerruf_waiver_confirmed: true,
          quantity,
          input_snapshot: finalSnapshot,
        },
      });
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
      <div className="min-h-screen pb-32" style={{ background: RGI.bg, color: RGI.text, fontFamily: bodyFont }}>
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
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: headingFont }}>
            Nebenkostenabrechnung für Mieter
          </h1>
          <p className="text-sm mt-2" style={{ color: RGI.muted }}>
            Grüne Felder sind vorbefüllt, gelbe Felder bitte ergänzen. Wir nutzen Ihre WEG-Abrechnung und die Werte des
            Messdienstes.
          </p>

          {isInitialLoading ? (
            <div
              className="mt-8 rounded-2xl border flex flex-col items-center justify-center gap-3 py-16 px-6 text-center"
              style={{ borderColor: RGI.border, background: "#fff" }}
            >
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: RGI.amber }} />
              <div className="text-sm font-medium" style={{ color: RGI.text }}>
                Daten werden geladen …
              </div>
              <div className="text-xs" style={{ color: RGI.muted }}>
                Bitte einen Moment Geduld, wir prüfen Ihre Wohnung und Abrechnung.
              </div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="mt-6 space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Für Ihren Account ist aktuell keine Wohnung hinterlegt. Bitte kontaktieren Sie die Verwaltung
                  (info@rgi-immobilien.de / 08363&nbsp;960656).
                </AlertDescription>
              </Alert>
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{ borderColor: RGI.border, background: RGI.amberBg, color: RGI.amber }}
              >
                Die Nebenkostenabrechnung kann aktuell noch nicht erstellt werden.
              </div>
            </div>
          ) : assignmentId && periods.length === 0 ? (
            <div className="mt-6 space-y-3">
              {assignments.length > 1 && (
                <SectionCard num={1} title="Wohnung & Abrechnungsjahr" icon={HomeIcon}>
                  <Field label="Wohnung">
                    <Select value={assignmentId ?? ""} onValueChange={(v) => setAssignmentId(v)}>
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
                </SectionCard>
              )}
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Für diese Wohnung ist noch keine WEG-Abrechnung finalisiert. Bitte wenden Sie sich an die Verwaltung
                  (info@rgi-immobilien.de / 08363&nbsp;960656).
                </AlertDescription>
              </Alert>
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{ borderColor: RGI.border, background: RGI.amberBg, color: RGI.amber }}
              >
                Die Nebenkostenabrechnung kann aktuell noch nicht erstellt werden.
              </div>
            </div>
          ) : (
            <>
              <SectionCard num={1} title="Wohnung & Abrechnungsjahr" icon={HomeIcon}>
                <div className="space-y-3">
                  <Field label="Wohnung">
                    <Select value={assignmentId ?? ""} onValueChange={(v) => setAssignmentId(v)}>
                      <SelectTrigger className="h-11" style={fieldStyle(!!assignmentId)}>
                        <SelectValue placeholder="Bitte wählen" style={{ color: RGI.green }} />
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
                    <Select value={periodId ?? ""} onValueChange={(v) => setPeriodId(v)}>
                      <SelectTrigger
                        className="h-11"
                        style={fieldStyle(!!periodId)}
                        disabled={!assignmentId || periods.length === 0}
                      >
                        <SelectValue
                          placeholder={
                            !assignmentId
                              ? "Erst Wohnung wählen"
                              : periods.length === 0
                                ? "Keine Periode verfügbar"
                                : "Bitte wählen"
                          }
                          style={{ color: RGI.green }}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.fiscal_year} ({formatDe(p.period_from)} – {formatDe(p.period_to)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SectionCard>

              {assignmentId && periodId && (
                <>
                  {/* 2. Mieter */}
                  <SectionCard
                    num={2}
                    title={tenantChanged ? "Mieter 1 – ursprünglicher Mieter" : "Mieter"}
                    icon={Users}
                  >
                    <div className="space-y-3">
                      <Field label="Name des Mieters" badge={tenantName ? "auto" : "ergänzen"}>
                        <Input
                          className="h-11"
                          style={fieldStyle(!!tenantName)}
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          onBlur={saveTenancy}
                        />
                      </Field>
                      <Field
                        label="Geleistete NK-Vorauszahlung des Mieters (€)"
                        tooltip="Betrag, den dieser Mieter im Abrechnungszeitraum insgesamt an NK-Vorauszahlung geleistet hat. Wird 1:1 übernommen (nicht anteilig gekürzt). Pflichtfeld."
                        badge={prepayMonthly !== "" && Number(prepayMonthly) > 0 ? undefined : "Pflicht"}
                      >
                        <Input
                          type="number"
                          step="0.01"
                          className="h-11"
                          style={fieldStyle(prepayMonthly !== "" && Number(prepayMonthly) > 0)}
                          value={prepayMonthly}
                          onChange={(e) => setPrepayMonthly(e.target.value === "" ? "" : Number(e.target.value))}
                          onBlur={saveTenancy}
                          required
                        />
                      </Field>

                      <div className="flex items-center gap-2 rounded-md border p-3" style={{ borderColor: "#e5e0d8" }}>
                        <Checkbox
                          id="tenant-changed"
                          checked={tenantChanged}
                          onCheckedChange={(c) => {
                            const v = !!c;
                            setTenantChanged(v);
                            if (v) {
                              // Beim Aktivieren: gleich ein leeres Eingabefeld für den Folgemieter anlegen
                              setAdditionalTenants((prev) => (prev.length === 0 ? [makeEmptyTenant()] : prev));
                            } else {
                              setMoveIn("");
                              setMoveOut("");
                              setAdditionalTenants([]);
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
                        <TenancyDates
                          from={moveIn}
                          to={moveOut}
                          onFrom={setMoveIn}
                          onTo={setMoveOut}
                          periodFrom={selectedPeriod?.period_from}
                          periodTo={selectedPeriod?.period_to}
                        />
                      )}
                    </div>
                  </SectionCard>

                  {/* 3. Heizkosten */}
                  <SectionCard num={3} title="Heizkostenabrechnung" icon={Flame}>
                    {loadingData ? (
                      <LoadingRow />
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: RGI.muted }}>
                          Dieser Wert kommt aus der Heizkostenabrechnung des Messdienstes – inkl. der Heiz-Nebenkonten
                          (Kaminkehrer, Heizungswartung etc.).
                        </p>
                        {tenantChanged ? (
                          <Alert>
                            <AlertCircle className="w-4 h-4" />
                            <AlertDescription className="text-xs">
                              <strong>Mieterwechsel im Zeitraum:</strong> Bitte tragen Sie hier die{" "}
                              <strong>anteilige Summe</strong> für diesen Mieter aus der Heizkostenabrechnung des
                              Messdienstes ein. Das Feld wird bei einem Mieterwechsel <em>nicht</em> automatisch
                              vorbefüllt, da der Messdienst die Aufteilung verbrauchsgenau ermittelt.
                            </AlertDescription>
                          </Alert>
                        ) : null}
                        <Field
                          label={heating?.label ?? "Heizung / Warmwasser / Wasser"}
                          badge={tenantChanged ? "ergänzen" : heating?.source === "messdienst" ? "auto" : "ergänzen"}
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
                              setHeatingOverride(e.target.value === "" ? "" : Number(e.target.value));
                            }}
                          />
                        </Field>

                        <HeizkostenHilfeWizard onUebernehmen={(v) => setHeatingOverride(v)} />
                      </div>
                    )}
                  </SectionCard>

                  {/* 4. Weitere Mieter – nur bei Mieterwechsel */}
                  {tenantChanged && (
                    <SectionCard num={4} title="Weitere Mieter (nach dem Wechsel)" icon={Users}>
                      <div className="space-y-4">
                        <p className="text-xs" style={{ color: RGI.muted }}>
                          Fügen Sie hier alle weiteren Mieter hinzu, die in diesem Abrechnungsjahr in der Wohnung
                          gewohnt haben. Pro Mieter wird eine eigene anteilige Abrechnung erstellt.
                        </p>

                        {additionalTenants.map((t, idx) => (
                          <div
                            key={t.id}
                            className="rounded-xl border p-3 space-y-3"
                            style={{ borderColor: "#e5e0d8", background: "#faf8f3" }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold" style={{ color: RGI.text }}>
                                Weiterer Mieter #{idx + 2}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeAdditionalTenant(t.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>

                            <Field label="Name des Mieters" badge={t.name ? "auto" : "ergänzen"}>
                              <Input
                                className="h-11"
                                style={fieldStyle(!!t.name)}
                                value={t.name}
                                onChange={(e) => updateAdditionalTenant(t.id, { name: e.target.value })}
                              />
                            </Field>

                            <Field
                              label="Geleistete NK-Vorauszahlung des Mieters (€)"
                              tooltip="Betrag, den dieser Mieter im Abrechnungszeitraum insgesamt an NK-Vorauszahlung geleistet hat. Wird 1:1 übernommen (nicht anteilig gekürzt). Pflichtfeld."
                              badge={t.prepayMonthly !== "" && Number(t.prepayMonthly) > 0 ? undefined : "Pflicht"}
                            >
                              <Input
                                type="number"
                                step="0.01"
                                className="h-11"
                                style={fieldStyle(t.prepayMonthly !== "" && Number(t.prepayMonthly) > 0)}
                                value={t.prepayMonthly}
                                onChange={(e) =>
                                  updateAdditionalTenant(t.id, {
                                    prepayMonthly: e.target.value === "" ? "" : Number(e.target.value),
                                  })
                                }
                              />
                            </Field>

                            <TenancyDates
                              from={t.moveIn}
                              to={t.moveOut}
                              onFrom={(v) => updateAdditionalTenant(t.id, { moveIn: v })}
                              onTo={(v) => updateAdditionalTenant(t.id, { moveOut: v })}
                              periodFrom={selectedPeriod?.period_from}
                              periodTo={selectedPeriod?.period_to}
                            />

                            <Field
                              label="Heizung / Warmwasser / Wasser (anteilig)"
                              badge="ergänzen"
                              tooltip="Anteilige Summe dieses Mieters aus der Heizkostenabrechnung des Messdienstes."
                            >
                              <Input
                                type="number"
                                step="0.01"
                                className="h-11"
                                style={fieldStyle(t.heatingOverride !== "" && Number(t.heatingOverride) > 0)}
                                value={t.heatingOverride}
                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                                }}
                                placeholder="Anteilige Summe aus Heizkostenabrechnung eintragen"
                                onChange={(e) =>
                                  updateAdditionalTenant(t.id, {
                                    heatingOverride: e.target.value === "" ? "" : Number(e.target.value),
                                  })
                                }
                              />
                            </Field>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addAdditionalTenant}
                          disabled={additionalTenants.length >= 9}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Weiteren Mieter hinzufügen
                        </Button>
                        {additionalTenants.length >= 9 && (
                          <p className="text-xs" style={{ color: RGI.muted }}>
                            Maximal 10 Mieter pro Abrechnungsjahr.
                          </p>
                        )}
                      </div>
                    </SectionCard>
                  )}

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
                          <>
                            vom {formatDe(prorata.fromISO)} bis {formatDe(prorata.toISO)} –{" "}
                          </>
                        )}
                        {prorata.tenantDays} von {prorata.periodDays} Tagen (
                        {(prorata.factor * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %). Beträge sind
                        tagesgenau gekürzt; verbrauchsabhängige Posten und die Heizkostenabrechnung des Messdienstes
                        bleiben unverändert.
                      </div>
                    </div>
                  )}

                  {/* 4. Umlagefähige Kosten */}
                  <SectionCard num={5} title="Umlagefähige Kosten" icon={Receipt}>
                    <div
                      className="text-xs px-3 py-2 rounded mb-3"
                      style={{ background: RGI.amberBg, color: RGI.amber }}
                    >
                      Diese Positionen dürfen gesetzlich umgelegt werden, sofern im Mietvertrag nichts anderes
                      vereinbart ist.
                    </div>
                    <div className="mb-4">
                      <div className="text-sm font-medium mb-2" style={{ color: RGI.text }}>
                        Umlageschlüssel
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(
                          [
                            { key: "weg", title: "WEG-Umlageschlüssel", desc: "Schlüssel aus Ihrer WEG-Abrechnung" },
                            { key: "qm", title: "Quadratmeter", desc: "Nach Wohnfläche (§ 556a BGB)" },
                          ] as const
                        ).map((opt) => {
                          const active = distributionMode === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setDistributionMode(opt.key)}
                              className="text-left rounded-xl border p-3 transition-all"
                              style={{
                                borderColor: active ? RGI.primary : RGI.border,
                                background: active ? RGI.orangeBg : "#fff",
                                boxShadow: active ? `inset 0 0 0 1px ${RGI.primary}` : "none",
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex items-center justify-center rounded-full shrink-0"
                                  style={{
                                    width: 16,
                                    height: 16,
                                    border: `2px solid ${active ? RGI.primary : "#cbb9a8"}`,
                                    background: active ? RGI.primary : "#fff",
                                  }}
                                >
                                  {active && (
                                    <span style={{ width: 6, height: 6, borderRadius: 9999, background: "#fff" }} />
                                  )}
                                </span>
                                <span className="font-semibold text-sm" style={{ color: RGI.text }}>
                                  {opt.title}
                                </span>
                              </div>
                              <div className="text-xs mt-1" style={{ color: RGI.muted, marginLeft: 24 }}>
                                {opt.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs mt-2" style={{ color: RGI.muted }}>
                        Gesetzlich werden Nebenkosten in der Regel nach Wohnfläche (§ 556a BGB) umgelegt; in der Praxis
                        wird häufig nach den Schlüsseln der WEG-Abrechnung verteilt.
                      </p>
                      {distributionMode === "qm" && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <Field label="Ihre Quadratmeter (m²)">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-11"
                              style={fieldStyle(Number(ownQm) > 0)}
                              value={ownQm}
                              onChange={(e) => setOwnQm(e.target.value === "" ? "" : Number(e.target.value))}
                            />
                          </Field>
                          <Field label="Gesamt-m² (alle Einheiten)">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-11"
                              style={fieldStyle(Number(totalQm) > 0)}
                              value={totalQm}
                              onChange={(e) => setTotalQm(e.target.value === "" ? "" : Number(e.target.value))}
                            />
                          </Field>
                        </div>
                      )}
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
                          const prorataApplied = prorata.active && !consumption;
                          return (
                            <div
                              key={p.account_number}
                              className="rounded-xl px-4 py-3 transition-all"
                              style={{
                                border: `1px solid ${disabled ? RGI.border : "transparent"}`,
                                background: disabled ? "#f3efea" : consumption ? RGI.amberBg : RGI.greenBg,
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
                                  <div className="font-semibold text-sm leading-tight truncate">{p.account_name}</div>
                                  <div
                                    className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"
                                    style={{ color: RGI.muted }}
                                  >
                                    <span>Schlüssel {displayKey(p).toUpperCase()}</span>
                                    <span>·</span>
                                    <span>Gesamt *,** €</span>
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
                                  <span
                                    className="w-24 text-right text-lg font-semibold tabular-nums"
                                    style={{ color: RGI.muted, letterSpacing: "0.08em" }}
                                    aria-label="Betrag nach Kauf sichtbar"
                                  >
                                    *,**
                                  </span>
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
                  <SectionCard num={6} title="Weitere Kosten" icon={Wrench}>
                    <p className="text-xs mb-3" style={{ color: RGI.muted }}>
                      Direkt bei Ihnen angefallene umlagefähige Kosten (Grundsteuer, Kabel-TV, Wartung Sondereigentum,
                      einzelne Reparaturen …).
                      {prorata.active && (
                        <>
                          {" "}
                          Bei einem Mieterwechsel werden diese Beträge automatisch tagesgenau auf den
                          Abrechnungszeitraum dieses Mieters umgelegt.
                        </>
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
                                  placeholder="Bezeichnung eingeben"
                                  className="w-full bg-white border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30 font-semibold text-sm leading-tight placeholder:text-muted-foreground/60"
                                  style={{ color: RGI.text, borderColor: RGI.border }}
                                  onChange={(e) => updateExtraCost(idx, { label: e.target.value })}
                                  onBlur={() => saveExtraCost(idx)}
                                />

                                <div
                                  className="text-[11px] mt-1 flex items-center gap-1.5 flex-wrap"
                                  style={{ color: RGI.muted }}
                                >
                                  <span>Schlüssel DIREKT</span>
                                  {prorataApplied && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        Vollbetrag {c.amount.toFixed(2)} € → tagesanteilig {effective.toFixed(2)} €
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div
                                className="flex items-center gap-2 shrink-0 pl-2"
                                style={{ borderLeft: `1px solid rgba(0,0,0,0.08)` }}
                              >
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`Betrag ${c.label}`}
                                  className="w-24 bg-white border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30 text-right text-lg font-semibold tabular-nums placeholder:text-muted-foreground/60"
                                  style={{ color: RGI.text, borderColor: RGI.border }}
                                  placeholder="0,00"
                                  value={c.amount.toLocaleString("de-DE", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/\./g, "").replace(",", ".");
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
                    Dieses Dokument wird automatisiert erstellt und stellt keine Rechts- oder Steuerberatung dar. Die
                    Verantwortung für die Richtigkeit der Eingaben liegt beim Nutzer. Für die Inhalte des erzeugten
                    Dokuments wird keine Haftung übernommen.
                  </div>
                </>
              )}
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
                <div className="text-lg font-bold flex items-center gap-1" style={{ fontFamily: headingFont }}>
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
                {price
                  ? formatPrice(price.price_cents * quantity, price.currency) +
                    (quantity > 1 ? ` (${quantity} Abrechnungen)` : "")
                  : "Jetzt erstellen"}
                <span className="ml-2">›</span>
              </Button>
            </div>
          </div>
        )}

        <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle style={{ fontFamily: headingFont }}>Zahlungspflichtig bestellen</DialogTitle>
              <DialogDescription>
                Nach erfolgreicher Zahlung erstellen wir Ihre Nebenkostenabrechnung als PDF und stellen sie hier zum
                Download bereit.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="bg-muted p-3 rounded text-sm space-y-1">
                <div className="flex justify-between">
                  <span>
                    Nebenkostenabrechnung {selectedPeriod?.fiscal_year}
                    {quantity > 1 ? ` (${quantity}×)` : ""}
                  </span>
                  <span className="font-bold">
                    {price && formatPrice(price.price_cents * quantity, price.currency)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wohnung Nr. {selectedAssignment?.unit_number}, Mieter: {tenantName}
                </div>
              </div>
              <div>
                <Label className="text-sm">E-Mail für den Versand der Abrechnung</Label>
                <Input
                  type="email"
                  className="h-11 mt-1"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="name@example.de"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Vorausgefüllt mit Ihrer Account-E-Mail – Sie können sie ändern.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm bg-amber-50 p-3 rounded cursor-pointer">
                <Checkbox checked={waiverChecked} onCheckedChange={(c) => setWaiverChecked(!!c)} className="mt-0.5" />
                <span>
                  Mit dem Kauf beginnt die Erstellung des Dokuments sofort. Ich bestätige, dass mein Widerrufsrecht mit
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
                Dieses Dokument wird automatisiert erstellt und stellt keine Rechts- oder Steuerberatung dar. Die
                Verantwortung für die Eingaben liegt beim Nutzer; für die Inhalte wird keine Haftung übernommen.
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

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function DateField({
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const som = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const clampMonth = (d: Date) => {
    let x = d;
    if (minDate && x < som(minDate)) x = som(minDate);
    if (maxDate && x > som(maxDate)) x = som(maxDate);
    return x;
  };
  const [month, setMonth] = useState<Date>(clampMonth(selected ?? minDate ?? new Date()));
  useEffect(() => {
    if (open) setMonth(clampMonth(selected ?? minDate ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const year = month.getFullYear();
  const minYear = minDate ? minDate.getFullYear() : 2015;
  const maxYear = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const disabledMatchers = [minDate ? { before: minDate } : null, maxDate ? { after: maxDate } : null].filter(
    Boolean,
  ) as any[];

  const selectStyle: React.CSSProperties = { borderColor: RGI.border, color: RGI.text, background: "#fff" };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-11 w-full rounded-lg border px-3 text-sm text-left flex items-center gap-2 outline-none transition focus:ring-2 focus:ring-primary/30"
          style={{ borderColor: RGI.border, background: "#fff", color: selected ? RGI.text : RGI.muted }}
        >
          <CalendarDays className="w-4 h-4 shrink-0" style={{ color: RGI.muted }} />
          {selected ? format(selected, "dd.MM.yyyy", { locale: de }) : (placeholder ?? "Datum wählen")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            aria-label="Vorheriger Monat"
            className="h-8 w-8 rounded-md border flex items-center justify-center shrink-0 hover:bg-muted"
            style={{ borderColor: RGI.border }}
            onClick={() => setMonth(clampMonth(new Date(year, month.getMonth() - 1, 1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={month.getMonth()}
            onChange={(e) => setMonth(clampMonth(new Date(year, Number(e.target.value), 1)))}
            className="h-8 flex-1 rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            style={selectStyle}
          >
            {MONATE.map((m, i) => (
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setMonth(clampMonth(new Date(Number(e.target.value), month.getMonth(), 1)))}
            className="h-8 w-[86px] rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            style={selectStyle}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Nächster Monat"
            className="h-8 w-8 rounded-md border flex items-center justify-center shrink-0 hover:bg-muted"
            style={{ borderColor: RGI.border }}
            onClick={() => setMonth(clampMonth(new Date(year, month.getMonth() + 1, 1)))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Calendar
          mode="single"
          month={month}
          onMonthChange={(m) => setMonth(clampMonth(m))}
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          fromDate={minDate}
          toDate={maxDate}
          disabled={disabledMatchers}
          locale={de}
          className="p-0"
          classNames={{ caption: "hidden" }}
        />
      </PopoverContent>
    </Popover>
  );
}
function TenancyDates({
  from,
  to,
  onFrom,
  onTo,
  periodFrom,
  periodTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  periodFrom?: string;
  periodTo?: string;
}) {
  const pStart = periodFrom ? parseISO(periodFrom) : undefined;
  const pEnd = periodTo ? parseISO(periodTo) : undefined;
  const fromD = from ? parseISO(from) : undefined;
  const toD = to ? parseISO(to) : undefined;
  const minOf = (a?: Date, b?: Date) => (a && b ? (a < b ? a : b) : (a ?? b));
  const maxOf = (a?: Date, b?: Date) => (a && b ? (a > b ? a : b) : (a ?? b));
  const einzugMax = minOf(toD, pEnd);
  const auszugMin = maxOf(fromD, pStart);
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: RGI.border, background: RGI.bg }}>
      <div className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: RGI.muted }}>
        <CalendarDays className="w-3.5 h-3.5" />
        Mietzeitraum dieses Mieters
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-[11px] block mb-1" style={{ color: RGI.muted }}>
            Einzug
          </label>
          <DateField value={from} onChange={onFrom} placeholder="Einzugsdatum" minDate={pStart} maxDate={einzugMax} />
        </div>
        <ArrowRight className="w-4 h-4 mb-3 shrink-0 hidden sm:block" style={{ color: RGI.muted }} />
        <div className="flex-1 min-w-0">
          <label className="text-[11px] block mb-1" style={{ color: RGI.muted }}>
            Auszug
          </label>
          <DateField value={to} onChange={onTo} placeholder="Auszugsdatum" minDate={auszugMin} maxDate={pEnd} />
        </div>
      </div>
    </div>
  );
}
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
              background: badge === "auto" ? RGI.greenBg : badge === "Pflicht" ? RGI.orangeBg : RGI.amberBg,
              color: badge === "auto" ? RGI.green : badge === "Pflicht" ? RGI.orange : RGI.amber,
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
