import { useState, useEffect, useMemo } from "react";
import { ErgebnisBeschliessen } from "./ErgebnisBeschliessen";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_FUNCTIONS_URL } from "@/integrations/supabase/functions-url";
import JSZip from "jszip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart3, ChevronDown, ChevronRight, Users, PiggyBank, AlertTriangle, Check, FileText, Building2, Loader2, Search, Download, Settings2, FileType, Receipt } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAccrualDisplaySign } from "./lib/accrualSign";
import { berechneAbrechnung, mergeDistributionOnlyShares, waehleAbrechnungsVorlagen } from "@shared/finanzen/abrechnung.ts";
import { dmsAblageGesamtabrechnung, dmsAblageEinzelabrechnung, dmsAblageVermoegensbericht } from "@shared/finanzen/dmsAblage.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { buildOverallPayload, buildOwnerPayload, buildAssetReportPayload } from "./lib/buildBillingPayload";
import {
  remapCommon,
  remapAbrechnungGesamt,
  remapAbrechnungEinzel,
  remapVermoegen,
  remapWirtschaftsplanGesamt,
  remapWirtschaftsplanEinzel,
  remapP35a,
} from "./lib/remapCombinedPayload";
import { AssetReportItemsCard } from "./AssetReportItemsCard";
import { AssetReportSection } from "./AssetReportSection";
import { ManualEconomicPlanEditor } from "./ManualEconomicPlanEditor";
import { Paragraph35aSection } from "./Paragraph35aSection";
import { FinanceDocumentsDialog } from "./FinanceDocumentsDialog";
import { useDmsJobs, type DmsJobItem } from "@/contexts/DmsJobsProvider";
import { unitFilePrefix } from "@/lib/unitFilePrefix";



interface BillingSettlementProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

// Verteilerschlüssel-Mapping (DIST_KEY_TO_SHARE / getShareType / SHARE_LABELS) liegt jetzt in
// supabase/functions/_shared/finanzen/abrechnung.ts.

const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Bewirtschaftungskosten",
  operating_non_distributable: "Nicht umlagefähige Kosten",
  heating: "Heizkosten (nach Brunata)",
  heating_prepayment: "Heizkosten-Vorauszahlungen (Durchlauf)",
  reserve: "Instandhaltungsrücklage",
  reserve_withdrawal: "Entnahme aus Rücklage",
  accrual: "Abgrenzungen (nachrichtlich, nicht verteilt)",
  bank: "Bankkonten",
  opening: "Eröffnungsbuchungen",
};

// Reihenfolge analog HV Office: Einnahmen → Bewirtschaftung → Heizkosten → Rücklage → Abgrenzungen (nachrichtlich).
// 'heating_prepayment' Konten (1431/1440/1470er) sind Durchlaufposten und werden per
// Repost auf 1400 umgebucht — sie erscheinen NICHT in der Abrechnung.
// 'opening' und 'bank' ebenfalls ausgeblendet.
const SECTION_ORDER = ["income", "operating_distributable", "operating_non_distributable", "heating", "reserve", "reserve_withdrawal", "accrual"];

