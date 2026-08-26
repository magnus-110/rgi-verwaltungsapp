import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Plus, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUpsertContract, useSaveContractFees, useContractFilesForBuilding } from "@/hooks/useManagementContracts";
import { useBuildingUnitStats } from "@/hooks/useOffers";
import {
  BASIS_CHOICES, BASIS_SUFFIX, FEE_CATALOG, RGI_STANDARD_APPROVAL_LIMIT,
  RGI_STANDARD_FEES, formatEur, isPercentBasis, toNet,
  type ContractFee, type ContractWithDetails, type FeeBasis, type FeeUnitKind,
  type ManagementMode,
} from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract?: ContractWithDetails | null;
  presetBuildingId?: string | null;
}

/** Eine Zeile im Schritt „Honorar“: eine Einheitenart mit Anzahl und Satz. */
interface UnitRow {
  kind: FeeUnitKind;
  label: string;
  count: string;
  rate: string;
}

interface ExtraRow {
  _key: string;
  fee_type: string;
  label: string;
  basis: FeeBasis;
  value: string;          // Betrag oder Prozentsatz, als Text
  threshold: string;
  min_amount: string;
  max_count: string;
  tier_from: string;
  tier_to: string;
  /** Steuert nur die Sichtbarkeit der Staffelfelder im Formular. */
  has_tier: boolean;
  halved_if_supervised: boolean;
  is_gross: boolean;
  debtor: "community" | "owner" | "tenant";
  role: string;
  note: string;
}

const UNIT_LABEL: Record<FeeUnitKind, string> = {
  apartment: "Wohnungen",
  parking: "Garagen und Stellplätze",
  commercial: "Teileigentum, zum Beispiel Läden oder Büros",
  other: "Sonstige Einheiten",
};

let seq = 0;
const key = () => `x${++seq}`;

