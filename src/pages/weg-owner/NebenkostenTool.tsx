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
} from "@/lib/services/nebenkosten";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Lock, Plus, Trash2, AlertCircle, ArrowLeft } from "lucide-react";
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
};

const DEFAULT_EXTRA_COST_TYPES = [
  { type: "grundsteuer", label: "Grundsteuer" },
  { type: "kabel_tv", label: "Kabel / TV" },
  { type: "wartung_se", label: "Wartung Sondereigentum" },
];

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
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(false);

  // Mieter-Daten
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");
  const [persons, setPersons] = useState<number | "">("");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [prepayMonthly, setPrepayMonthly] = useState<number | "">("");

  // Direkte Eigentümerkosten
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([]);

  // Kauf-Dialog
  const [buyOpen, setBuyOpen] = useState(false);
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId);
  const selectedPeriod = periods.find((p) => p.id === periodId);

  // 1. Wohnungen laden (via Edge Function – umgeht RLS-Edge-Cases)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-owner-units");
        if (error) throw error;
        const units = (data?.units ?? []) as Assignment[];
        if (units.length === 0) {
          console.warn("[NebenkostenTool] keine Wohnungen für user", user.id);
        }
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

  // 3. Positionen + Mieter + Extra-Kosten laden
  useEffect(() => {
    if (!assignmentId || !periodId || !selectedPeriod || !user) return;
    setLoadingData(true);
    (async () => {
      try {
        const [positions, tenancyRes, costsRes] = await Promise.all([
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

        setAutoPositions(positions);
        setDisabledAccounts(new Set());

        const t = tenancyRes.data;
        if (t) {
          setTenancyId(t.id);
          setTenantName(t.tenant_name ?? "");
          setTenantAddress(t.tenant_address ?? "");
          setPersons(t.persons ?? "");
          setMoveIn(t.move_in ?? "");
          setMoveOut(t.move_out ?? "");
          setPrepayMonthly(t.nk_prepayment_monthly ?? "");
        } else {
          setTenancyId(null);
        }

        const ec = (costsRes.data ?? []).map((c: any) => ({
          id: c.id,
          cost_type: c.cost_type,
          label: c.label ?? c.cost_type,
          amount: Number(c.amount),
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

  // Speicherfunktionen (Save on blur)
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
    setExtraCosts((prev) => [...prev, { cost_type: type, label, amount: 0 }]);
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

  // Summen
  const totals = useMemo(() => {
    const autoSum = autoPositions
      .filter((p) => !disabledAccounts.has(p.account_number))
      .reduce((s, p) => s + p.share_amount, 0);
    const extraSum = extraCosts.reduce((s, c) => s + (c.amount || 0), 0);
    const costSum = autoSum + extraSum;
    const months = monthsInPeriod(moveIn, moveOut, selectedPeriod);
    const prepaySum = (Number(prepayMonthly) || 0) * months;
    const result = costSum - prepaySum;
    return { autoSum, extraSum, costSum, prepaySum, result, months };
  }, [autoPositions, disabledAccounts, extraCosts, prepayMonthly, moveIn, moveOut, selectedPeriod]);

  const canBuy = !!(
    assignmentId &&
    periodId &&
    tenantName &&
    tenantAddress &&
    persons &&
    !loadingData
  );

  const handleBuy = async () => {
    if (!user || !selectedPeriod || !assignmentId || !waiverChecked) return;
    setSubmitting(true);
    try {
      // Tenancy/Costs noch sichern
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
            share_amount: p.share_amount,
            distribution_key: p.distribution_key,
          })),
        extra_costs: extraCosts.map((c) => ({
          cost_type: c.cost_type,
          label: c.label,
          amount: c.amount,
        })),
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
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/weg-owner/service-hub")}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Zurück zum Service-Hub
      </Button>
      <h1
        className="text-2xl font-bold mb-1"
        style={{ fontFamily: "Century Gothic, sans-serif" }}
      >
        Nebenkostenabrechnung für Mieter
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Felder mit grünem Hintergrund stammen aus Ihren Stammdaten bzw. der
        WEG-Abrechnung. Gelbe Felder bitte ergänzen.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Linke Spalte: Formular */}
        <div className="lg:col-span-2 space-y-6">
          {/* Auswahl */}
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-lg">Auswahl</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Wohnung</Label>
                <Select
                  value={assignmentId ?? ""}
                  onValueChange={(v) => setAssignmentId(v)}
                >
                  <SelectTrigger>
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
              </div>
              <div>
                <Label>Abrechnungsjahr</Label>
                <Select
                  value={periodId ?? ""}
                  onValueChange={(v) => setPeriodId(v)}
                  disabled={!assignmentId || periods.length === 0}
                >
                  <SelectTrigger>
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
              </div>
            </div>
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

          </Card>

          {assignmentId && periodId && (
            <>
              {/* Mieter-Daten */}
              <Card className="p-5 space-y-4">
                <h2 className="font-semibold text-lg">Mieter</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Name des Mieters *</Label>
                    <Input
                      className="bg-amber-50"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      onBlur={saveTenancy}
                    />
                  </div>
                  <div>
                    <Label>Anzahl Personen *</Label>
                    <Input
                      type="number"
                      className="bg-amber-50"
                      value={persons}
                      onChange={(e) =>
                        setPersons(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      onBlur={saveTenancy}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Adresse *</Label>
                    <Input
                      className="bg-amber-50"
                      value={tenantAddress}
                      onChange={(e) => setTenantAddress(e.target.value)}
                      onBlur={saveTenancy}
                    />
                  </div>
                  <div>
                    <Label>Einzug</Label>
                    <Input
                      type="date"
                      className="bg-amber-50"
                      value={moveIn}
                      onChange={(e) => setMoveIn(e.target.value)}
                      onBlur={saveTenancy}
                    />
                  </div>
                  <div>
                    <Label>Auszug</Label>
                    <Input
                      type="date"
                      className="bg-amber-50"
                      value={moveOut}
                      onChange={(e) => setMoveOut(e.target.value)}
                      onBlur={saveTenancy}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>NK-Vorauszahlung pro Monat (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="bg-amber-50"
                      value={prepayMonthly}
                      onChange={(e) =>
                        setPrepayMonthly(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                      onBlur={saveTenancy}
                    />
                  </div>
                </div>
              </Card>

              {/* Automatische Positionen */}
              <Card className="p-5 space-y-3">
                <h2 className="font-semibold text-lg">
                  Positionen aus der WEG-Abrechnung
                </h2>
                {loadingData ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Lade Positionen…
                  </div>
                ) : autoPositions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine umlagefähigen Positionen gefunden.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {autoPositions.map((p) => {
                      const disabled = disabledAccounts.has(p.account_number);
                      return (
                        <div
                          key={p.account_number}
                          className={`flex items-center gap-3 p-2 rounded ${
                            disabled ? "bg-muted/30 opacity-60" : "bg-green-50/60"
                          }`}
                        >
                          <Checkbox
                            checked={!disabled}
                            onCheckedChange={(c) => {
                              setDisabledAccounts((prev) => {
                                const n = new Set(prev);
                                c ? n.delete(p.account_number) : n.add(p.account_number);
                                return n;
                              });
                            }}
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{p.account_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Konto {p.account_number} · Schlüssel{" "}
                              {p.distribution_key.toUpperCase()}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold">
                              {p.share_amount.toFixed(2)} €
                            </div>
                            <div className="text-xs text-muted-foreground">
                              gesamt {p.total_amount.toFixed(2)} €
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Eigene Kosten */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">
                    Direkte Eigentümer-Kosten
                  </h2>
                  <div className="flex gap-1">
                    {DEFAULT_EXTRA_COST_TYPES.map((d) => (
                      <Button
                        key={d.type}
                        size="sm"
                        variant="outline"
                        onClick={() => addExtraCost(d.type, d.label)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {d.label}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addExtraCost("sonstige", "Sonstige")}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Freie Position
                    </Button>
                  </div>
                </div>
                {extraCosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Hier können Sie Kosten ergänzen, die direkt bei Ihnen
                    angefallen sind (Grundsteuer, Kabel-TV, Wartung …).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {extraCosts.map((c, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_140px_40px] gap-2 items-center bg-amber-50 p-2 rounded"
                      >
                        <Input
                          value={c.label}
                          onChange={(e) =>
                            updateExtraCost(idx, { label: e.target.value })
                          }
                          onBlur={() => saveExtraCost(idx)}
                          placeholder="Bezeichnung"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={c.amount}
                          onChange={(e) =>
                            updateExtraCost(idx, { amount: Number(e.target.value) })
                          }
                          onBlur={() => saveExtraCost(idx)}
                          placeholder="€"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeExtraCost(idx)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>

        {/* Rechte Spalte: Preview */}
        <div>
          <Card className="p-5 sticky top-20 space-y-3">
            <h2 className="font-semibold text-lg">Vorschau</h2>
            {!assignmentId || !periodId ? (
              <p className="text-sm text-muted-foreground">
                Wählen Sie zuerst Wohnung und Jahr.
              </p>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  Wohnung Nr. {selectedAssignment?.unit_number} · {selectedPeriod?.fiscal_year}
                </div>
                <div className="space-y-1 text-sm">
                  <Row label="Anteil WEG-Kosten" value={totals.autoSum} />
                  <Row label="Direkte Kosten" value={totals.extraSum} />
                  <div className="border-t pt-1">
                    <Row
                      label="Summe Nebenkosten"
                      value={totals.costSum}
                      bold
                    />
                  </div>
                  <Row
                    label={`Vorauszahlungen (${totals.months} Monate)`}
                    value={-totals.prepaySum}
                  />
                </div>
                <div className="bg-muted rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Ergebnis
                    </div>
                    <div className="text-lg font-bold flex items-center gap-1">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      XX,** €
                    </div>
                  </div>
                  <Badge variant="secondary">nach Kauf</Badge>
                </div>

                {price && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Preis</span>
                      <span className="font-bold">
                        {formatPrice(price.price_cents, price.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      inkl. 19&nbsp;% USt. Rechnung kommt per E-Mail von Stripe.
                    </p>
                    <Button
                      className="w-full"
                      disabled={!canBuy}
                      onClick={() => setBuyOpen(true)}
                    >
                      Jetzt kaufen
                    </Button>
                    {!canBuy && (
                      <p className="text-xs text-muted-foreground">
                        Bitte alle Pflichtfelder (Mieter, Adresse, Personen) ausfüllen.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zahlungspflichtig bestellen</DialogTitle>
            <DialogDescription>
              Nach erfolgreicher Zahlung erstellen wir Ihre Nebenkostenabrechnung
              als PDF und stellen sie hier zum Download bereit.
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
                Wohnung Nr. {selectedAssignment?.unit_number}, Mieter: {tenantName}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm bg-amber-50 p-3 rounded cursor-pointer">
              <Checkbox
                checked={waiverChecked}
                onCheckedChange={(c) => setWaiverChecked(!!c)}
                className="mt-0.5"
              />
              <span>
                <strong>Ich verlange ausdrücklich</strong>, dass mit der Erstellung
                des Dokuments sofort nach Zahlungseingang begonnen wird, und bestätige,
                dass mein Widerrufsrecht mit vollständiger Ausführung erlischt.
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Mit dem Kauf akzeptieren Sie unsere{" "}
              <a href="/legal/agb" target="_blank" className="underline">AGB</a> und die{" "}
              <a href="/legal/datenschutz" target="_blank" className="underline">
                Datenschutzerklärung
              </a>{" "}
              (Version {CURRENT_LEGAL_VERSION}).
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleBuy} disabled={!waiverChecked || submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Zahlungspflichtig bestellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value.toFixed(2)} €</span>
    </div>
  );
}

function monthsInPeriod(
  moveIn: string,
  moveOut: string,
  period?: FinalizedPeriod | undefined,
): number {
  if (!period) return 0;
  const pFrom = new Date(period.period_from);
  const pTo = new Date(period.period_to);
  const from = moveIn ? new Date(moveIn) : pFrom;
  const to = moveOut ? new Date(moveOut) : pTo;
  const start = from > pFrom ? from : pFrom;
  const end = to < pTo ? to : pTo;
  if (end < start) return 0;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1;
  return Math.max(0, Math.min(12, months));
}
