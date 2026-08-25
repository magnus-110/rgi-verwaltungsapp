import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useUpsertContract, useSaveContractFees, useContractFilesForBuilding,
} from "@/hooks/useManagementContracts";
import {
  FEE_BASIS_LABEL, FEE_CATALOG, FEE_DEBTOR_LABEL, FEE_UNIT_KIND_LABEL,
  formatEur, isPercentBasis, monthlyNet,
  type ContractFee, type ContractWithDetails, type FeeBasis, type FeeDebtor,
  type FeeUnitKind, type ManagementMode,
} from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract?: ContractWithDetails | null;
  /** Vorbelegtes Gebäude, wenn aus der Lückenliste angelegt wird. */
  presetBuildingId?: string | null;
}

type FeeDraft = Partial<ContractFee> & { _key: string };

let keySeq = 0;
const nextKey = () => `f${++keySeq}`;

function emptyContract(buildingId?: string | null) {
  return {
    building_id: buildingId ?? "",
    status: "active",
    parking_billed_separately: false,
    self_debit_day: 3,
    payment_interval: "monatlich",
    index_lock_months: 12,
  } as any;
}

export function ContractDialog({ open, onOpenChange, contract, presetBuildingId }: Props) {
  const upsert = useUpsertContract();
  const saveFees = useSaveContractFees();
  const [form, setForm] = useState<any>(emptyContract());
  const [fees, setFees] = useState<FeeDraft[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: dmsFiles } = useContractFilesForBuilding(form.building_id);

  useEffect(() => {
    if (!open) return;
    setForm(contract ? { ...contract } : emptyContract(presetBuildingId));
    setFees((contract?.fees ?? []).map((f) => ({ ...f, _key: nextKey() })));
    // types.ts im Repo ist veraltet, daher ungetypter Zugriff.
    (supabase as any)
      .from("buildings")
      .select("id, name, building_code, management_mode, unit_count, city")
      .order("name")
      .then(({ data }: any) => setBuildings(data ?? []));
  }, [open, contract, presetBuildingId]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

  const selectedBuilding = buildings.find((b) => b.id === form.building_id);
  const mode: ManagementMode = (selectedBuilding?.management_mode as ManagementMode) ?? "weg";

  const catalogForMode = useMemo(
    () => FEE_CATALOG.filter((c) => c.modes.includes(mode)),
    [mode]
  );

  const monthly = useMemo(() => monthlyNet(fees as ContractFee[]), [fees]);

  const addFee = (entry?: typeof FEE_CATALOG[number]) => {
    setFees((prev) => [
      ...prev,
      {
        _key: nextKey(),
        fee_type: entry?.fee_type ?? "custom",
        label: entry?.label ?? "",
        basis: entry?.basis ?? "case",
        unit_kind: entry?.unit_kind ?? null,
        debtor: entry?.debtor ?? "community",
        is_gross: false,
        vat_rate: 19,
        is_active: true,
        quantity: entry?.basis === "unit_month" ? null : 1,
      },
    ]);
  };

  const setFee = (key: string, patch: Partial<ContractFee>) =>
    setFees((prev) => prev.map((f) => (f._key === key ? { ...f, ...patch } : f)));

  const removeFee = (key: string) => setFees((prev) => prev.filter((f) => f._key !== key));

  /** Übernimmt die Einheitenzahlen aus dem Kopf in die passenden Bausteine. */
  const applyUnitCounts = () => {
    const map: Record<string, any> = {
      apartment: form.units_apartment,
      commercial: form.units_commercial,
      parking: form.units_parking,
      other: form.units_other,
    };
    setFees((prev) =>
      prev.map((f) =>
        f.basis === "unit_month" && f.unit_kind && map[f.unit_kind] != null
          ? { ...f, quantity: Number(map[f.unit_kind]) }
          : f
      )
    );
  };

  const submit = async () => {
    if (!form.building_id) return;
    setSaving(true);
    try {
      const { fees: _drop, building: _drop2, ...payload } = form;
      const saved = await upsert.mutateAsync(payload);
      await saveFees.mutateAsync({
        contractId: saved.id,
        fees: fees.map(({ _key, ...f }) => f),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract ? "Vertrag bearbeiten" : "Neuer Vertrag"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ---------- Objekt und Bestellung ---------- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Objekt und Bestellung</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Objekt *</Label>
                <Select value={form.building_id ?? ""} onValueChange={(v) => set("building_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Objekt wählen…" /></SelectTrigger>
                  <SelectContent>
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.building_code ? `· ${b.building_code}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBuilding && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {mode === "weg" ? "WEG-Verwaltung" : "Mietverwaltung"}
                    {selectedBuilding.unit_count != null && ` · ${selectedBuilding.unit_count} Einheiten in den Stammdaten`}
                  </p>
                )}
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Entwurf</SelectItem>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="ended">Beendet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bestellung von</Label>
                <Input type="date" value={form.appointed_from ?? ""} onChange={(e) => set("appointed_from", e.target.value || null)} />
              </div>
              <div>
                <Label>Bestellung bis</Label>
                <Input type="date" value={form.appointed_until ?? ""} onChange={(e) => set("appointed_until", e.target.value || null)} />
                <p className="text-xs text-muted-foreground mt-1">Leer lassen bei unbefristeter Bestellung.</p>
              </div>
              <div>
                <Label>Beschlussdatum</Label>
                <Input type="date" value={form.resolution_date ?? ""} onChange={(e) => set("resolution_date", e.target.value || null)} />
              </div>
              <div>
                <Label>Beschluss / TOP</Label>
                <Input value={form.resolution_ref ?? ""} onChange={(e) => set("resolution_ref", e.target.value)} placeholder="z. B. Umlaufbeschluss vom 12.03.2026" />
              </div>
              <div>
                <Label>Bezeichnung der Fassung</Label>
                <Input value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} placeholder="z. B. Fassung 2027" />
              </div>
              <div>
                <Label>Vertragsvorlage</Label>
                <Input value={form.template_version ?? ""} onChange={(e) => set("template_version", e.target.value)} placeholder="z. B. Boorberg M-54 510 oder RGI 2026" />
              </div>
            </div>
          </section>

          <Separator />

          {/* ---------- Einheiten ---------- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold">Einheiten nach Vertrag</h3>
              <Button type="button" variant="outline" size="sm" onClick={applyUnitCounts}>
                In Bausteine übernehmen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Bewusst getrennt von den Stammdaten des Gebäudes: maßgeblich ist, was im Vertrag steht.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Wohneinheiten</Label><Input type="number" value={form.units_apartment ?? ""} onChange={(e) => set("units_apartment", num(e.target.value))} /></div>
              <div><Label>Teileigentum</Label><Input type="number" value={form.units_commercial ?? ""} onChange={(e) => set("units_commercial", num(e.target.value))} /></div>
              <div><Label>Garagen / Stellplätze</Label><Input type="number" value={form.units_parking ?? ""} onChange={(e) => set("units_parking", num(e.target.value))} /></div>
              <div><Label>Sonstige</Label><Input type="number" value={form.units_other ?? ""} onChange={(e) => set("units_other", num(e.target.value))} /></div>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                checked={!!form.parking_billed_separately}
                onCheckedChange={(v) => set("parking_billed_separately", v)}
              />
              <div className="text-sm">
                <div className="font-medium">Stellplätze werden separat vergütet</div>
                <p className="text-xs text-muted-foreground">
                  Aus, wenn Garagen und Stellplätze im Satz je Wohneinheit enthalten sind.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* ---------- Honorarbausteine ---------- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Honorarbausteine</h3>
                <p className="text-xs text-muted-foreground">
                  Grundvergütung netto pro Monat: <span className="font-medium text-foreground">{formatEur(monthly)}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Select value="" onValueChange={(v) => {
                  const entry = catalogForMode.find((c) => `${c.fee_type}|${c.label}` === v);
                  addFee(entry);
                }}>
                  <SelectTrigger className="w-[240px]"><SelectValue placeholder="Aus Katalog hinzufügen…" /></SelectTrigger>
                  <SelectContent>
                    {catalogForMode.map((c) => (
                      <SelectItem key={`${c.fee_type}|${c.label}`} value={`${c.fee_type}|${c.label}`}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => addFee()}>
                  <Plus className="w-4 h-4 mr-1" />Freie Position
                </Button>
              </div>
            </div>

            {fees.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Noch keine Bausteine. Wähle aus dem Katalog oder lege eine freie Position an.
              </div>
            )}

            <div className="space-y-3">
              {fees.map((f) => {
                const pct = isPercentBasis(f.basis as FeeBasis);
                return (
                  <div key={f._key} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <Input
                        className="flex-1"
                        value={f.label ?? ""}
                        placeholder="Bezeichnung"
                        onChange={(e) => setFee(f._key, { label: e.target.value })}
                      />
                      {!f.is_active && <Badge variant="secondary">inaktiv</Badge>}
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeFee(f._key)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Bemessung</Label>
                        <Select
                          value={f.basis ?? "case"}
                          onValueChange={(v) => setFee(f._key, { basis: v as FeeBasis })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FEE_BASIS_LABEL).map(([k, label]) => (
                              <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {f.basis === "unit_month" && (
                        <div>
                          <Label className="text-xs">Einheitenart</Label>
                          <Select
                            value={f.unit_kind ?? "apartment"}
                            onValueChange={(v) => setFee(f._key, { unit_kind: v as FeeUnitKind })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(FEE_UNIT_KIND_LABEL).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {pct ? (
                        <div>
                          <Label className="text-xs">Prozentsatz</Label>
                          <Input
                            inputMode="decimal"
                            value={f.percent ?? ""}
                            onChange={(e) => setFee(f._key, { percent: num(e.target.value) as any })}
                            placeholder="z. B. 5"
                          />
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">Betrag</Label>
                          <Input
                            inputMode="decimal"
                            value={f.amount ?? ""}
                            onChange={(e) => setFee(f._key, { amount: num(e.target.value) as any })}
                            placeholder="z. B. 30,00"
                          />
                        </div>
                      )}

                      {f.basis === "unit_month" && (
                        <div>
                          <Label className="text-xs">Anzahl</Label>
                          <Input
                            type="number"
                            value={f.quantity ?? ""}
                            onChange={(e) => setFee(f._key, { quantity: num(e.target.value) as any })}
                          />
                        </div>
                      )}

                      <div>
                        <Label className="text-xs">USt.-Satz</Label>
                        <Input
                          inputMode="decimal"
                          value={f.vat_rate ?? 19}
                          onChange={(e) => setFee(f._key, { vat_rate: num(e.target.value) as any })}
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Schuldner</Label>
                        <Select
                          value={f.debtor ?? "community"}
                          onValueChange={(v) => setFee(f._key, { debtor: v as FeeDebtor })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FEE_DEBTOR_LABEL).map(([k, label]) => (
                              <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {pct && (
                        <>
                          <div>
                            <Label className="text-xs">ab Schwelle</Label>
                            <Input inputMode="decimal" value={f.threshold ?? ""} onChange={(e) => setFee(f._key, { threshold: num(e.target.value) as any })} placeholder="z. B. 5000" />
                          </div>
                          <div>
                            <Label className="text-xs">Mindestbetrag</Label>
                            <Input inputMode="decimal" value={f.min_amount ?? ""} onChange={(e) => setFee(f._key, { min_amount: num(e.target.value) as any })} placeholder="z. B. 250" />
                          </div>
                        </>
                      )}

                      {f.basis === "item" && (
                        <div>
                          <Label className="text-xs">Höchstanzahl</Label>
                          <Input type="number" value={f.max_count ?? ""} onChange={(e) => setFee(f._key, { max_count: num(e.target.value) as any })} placeholder="z. B. 3" />
                        </div>
                      )}

                      {f.basis === "hour" && (
                        <div>
                          <Label className="text-xs">Rolle</Label>
                          <Input value={f.role ?? ""} onChange={(e) => setFee(f._key, { role: e.target.value })} placeholder="Geschäftsführung" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={!!f.is_gross} onCheckedChange={(v) => setFee(f._key, { is_gross: v })} />
                        Betrag ist brutto (inkl. MwSt.)
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={f.is_active !== false} onCheckedChange={(v) => setFee(f._key, { is_active: v })} />
                        aktiv
                      </label>
                      <Input
                        className="flex-1 min-w-[180px] h-8 text-xs"
                        value={f.note ?? ""}
                        placeholder="Notiz, z. B. Vertragsziffer"
                        onChange={(e) => setFee(f._key, { note: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* ---------- Index und Sonstiges ---------- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Indexanpassung und Sonstiges</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Index-Referenzmonat</Label>
                <Input type="month" value={(form.index_base_month ?? "").slice(0, 7)} onChange={(e) => set("index_base_month", e.target.value ? `${e.target.value}-01` : null)} />
              </div>
              <div>
                <Label>Indexstand (Basis 2020 = 100)</Label>
                <Input inputMode="decimal" value={form.index_base_value ?? ""} onChange={(e) => set("index_base_value", num(e.target.value))} placeholder="z. B. 122,20" />
              </div>
              <div>
                <Label>Sperrfrist in Monaten</Label>
                <Input type="number" value={form.index_lock_months ?? ""} onChange={(e) => set("index_lock_months", num(e.target.value))} />
              </div>
              <div>
                <Label>Letzte Anpassung</Label>
                <Input type="date" value={form.index_last_applied ?? ""} onChange={(e) => set("index_last_applied", e.target.value || null)} />
              </div>
              <div>
                <Label>Entnahmetag</Label>
                <Input type="number" value={form.self_debit_day ?? ""} onChange={(e) => set("self_debit_day", num(e.target.value))} />
              </div>
              <div>
                <Label>Freigabegrenze Eigenaufträge</Label>
                <Input inputMode="decimal" value={form.approval_limit_amount ?? ""} onChange={(e) => set("approval_limit_amount", num(e.target.value))} placeholder="z. B. 1500" />
              </div>
            </div>
            <div>
              <Label>Vertrag im DMS</Label>
              <Select value={form.dms_file_id ?? "none"} onValueChange={(v) => set("dms_file_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Datei wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Verknüpfung</SelectItem>
                  {(dmsFiles ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kündigung / Abberufung</Label>
              <Textarea
                rows={2}
                value={form.termination_note ?? ""}
                onChange={(e) => set("termination_note", e.target.value)}
                placeholder="z. B. Vertragsende spätestens sechs Monate nach Abberufung, § 26 Abs. 3 WEG"
              />
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </section>

          <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-muted/50 p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Alle Werte sind frei eintragbar. Nichts wird aus den Gebäudestammdaten übernommen,
              solange du es nicht selbst über „In Bausteine übernehmen“ auslöst.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!form.building_id || saving}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