const dec = (s: string): number | null => {
  if (s == null || s.trim() === "") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const str = (n: number | null | undefined): string =>
  n == null ? "" : String(n).replace(".", ",");

const STEPS = ["Objekt", "Zeitraum", "Honorar", "Zusatzleistungen"];

export function ContractWizard({ open, onOpenChange, contract, presetBuildingId }: Props) {
  const upsert = useUpsertContract();
  const saveFees = useSaveContractFees();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [buildingSearch, setBuildingSearch] = useState("");

  const [buildingId, setBuildingId] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [resolutionDate, setResolutionDate] = useState("");
  const [resolutionRef, setResolutionRef] = useState("");

  const [baseIsGross, setBaseIsGross] = useState(false);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [parkingSeparate, setParkingSeparate] = useState<boolean | null>(null);

  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [indexMonth, setIndexMonth] = useState("");
  const [indexValue, setIndexValue] = useState("");
  const [approvalLimit, setApprovalLimit] = useState("");
  const [dmsFileId, setDmsFileId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: dmsFiles } = useContractFilesForBuilding(buildingId || null);
  const { data: unitStats } = useBuildingUnitStats(buildingId || null);

  // ---------- Laden ----------
  useEffect(() => {
    if (!open) return;
    setStep(0);
    (supabase as any)
      .from("buildings")
      .select("id, name, building_code, management_mode, unit_count, city")
      .order("name")
      .then(({ data }: any) => setBuildings(data ?? []));

    if (contract) {
      setBuildingId(contract.building_id);
      setFrom(contract.appointed_from ?? "");
      setUntil(contract.appointed_until ?? "");
      setOpenEnded(!contract.appointed_until);
      setResolutionDate(contract.resolution_date ?? "");
      setResolutionRef(contract.resolution_ref ?? "");
      setParkingSeparate(contract.parking_billed_separately);
      setIndexMonth((contract.index_base_month ?? "").slice(0, 7));
      setIndexValue(str(contract.index_base_value));
      setApprovalLimit(str(contract.approval_limit_amount));
      setDmsFileId(contract.dms_file_id ?? "");
      setNotes(contract.notes ?? "");

      const fees = contract.fees ?? [];
      const baseFees = fees.filter((f) => f.basis === "unit_month");
      setBaseIsGross(baseFees.some((f) => f.is_gross));
      setUnits(
        baseFees.map((f) => ({
          kind: (f.unit_kind ?? "apartment") as FeeUnitKind,
          label: UNIT_LABEL[(f.unit_kind ?? "apartment") as FeeUnitKind],
          count: str(f.quantity),
          rate: str(f.amount),
        }))
      );
      setExtras(
        fees
          .filter((f) => f.basis !== "unit_month")
          .map((f) => ({
            _key: key(),
            fee_type: f.fee_type,
            label: f.label,
            basis: f.basis,
            value: isPercentBasis(f.basis) ? str(f.percent) : str(f.amount),
            threshold: str(f.threshold),
            min_amount: str(f.min_amount),
            max_count: f.max_count == null ? "" : String(f.max_count),
            tier_from: str(f.tier_from ?? null),
            tier_to: str(f.tier_to ?? null),
            has_tier: f.tier_from != null || f.tier_to != null,
            halved_if_supervised: !!f.halved_if_supervised,
            is_gross: f.is_gross,
            debtor: f.debtor,
            role: f.role ?? "",
            note: f.note ?? "",
          }))
      );
    } else {
      setBuildingId(presetBuildingId ?? "");
      setFrom("");
      setUntil("");
      setOpenEnded(false);
      setResolutionDate("");
      setResolutionRef("");
      setBaseIsGross(false);
      setUnits([{ kind: "apartment", label: UNIT_LABEL.apartment, count: "", rate: "" }]);
      setParkingSeparate(null);
      setExtras([]);
      setIndexMonth("");
      setIndexValue("");
      setApprovalLimit("");
      setDmsFileId("");
      setNotes("");
      setDetailsOpen(false);
    }
  }, [open, contract, presetBuildingId]);

  const building = buildings.find((b) => b.id === buildingId);
  const mode: ManagementMode = (building?.management_mode as ManagementMode) ?? "weg";

  // ---------- Rechnen ----------
  const monthlyNetTotal = useMemo(
    () =>
      units.reduce((sum, u) => {
        const rate = dec(u.rate) ?? 0;
        const count = dec(u.count) ?? 0;
        return sum + toNet(rate, baseIsGross, 19) * count;
      }, 0),
    [units, baseIsGross]
  );

  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.trim().toLowerCase();
    if (!q) return buildings;
    return buildings.filter(
      (b) =>
        (b.name ?? "").toLowerCase().includes(q) ||
        (b.city ?? "").toLowerCase().includes(q) ||
        (b.building_code ?? "").toLowerCase().includes(q)
    );
  }, [buildings, buildingSearch]);

  // ---------- Bearbeiten ----------
  const setUnit = (i: number, patch: Partial<UnitRow>) =>
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));

  const addUnitKind = (kind: FeeUnitKind) => {
    if (units.some((u) => u.kind === kind)) return;
    setUnits((prev) => [...prev, { kind, label: UNIT_LABEL[kind], count: "", rate: "" }]);
  };
  const removeUnitKind = (kind: FeeUnitKind) =>
    setUnits((prev) => prev.filter((u) => u.kind !== kind));

  const chooseParking = (separate: boolean) => {
    setParkingSeparate(separate);
    if (separate) addUnitKind("parking");
    else removeUnitKind("parking");
  };

  const addExtraFromCatalog = (fee_type: string, label: string) => {
    const entry = FEE_CATALOG.find((c) => c.fee_type === fee_type && c.label === label);
    if (!entry) return;
    setExtras((prev) => [
      ...prev,
      {
        _key: key(), fee_type: entry.fee_type, label: entry.label, basis: entry.basis,
        value: "", threshold: "", min_amount: "", max_count: "", tier_from: "", tier_to: "",
        has_tier: false, halved_if_supervised: false,
        is_gross: false, debtor: entry.debtor ?? "community", role: "", note: "",
      },
    ]);
  };

  const addFreeExtra = () =>
    setExtras((prev) => [
      ...prev,
      {
        _key: key(), fee_type: "custom", label: "", basis: "case",
        value: "", threshold: "", min_amount: "", max_count: "", tier_from: "", tier_to: "",
        has_tier: false, halved_if_supervised: false,
        is_gross: false, debtor: "community", role: "", note: "",
      },
    ]);

  const applyRgiStandard = () => {
    setExtras(
      RGI_STANDARD_FEES.map((f) => ({
        _key: key(),
        fee_type: f.fee_type,
        label: f.label,
        basis: f.basis,
        value: isPercentBasis(f.basis) ? str(f.percent ?? null) : str(f.amount ?? null),
        threshold: str(f.threshold ?? null),
        min_amount: str(f.min_amount ?? null),
        max_count: f.max_count == null ? "" : String(f.max_count),
        tier_from: str(f.tier_from ?? null),
        tier_to: str(f.tier_to ?? null),
        has_tier: f.tier_from != null || f.tier_to != null,
        halved_if_supervised: !!f.halved_if_supervised,
        is_gross: f.is_gross,
        debtor: f.debtor ?? "community",
        role: f.role ?? "",
        note: f.note ?? "",
      }))
    );
    if (!approvalLimit) setApprovalLimit(str(RGI_STANDARD_APPROVAL_LIMIT));
  };

  const setExtra = (k: string, patch: Partial<ExtraRow>) =>
    setExtras((prev) => prev.map((e) => (e._key === k ? { ...e, ...patch } : e)));
  const removeExtra = (k: string) => setExtras((prev) => prev.filter((e) => e._key !== k));

  // ---------- Speichern ----------
  const canContinue =
    step === 0 ? !!buildingId :
    step === 1 ? true :
    step === 2 ? units.some((u) => dec(u.count) && dec(u.rate)) :
    true;

  const submit = async () => {
    if (!buildingId) return;
    setSaving(true);
    try {
      const unitCount = (k: FeeUnitKind) => dec(units.find((u) => u.kind === k)?.count ?? "") ?? null;
      const saved = await upsert.mutateAsync({
        ...(contract ? { id: contract.id } : {}),
        building_id: buildingId,
        // Beim Bearbeiten den bestehenden Status behalten, damit ein
        // Entwurf oder ein beendeter Vertrag nicht stillschweigend
        // wieder aktiv wird.
        status: contract?.status ?? "active",
        appointed_from: from || null,
        appointed_until: openEnded ? null : until || null,
        resolution_date: resolutionDate || null,
        resolution_ref: resolutionRef || null,
        parking_billed_separately: parkingSeparate === true,
        units_apartment: unitCount("apartment"),
        units_commercial: unitCount("commercial"),
        units_parking: unitCount("parking"),
        units_other: unitCount("other"),
        index_base_month: indexMonth ? `${indexMonth}-01` : null,
        index_base_value: dec(indexValue),
        approval_limit_amount: dec(approvalLimit),
        dms_file_id: dmsFileId || null,
        notes: notes || null,
      } as any);

      const feeRows: Partial<ContractFee>[] = [
        ...units
          .filter((u) => dec(u.count) != null && dec(u.rate) != null)
          .map((u) => ({
            fee_type: "base",
            label: `Grundvergütung ${u.label}`,
            unit_kind: u.kind,
            basis: "unit_month" as FeeBasis,
            amount: dec(u.rate),
            quantity: dec(u.count),
            is_gross: baseIsGross,
            vat_rate: 19,
            debtor: "community" as const,
            is_active: true,
          })),
        ...extras
          .filter((e) => e.label.trim() !== "")
          .map((e) => ({
            fee_type: e.fee_type,
            label: e.label,
            basis: e.basis,
            amount: isPercentBasis(e.basis) ? null : dec(e.value),
            percent: isPercentBasis(e.basis) ? dec(e.value) : null,
            threshold: dec(e.threshold),
            min_amount: dec(e.min_amount),
            max_count: e.max_count ? Number(e.max_count) : null,
            tier_from: e.has_tier ? dec(e.tier_from) : null,
            tier_to: e.has_tier ? dec(e.tier_to) : null,
            halved_if_supervised: e.halved_if_supervised,
            is_gross: e.is_gross,
            vat_rate: 19,
            debtor: e.debtor,
            role: e.role || null,
            note: e.note || null,
            is_active: true,
          })),
      ];

      await saveFees.mutateAsync({ contractId: saved.id, fees: feeRows });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const catalogExtras = FEE_CATALOG.filter(
    (c) => c.modes.includes(mode) && c.basis !== "unit_month" && c.basis !== "monthly_flat" && c.basis !== "net_rent_percent"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Titel für Screenreader; sichtbar steht die Frage im Kopf. */}
        <DialogTitle className="sr-only">
          {contract ? "Vertrag bearbeiten" : "Neuen Vertrag anlegen"}
        </DialogTitle>

        {/* ---------- Kopf mit Fortschritt ---------- */}
        <div className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={
                    i < step
                      ? "w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs"
                      : i === step
                      ? "w-6 h-6 rounded-full bg-primary/15 text-primary border-2 border-primary grid place-items-center text-xs font-semibold"
                      : "w-6 h-6 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs"
                  }
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={i === step ? "text-sm font-medium" : "text-sm text-muted-foreground hidden sm:inline"}>
                  {s}
                </span>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-border hidden sm:block" />}
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold">
            {step === 0 && "Für welches Objekt ist der Vertrag?"}
            {step === 1 && "Wie lange sind wir bestellt?"}
            {step === 2 && "Was bekommen wir im Monat?"}
            {step === 3 && "Was rechnen wir zusätzlich ab?"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {step === 0 && "Wähle das Objekt aus. Alles Weitere richtet sich danach."}
            {step === 1 && "Steht im Vertrag oben im Rubrum. Was du nicht weißt, kannst du später ergänzen."}
            {step === 2 && "Steht in § 3 des Vertrags, in der Vergütungstabelle."}
            {step === 3 && "Steht in § 4. Mit einem Klick kannst du unsere Standardwerte übernehmen."}
          </p>
        </div>

        {/* ---------- Inhalt ---------- */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* ===== Schritt 1: Objekt ===== */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Objekt suchen…"
                  value={buildingSearch}
                  onChange={(e) => setBuildingSearch(e.target.value)}
                />
              </div>
              <div className="border rounded-md divide-y max-h-[46vh] overflow-y-auto">
                {filteredBuildings.map((b) => {
                  const active = buildingId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBuildingId(b.id)}
                      className={
                        active
                          ? "w-full text-left px-4 py-3 flex items-center gap-3 bg-primary/10"
                          : "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted transition-colors"
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[b.city, b.building_code].filter(Boolean).join(" · ")}
                          {b.unit_count ? ` · ${b.unit_count} Einheiten` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {b.management_mode === "weg" ? "WEG" : "Miete"}
                      </Badge>
                      {active && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
                {filteredBuildings.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Kein Objekt gefunden.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== Schritt 2: Zeitraum ===== */}
          {step === 1 && (
            <div className="space-y-5 max-w-lg">
              <div>
                <Label className="text-base">Ab wann verwalten wir das Objekt?</Label>
                <Input className="mt-1.5" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>

              <div>
                <Label className="text-base">Bis wann sind wir bestellt?</Label>
                <Input
                  className="mt-1.5"
                  type="date"
                  value={until}
                  disabled={openEnded}
                  onChange={(e) => setUntil(e.target.value)}
                />
                <label className="flex items-center gap-2 mt-2.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={openEnded}
                    onCheckedChange={(v) => {
                      setOpenEnded(!!v);
                      if (v) setUntil("");
                    }}
                  />
                  Wir sind unbefristet bestellt
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  Das Enddatum brauchen wir, damit dich die App rechtzeitig an die Wiederbestellung erinnert.
                </p>
              </div>

              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                    <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                    Wie wurde die Bestellung beschlossen?
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div>
                    <Label>Datum des Beschlusses</Label>
                    <Input className="mt-1.5" type="date" value={resolutionDate} onChange={(e) => setResolutionDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Wo steht das?</Label>
                    <Input
                      className="mt-1.5"
                      value={resolutionRef}
                      onChange={(e) => setResolutionRef(e.target.value)}
                      placeholder="z. B. Umlaufbeschluss, oder Versammlung TOP 5"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* ===== Schritt 3: Honorar ===== */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Was die App zu diesem Objekt schon weiß. Nur ein Angebot —
                  übernommen wird es erst auf Klick. */}
              {unitStats && (unitStats.unitCount != null || unitStats.assignedTotal > 0) && (
                <div className="rounded-md border bg-muted/40 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                    In der App hinterlegt
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {unitStats.unitCount != null && (
                      <span>
                        Gebäudedaten: <strong>{unitStats.unitCount}</strong> Einheiten
                      </span>
                    )}
                    {unitStats.assignedTotal > 0 && (
                      <span className="text-muted-foreground">
                        Erfasste Zuordnungen: {unitStats.assigned.apartment} Wohnungen
                        {unitStats.assigned.commercial > 0 && `, ${unitStats.assigned.commercial} Teileigentum`}
                        {unitStats.assigned.parking > 0 && `, ${unitStats.assigned.parking} Stellplätze`}
                        {unitStats.assigned.other > 0 && `, ${unitStats.assigned.other} sonstige`}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        const a = unitStats.assigned.apartment || unitStats.unitCount || 0;
                        setUnits((prev) =>
                          prev.map((u) =>
                            u.kind === "apartment"
                              ? { ...u, count: a ? String(a) : u.count }
                              : u.kind === "parking" && unitStats.assigned.parking
                              ? { ...u, count: String(unitStats.assigned.parking) }
                              : u.kind === "commercial" && unitStats.assigned.commercial
                              ? { ...u, count: String(unitStats.assigned.commercial) }
                              : u
                          )
                        );
                      }}
                    >
                      Zahlen übernehmen
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Maßgeblich bleibt, was im Vertrag steht — die Zahlen unten kannst du frei ändern.
                  </p>
                </div>
              )}

              <div className="inline-flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setBaseIsGross(false)}
                  className={!baseIsGross ? "px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground" : "px-3 py-1.5 text-sm rounded text-muted-foreground"}
                >
                  Beträge sind netto
                </button>
                <button
                  type="button"
                  onClick={() => setBaseIsGross(true)}
                  className={baseIsGross ? "px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground" : "px-3 py-1.5 text-sm rounded text-muted-foreground"}
                >
                  Beträge sind mit MwSt.
                </button>
              </div>

              <div className="space-y-3">
                {units.map((u, i) => (
                  <div key={u.kind} className="border rounded-md p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="font-medium text-sm">{u.label}</div>
                      {u.kind !== "apartment" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => removeUnitKind(u.kind)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">Wie viele?</Label>
                        <Input
                          className="mt-1"
                          inputMode="numeric"
                          value={u.count}
                          onChange={(e) => setUnit(i, { count: e.target.value })}
                          placeholder="6"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Wie viel pro Einheit im Monat?</Label>
                        <div className="relative mt-1">
                          <Input
                            inputMode="decimal"
                            value={u.rate}
                            onChange={(e) => setUnit(i, { rate: e.target.value })}
                            placeholder="30,00"
                            className="pr-7"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground pb-2.5 tabular-nums whitespace-nowrap">
                        = {formatEur(toNet(dec(u.rate) ?? 0, baseIsGross, 19) * (dec(u.count) ?? 0))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Garagen: bewusste Ja/Nein-Frage statt stiller Annahme */}
              {!units.some((u) => u.kind === "parking") && (
                <div className="border rounded-md p-4">
                  <div className="font-medium text-sm">Rechnen wir Garagen und Stellplätze extra ab?</div>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                    Bei manchen Verträgen sind sie im Satz pro Wohnung enthalten.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant={parkingSeparate === false ? "default" : "outline"}
                      size="sm"
                      onClick={() => chooseParking(false)}
                    >
                      Nein, im Wohnungssatz enthalten
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => chooseParking(true)}
                    >
                      Ja, extra
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(["commercial", "other"] as FeeUnitKind[])
                  .filter((k) => !units.some((u) => u.kind === k))
                  .map((k) => (
                    <Button key={k} variant="ghost" size="sm" className="gap-1.5" onClick={() => addUnitKind(k)}>
                      <Plus className="w-3.5 h-3.5" />
                      {UNIT_LABEL[k]}
                    </Button>
                  ))}
              </div>

              <div className="rounded-md bg-primary/10 border border-primary/20 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Ergibt</div>
                <div className="text-2xl font-semibold text-primary tabular-nums mt-1">
                  {formatEur(monthlyNetTotal)} <span className="text-sm font-normal text-muted-foreground">netto im Monat</span>
                </div>
                <div className="text-sm text-muted-foreground tabular-nums mt-0.5">
                  {formatEur(monthlyNetTotal * 12)} netto im Jahr
                </div>
              </div>
            </div>
          )}

          {/* ===== Schritt 4: Zusatzleistungen ===== */}
          {step === 3 && (
            <div className="space-y-4">
              {extras.length === 0 && (
                <div className="border border-dashed rounded-md p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Noch keine Zusatzleistungen erfasst.
                  </p>
                  <Button onClick={applyRgiStandard} className="gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Standardwerte aus unserem Verwaltervertrag übernehmen
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    Eigentümerwechsel, § 35a, außerordentliche Versammlung, Versicherungsschaden,
                    Bau-Staffel und Stundensatz. Danach alles einzeln anpassbar.
                  </p>
                </div>
              )}

              {extras.map((e) => {
                const pct = isPercentBasis(e.basis);
                return (
                  <div key={e._key} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Input
                        className="flex-1 font-medium"
                        value={e.label}
                        placeholder="Was rechnen wir ab?"
                        onChange={(ev) => setExtra(e._key, { label: ev.target.value })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeExtra(e._key)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      {e.fee_type === "custom" && (
                        <div className="min-w-[220px]">
                          <Label className="text-xs text-muted-foreground">Wie wird gerechnet?</Label>
                          <Select value={e.basis} onValueChange={(v) => setExtra(e._key, { basis: v as FeeBasis })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {BASIS_CHOICES.map((c) => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="w-[150px]">
                        <Label className="text-xs text-muted-foreground">{pct ? "Prozentsatz" : "Betrag"}</Label>
                        <Input
                          className="mt-1"
                          inputMode="decimal"
                          value={e.value}
                          onChange={(ev) => setExtra(e._key, { value: ev.target.value })}
                          placeholder={pct ? "5" : "250,00"}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground pb-2.5">{BASIS_SUFFIX[e.basis]}</span>

                      {!pct && (
                        <div className="inline-flex rounded-md border p-0.5 mb-1">
                          <button
                            type="button"
                            onClick={() => setExtra(e._key, { is_gross: false })}
                            className={!e.is_gross ? "px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground" : "px-2.5 py-1 text-xs rounded text-muted-foreground"}
                          >
                            netto
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtra(e._key, { is_gross: true })}
                            className={e.is_gross ? "px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground" : "px-2.5 py-1 text-xs rounded text-muted-foreground"}
                          >
                            mit MwSt.
                          </button>
                        </div>
                      )}
                    </div>

                    {pct && (
                      <div className="flex flex-wrap gap-3">
                        <div className="w-[170px]">
                          <Label className="text-xs text-muted-foreground">Erst ab einer Summe von</Label>
                          <Input className="mt-1" inputMode="decimal" value={e.threshold}
                            onChange={(ev) => setExtra(e._key, { threshold: ev.target.value })} placeholder="5.000,00" />
                        </div>
                        <div className="w-[150px]">
                          <Label className="text-xs text-muted-foreground">Mindestens aber</Label>
                          <Input className="mt-1" inputMode="decimal" value={e.min_amount}
                            onChange={(ev) => setExtra(e._key, { min_amount: ev.target.value })} placeholder="250,00" />
                        </div>
                        {e.has_tier && (
                          <div className="flex gap-3">
                            <div className="w-[140px]">
                              <Label className="text-xs text-muted-foreground">Diese Stufe gilt von</Label>
                              <Input className="mt-1" inputMode="decimal" value={e.tier_from}
                                onChange={(ev) => setExtra(e._key, { tier_from: ev.target.value })}
                                placeholder="0,00" />
                            </div>
                            <div className="w-[140px]">
                              <Label className="text-xs text-muted-foreground">bis</Label>
                              <Input className="mt-1" inputMode="decimal" value={e.tier_to}
                                onChange={(ev) => setExtra(e._key, { tier_to: ev.target.value })}
                                placeholder="nach oben offen" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {pct && (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={e.has_tier}
                            onCheckedChange={(v) => setExtra(e._key, { has_tier: !!v })}
                          />
                          Der Satz gilt gestaffelt
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={e.halved_if_supervised}
                            onCheckedChange={(v) => setExtra(e._key, { halved_if_supervised: !!v })}
                          />
                          Halbiert sich, wenn ein Architekt die Bauleitung führt
                        </label>
                      </div>
                    )}
                    {pct && e.has_tier && (
                      <p className="text-xs text-muted-foreground">
                        Für jede weitere Stufe eine eigene Position mit demselben Namen anlegen und
                        die Grenzen setzen — so wie in § 4 Ziff. 8 unseres Vertrags.
                      </p>
                    )}

                    {e.basis === "item" && (
                      <div className="w-[220px]">
                        <Label className="text-xs text-muted-foreground">Höchstens wie oft?</Label>
                        <Input className="mt-1" inputMode="numeric" value={e.max_count}
                          onChange={(ev) => setExtra(e._key, { max_count: ev.target.value })} placeholder="unbegrenzt" />
                      </div>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[200px]">
                        <Label className="text-xs text-muted-foreground">Wer zahlt das?</Label>
                        <Select value={e.debtor} onValueChange={(v) => setExtra(e._key, { debtor: v as any })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="community">Die Gemeinschaft</SelectItem>
                            <SelectItem value="owner">Der einzelne Eigentümer</SelectItem>
                            <SelectItem value="tenant">Der Mieter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        className="flex-1 min-w-[180px] h-9 text-sm"
                        value={e.note}
                        placeholder="Notiz, z. B. § 4 Ziff. 3"
                        onChange={(ev) => setExtra(e._key, { note: ev.target.value })}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2 items-center">
                <Select value="" onValueChange={(v) => {
                  const [ft, ...rest] = v.split("|");
                  addExtraFromCatalog(ft, rest.join("|"));
                }}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Leistung aus der Liste hinzufügen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogExtras.map((c) => (
                      <SelectItem key={`${c.fee_type}|${c.label}`} value={`${c.fee_type}|${c.label}`}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={addFreeExtra}>
                  <Plus className="w-4 h-4" />Etwas anderes
                </Button>
                {extras.length > 0 && (
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={applyRgiStandard}>
                    <Sparkles className="w-4 h-4" />Standardwerte einsetzen
                  </Button>
                )}
              </div>

              {/* Feinheiten, standardmäßig zu */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                    <ChevronDown className="w-4 h-4" />
                    Feinheiten: Indexanpassung, Freigabegrenze, Vertragsdatei
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Index-Stand bei Vertragsschluss</Label>
                      <Input className="mt-1" type="month" value={indexMonth} onChange={(e) => setIndexMonth(e.target.value)} />
                      <p className="text-xs text-muted-foreground mt-1">Monat, auf den sich der Vertrag bezieht.</p>
                    </div>
                    <div>
                      <Label className="text-sm">Indexwert</Label>
                      <Input className="mt-1" inputMode="decimal" value={indexValue}
                        onChange={(e) => setIndexValue(e.target.value)} placeholder="122,20" />
                      <p className="text-xs text-muted-foreground mt-1">Verbraucherpreisindex, Basis 2020 = 100.</p>
                    </div>
                    <div>
                      <Label className="text-sm">Freigabegrenze für eigene Aufträge</Label>
                      <Input className="mt-1" inputMode="decimal" value={approvalLimit}
                        onChange={(e) => setApprovalLimit(e.target.value)} placeholder="1.500,00" />
                    </div>
                    <div>
                      <Label className="text-sm">Vertragsdatei im DMS</Label>
                      <Select value={dmsFileId || "none"} onValueChange={(v) => setDmsFileId(v === "none" ? "" : v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Datei wählen…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Keine Verknüpfung</SelectItem>
                          {(dmsFiles ?? []).map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>{f.display_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Notizen</Label>
                    <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>

        {/* ---------- Fuß ---------- */}
        <div className="px-6 py-4 border-t flex items-center gap-2 bg-muted/30">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Zurück
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          )}

          {step === 2 && monthlyNetTotal > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums hidden sm:inline">
              {formatEur(monthlyNetTotal)} im Monat
            </span>
          )}

          <div className="flex-1" />

          {step < STEPS.length - 1 ? (
            <>
              {step >= 2 && (
                <Button variant="outline" onClick={submit} disabled={saving || !canContinue}>
                  Speichern und schließen
                </Button>
              )}
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className="gap-1.5">
                Weiter<ArrowRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button onClick={submit} disabled={saving || !buildingId} className="gap-1.5">
              {saving ? "Speichern…" : <>Vertrag speichern<Check className="w-4 h-4" /></>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
