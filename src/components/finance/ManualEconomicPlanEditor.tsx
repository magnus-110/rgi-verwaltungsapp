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
import { SUPABASE_FUNCTIONS_URL } from "@/integrations/supabase/functions-url";
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
import { useDmsJobs, type DmsJobItem } from "@/contexts/DmsJobsProvider";
import { unitFilePrefix } from "@/lib/unitFilePrefix";
import { berechneWirtschaftsplan, normalizeKey } from "@shared/finanzen/wirtschaftsplan.ts";
import { HausgeldUebernehmen, type HausgeldWert } from "./HausgeldUebernehmen";

/** Einheitennummer eines Eigentümer-Datensatzes (ohne Platzhalter "–"). */
const unitNo = (o: any): string => {
  const u = String(o?.unitNumber || "").trim();
  return u && u !== "–" ? u : "";
};

interface Props {
  buildingId: string;
  fiscalYear: number;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

export function ManualEconomicPlanEditor({ buildingId, fiscalYear }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { enqueue: enqueueDms } = useDmsJobs();
  const mode = "edit" as const;
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Local edit cache (account_id → planned_amount)
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  // Local edit cache for unit overrides ("unit:account" → amount)
  const [unitDrafts, setUnitDrafts] = useState<Record<string, number>>({});
  // Per-Owner Override: monatliche Gesamt-Belastung (aufgerundet)
  const [monthlyTotalOverrides, setMonthlyTotalOverrides] = useState<Record<string, number>>({});
  // Per-Owner Override: monatlicher Vorschuss (Hausgeld)
  const [monthlyAdvanceOverrides, setMonthlyAdvanceOverrides] = useState<Record<string, number>>({});

  // ── Building info ─────────────────────────────────────────────────
  const { data: building } = useQuery({
    queryKey: ["building-info-mep", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings").select("name, address, postal_code, city, manager_name").eq("id", buildingId).single();
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

  // ── Overrides aus plan.adjustments laden (einmalig pro Plan) ──────
  const overridesLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!plan?.id || overridesLoadedRef.current === plan.id) return;
    const adj: any = (plan as any).adjustments || {};
    if (adj.monthlyTotalOverrides && typeof adj.monthlyTotalOverrides === "object") {
      setMonthlyTotalOverrides(adj.monthlyTotalOverrides);
    }
    if (adj.monthlyAdvanceOverrides && typeof adj.monthlyAdvanceOverrides === "object") {
      setMonthlyAdvanceOverrides(adj.monthlyAdvanceOverrides);
    }
    overridesLoadedRef.current = plan.id;
  }, [plan?.id]);

  // ── Overrides persistieren (debounced) ────────────────────────────
  useEffect(() => {
    if (!plan?.id || overridesLoadedRef.current !== plan.id) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("economic_plans" as any)
        .update({
          adjustments: { monthlyTotalOverrides, monthlyAdvanceOverrides },
        } as any)
        .eq("id", plan.id);
      if (error) {
        toast.error("Speichern fehlgeschlagen: " + error.message);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [plan?.id, monthlyTotalOverrides, monthlyAdvanceOverrides]);



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
          id, unit_number, floor_location, contact_id, unit_kind, billing_mode, parent_assignment_id, area_sqm_override,
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

  // ── Berechnung: gemeinsam mit dem Server (Claude-Konnektor) ───────
  // Quelle: supabase/functions/_shared/finanzen/wirtschaftsplan.ts
  const wp = useMemo(
    () =>
      berechneWirtschaftsplan(
        { building: building as any, plan, allAccounts: allAccounts as any[], accountOverrides, prevYearBookings: prevYearBookings as any[], heatingPrev: heatingPrev as any[], assignmentsRaw: assignmentsRaw as any[], unitItems: unitItems as any[] },
        { fiscalYear, showAllAccounts, drafts, unitDrafts, monthlyTotalOverrides, monthlyAdvanceOverrides },
      ),
    [building, plan, allAccounts, accountOverrides, prevYearBookings, heatingPrev, assignmentsRaw, unitItems, fiscalYear, showAllAccounts, drafts, unitDrafts, monthlyTotalOverrides, monthlyAdvanceOverrides],
  );
  const {
    heatingByAssignment, heatingTotal, sumForAccount, accounts, totalAreaSqm, assignments, totalPlanned, distributableTotal,
    shareTotals, ownerShareValue, ownerData, buildUnitRows, buildOverallPlanPayload, buildOwnerPlanPayload, hausgeldWerte,
  } = wp;
  const rows = wp.rows as PlanRow[];

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

    // Update plan totals (immer als positiver Gesamtbetrag)
    const newTotal = rows.reduce((s, r) => s + Math.abs(r.planned_amount), 0);
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

  // ── Deactivate plan (zurück auf Entwurf) ──────────────────────────
  const deactivate = useMutation({
    mutationFn: async () => {
      if (!plan?.id) throw new Error("Kein Plan zum Deaktivieren");
      const { error } = await supabase
        .from("economic_plans" as any)
        .update({ status: "draft", activated_by: null } as any)
        .eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wirtschaftsplan auf Entwurf zurückgesetzt");
      qc.invalidateQueries({ queryKey: ["manual-plan", buildingId, fiscalYear] });
    },
    onError: (e: any) => toast.error("Deaktivierung fehlgeschlagen: " + e.message),
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

  // ── Download-Handler (vom globalen "Dokumente"-Dialog ausgelöst) ──

  const sanitizeFilename = (s: string) =>
    (s || "").normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);

  const triggerDownload = (bytes: Blob, filename: string, mime: string) => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        target: string;
        format: "docx" | "pdf" | "dms";
        template_id: string;
      };
      if (!detail) return;
      if (detail.target !== "economic_plan_overall" && detail.target !== "economic_plan_single") return;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Bitte erneut anmelden.");

        const isSingle = detail.target === "economic_plan_single";

        // DMS-Modus: Job in globale Hintergrund-Queue einreihen.
        if (detail.format === "dms") {
          if (!isSingle) {
            enqueueDms(`Wirtschaftsplan ${fiscalYear}`, [{
              title: `Gesamtwirtschaftsplan ${fiscalYear}`,
              edgeFn: "generate-billing-document",
              body: {
                template_id: detail.template_id, fiscal_year: fiscalYear,
                mode: "single", format: "pdf",
                file_prefix: `Gesamtwirtschaftsplan_${fiscalYear}`,
                items: [{ kind: "overall", payload: buildOverallPlanPayload() }],
              },
              displayName: `Gesamtwirtschaftsplan_${fiscalYear}`,
              folderKey: "wirtschaftsplan_gesamt",
              visibility: "alle",
              buildingId, periodId: null, managementMode: "weg", fiscalYear,
            }]);
          } else {
            if (ownerData.length === 0) { toast.error("Keine Eigentümer gefunden."); return; }
            const jobItems: DmsJobItem[] = ownerData.map((o) => ({
              title: o.name,
              edgeFn: "generate-billing-document",
              body: {
                template_id: detail.template_id, fiscal_year: fiscalYear,
                mode: "single", format: "pdf",
                file_prefix: `Einzelwirtschaftsplan_${fiscalYear}`,
                items: [{ kind: "owner", ownerId: o.id, ownerName: o.name, unitNumber: unitNo(o), payload: buildOwnerPlanPayload(o.id) }],
              },
              displayName: `${unitFilePrefix(unitNo(o))}Einzelwirtschaftsplan_${fiscalYear}_${o.name}${unitNo(o) ? `_${unitNo(o)}` : ""}`,
              folderKey: "wirtschaftsplan_einzel",
              visibility: "eigentuemer_only",
              contactId: (o as any).raw?.contact_id || null,
              buildingId, periodId: null, managementMode: "weg", fiscalYear,
            }));
            enqueueDms(`Einzelwirtschaftspläne ${fiscalYear}`, jobItems);
          }
          return;
        }


        const filePrefix = isSingle ? `Einzelwirtschaftsplan_${fiscalYear}` : `Gesamtwirtschaftsplan_${fiscalYear}`;

        const fetchOne = async (requestBody: unknown): Promise<Blob> => {
          const resp = await fetch(
            `${SUPABASE_FUNCTIONS_URL}/generate-billing-document`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(requestBody),
            },
          );
          if (!resp.ok) {
            const msg = await resp.text();
            throw new Error(msg || `Export fehlgeschlagen (${resp.status})`);
          }
          return await resp.blob();
        };

        const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        if (!isSingle) {
          toast.message("Wirtschaftsplan wird erzeugt…");
          const blob = await fetchOne({
            template_id: detail.template_id,
            fiscal_year: fiscalYear,
            mode: "single",
            format: detail.format,
            file_prefix: filePrefix,
            items: [{ kind: "overall", payload: buildOverallPlanPayload() }],
          });
          triggerDownload(blob, `${filePrefix}.${detail.format}`, detail.format === "pdf" ? "application/pdf" : docxMime);
          toast.success("Download bereit");
          return;
        }

        // Einzelpläne: pro Eigentümer ein eigener, kleiner Funktionsaufruf und
        // ZIP im Browser bauen. Ein einzelner Sammel-Request lief bei vielen
        // Eigentümern in das Rechenlimit der Edge Function (WORKER_RESOURCE_LIMIT).
        if (ownerData.length === 0) {
          toast.error("Keine Eigentümer für Einzelpläne gefunden.");
          return;
        }
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const errors: string[] = [];
        for (let i = 0; i < ownerData.length; i++) {
          const o = ownerData[i];
          toast.message(`Wirtschaftsplan ${i + 1}/${ownerData.length}: ${o.name}…`);
          try {
            const blob = await fetchOne({
              template_id: detail.template_id,
              fiscal_year: fiscalYear,
              mode: "single",
              format: detail.format,
              file_prefix: filePrefix,
              items: [{ kind: "owner", ownerId: o.id, ownerName: o.name, unitNumber: unitNo(o), payload: buildOwnerPlanPayload(o.id) }],
            });
            const safeName = String(o.name || `Eigentuemer_${i + 1}`).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
            zip.file(`${unitFilePrefix(unitNo(o))}${filePrefix}_${safeName}${unitNo(o) ? `_${unitNo(o)}` : ""}.${detail.format}`, blob);
          } catch (err) {
            errors.push(`${o.name}: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
          }
        }
        if (errors.length > 0) zip.file("FEHLER.txt", errors.join("\n"));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, `${filePrefix}.zip`, "application/zip");
        toast.success(errors.length > 0 ? `Download bereit — ${errors.length} Plan/Pläne fehlgeschlagen (siehe FEHLER.txt im ZIP)` : "Download bereit");
      } catch (err: any) {
        toast.error("Fehler: " + (err?.message || "Unbekannt"));
      }
    };
    window.addEventListener("finance:request-download", handler as EventListener);
    return () => window.removeEventListener("finance:request-download", handler as EventListener);
  });

  // Synchroner Payload-Collector für den Sammelbericht-Trigger im BillingSettlement.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { payloads: Record<string, any>; errors?: string[] };
      if (!detail?.payloads) return;
      if (loadingPlan || !plan) {
        (detail.errors ||= []).push("Wirtschaftsplan noch nicht geladen — Tab kurz öffnen und erneut versuchen.");
        return;
      }
      try {
        detail.payloads.economic_plan_overall = buildOverallPlanPayload();
        detail.payloads.economic_plan_owners = ownerData.map((o) => ({
          ownerId: o.id,
          name: o.name,
          payload: buildOwnerPlanPayload(o.id),
        }));
      } catch (err: any) {
        (detail.errors ||= []).push(`Wirtschaftsplan: ${err?.message || err}`);
      }
    };
    window.addEventListener("finance:collect-combined-payload", handler as EventListener);
    return () => window.removeEventListener("finance:collect-combined-payload", handler as EventListener);
  });




  // Hausgeld je Eigentümer mitspeichern – die Dauerlastschrift übernimmt es von dort
  const hausgeldSchnappschuss = JSON.stringify(
    hausgeldWerte.map((w) => ({ ...w, monatlich: Math.round(w.monatlich * 100) / 100, ruecklage: Math.round(w.ruecklage * 100) / 100 })),
  );
  const gespeicherterSchnappschuss = useRef<string | null>(null);
  useEffect(() => {
    if (!plan?.id || !accounts.length || !hausgeldWerte.length || !hausgeldWerte.some((w) => w.monatlich > 0)) return;
    if (gespeicherterSchnappschuss.current === `${plan.id}|${hausgeldSchnappschuss}`) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("economic_plans" as any)
        .update({ hausgeld_je_eigentuemer: JSON.parse(hausgeldSchnappschuss), hausgeld_berechnet_am: new Date().toISOString() } as any)
        .eq("id", plan.id);
      if (!error) gespeicherterSchnappschuss.current = `${plan.id}|${hausgeldSchnappschuss}`;
    }, 1500);
    return () => clearTimeout(t);
  }, [plan?.id, hausgeldSchnappschuss, accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps


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
            {isActive && <HausgeldUebernehmen werte={hausgeldWerte} fiscalYear={fiscalYear} />}
            {isActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => deactivate.mutate()}
                disabled={deactivate.isPending}
              >
                {deactivate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                Aktivierung aufheben
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
                    value={row.planned_amount === 0 ? "" : Math.abs(Number(row.planned_amount))}
                    placeholder="0,00"
                    className="h-7 w-28 text-right font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value.replace(",", ".")) || 0;
                      const v = -Math.abs(raw);
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
                          // Immer auf die nächste volle 10er-Stelle aufrunden (bei jedem Klick +10 wenn schon glatt)
                          const abs = Math.abs(v);
                          const nextTen = Math.floor(abs / 10) * 10 + 10;
                          // Kosten werden immer negativ gespeichert
                          setDrafts((p) => ({ ...p, [row.account_id]: -nextTen }));
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Aufrunden auf nächste 10 €</TooltipContent>
                  </Tooltip>
                </div>
              ) : undefined}
              onPreviousAmountClick={mode === "edit" ? (row) => {
                const prev = Number(row.previousAmount || 0);
                if (!prev) return;
                // Vorjahres-IST als Kostenbetrag übernehmen → immer negativ
                setDrafts((p) => ({ ...p, [row.account_id]: -Math.abs(prev) }));
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
                row.manually_overridden && row.planned_amount !== 0 ? (
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
                  const unitRows = buildUnitRows(owner.id).filter((r) => r.isWpRelevant);
                  const ownerTotal = unitRows.reduce((s, r) => s + Math.abs(r.planned_amount), 0);
                  const ownerReserveTotal = unitRows.filter((r) => r.isReserve).reduce((s, r) => s + Math.abs(r.planned_amount), 0);
                  const ownerAdvanceTotal = ownerTotal - ownerReserveTotal;
                  const calculatedTotal = totalPlanned * owner.proportion;
                  const deviation = ownerTotal - calculatedTotal;

                  return (
                    <div className="space-y-3 min-w-0">
                      {/* gelbe Abweichungswarnung entfernt */}

                      <EconomicPlanLayout
                        title={`Einzelwirtschaftsplan – ${owner.name}`}
                        subtitle={`WE ${owner.unitNumber} · ${(owner.proportion * 100).toFixed(2)}% MEA · ${periodLabel}`}
                        buildingName={building?.name}
                        rows={unitRows}
                        variant="einzel"
                        footer={{
                          ownerTotal,
                          ownerReserveTotal,
                          ownerAdvanceTotal,
                          monthlyTotalOverride: monthlyTotalOverrides[owner.id] ?? null,
                          onMonthlyTotalRoundUp: () => {
                            const base = monthlyTotalOverrides[owner.id] ?? ownerTotal / 12;
                            const rounded = -Math.ceil(Math.abs(base));
                            setMonthlyTotalOverrides((p) => ({ ...p, [owner.id]: rounded }));
                          },
                          onMonthlyTotalReset: () => {
                            setMonthlyTotalOverrides((p) => {
                              const n = { ...p }; delete n[owner.id]; return n;
                            });
                          },
                          monthlyAdvanceOverride: monthlyAdvanceOverrides[owner.id] ?? null,
                          onMonthlyAdvanceChange: (v) => {
                            setMonthlyAdvanceOverrides((p) => {
                              const n = { ...p };
                              if (v == null) delete n[owner.id];
                              else n[owner.id] = v;
                              return n;
                            });
                          },
                        }}
                        renderAmountCell={(row) => {
                          const key = normalizeKey(row.distribution_key);
                          const noHeatingData = key === "heizk_abr" && heatingTotal === 0;
                          return (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={row.planned_amount === 0 ? "" : Number(Math.abs(row.planned_amount).toFixed(2))}
                                placeholder={noHeatingData ? "manuell" : "0,00"}
                                className={cn(
                                  "h-7 w-28 text-right font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                  noHeatingData && !row.manually_overridden && "border-amber-300",
                                )}
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value.replace(",", ".")) || 0;
                                  const v = -Math.abs(raw);
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
                                      const abs = Math.abs(v);
                                      const nextTen = Math.floor(abs / 10) * 10 + 10;
                                      // Kosten werden immer negativ gespeichert
                                      setUnitDrafts((p) => ({ ...p, [`${owner.id}|${row.account_id}`]: -nextTen }));
                                    }}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aufrunden auf nächste 10 €</TooltipContent>
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
