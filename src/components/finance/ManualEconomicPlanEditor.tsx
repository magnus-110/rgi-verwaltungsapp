/**
 * ManualEconomicPlanEditor — Wirtschaftsplan ohne Vorjahresperiode anlegen.
 *
 * Workflow:
 *  1. Lädt alle wirtschaftsplanrelevanten Konten der Liegenschaft
 *  2. Lädt (oder erzeugt) Plan-Datensatz mit source='manual'
 *  3. Inline-Edit pro Konto, Auto-Save (debounced)
 *  4. Tab "Einzelpläne": Live-Berechnung über MEA + Override pro Zelle
 *  5. Aktivieren-Button → status='active' (Trigger archiviert alte aktive)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, RotateCcw, CheckCircle2, Eye, Edit3, AlertTriangle, Save, ArrowUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { EconomicPlanLayout, PlanRow } from "./EconomicPlanLayout";
import { isReserveContributionAccount } from "@/lib/accountClassification";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SHARE_TYPES } from "@/lib/shareTypes";

interface Props {
  buildingId: string;
  fiscalYear: number;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

export function ManualEconomicPlanEditor({ buildingId, fiscalYear }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Local edit cache (account_id → planned_amount)
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  // Local edit cache for unit overrides ("unit:account" → amount)
  const [unitDrafts, setUnitDrafts] = useState<Record<string, number>>({});

  // ── Building info ─────────────────────────────────────────────────
  const { data: building } = useQuery({
    queryKey: ["building-info-mep", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings").select("name, address").eq("id", buildingId).single();
      if (error) throw error;
      return data;
    },
  });

  // ── Plan (find or create) ─────────────────────────────────────────
  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ["manual-plan", buildingId, fiscalYear],
    queryFn: async () => {
      // 1. Try find existing draft/active plan for this year
      const { data: existing } = await supabase
        .from("economic_plans" as any)
        .select("*, economic_plan_items(*)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) return existing as any;

      // 2. None → create new draft
      const { data: created, error } = await supabase
        .from("economic_plans" as any)
        .insert({
          building_id: buildingId,
          fiscal_year: fiscalYear,
          source: "manual",
          status: "draft",
          total_costs: 0,
          total_reserve: 0,
        } as any)
        .select("*, economic_plan_items(*)")
        .single();
      if (error) throw error;
      return created as any;
    },
  });

  // ── Alle Konten der Liegenschaft (Filter erfolgt clientseitig) ────
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["wp-accounts-manual-all", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category, default_distribution_key, settlement_section, is_distributable, is_reserve_funded, reserve_role, is_wirtschaftsplan_relevant")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // ── Liegenschafts-spezifische Verteilerschlüssel-Overrides ────────
  // Werden im "Verteilerschlüssel"-Tab des Gebäudes gepflegt und
  // überschreiben den default_distribution_key des globalen Kontos.
  const { data: accountOverrides = [] } = useQuery({
    queryKey: ["building-account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_account_overrides" as any)
        .select("account_id, distribution_key")
        .eq("building_id", buildingId);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const overrideKeyByAccount = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of accountOverrides) if (o.distribution_key) m.set(o.account_id, o.distribution_key);
    return m;
  }, [accountOverrides]);

  // ── Vorjahres-IST aus Buchungen (bank-zentrische Aggregation) ─────
  const { data: prevYearBookings = [] } = useQuery({
    queryKey: ["wp-prev-year-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_category")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear - 1)
        .neq("status", "cancelled");
      if (error) throw error;
      return data || [];
    },
  });

  // ── Vorjahres-Brunata-Werte (für Hochrechnung Konto 1400 / heizk_abr) ──
  const { data: heatingPrev = [] } = useQuery({
    queryKey: ["wp-heating-distribution-prev", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: period } = await supabase
        .from("billing_periods")
        .select("id")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear - 1)
        .maybeSingle();
      if (!period?.id) return [];
      const { data, error } = await supabase
        .from("heating_distribution_values")
        .select("assignment_id, amount")
        .eq("billing_period_id", period.id);
      if (error) throw error;
      return data || [];
    },
  });

  const heatingByAssignment = useMemo(() => {
    const m: Record<string, number> = {};
    (heatingPrev as any[]).forEach((h) => { m[h.assignment_id] = Number(h.amount) || 0; });
    return m;
  }, [heatingPrev]);

  const heatingTotal = useMemo(
    () => Object.values(heatingByAssignment).reduce((s, v) => s + v, 0),
    [heatingByAssignment]
  );

  const sumForAccount = (accId: string): number => {
    return (prevYearBookings as any[]).reduce((s, b) => {
      if (b.booking_category === "heating_repost") return s;
      const amt = Number(b.amount) || 0;
      if (b.account_id === accId) return s + amt;
      if (b.counter_account_id === accId) return s - amt;
      return s;
    }, 0);
  };

  // Effektive Konten: Default = WP-relevant ODER Vorjahres-Saldo ≠ 0.
  // "Alle anzeigen" zeigt sämtliche Konten der Liegenschaft.
  const accounts = useMemo(() => {
    if (showAllAccounts) return allAccounts as any[];
    return (allAccounts as any[]).filter((a) => {
      if (a.is_wirtschaftsplan_relevant) return true;
      return Math.abs(sumForAccount(a.id)) > 0.005;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAccounts, showAllAccounts, prevYearBookings]);

  // Toggle: Konto WP-relevant ja/nein (persistiert global)
  const toggleWpRelevance = async (accountId: string, value: boolean) => {
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({ is_wirtschaftsplan_relevant: value })
      .eq("id", accountId);
    if (error) { toast.error("Fehler: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["wp-accounts-manual-all", buildingId] });
    qc.invalidateQueries({ queryKey: ["chart-of-accounts"] });
  };

  // Umlageschlüssel pro Konto in dieser Liegenschaft setzen (Override).
  // Nicht im chart_of_accounts ändern — Default bleibt global.
  const setDistributionKey = async (accountId: string, key: string) => {
    const existing = accountOverrides.find((o: any) => o.account_id === accountId);
    if (existing) {
      const { error } = await supabase
        .from("building_account_overrides" as any)
        .update({ distribution_key: key } as any)
        .eq("building_id", buildingId)
        .eq("account_id", accountId);
      if (error) { toast.error("Fehler: " + error.message); return; }
    } else {
      const { error } = await supabase
        .from("building_account_overrides" as any)
        .insert({ building_id: buildingId, account_id: accountId, distribution_key: key } as any);
      if (error) { toast.error("Fehler: " + error.message); return; }
    }
    // Bestehende Plan-Items auf den neuen Schlüssel updaten, damit Einzelplan
    // sofort frisch verteilt — Override ist autoritativ, alte items sind veraltet.
    if (plan?.id) {
      await supabase
        .from("economic_plan_items" as any)
        .update({ distribution_key: key } as any)
        .eq("plan_id", plan.id)
        .eq("account_id", accountId);
    }
    qc.invalidateQueries({ queryKey: ["building-account-overrides", buildingId] });
    qc.invalidateQueries({ queryKey: ["manual-plan", buildingId, fiscalYear] });
  };


  const { data: assignmentsRaw = [] } = useQuery({
    queryKey: ["mep-assignments", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, unit_number, contact_id, unit_kind, billing_mode, parent_assignment_id, area_sqm_override,
          contacts(first_name, last_name, company_name),
          contact_building_shares(share_type, share_value)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer"]);
      if (error) throw error;
      return data;
    },
  });

  // ── Wohnfläche der Liegenschaft (Σ area_sqm_override) ─────────────
  const totalAreaSqm = useMemo(() => {
    return (assignmentsRaw as any[]).reduce((s, a) => {
      const v = Number(a.area_sqm_override || 0);
      return s + (isFinite(v) ? v : 0);
    }, 0);
  }, [assignmentsRaw]);

  // Nebeneinheiten (Stellplätze etc.) bekommen keine eigene Plan-Zeile.
  // Ihre MEA wird auf die Hauptwohnung des selben Eigentümers in diesem Building aufgeschlagen.
  const assignments = (assignmentsRaw as any[]).filter(
    (a) => a?.billing_mode !== "distribution_only" && (!a?.unit_kind || a.unit_kind === "apartment")
  );
  const extraMeaByContact = (() => {
    const m = new Map<string, number>();
    for (const a of (assignmentsRaw as any[])) {
      const isSec = a?.billing_mode === "distribution_only" || (a?.unit_kind && a.unit_kind !== "apartment");
      if (!isSec || !a.contact_id) continue;
      const v = (a.contact_building_shares || []).find((sh: any) => sh.share_type === "mea");
      m.set(a.contact_id, (m.get(a.contact_id) || 0) + (v ? Number(v.share_value) : 0));
    }
    return m;
  })();

  // ── Unit overrides ────────────────────────────────────────────────
  const { data: unitItems = [] } = useQuery({
    queryKey: ["mep-unit-items", plan?.id],
    queryFn: async () => {
      if (!plan?.id) return [];
      const { data, error } = await supabase
        .from("economic_plan_unit_items" as any)
        .select("*")
        .eq("plan_id", plan.id);
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!plan?.id,
  });

  // ── Build rows: merged plan items + accounts ──────────────────────
  // WICHTIG: Der gebäudespezifische Verteilerschlüssel (override) bzw. der
  // aktuelle default_distribution_key des Kontos hat IMMER Vorrang vor einem
  // ggf. veralteten distribution_key in einem economic_plan_items-Datensatz.
  // Dadurch wirken Änderungen im Kontenrahmen sofort auf bestehende Pläne.
  const rows: PlanRow[] = useMemo(() => {
    const items = (plan?.economic_plan_items || []) as any[];
    return accounts.map((acc: any) => {
      const item = items.find((i) => i.account_id === acc.id);
      const draft = drafts[acc.id];
      const effectiveDefaultKey = overrideKeyByAccount.get(acc.id) || acc.default_distribution_key || "mea";
      return {
        account_id: acc.id,
        account_number: acc.account_number,
        account_name: acc.account_name,
        category: acc.settlement_section || acc.category || "Sonstige",
        // Override / aktueller Konten-Default gewinnt — alte Plan-Items werden ignoriert.
        distribution_key: effectiveDefaultKey,
        planned_amount: draft !== undefined ? draft : Number(item?.planned_amount || 0),
        manually_overridden: draft !== undefined || !!item?.manually_overridden,
        isDistributable: !!acc.is_distributable,
        isReserve: isReserveContributionAccount(acc),
        previousAmount: sumForAccount(acc.id),
      } as PlanRow;
    });
  }, [accounts, plan, drafts, prevYearBookings, overrideKeyByAccount]);

  const totalPlanned = rows.reduce((s, r) => s + r.planned_amount, 0);
  const distributableTotal = rows.filter((r) => r.isDistributable).reduce((s, r) => s + r.planned_amount, 0);

  // ── Auto-save (debounced) ─────────────────────────────────────────
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "pending" | "saved">("idle");

  const flushSave = async () => {
    if (!plan?.id) return;
    setSavingState("pending");

    const items = (plan.economic_plan_items || []) as any[];
    const ops: Promise<any>[] = [];
    for (const acc of accounts as any[]) {
      const draftVal = drafts[acc.id];
      if (draftVal === undefined) continue;
      const effKey = overrideKeyByAccount.get(acc.id) || acc.default_distribution_key || "mea";
      const existing = items.find((i) => i.account_id === acc.id);
      if (existing) {
        ops.push(Promise.resolve(
          supabase.from("economic_plan_items" as any)
            .update({ planned_amount: draftVal, distribution_key: effKey, manually_overridden: true } as any)
            .eq("id", existing.id),
        ));
      } else {
        ops.push(Promise.resolve(
          supabase.from("economic_plan_items" as any).insert({
            plan_id: plan.id,
            account_id: acc.id,
            previous_amount: 0,
            planned_amount: draftVal,
            distribution_key: effKey,
            manually_overridden: true,
          } as any),
        ));
      }
    }

    // Update plan totals
    const newTotal = rows.reduce((s, r) => s + r.planned_amount, 0);
    ops.push(Promise.resolve(
      supabase.from("economic_plans" as any)
        .update({ total_costs: newTotal } as any)
        .eq("id", plan.id),
    ));

    await Promise.all(ops);
    setDrafts({});
    qc.invalidateQueries({ queryKey: ["manual-plan", buildingId, fiscalYear] });
    setSavingState("saved");
    setTimeout(() => setSavingState("idle"), 1500);
  };

  useEffect(() => {
    if (Object.keys(drafts).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // ── Auto-save unit overrides (debounced) ──────────────────────────
  const unitSaveTimer = useRef<NodeJS.Timeout | null>(null);

  const flushUnitSave = async () => {
    if (!plan?.id) return;
    const ops: Promise<any>[] = [];
    Object.entries(unitDrafts).forEach(([key, amount]) => {
      const [unitId, accountId] = key.split("|");
      const existing = unitItems.find((u: any) => u.unit_id === unitId && u.account_id === accountId);
      if (existing) {
        ops.push(Promise.resolve(
          supabase.from("economic_plan_unit_items" as any)
            .update({ amount, manually_overridden: true, updated_by: user?.id } as any)
            .eq("id", existing.id),
        ));
      } else {
        ops.push(Promise.resolve(
          supabase.from("economic_plan_unit_items" as any).insert({
            plan_id: plan.id,
            unit_id: unitId,
            account_id: accountId,
            amount,
            manually_overridden: true,
            created_by: user?.id,
          } as any),
        ));
      }
    });
    await Promise.all(ops);
    setUnitDrafts({});
    qc.invalidateQueries({ queryKey: ["mep-unit-items", plan.id] });
  };

  useEffect(() => {
    if (Object.keys(unitDrafts).length === 0) return;
    if (unitSaveTimer.current) clearTimeout(unitSaveTimer.current);
    unitSaveTimer.current = setTimeout(() => { flushUnitSave(); }, 800);
    return () => { if (unitSaveTimer.current) clearTimeout(unitSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitDrafts]);

  // ── Activate plan ─────────────────────────────────────────────────
  const activate = useMutation({
    mutationFn: async () => {
      if (!plan?.id) throw new Error("Kein Plan zum Aktivieren");
      // Flush pending edits first
      if (Object.keys(drafts).length > 0) await flushSave();
      if (Object.keys(unitDrafts).length > 0) await flushUnitSave();
      const { error } = await supabase
        .from("economic_plans" as any)
        .update({ status: "active", activated_by: user?.id } as any)
        .eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wirtschaftsplan aktiviert");
      qc.invalidateQueries({ queryKey: ["manual-plan", buildingId, fiscalYear] });
    },
    onError: (e: any) => toast.error("Aktivierung fehlgeschlagen: " + e.message),
  });

  // ── Reset single value to 0 ───────────────────────────────────────
  const resetValue = async (accountId: string) => {
    const items = (plan?.economic_plan_items || []) as any[];
    const existing = items.find((i) => i.account_id === accountId);
    if (existing) {
      await supabase.from("economic_plan_items" as any).delete().eq("id", existing.id);
      qc.invalidateQueries({ queryKey: ["manual-plan", buildingId, fiscalYear] });
    }
    setDrafts((p) => {
      const n = { ...p }; delete n[accountId]; return n;
    });
  };

  // ── Maps für Verteilungsschlüssel ─────────────────────────────────
  // Pro Schlüssel-Typ: Σ aller Anteile in der Liegenschaft.
  // Berücksichtigt Nebeneinheiten (z.B. Stellplätze für 'stellplaetze').
  const shareTotals = useMemo(() => {
    const totals: Record<string, number> = { mea: 0, stellplaetze: 0, einheit: 0, qm: 0, personen: 0 };
    for (const a of (assignmentsRaw as any[])) {
      const isApartment = (!a.unit_kind || a.unit_kind === "apartment" || a.unit_kind === "commercial") && a.billing_mode !== "distribution_only";
      const area = Number(a.area_sqm_override || 0);
      if (isApartment) {
        totals.einheit += 1;
        if (area > 0) totals.qm += area;
      }
      for (const sh of (a.contact_building_shares || [])) {
        const t = String(sh.share_type || "").toLowerCase();
        const v = Number(sh.share_value) || 0;
        // WICHTIG: MEA, Whg.-MEA, Gar.-MEA, Sonder-MEA sind EIGENSTÄNDIGE
        // Verteilerschlüssel und dürfen NICHT zur "mea"-Summe addiert werden.
        if (t === "mea") totals.mea += v;
        else if (t === "stellplaetze") totals.stellplaetze += v;
        else if (t === "personen") totals.personen += v;
        // 'einheit'/'einheiten' werden bereits über isApartment gezählt → hier ignorieren
        else if (t === "einheit" || t === "einheiten" || t === "qm") { /* skip */ }
        // Custom-Schlüssel (whg.-mea, gar.-mea, sonder-mea, …) separat tracken
        else if (t) totals[t] = (totals[t] || 0) + v;
      }
    }
    return totals;
  }, [assignmentsRaw]);

  // Schlüssel auf intern normalisieren
  const normalizeKey = (k?: string | null): string => {
    const v = String(k || "mea").toLowerCase();
    if (v === "einheiten") return "einheit";
    if (
      v === "verbrauch_heizung" ||
      v === "heizk.abr" ||
      v === "heizk_abr" ||
      v === "heizkostenverordnung" ||
      v === "heizkostenv" ||
      v === "heating_individual" ||
      v === "heizkosten"
    ) return "heizk_abr";
    return v;
  };

  // Anteil eines Owners für einen bestimmten Schlüssel ermitteln
  const ownerShareValue = (assignmentRaw: any, key: string, ownContactId?: string | null): number => {
    const k = normalizeKey(key);
    if (k === "einheit") return 1;
    if (k === "qm") return Number(assignmentRaw?.area_sqm_override || 0);

    // Eigene + Nebeneinheiten desselben Eigentümers (für stellplaetze/mea)
    const collectFor = (a: any, types: string[]) =>
      (a?.contact_building_shares || []).filter((sh: any) =>
        types.map((t) => t.toLowerCase()).includes(String(sh.share_type || "").toLowerCase())
      ).reduce((s: number, sh: any) => s + (Number(sh.share_value) || 0), 0);

    // Strikte 1:1-Zuordnung: jeder Schlüssel zählt nur seinen eigenen share_type.
    // Whg.-MEA / Gar.-MEA / Sonder-MEA sind separate Custom-Schlüssel.
    const types = [k];

    let sum = collectFor(assignmentRaw, types);
    // Nebeneinheiten desselben Owners hinzuaddieren (gleiches Building)
    if (ownContactId) {
      for (const a of (assignmentsRaw as any[])) {
        if (a.id === assignmentRaw.id) continue;
        if (a.contact_id !== ownContactId) continue;
        const isSec = a?.billing_mode === "distribution_only" || (a?.unit_kind && a.unit_kind !== "apartment");
        if (!isSec) continue;
        sum += collectFor(a, types);
      }
    }
    return sum;
  };

  // ── Owner plan calculations (Anteile für Sidebar/MEA-Quote) ──────
  const ownerData = useMemo(() => {
    const meaTotal = shareTotals.mea || 1;
    return assignments.map((a: any) => {
      const c = a.contacts;
      const name = c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "–";
      const meaValue = ownerShareValue(a, "mea", a.contact_id);
      const proportion = meaValue / meaTotal;
      return { id: a.id, name, unitNumber: a.unit_number || "–", meaValue, proportion, raw: a };
    });
  }, [assignments, shareTotals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unit-row builder: pro Konto den richtigen Schlüssel anwenden ──
  const buildUnitRows = (unitId: string): PlanRow[] => {
    const ownerEntry = ownerData.find((o) => o.id === unitId);
    if (!ownerEntry) return [];
    const a = ownerEntry.raw;
    return rows.map((r) => {
      const overrideKey = `${unitId}|${r.account_id}`;
      const draftOverride = unitDrafts[overrideKey];
      const dbOverride = unitItems.find((u: any) => u.unit_id === unitId && u.account_id === r.account_id);
      const overrideAmount = draftOverride !== undefined ? draftOverride : (dbOverride ? Number(dbOverride.amount) : null);
      const isOverridden = overrideAmount !== null;

      const key = normalizeKey(r.distribution_key);
      // Generischer Lookup über shareTotals — Custom-Schlüssel (whg.-mea, gar.-mea, sonder-mea …)
      // werden in shareTotals separat unter ihrem eigenen Key geführt.
      const totalShareForKey = key === "heizk_abr"
        ? (heatingTotal > 0 ? heatingTotal : 0)
        : key === "einheit"
          ? (shareTotals.einheit || 1)
          : key === "qm"
            ? (shareTotals.qm || 1)
            : (shareTotals[key] && shareTotals[key] > 0 ? shareTotals[key] : (shareTotals.mea || 1));
      const yourShareValue = key === "heizk_abr"
        ? (heatingByAssignment[unitId] ?? 0) // Brunata-Vorjahreswert dieser Einheit
        : ownerShareValue(a, key, a.contact_id);
      const proportion = key === "heizk_abr"
        ? (heatingTotal > 0 ? yourShareValue / heatingTotal : 0)
        : (totalShareForKey > 0 ? yourShareValue / totalShareForKey : 0);

      const calculated = r.planned_amount * proportion;
      return {
        ...r,
        planned_amount: isOverridden ? overrideAmount! : calculated,
        manually_overridden: isOverridden,
        totalShare: totalShareForKey,
        yourShare: yourShareValue,
        totalAmount: r.planned_amount,
      };
    });
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loadingPlan || !plan) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade Wirtschaftsplan…
        </CardContent>
      </Card>
    );
  }

  const isActive = plan.status === "active";
  const periodLabel = `01.01.${fiscalYear} – 31.12.${fiscalYear}`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Wirtschaftsplan {fiscalYear}</h2>
            <Badge variant={isActive ? "default" : "outline"}>
              {isActive ? "Aktiv" : plan.status === "archived" ? "Archiviert" : "Entwurf"}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {plan.source === "manual" ? "Manuell erstellt" : plan.source === "previous_year" ? "Aus Vorjahr" : "ETV-Beschluss"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {savingState === "pending" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Speichern…
              </span>
            )}
            {savingState === "saved" && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Gespeichert
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            >
              {mode === "edit" ? <Eye className="h-4 w-4 mr-1" /> : <Edit3 className="h-4 w-4 mr-1" />}
              {mode === "edit" ? "Vorschau" : "Bearbeiten"}
            </Button>
            {!isActive && (
              <Button
                size="sm"
                onClick={() => activate.mutate()}
                disabled={activate.isPending || totalPlanned === 0}
              >
                {activate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Plan aktivieren
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="gesamt">
          <TabsList>
            <TabsTrigger value="gesamt">Gesamtwirtschaftsplan</TabsTrigger>
            <TabsTrigger value="einzel">Einzelwirtschaftspläne ({ownerData.length})</TabsTrigger>
          </TabsList>

          {/* ── Tab: Gesamtplan ─────────────────────────────────── */}
          <TabsContent value="gesamt" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Es werden <strong>{accounts.length}</strong> Konten angezeigt
                {showAllAccounts ? " (alle Konten der Liegenschaft)" : " (relevant oder mit Vorjahres-Saldo)"}.
              </div>
              <div className="flex items-center gap-2">
                <Switch id="wp-show-all" checked={showAllAccounts} onCheckedChange={setShowAllAccounts} />
                <Label htmlFor="wp-show-all" className="text-xs cursor-pointer">Alle Konten anzeigen</Label>
              </div>
            </div>

            <EconomicPlanLayout
              title={`Gesamtwirtschaftsplan ${fiscalYear}`}
              subtitle={`Wirtschaftszeitraum: ${periodLabel}`}
              buildingName={building?.name}
              rows={rows}
              renderAmountCell={mode === "edit" ? (row) => (
                <div className="flex items-center gap-1 justify-end">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={row.planned_amount === 0 ? "" : row.planned_amount}
                    placeholder="0,00"
                    className="h-7 w-28 text-right font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                      setDrafts((p) => ({ ...p, [row.account_id]: v }));
                    }}
                  />
                  <span className="text-muted-foreground text-xs">€</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const v = Number(row.planned_amount) || 0;
                          const rounded = Math.sign(v) * Math.ceil(Math.abs(v));
                          setDrafts((p) => ({ ...p, [row.account_id]: rounded }));
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Aufrunden auf ganze €</TooltipContent>
                  </Tooltip>
                </div>
              ) : undefined}
              onPreviousAmountClick={mode === "edit" ? (row) => {
                const prev = Number(row.previousAmount || 0);
                if (!prev) return;
                setDrafts((p) => ({ ...p, [row.account_id]: prev }));
              } : undefined}
              renderDistKeyCell={mode === "edit" ? (row) => (
                <Select
                  value={String(row.distribution_key || "mea")}
                  onValueChange={(v) => setDistributionKey(row.account_id, v)}
                >
                  <SelectTrigger className="h-7 text-xs w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined}
              secondaryColumn={mode === "edit" ? {
                label: "WP-relevant",
                render: (row) => {
                  const acc = (allAccounts as any[]).find((a) => a.id === row.account_id);
                  const checked = !!acc?.is_wirtschaftsplan_relevant;
                  return (
                    <div className="flex items-center justify-end">
                      <Switch
                        checked={checked}
                        onCheckedChange={(v) => toggleWpRelevance(row.account_id, v)}
                      />
                    </div>
                  );
                },
              } : undefined}
              renderActionCell={mode === "edit" ? (row) => (
                row.manually_overridden && row.planned_amount > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => resetValue(row.account_id)}>
                        <RotateCcw className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Auf 0 zurücksetzen</TooltipContent>
                  </Tooltip>
                ) : null
              ) : undefined}
              variant="gesamt"
              footer={{
                distributableTotal,
                totalAreaSqm,
              }}
            />

            {totalPlanned === 0 && mode === "edit" && (
              <Card className="mt-3 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="py-3 px-4 flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-200">Plan ist leer</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Trage in jeder Zeile den geplanten Jahresbetrag ein. Auto-Save speichert nach 0,8 s.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Tab: Einzelpläne ────────────────────────────────── */}
          <TabsContent value="einzel" className="mt-4">
            {ownerData.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Keine Eigentümer mit MEA hinterlegt. Bitte zuerst im Adressbereich pflegen.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
                {/* Owner list */}
                <Card>
                  <CardContent className="p-2 space-y-1">
                    {ownerData.map((o) => {
                      const sel = selectedUnitId === o.id || (selectedUnitId === null && o === ownerData[0]);
                      return (
                        <button
                          key={o.id}
                          onClick={() => setSelectedUnitId(o.id)}
                          className={cn(
                            "w-full text-left rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors",
                            sel && "bg-muted font-medium",
                          )}
                        >
                          <div className="font-medium truncate">{o.name}</div>
                          <div className="text-xs text-muted-foreground">
                            WE {o.unitNumber} · {(o.proportion * 100).toFixed(2)}% MEA
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Owner detail */}
                {(() => {
                  const owner = ownerData.find((o) => o.id === selectedUnitId) || ownerData[0];
                  if (!owner) return null;
                  const unitRows = buildUnitRows(owner.id);
                  const ownerTotal = unitRows.reduce((s, r) => s + r.planned_amount, 0);
                  const ownerReserveTotal = unitRows.filter((r) => r.isReserve).reduce((s, r) => s + r.planned_amount, 0);
                  const ownerAdvanceTotal = ownerTotal - ownerReserveTotal;
                  const calculatedTotal = totalPlanned * owner.proportion;
                  const deviation = ownerTotal - calculatedTotal;

                  return (
                    <div className="space-y-3">
                      {Math.abs(deviation) > 0.01 && (
                        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                          <CardContent className="py-2 px-3 flex items-center gap-2 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-amber-900 dark:text-amber-200">
                              Σ Einzelplan ({formatCurrency(ownerTotal)}) weicht von linearer MEA-Quote
                              ({formatCurrency(calculatedTotal)}) um {formatCurrency(deviation)} ab — i.d.R. korrekt, weil je Konto unterschiedliche Schlüssel angewendet werden.
                            </span>
                          </CardContent>
                        </Card>
                      )}

                      <EconomicPlanLayout
                        title={`Einzelwirtschaftsplan – ${owner.name}`}
                        subtitle={`WE ${owner.unitNumber} · ${(owner.proportion * 100).toFixed(2)}% MEA · ${periodLabel}`}
                        buildingName={building?.name}
                        rows={unitRows}
                        variant="einzel"
                        footer={{ ownerTotal, ownerReserveTotal, ownerAdvanceTotal }}
                        renderAmountCell={(row) => {
                          const key = normalizeKey(row.distribution_key);
                          const noHeatingData = key === "heizk_abr" && heatingTotal === 0;
                          return (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={row.planned_amount === 0 ? "" : Number(row.planned_amount.toFixed(2))}
                                placeholder={noHeatingData ? "manuell" : "0,00"}
                                className={cn(
                                  "h-7 w-28 text-right font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                  !row.manually_overridden && !noHeatingData && "text-muted-foreground italic",
                                  noHeatingData && !row.manually_overridden && "border-amber-300",
                                )}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                                  setUnitDrafts((p) => ({ ...p, [`${owner.id}|${row.account_id}`]: v }));
                                }}
                              />
                              <span className="text-muted-foreground text-xs">€</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      const v = Number(row.planned_amount) || 0;
                                      const rounded = Math.sign(v) * Math.ceil(Math.abs(v));
                                      setUnitDrafts((p) => ({ ...p, [`${owner.id}|${row.account_id}`]: rounded }));
                                    }}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aufrunden auf ganze €</TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        }}
                        renderActionCell={(row) => (
                          row.manually_overridden ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={async () => {
                                    const dbOverride = unitItems.find((u: any) => u.unit_id === owner.id && u.account_id === row.account_id);
                                    if (dbOverride) {
                                      await supabase.from("economic_plan_unit_items" as any).delete().eq("id", dbOverride.id);
                                      qc.invalidateQueries({ queryKey: ["mep-unit-items", plan.id] });
                                    }
                                    setUnitDrafts((p) => {
                                      const n = { ...p }; delete n[`${owner.id}|${row.account_id}`]; return n;
                                    });
                                  }}
                                >
                                  <RotateCcw className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Override entfernen → berechneter Anteil</TooltipContent>
                            </Tooltip>
                          ) : null
                        )}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