export function BillingSettlement({ buildingId, periodId, fiscalYear }: BillingSettlementProps) {
  const queryClient = useQueryClient();
  const { enqueue: enqueueDms } = useDmsJobs();
  const [activeTab, setActiveTab] = useState("total");
  const [docsOpen, setDocsOpen] = useState(false);
  const [busyDownload, setBusyDownload] = useState<string | null>(null); // owner.assignmentId | "overall" | "all"
  // Vorlagen-Verwaltung läuft jetzt zentral über den "Dokumente"-Button im Finance-Header
  // (FinanceDocumentsDialog). Hier nur noch lesender Zugriff auf billing_templates.
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  const [useIstVorschuss, setUseIstVorschuss] = useState(false);
  const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);
  // Wirtschaftsplan-Jahr (Default: Folgejahr des aktuellen Abrechnungsjahrs).
  const [wpYear, setWpYear] = useState<number>(fiscalYear + 1);
  useEffect(() => { setWpYear(fiscalYear + 1); }, [fiscalYear]);

  // Period
  const { data: period } = useQuery({
    queryKey: ["billing-period-settlement", periodId],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_periods").select("*").eq("id", periodId).single();
      if (error) throw error;
      return data;
    },
  });

  // ALL accounts (not just billing-relevant — we need section-based filtering)
  const { data: accounts = [] } = useQuery({
    queryKey: ["settlement-accounts", buildingId],
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

  // Account overrides
  const { data: overrides = [] } = useQuery({
    queryKey: ["account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("building_account_overrides").select("*").eq("building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  // All bookings in the period — HV-Office-konform per booking_date filtern
  // (NICHT per fiscal_year, sonst fehlen Buchungen wie die Gas-Rückerstattung
  // 427,68 € vom 18.02.2025 mit fiscal_year=2024).
  const { data: rawBookings = [] } = useQuery({
    queryKey: ["settlement-bookings", buildingId, periodId],
    enabled: !!period,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_date, booking_type, booking_category, description, is_35a_relevant, fiscal_year")
        .eq("building_id", buildingId)
        .gte("booking_date", period!.period_from)
        .lte("booking_date", period!.period_to)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Defense-in-depth-Filter (nur Buchungen auf bekannten Konten) passiert in berechneAbrechnung.

  // IST-payments on person accounts (for SOLL/IST toggle)
  const { data: istPayments = [] } = useQuery({
    queryKey: ["ist-payments-settlement", buildingId, fiscalYear],
    enabled: useIstVorschuss,
    queryFn: async () => {
      // Get person accounts (account_number starts with 0000)
      const personAccounts = accounts.filter(a => a.account_number.startsWith("0000"));
      if (personAccounts.length === 0) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, counter_account_id, description")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .in("account_id", personAccounts.map(a => a.id));
      if (error) throw error;
      return data;
    },
  });

  // Owners with shares and costs
  // WICHTIG: Nebeneinheiten (Stellplätze, Keller, …) mit billing_mode='distribution_only'
  // bekommen KEINE eigene Abrechnungszeile. Ihre Shares (MEA, Einheit, qm, …) werden
  // unmittelbar nach dem Laden auf die Hauptwohnung des selben Eigentümers im Building
  // addiert, damit die bestehende Verteilungs-Logik unverändert greift.
  const { data: assignments = [] } = useQuery({
    queryKey: ["owner-assignments-settlement", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`*, contacts(id, first_name, last_name, company_name), contact_building_shares(*), contact_building_costs(*)`)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer", "mieter"]);
      if (error) throw error;
      // distribution_only-Merge — gemeinsam mit dem Server (abrechnung.ts)
      return mergeDistributionOnlyShares(data);
    },
  });

  // Building (for unit_count / unit_count_for_billing + CSV header)
  const { data: building } = useQuery({
    queryKey: ["settlement-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("name, address, building_code, unit_count, unit_count_for_billing")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Economic plan (for IHR contribution as planned reserve)
  const { data: economicPlan } = useQuery({
    queryKey: ["settlement-economic-plan", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("total_reserve")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });

  // Account balances
  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances-settlement", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  // Economic plan items for WP column
  const { data: wpItems = [] } = useQuery({
    queryKey: ["wp-items-settlement", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plan_items" as any)
        .select("account_id, planned_amount")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) return [];
      return (data as any[]) || [];
    },
  });

  // Heating distribution values
  const { data: heatingDistValues = [] } = useQuery({
    queryKey: ["heating-dist-values-settlement", buildingId, periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heating_distribution_values")
        .select("*")
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId);
      if (error) return [];
      return data || [];
    },
  });

  // Open invoices
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["open-invoices-settlement", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices" as any)
        .select("id, vendor_name, gross_amount, invoice_date, status")
        .eq("building_id", buildingId)
        .in("status", ["pending", "approved"])
        .order("invoice_date");
      if (error) return [];
      return (data as any[]) || [];
    },
  });

  // --- Computation helpers ---
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const formatNum = (n: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);

  // Gesamte Abrechnungsberechnung — Single Source of Truth (UI + Server):
  // supabase/functions/_shared/finanzen/abrechnung.ts
  const abrechnung = useMemo(
    () => berechneAbrechnung(
      {
        buildingId, periodId, fiscalYear, period,
        accounts, overrides, rawBookings, istPayments, assignments, building,
        economicPlan, balances, wpItems, heatingDistValues, openInvoices,
      },
      { useIstVorschuss, showZeroBalanceAccounts },
    ),
    [
      buildingId, periodId, fiscalYear, period,
      accounts, overrides, rawBookings, istPayments, assignments, building,
      economicPlan, balances, wpItems, heatingDistValues, openInvoices,
      useIstVorschuss, showZeroBalanceAccounts,
    ],
  );
  const {
    sectionAccounts,
    totalIncome, totalOperatingDist, totalOperatingNonDist, totalAccrual,
    totalReserve, totalReserveWithdrawal,
    openingGiro, openingReserve, openingFuel, openingPrepay, openingOther, openingTotal,
    closingGiro, closingReserve, closingFuel, closingPrepay, closingOther, closingTotal,
    carryAccountsList, reserveAccountsList,
    abrechnungssumme,
    totalSollEHR, totalSollKostendeckung, totalUeberzahlung, hasReserveSplit, totalVorschuss,
    incomeAccountTotals, totalEinnahmen, vorschussFuerSpitze, abrechnungsspitze,
    ownerResults, totalPaidAll, totalShareAll,
    distributionWarnings,
    buildPayloadInputs,
  } = abrechnung;

  const filteredOwners = ownerResults.filter(o =>
    !ownerSearch || o.name.toLowerCase().includes(ownerSearch.toLowerCase()) || o.unitNumber.includes(ownerSearch)
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  // ============================================================
  //  Vorlagen-basierter Export — neu (DOCX/PDF via generate-billing-document)
  //  Quelle der Wahrheit: ausschließlich UI-Werte aus diesem Component.
  // ============================================================
  const { data: billingTemplates = [] } = useQuery({
    queryKey: ["billing-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const {
    effectiveSingleTpl,
    effectiveOverallTpl,
    effectiveAssetReportTpl,
    effectiveParagraph35aTpl,
  } = waehleAbrechnungsVorlagen(billingTemplates);

  // openTemplatesFor entfällt — Vorlagen verwaltet jetzt der globale "Dokumente"-Dialog.
  const openTemplatesFor = (_filter?: string) => {
    toast.info("Vorlagen verwaltest du über den Button 'Dokumente' oben rechts.");
  };

  const downloadParagraph35a = async (format: "docx" | "pdf" | "dms") => {
    if (!effectiveParagraph35aTpl) {
      toast.error("Bitte zuerst eine §35a-Vorlage hochladen.");
      openTemplatesFor("paragraph_35a");
      return;
    }
    setBusyDownload("paragraph_35a");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");

      if (format === "dms") {
        const owners = ownerResults;
        if (owners.length === 0) { toast.error("Keine Eigentümer gefunden."); return; }
        const items: DmsJobItem[] = owners.map((o) => {
          const a = (assignments as any[]).find((x) => x.id === o.assignmentId);
          return {
            title: o.name,
            edgeFn: "generate-35a-docx",
            body: {
              template_id: effectiveParagraph35aTpl,
              building_id: buildingId,
              fiscal_year: fiscalYear,
              period_id: periodId,
              assignment_ids: [o.assignmentId],
              format: "pdf",
            },
            displayName: `${unitFilePrefix(a?.unit_number)}§35a_${fiscalYear}_${o.name}${a?.unit_number ? `_${a.unit_number}` : ""}`,
            folderKey: "paragraph_35a",
            visibility: "eigentuemer_only",
            contactId: a?.contact_id || null,
            buildingId,
            periodId,
            managementMode: "weg",
            fiscalYear,
          };
        });
        enqueueDms(`§35a-Bescheinigungen ${fiscalYear}`, items);
        return;
      }



      // PDF-Sammelexport: pro Eigentuemer EIN Function-Aufruf (je eine CloudConvert-
      // Konvertierung) und clientseitig zippen. Ein einziger Aufruf ueber alle
      // Eigentuemer wuerde das Speicher-/Zeitlimit der Edge-Function sprengen
      // (WORKER_RESOURCE_LIMIT). DOCX bleibt ein Sammelaufruf (kein CloudConvert).
      if (format === "pdf") {
        const owners = ownerResults;
        if (owners.length === 0) { toast.error("Keine Eigentuemer gefunden."); return; }
        // Pro Eigentuemer EIN Aufruf (je eine CloudConvert-Konvertierung), in kleinen
        // Parallel-Batches fuer Tempo, mit Fortschrittsanzeige. Dateiname enthaelt die
        // Einheiten-Nr., damit Eigentuemer mit mehreren Einheiten (Wohnung + Garage)
        // sich im ZIP nicht gegenseitig ueberschreiben.
        const zip = new JSZip();
        let done = 0, failed = 0;
        const tId = toast.loading(`Erzeuge §35a-PDFs… 0/${owners.length}`);
        const CONC = 4;
        const genOne = async (o: any) => {
          try {
            const r = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                template_id: effectiveParagraph35aTpl,
                building_id: buildingId,
                fiscal_year: fiscalYear,
                period_id: periodId,
                assignment_ids: [o.assignmentId],
                format: "pdf",
              }),
            });
            if (!r.ok) throw new Error(await r.text());
            const unitPart = o.unitNumber && o.unitNumber !== "–" ? `_${sanitizeFilename(o.unitNumber)}` : "";
            zip.file(`${unitFilePrefix(o.unitNumber)}35a_${fiscalYear}_${sanitizeFilename(o.name)}${unitPart}.pdf`, await r.blob());
          } catch { failed++; }
          finally { done++; toast.loading(`Erzeuge §35a-PDFs… ${done}/${owners.length}`, { id: tId }); }
        };
        for (let i = 0; i < owners.length; i += CONC) {
          await Promise.all(owners.slice(i, i + CONC).map(genOne));
        }
        const out = await zip.generateAsync({ type: "blob" });
        triggerDownload(out, `35a_${fiscalYear}_PDF.zip`, "application/zip");
        toast.dismiss(tId);
        if (failed) toast.warning(`${failed} von ${owners.length} Bescheinigung(en) fehlgeschlagen — Rest im ZIP.`);
        else toast.success(`${owners.length} §35a-Bescheinigungen als PDF heruntergeladen.`);
        return;
      }

      const resp = await fetch(
        `${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            template_id: effectiveParagraph35aTpl,
            building_id: buildingId,
            fiscal_year: fiscalYear,
            period_id: periodId,
            format,
          }),
        },
      );
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const fname = m?.[1] || `35a_${fiscalYear}.zip`;
      triggerDownload(blob, fname, blob.type || "application/zip");
      toast.success("Download bereit");
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };

  const sanitizeFilename = (s: string) =>
    s.replace(/[^a-zA-Z0-9äöüÄÖÜß_\-]+/g, "_").replace(/^_+|_+$/g, "");

  // buildPayloadInputs kommt aus berechneAbrechnung (gemeinsam mit dem Server).

  const triggerDownload = (bytes: ArrayBuffer | Uint8Array | Blob, filename: string, mime: string) => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBilling = async (
    target: "overall" | "owner" | "all" | "asset_report",
    format: "docx" | "pdf" | "dms",
    owner?: { assignmentId: string; name: string },
  ) => {
    const tplId =
      target === "overall" ? effectiveOverallTpl
      : target === "asset_report" ? effectiveAssetReportTpl
      : effectiveSingleTpl;
    if (!tplId) {
      toast.error("Bitte zuerst eine Vorlage hochladen (Vorlagen-Verwaltung).");
      openTemplatesFor(target === "overall" ? "overall" : target === "asset_report" ? "asset_report" : "single");
      return;
    }
    const busyKey = target === "owner" ? owner!.assignmentId : target;
    setBusyDownload(busyKey);
    try {
      const inp = buildPayloadInputs();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden, um die Abrechnung herunterzuladen.");

      const callOnce = async (
        body: any,
      ): Promise<Blob> => {
        const resp = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-billing-document`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(body),
          },
        );
        if (!resp.ok) throw new Error((await resp.text()) || `Export fehlgeschlagen (${resp.status})`);
        return await resp.blob();
      };

      // DMS-Modus: in Hintergrund-Queue einreihen (überlebt Seitenwechsel).
      if (format === "dms") {
        if (target === "overall") {
          const dms = dmsAblageGesamtabrechnung(fiscalYear);
          enqueueDms(dms.jobLabel, [{
            title: dms.title,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format: "pdf",
              file_prefix: dms.filePrefix,
              items: [{ kind: "overall", payload: buildOverallPayload(inp) }],
            },
            displayName: dms.displayName,
            folderKey: dms.folderKey,
            visibility: dms.visibility,
            buildingId, periodId, managementMode: dms.managementMode, fiscalYear,
          }]);
        } else if (target === "asset_report") {
          const dms = dmsAblageVermoegensbericht(fiscalYear);
          enqueueDms(dms.jobLabel, [{
            title: dms.title,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format: "pdf",
              file_prefix: dms.filePrefix,
              items: [{ kind: "asset_report", payload: buildAssetReportPayload(inp) }],
            },
            displayName: dms.displayName,
            folderKey: dms.folderKey,
            visibility: dms.visibility,
            buildingId, periodId, managementMode: dms.managementMode, fiscalYear,
          }]);
        } else {
          const targetOwners = target === "owner"
            ? [{ assignmentId: owner!.assignmentId, name: owner!.name }]
            : ownerResults.map((o) => ({ assignmentId: o.assignmentId, name: o.name }));
          if (targetOwners.length === 0) { toast.error("Keine Eigentümer gefunden."); return; }
          const jobItems: DmsJobItem[] = targetOwners.map((o) => {
            const a = (assignments as any[]).find((x) => x.id === o.assignmentId);
            const unitNo = a?.unit_number ? String(a.unit_number) : "";
            // Anzeigename/Ordner/Sichtbarkeit: gemeinsame Regel (dmsAblage.ts) — Einheitennummer
            // im Anzeigenamen, damit Eigentuemer mit mehreren Einheiten (z. B. Wohnung + Garage)
            // je Einheit ein eigenes, eindeutiges Dokument im DMS erhalten.
            const dms = dmsAblageEinzelabrechnung(fiscalYear, o.name, unitNo);
            return {
              title: dms.title,
              edgeFn: "generate-billing-document",
              body: {
                template_id: tplId, overall_template_id: effectiveOverallTpl,
                fiscal_year: fiscalYear, mode: "single", format: "pdf",
                file_prefix: dms.filePrefix,
                items: [{ kind: "owner", ownerId: o.assignmentId, ownerName: o.name, unitNumber: unitNo, payload: buildOwnerPayload(inp, o.assignmentId) }],
              },
              displayName: dms.displayName,
              folderKey: dms.folderKey,
              visibility: dms.visibility,
              contactId: a?.contact_id || null,
              buildingId, periodId, managementMode: dms.managementMode, fiscalYear,
            };
          });
          enqueueDms(`Einzelabrechnungen ${fiscalYear}`, jobItems);
        }
        return;
      }



      // Sammel-Download: pro Dokument ein eigener, kleiner Funktionsaufruf und
      // ZIP im Browser bauen — ein einzelner Batch-Request lief bei vielen
      // Eigentümern in das Rechenlimit der Edge Function (WORKER_RESOURCE_LIMIT).
      if (target === "all") {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const zipErrors: string[] = [];
        const jobs: Array<{ label: string; fileBase: string; body: any }> = [
          {
            label: "Gesamtabrechnung",
            fileBase: `00_Abrechnung_${fiscalYear}_Gesamt`,
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format,
              file_prefix: `Abrechnung_${fiscalYear}`,
              items: [{ kind: "overall", payload: buildOverallPayload(inp) }],
            },
          },
          ...ownerResults.map((o) => ({
            label: o.name,
            // Einheitennummer im Dateinamen, damit Eigentuemer mit mehreren
            // Einheiten (z. B. Wohnung + Garage) nicht denselben Namen erhalten
            // und sich im ZIP gegenseitig ueberschreiben.
            fileBase: `${unitFilePrefix(o.unitNumber && o.unitNumber !== "–" ? o.unitNumber : null)}Abrechnung_${fiscalYear}_${sanitizeFilename(o.name)}${o.unitNumber && o.unitNumber !== "–" ? `_${sanitizeFilename(o.unitNumber)}` : ""}`,
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format,
              file_prefix: `Abrechnung_${fiscalYear}`,
              items: [{ kind: "owner", ownerId: o.assignmentId, ownerName: o.name, unitNumber: o.unitNumber, payload: buildOwnerPayload(inp, o.assignmentId) }],
            },
          })),
        ];
        for (let i = 0; i < jobs.length; i++) {
          toast.message(`Dokument ${i + 1}/${jobs.length}: ${jobs[i].label}…`);
          try {
            const blob = await callOnce(jobs[i].body);
            zip.file(`${jobs[i].fileBase}.${format}`, blob);
          } catch (err) {
            zipErrors.push(`${jobs[i].label}: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
          }
        }
        if (zipErrors.length > 0) zip.file("FEHLER.txt", zipErrors.join("\n"));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, `Abrechnung_${fiscalYear}${format === "pdf" ? "_PDF" : ""}.zip`, "application/zip");
        toast.success(zipErrors.length > 0 ? `Download bereit — ${zipErrors.length} Dokument(e) fehlgeschlagen (siehe FEHLER.txt im ZIP)` : "Download bereit");
        return;
      }

      // Einzeldokument-Download (DOCX/PDF).
      let items: Array<{ kind: "owner" | "overall" | "asset_report"; ownerId?: string; ownerName?: string; payload: any }> = [];
      if (target === "overall") {
        items = [{ kind: "overall", payload: buildOverallPayload(inp) }];
      } else if (target === "asset_report") {
        items = [{ kind: "asset_report", payload: buildAssetReportPayload(inp) }];
      } else {
        items = [{ kind: "owner", ownerId: owner!.assignmentId, ownerName: owner!.name, payload: buildOwnerPayload(inp, owner!.assignmentId) }];
      }
      const mode = "single";
      const filePrefix =
        target === "asset_report" ? `Vermoegensbericht_${fiscalYear}` : `Abrechnung_${fiscalYear}`;
      const bytes = await callOnce({
        template_id: tplId,
        overall_template_id: effectiveOverallTpl,
        fiscal_year: fiscalYear,
        mode,
        format,
        file_prefix: filePrefix,
        items,
      });
      const ext = format;
      const mime =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const fname =
        target === "owner"
          ? `${unitFilePrefix((assignments as any[])?.find((x) => x.id === owner!.assignmentId)?.unit_number)}Einzelabrechnung_${sanitizeFilename(owner!.name)}_${fiscalYear}.${ext}`
          : target === "overall"
            ? `Gesamtabrechnung_${fiscalYear}.${ext}`
            : target === "asset_report"
              ? `Vermoegensbericht_${fiscalYear}.${ext}`
              : `Abrechnung_${fiscalYear}.${ext}`;
      triggerDownload(bytes, fname, mime);
      toast.success("Download bereit");
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };

  // Globaler Dokumente-Button (Finance-Header) → existierende Download-Funktionen aufrufen.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { target: string; format: "docx" | "pdf" | "dms" };
      if (!detail) return;
      switch (detail.target) {
        case "overall": downloadBilling("overall", detail.format); break;
        case "all": downloadBilling("all", detail.format); break;
        case "asset_report": downloadBilling("asset_report", detail.format); break;
        case "paragraph_35a": downloadParagraph35a(detail.format); break;
        case "combined_report": downloadCombined(detail.format); break;
        // economic_plan_* wird vom ManualEconomicPlanEditor selbst behandelt
      }
    };
    const switchTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab: string };
      if (detail?.tab) setActiveTab(detail.tab);
    };
    window.addEventListener("finance:request-download", handler as EventListener);
    window.addEventListener("finance:switch-settlement-tab", switchTab as EventListener);
    return () => {
      window.removeEventListener("finance:request-download", handler as EventListener);
      window.removeEventListener("finance:switch-settlement-tab", switchTab as EventListener);
    };
  });

  // Synchroner Payload-Collector für den Sammelbericht.
  // Wird vom Sammelbericht-Button dispatched; alle Tab-Editoren schreiben
  // ihre Payloads (UI = Source of Truth) inline ins detail.payloads-Objekt.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { payloads: Record<string, any>; errors?: string[] };
      if (!detail?.payloads) return;
      try {
        const inp = buildPayloadInputs();
        detail.payloads.overall = buildOverallPayload(inp);
        detail.payloads.asset_report = buildAssetReportPayload(inp);
        detail.payloads.owners = ownerResults.map((o) => ({
          assignmentId: o.assignmentId,
          name: o.name,
          payload: buildOwnerPayload(inp, o.assignmentId),
        }));
      } catch (err: any) {
        (detail.errors ||= []).push(`Abrechnung: ${err?.message || err}`);
      }
    };
    window.addEventListener("finance:collect-combined-payload", handler as EventListener);
    return () => window.removeEventListener("finance:collect-combined-payload", handler as EventListener);
  });

  // Sammelbericht-Trigger: sammelt Payloads aller Tabs (Abrechnung + Wirtschaftsplan + §35a),
  // mergt sie pro Eigentümer und ruft generate-billing-document mit der combined_report-Vorlage auf.
  // Es gibt nur Einzel-Sammelberichte (pro Eigentümer), da jeder Sammelbericht die Gesamtdaten enthält.
  const downloadCombined = async (format: "docx" | "pdf" | "dms") => {
    const combinedTpls = billingTemplates.filter((t: any) => t.scope === "combined_report");
    const tplId = combinedTpls[0]?.id;
    if (!tplId) {
      toast.error("Bitte zuerst eine Sammelbericht-Vorlage hochladen.");
      setDocsOpen(true);
      return;
    }
    // Sicherstellen, dass Wirtschaftsplan-Tab schon einmal aktiv war (forceMount sollte das erledigen,
    // aber zur Sicherheit kurz darauf umschalten, falls noch kein Mount erfolgt ist).
    const detail: any = { payloads: {}, errors: [] };
    window.dispatchEvent(new CustomEvent("finance:collect-combined-payload", { detail }));
    if (detail.errors?.length) { toast.error(detail.errors.join(" | ")); return; }
    const p = detail.payloads;
    if (!p.overall) { toast.error("Abrechnungs-Daten fehlen."); return; }
    if (!p.economic_plan_overall) {
      toast.error("Wirtschaftsplan-Daten fehlen — bitte den Wirtschaftsplan-Tab kurz öffnen und erneut versuchen.");
      return;
    }

    setBusyDownload("combined_owners");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");

      // §35a-Payloads parallel von Edge Function abholen (payloads_only Modus).
      let p35aItems: any[] = [];
      try {
        const r35 = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              building_id: buildingId,
              fiscal_year: fiscalYear,
              period_id: periodId,
              mode: "payloads_only",
            }),
          },
        );
        if (r35.ok) {
          const j = await r35.json();
          p35aItems = j.items || [];
        } else {
          console.warn("§35a payloads konnten nicht geladen werden:", await r35.text());
        }
      } catch (e) {
        console.warn("§35a Aufruf fehlgeschlagen", e);
      }

      const epOwners: any[] = p.economic_plan_owners || [];
      // Common-Felder fürs Deckblatt aus dem reichsten Owner-Payload ziehen.
      const pickCommon = (src: any) => {
        if (!src) return {};
        const keys = ["wirtschaftsjahr", "gebaeude_name", "gebaeude_adresse", "empfaenger_name",
          "empfaenger_anschrift", "stichtag", "abrechnungszeitraum", "abrechnungszeitraum_von",
          "abrechnungszeitraum_bis", "verwalter_name", "verwalter_anschrift", "datum_heute"];
        const out: any = {};
        for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
        return out;
      };
      const items = (p.owners || []).map((o: any) => {
        const ep = epOwners.find((e) => e.ownerId === o.assignmentId) || epOwners.find((e) => e.name === o.name);
        const p35 = p35aItems.find((x: any) => x.assignment_id === o.assignmentId)
          || p35aItems.find((x: any) => x.owner_name === o.name);
        // Common (Deckblatt) aus reichstem Owner-Payload + overall ziehen und auf neue
        // Sammelbericht-Konvention normalisieren (datum_heute, abrechnungszeitraum_*, …).
        const common = remapCommon({ ...pickCommon(o.payload), ...pickCommon(p.overall) });
        const oa = (assignments as any[]).find((x) => x.id === o.assignmentId);
        return {
          kind: "owner",
          ownerId: o.assignmentId,
          ownerName: o.name,
          unitNumber: oa?.unit_number ? String(oa.unit_number) : undefined,
          payload: {
            // Top-Level Common (Deckblatt-Variablen ohne Prefix)
            ...common,
            // 6 vollständige Sub-Payloads, jeweils mit Common-Fallback gemerged und
            // auf die Platzhalter-Namen der v2-Vorlage gemappt.
            abrechnung_gesamt:      { ...common, ...remapAbrechnungGesamt(p.overall) },
            abrechnung_einzel:      { ...common, ...remapAbrechnungEinzel(o.payload) },
            vermoegen:              { ...common, ...remapVermoegen(p.asset_report) },
            wirtschaftsplan_gesamt: { ...common, ...remapWirtschaftsplanGesamt(p.economic_plan_overall) },
            wirtschaftsplan_einzel: { ...common, ...remapWirtschaftsplanEinzel(ep?.payload) },
            p35a:                   { ...common, ...remapP35a(p35?.payload) },
          },
        };
      });

      if (!items.length) { toast.error("Keine Eigentümer gefunden."); setBusyDownload(null); return; }

      const prefix = `Sammelberichte_${fiscalYear}`;

      if (format === "dms") {
        const jobItems: DmsJobItem[] = items.map((it: any) => {
          const a = (assignments as any[]).find((x) => x.id === it.ownerId);
          return {
            title: it.ownerName,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, fiscal_year: fiscalYear,
              mode: "single", format: "pdf", file_prefix: prefix,
              items: [it],
            },
            displayName: `${unitFilePrefix(it.unitNumber)}Sammelbericht_${fiscalYear}_${it.ownerName}${it.unitNumber ? `_${it.unitNumber}` : ""}`,
            folderKey: "sammelbericht",
            visibility: "eigentuemer_only",
            contactId: a?.contact_id || null,
            buildingId, periodId, managementMode: "weg", fiscalYear,
          };
        });
        enqueueDms(`Sammelberichte ${fiscalYear}`, jobItems);
      } else {
        const resp = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-billing-document`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              template_id: tplId,
              fiscal_year: fiscalYear,
              mode: "all",
              format,
              file_prefix: prefix,
              items,
            }),
          },
        );
        if (!resp.ok) throw new Error(await resp.text());
        const bytes = await resp.blob();
        triggerDownload(bytes, `${prefix}.zip`, "application/zip");
        toast.success("Sammelberichte bereit");
      }
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };





  // Verteilerschlüssel-Warnungen: berechnet in berechneAbrechnung (distributionWarnings).






  // --- Render helper for Gesamtabrechnung section ---
  const renderSection = (section: string) => {
    const accs = sectionAccounts[section] || [];
    if (accs.length === 0 && section !== "reserve") return null;
    const wpTotal = accs.reduce((s, a) => s + a.wpAmount, 0);
    // Verteilungsrelevante Summe nutzt Magnitude (Kostensumme zur Verteilung)
    const distTotal = accs.filter(a => a.is_distributable).reduce((s, a) => s + a.totalAbs, 0);
    const isExpanded = expandedSections.has(section);
    const isIncomeSection = section === "income";
    const isAccrualSection = section === "accrual";

    // Vorzeichen-Konvention für die Anzeige:
    //  - Einnahmen-Sektion → positive Werte mit "+"
    //  - Aufwands-Sektionen (Bewirtschaftung, Heizung, Rücklage) → mit "−"
    //  - Abgrenzungs-Sektion → pro Konto je nach Konto-Nummer (siehe accrualSign.ts)
    const isExpenseSection = section !== "income";

    // Pro-Konto Anzeigewert (signiert) — bei Abgrenzungen abhängig von Kontonummer
    const accountDisplayValue = (acc: any): number => {
      if (isAccrualSection) return acc.totalAbs * getAccrualDisplaySign(acc.account_number);
      if (isIncomeSection) return acc.totalAbs; // Einnahmen positiv
      return -acc.totalAbs; // Aufwand negativ
    };

    const sectionDisplayTotal = accs.reduce((s, a) => s + accountDisplayValue(a), 0);

    const renderSigned = (n: number) => {
      const v = Math.round(n * 100) / 100;
      if (v === 0) return <span className="font-mono">{formatCurrency(0)}</span>;
      const positive = v > 0;
      return (
        <span className={cn("font-mono", positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
          {positive ? "+" : "−"}{formatCurrency(Math.abs(v))}
        </span>
      );
    };

    return (
      <Collapsible key={section} open={isExpanded} onOpenChange={() => toggleSection(section)}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted text-left">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium text-sm">{SECTION_LABELS[section] || section}</span>
            <Badge variant="outline" className="text-xs">{accs.length}</Badge>
          </div>
          <div className="flex gap-4 text-sm">
            {wpTotal > 0 && <span className="font-mono text-muted-foreground">{formatCurrency(wpTotal)}</span>}
            <span className="font-medium">{renderSigned(sectionDisplayTotal)}</span>
            {distTotal > 0 && Math.abs(distTotal - Math.abs(sectionDisplayTotal)) > 0.005 && (
              <span className="font-mono text-muted-foreground">{formatCurrency(distTotal)}</span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right w-[120px]">Wirtschaftsplan</TableHead>
                <TableHead className="text-right w-[140px]">Einnahme/Ausgabe</TableHead>
                <TableHead className="text-right w-[120px]">Verteilungsrel.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accs.map(acc => (
                <TableRow key={acc.id}>
                  <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                  <TableCell className="text-sm">{acc.account_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {acc.wpAmount > 0 ? formatCurrency(acc.wpAmount) : "–"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{renderSigned(accountDisplayValue(acc))}</TableCell>
                  <TableCell className="text-right text-sm">
                    {acc.is_distributable ? renderSigned(accountDisplayValue(acc)) : <span className="font-mono">–</span>}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell colSpan={2} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Abschnittsaldo {SECTION_LABELS[section] || section}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-muted-foreground">
                  {wpTotal > 0 ? formatCurrency(wpTotal) : "–"}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">{renderSigned(sectionDisplayTotal)}</TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  {distTotal > 0 ? renderSigned(accs.filter(a => a.is_distributable).reduce((s, a) => s + accountDisplayValue(a), 0)) : <span className="font-mono">–</span>}
                </TableCell>

              </TableRow>
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const selectedOwnerData = selectedOwner ? ownerResults.find(o => o.assignmentId === selectedOwner) : null;

  // Wiederverwendbarer Tab-Download-Button (DOCX/PDF + Vorlage wählen).
  const TabDownloadMenu = ({
    target,
    label,
    scope,
    busyKey,
    onOwner,
  }: {
    target: "overall" | "asset_report" | "all" | "owner";
    label: string;
    scope: "overall" | "single" | "asset_report";
    busyKey: string;
    onOwner?: { assignmentId: string; name: string };
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busyDownload === busyKey}>
          {busyDownload === busyKey ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          {label}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadBilling(target, "docx", onOwner)}>
          <FileType className="h-4 w-4 mr-2" /> DOCX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadBilling(target, "pdf", onOwner)}>
          <FileText className="h-4 w-4 mr-2" /> PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openTemplatesFor(scope)}>
          <Settings2 className="h-4 w-4 mr-2" /> Vorlage wählen / hochladen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Gesamtabrechnung {fiscalYear}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.filter(a => a.settlement_section).length} Konten in Abrechnungsstruktur
          </p>
        </div>
        {/* Vorlagen und Downloads jetzt im globalen "Dokumente"-Button (Finance-Header). */}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <TabsList variant="underline" className="flex-wrap h-auto">
              <TabsTrigger variant="underline" value="total">Gesamtabrechnung</TabsTrigger>
              <TabsTrigger variant="underline" value="owners">
                <Users className="h-4 w-4 mr-1" /> Einzelabrechnungen ({ownerResults.length})
              </TabsTrigger>
              <TabsTrigger variant="underline" value="assets">
                <Building2 className="h-4 w-4 mr-1" /> Vermögensbericht
              </TabsTrigger>
              <TabsTrigger variant="underline" value="wirtschaftsplan">
                <FileText className="h-4 w-4 mr-1" /> Wirtschaftsplan
              </TabsTrigger>
              <TabsTrigger variant="underline" value="paragraph35a">
                <Receipt className="h-4 w-4 mr-1" /> §35a Bescheinigung
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
              <ErgebnisBeschliessen buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} ownerResults={ownerResults} />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDocsOpen(true)}>
                <FileText className="h-4 w-4" />
                Dokumente
              </Button>
            </div>
          </div>
          <FinanceDocumentsDialog
            open={docsOpen}
            onOpenChange={setDocsOpen}
            selectedBuildingId={buildingId}
            selectedPeriodId={periodId}
          />


          {/* ===== TAB 1: GESAMTABRECHNUNG ===== */}
          <TabsContent value="total" className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Null-Saldo Konten anzeigen</span>
                <Switch checked={showZeroBalanceAccounts} onCheckedChange={setShowZeroBalanceAccounts} />
              </div>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
            </div>
            {distributionWarnings.length > 0 && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/5 text-foreground">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  Verteilung unvollständig — {distributionWarnings.length}{" "}
                  {distributionWarnings.length === 1 ? "Konto wird" : "Konten werden"} nicht verteilt
                </AlertTitle>
                <AlertDescription className="mt-2">
                  <ul className="space-y-1 text-sm">
                    {distributionWarnings.map((w) => (
                      <li key={w.accountNumber}>
                        <span className="font-mono">{w.accountNumber}</span>{" "}
                        <span className="font-medium">{w.accountName}</span>{" "}
                        <span className="text-muted-foreground">({formatCurrency(w.amount)})</span>
                        {" — "}
                        {w.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    → Verteilerschlüssel im Kontenrahmen oder per Building-Override anpassen, dann Abrechnung neu laden.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {/* Anfangsbestände */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="text-sm font-medium mb-1">Anfangsbestände zum {period ? new Date(period.period_from).toLocaleDateString("de-DE") : "–"}</div>
              <div className="flex justify-between text-sm">
                <span>Girokonto</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingGiro))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingReserve))}</span>
              </div>
              {reserveAccountsList
                .filter((a) => Math.abs(a.opening) > 0.005 || Math.abs(a.closing) > 0.005)
                .map((a) => (
                  <div key={`op-res-${a.account_number}`} className="flex justify-between text-sm pl-4 text-muted-foreground">
                    <span>{a.account_number} {a.account_name}</span>
                    <span className="font-mono">{formatCurrency(Math.abs(a.opening))}</span>
                  </div>
                ))}
              {openingFuel !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Brennstoffanfangsbestand (Heizöl)</span>
                  <span className="font-mono">{formatCurrency(Math.abs(openingFuel))}</span>
                </div>
              )}
              {openingPrepay !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Vorauszahlungen Versorger (1470–1473)</span>
                  <span className="font-mono">{formatCurrency(openingPrepay)}</span>
                </div>
              )}
              {openingOther !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Bestandskonten</span>
                  <span className="font-mono">{formatCurrency(openingOther)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingGiro) + Math.abs(openingReserve) + Math.abs(openingFuel) + openingPrepay + openingOther)}</span>
              </div>
            </div>

            {/* Einnahmen-Hochrechnung (HV-Office-Stil) — Soll aus Stammdaten + Zinsen aus Buchungen */}
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-1">
              <div className="text-sm font-medium mb-1">Einnahmen (Soll-Hochrechnung)</div>
              <div className="flex justify-between text-sm">
                <span>Vorschüsse zur Kostendeckung</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalSollKostendeckung)}</span>
              </div>
              {hasReserveSplit && (
                <div className="flex justify-between text-sm">
                  <span>Vorschüsse auf Erhaltungsrücklage</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalSollEHR)}</span>
                </div>
              )}
              {Math.abs(totalUeberzahlung) > 0.005 && (
                <div className="flex justify-between text-sm">
                  <span>Überzahlung Vorschüsse</span>
                  <span className={`font-mono ${totalUeberzahlung >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {totalUeberzahlung >= 0 ? "+" : ""}{formatCurrency(totalUeberzahlung)}
                  </span>
                </div>
              )}
              {incomeAccountTotals.interest > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Zinseinnahmen (lt. Buchungen)</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(incomeAccountTotals.interest)}</span>
                </div>
              )}
              {incomeAccountTotals.other > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Erträge (lt. Buchungen)</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(incomeAccountTotals.other)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t border-emerald-200 dark:border-emerald-900 pt-1">
                <span>Zwischensumme Einnahmen</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalEinnahmen)}</span>
              </div>
            </div>

            {/* Sections — Income wird oben im Soll-Hochrechnungsblock dargestellt → hier ausblenden */}
            {SECTION_ORDER.filter(s => s !== "income").map(section => renderSection(section))}

            {/* Abrechnungssumme */}
            <div className="space-y-2 mt-4">
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Abrechnungssumme (Gesamtkosten)</span>
                <span className="font-mono font-medium">{formatCurrency(abrechnungssumme)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Vorschussverpflichtung (Hausgeld + IHR, Soll)</span>
                <span className="font-mono font-medium">{formatCurrency(vorschussFuerSpitze)}</span>
              </div>
              <div className={`flex justify-between p-3 rounded-lg border-2 text-sm font-semibold ${
                abrechnungsspitze >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}>
                <span>Abrechnungsspitze ({abrechnungsspitze >= 0 ? "Guthaben" : "Nachzahlung"})</span>
                <span className="font-mono">{formatCurrency(Math.abs(abrechnungsspitze))}</span>
              </div>
            </div>

            {/* Kontrolle Endbestände */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1 mt-2">
              <div className="text-sm font-medium mb-1">Kontrolle Endbestände zum {period ? new Date(period.period_to).toLocaleDateString("de-DE") : "–"}</div>
              <div className="flex justify-between text-sm">
                <span>Girokonto</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingGiro))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingReserve))}</span>
              </div>
              {reserveAccountsList
                .filter((a) => Math.abs(a.opening) > 0.005 || Math.abs(a.closing) > 0.005)
                .map((a) => (
                  <div key={`cl-res-${a.account_number}`} className="flex justify-between text-sm pl-4 text-muted-foreground">
                    <span>{a.account_number} {a.account_name}</span>
                    <span className="font-mono">{formatCurrency(Math.abs(a.closing))}</span>
                  </div>
                ))}
              {closingFuel !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Brennstoffendbestand (Heizöl)</span>
                  <span className="font-mono">{formatCurrency(Math.abs(closingFuel))}</span>
                </div>
              )}
              {closingPrepay !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Vorauszahlungen Versorger (1470–1473)</span>
                  <span className="font-mono">{formatCurrency(closingPrepay)}</span>
                </div>
              )}
              {closingOther !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Bestandskonten</span>
                  <span className="font-mono">{formatCurrency(closingOther)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingGiro) + Math.abs(closingReserve) + Math.abs(closingFuel) + closingPrepay + closingOther)}</span>
              </div>
            </div>

          </TabsContent>

          {/* ===== TAB 2: EINZELABRECHNUNGEN ===== */}
          <TabsContent value="owners">
            {/* SOLL/IST Toggle + Download */}
            <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-muted/30 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Vorschüsse aus:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${!useIstVorschuss ? "text-foreground" : "text-muted-foreground"}`}>SOLL</span>
                  <Switch checked={useIstVorschuss} onCheckedChange={setUseIstVorschuss} />
                  <span className={`text-sm font-medium ${useIstVorschuss ? "text-foreground" : "text-muted-foreground"}`}>IST</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {useIstVorschuss ? "Tatsächliche Zahlungen aus Personenkonten" : "Geplante Beträge aus Kostenzuordnung"}
                </span>
              </div>
              {/* Bulk-Download alle Einzelabrechnungen → Button "Dokumente" oben rechts. */}
            </div>
            {ownerResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Eigentümer mit aktiven Zuordnungen gefunden.
              </p>
            ) : selectedOwnerData ? (
              // Detail view for selected owner
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedOwner(null)} className="mb-1">
                      ← Zurück zur Übersicht
                    </Button>
                    <h3 className="text-lg font-semibold">{selectedOwnerData.name} — Einheit {selectedOwnerData.unitNumber}</h3>
                  </div>
                  <TabDownloadMenu
                    target="owner"
                    label="Diese Einzelabrechnung"
                    scope="single"
                    busyKey={selectedOwnerData.assignmentId}
                    onOwner={{ assignmentId: selectedOwnerData.assignmentId, name: selectedOwnerData.name }}
                  />
                </div>

                {/* 7-column detail table — gruppiert nach displaySection (HV-Office-konform) */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[70px]">Konto</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead className="text-right w-[100px]">Verteilungsrel.</TableHead>
                        <TableHead className="w-[100px]">Verteiler</TableHead>
                        <TableHead className="text-right w-[80px]">Gesamt</TableHead>
                        <TableHead className="text-right w-[80px]">Ihr Anteil</TableHead>
                        <TableHead className="text-right w-[100px]">Ihre Kosten</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Gruppieren nach displaySection — Reihenfolge wie in der Gesamtabrechnung
                        const groupOrder = ["operating_distributable", "operating_non_distributable", "heating", "reserve"];
                        const groups = groupOrder
                          .map((sec) => ({
                            sec,
                            label: SECTION_LABELS[sec] || sec,
                            rows: selectedOwnerData.accountBreakdown.filter((r) => r.displaySection === sec),
                          }))
                          .filter((g) => g.rows.length > 0);

                        return groups.flatMap((g) => {
                          const subtotal = g.rows.reduce((s, r) => s + r.ownerCost, 0);
                          return [
                            <TableRow key={`hdr-${g.sec}`} className="bg-muted/40">
                              <TableCell colSpan={7} className="font-semibold text-xs uppercase tracking-wide">
                                {g.label}
                              </TableCell>
                            </TableRow>,
                            ...g.rows.map((row, i) => (
                              <TableRow key={`${g.sec}-${i}`}>
                                <TableCell className="font-mono text-xs">{row.accountNumber}</TableCell>
                                <TableCell className="text-sm">
                                  {row.signedFactor < 0 ? `./. ${row.accountName} (aus Rücklage)` : row.accountName}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">{formatCurrency(row.distributableAmount)}</TableCell>
                                <TableCell className="text-xs">{row.distKey}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatNum(row.totalShares)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatNum(row.ownerShare)}</TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono text-sm font-medium",
                                  row.ownerCost < 0 && "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {row.ownerCost < 0 ? "−" : ""}{formatCurrency(Math.abs(row.ownerCost))}
                                </TableCell>
                              </TableRow>
                            )),
                            <TableRow key={`sub-${g.sec}`} className="border-t">
                              <TableCell colSpan={6} className="text-xs text-muted-foreground">Zwischensumme {g.label}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {subtotal < 0 ? "−" : ""}{formatCurrency(Math.abs(subtotal))}
                              </TableCell>
                            </TableRow>,
                          ];
                        });
                      })()}
                      <TableRow className="font-medium border-t-2">
                        <TableCell colSpan={6}>Abrechnungssumme</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(selectedOwnerData.totalOwnerCost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm">Vorschussverpflichtung (Hausgeld + IHR)</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(selectedOwnerData.totalPaid)}</TableCell>
                      </TableRow>
                      <TableRow className={`font-semibold ${selectedOwnerData.result >= 0 ? "text-green-700" : "text-red-700"}`}>
                        <TableCell colSpan={6}>
                          Abrechnungsspitze ({selectedOwnerData.result >= 0 ? "Guthaben" : "Nachzahlung"})
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Math.abs(selectedOwnerData.result))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* §35a */}
                {(selectedOwnerData.owner35aDienste > 0 || selectedOwnerData.owner35aHandwerker > 0) && (
                  <Card className="border-dashed">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">§35a EStG Bescheinigung</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2 text-sm">
                      {selectedOwnerData.owner35aDienste > 0 && (
                        <div className="flex justify-between">
                          <span>Haushaltsnahe Dienstleistungen (20%, max. 4.000€)</span>
                          <span className="font-mono">{formatCurrency(selectedOwnerData.owner35aDienste)}</span>
                        </div>
                      )}
                      {selectedOwnerData.owner35aHandwerker > 0 && (
                        <div className="flex justify-between">
                          <span>Handwerkerleistungen (20%, max. 1.200€)</span>
                          <span className="font-mono">{formatCurrency(selectedOwnerData.owner35aHandwerker)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium border-t pt-1">
                        <span>Steuerbonus</span>
                        <span className="font-mono">
                          {formatCurrency(
                            Math.min(selectedOwnerData.owner35aDienste * 0.2, 4000) +
                            Math.min(selectedOwnerData.owner35aHandwerker * 0.2, 1200)
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              // Owner list view
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline">
                    <PiggyBank className="h-3 w-3 mr-1" /> Vorschüsse: {formatCurrency(totalPaidAll)}
                  </Badge>
                  <Badge variant="outline">Kosten: {formatCurrency(totalShareAll)}</Badge>
                  {Math.abs(totalPaidAll - totalShareAll) > 0.01 && (
                    <Badge className={totalPaidAll > totalShareAll ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                      {totalPaidAll > totalShareAll ? "Guthaben" : "Nachzahlung"}: {formatCurrency(Math.abs(totalPaidAll - totalShareAll))}
                    </Badge>
                  )}
                </div>

                {ownerResults.length > 10 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Eigentümer suchen..." value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)} className="pl-9" />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Einheit</TableHead>
                        <TableHead>Eigentümer</TableHead>
                        <TableHead className="text-right">Kostenanteil</TableHead>
                        <TableHead className="text-right">Vorschüsse</TableHead>
                        <TableHead className="text-right">Ergebnis</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOwners.map(owner => (
                        <TableRow key={owner.assignmentId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOwner(owner.assignmentId)}>
                          <TableCell className="text-sm font-medium">
                            {owner.unitNumber}
                            {owner.timeProp < 1 && (
                              <Badge variant="outline" className="ml-1 text-[10px]">
                                {Math.round(owner.timeProp * 100)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{owner.name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(owner.totalOwnerCost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(owner.totalPaid)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {owner.result >= 0 ? (
                              <span className="text-green-700 flex items-center justify-end gap-1">
                                <Check className="h-3 w-3" /> {formatCurrency(owner.result)}
                              </span>
                            ) : (
                              <span className="text-red-700 flex items-center justify-end gap-1">
                                <AlertTriangle className="h-3 w-3" /> {formatCurrency(owner.result)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); downloadBilling("owner", "docx", { assignmentId: owner.assignmentId, name: owner.name }); }}
                              disabled={busyDownload === owner.assignmentId} title="DOCX herunterladen">
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium border-t-2">
                        <TableCell></TableCell>
                        <TableCell>Gesamt</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(totalShareAll)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(totalPaidAll)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(ownerResults.reduce((s, o) => s + o.result, 0))}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ===== TAB 3: VERMÖGENSBERICHT ===== */}
          <TabsContent value="assets" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Gemäß §28 WEG — Vermögenslage zum Ende des Abrechnungszeitraums {fiscalYear}.
              </p>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
            </div>

            <AssetReportSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} ownerResults={ownerResults} />
          </TabsContent>

          <TabsContent value="wirtschaftsplan" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                Geplante Kosten pro Konto für das gewählte Wirtschaftsjahr. Auto-Save beim Bearbeiten.
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="wp-year" className="text-xs text-muted-foreground">Wirtschaftsjahr</label>
                <Input
                  id="wp-year"
                  type="number"
                  value={wpYear}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 2000 && v < 2100) setWpYear(v);
                  }}
                  className="h-8 w-24 text-sm"
                />
              </div>
            </div>
            <ManualEconomicPlanEditor buildingId={buildingId} fiscalYear={wpYear} />
          </TabsContent>

          <TabsContent value="paragraph35a" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Gemäß §35a EStG — Bescheinigung haushaltsnaher Dienstleistungen und Handwerkerleistungen.
              </p>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
            </div>
            <Paragraph35aSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
