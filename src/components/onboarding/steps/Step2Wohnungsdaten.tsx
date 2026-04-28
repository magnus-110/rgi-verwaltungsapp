import type { ReactNode } from "react";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";
import { MultiEntryList } from "../ui/MultiEntryList";
import {
  UNIT_KIND_OPTIONS,
  type UnitKind,
  type BillingMode,
} from "@/lib/secondaryUnits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export interface SecondaryUnitDraft {
  unit_kind: UnitKind;
  unit_number?: string;
  mea_share?: string;
  billing_mode: BillingMode;
  monthly_fee?: string; // nur relevant wenn billing_mode='own_billing'
}

export interface Step2Data {
  unit_number?: string;
  unit_description?: string;
  monthly_fee?: string;
  mea_share?: string;
  square_meters?: string;
  secondary_units?: SecondaryUnitDraft[];
}

interface Props {
  value: Step2Data;
  onChange: (next: Step2Data) => void;
}

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-[12px] text-muted-foreground mb-1">{children}</div>
);

// Default für eine neue Nebeneinheit
const newSecondaryUnit = (): SecondaryUnitDraft => ({
  unit_kind: "parking_garage",
  unit_number: "",
  mea_share: "",
  billing_mode: "distribution_only",
  monthly_fee: "",
});

export const Step2Wohnungsdaten = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step2Data>) => onChange({ ...value, ...patch });
  const secondaryUnits = value.secondary_units ?? [];

  return (
    <div className="space-y-2.5">
      <SectionCard label="WOHNUNG">
        <div className="px-4 py-3">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div>
              <FieldLabel>Nr.</FieldLabel>
              <EmbeddedInput
                value={value.unit_number ?? ""}
                onChange={(e) => set({ unit_number: e.target.value })}
                placeholder="0001"
              />
            </div>
            <div>
              <FieldLabel>Beschreibung</FieldLabel>
              <EmbeddedInput
                value={value.unit_description ?? ""}
                onChange={(e) => set({ unit_description: e.target.value })}
                placeholder="EG rechts"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="FINANZIELLE ECKDATEN">
        <div className="px-4 py-3 space-y-3">
          <div>
            <FieldLabel>Hausgeld (€/Monat)</FieldLabel>
            <EmbeddedInput
              value={value.monthly_fee ?? ""}
              onChange={(e) => set({ monthly_fee: e.target.value })}
              inputMode="decimal"
              placeholder="z. B. 350,00"
            />
          </div>
          <div>
            <FieldLabel>Miteigentumsanteile</FieldLabel>
            <EmbeddedInput
              value={value.mea_share ?? ""}
              onChange={(e) => set({ mea_share: e.target.value })}
              inputMode="decimal"
              placeholder="z. B. 125,5"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard label="WOHNFLÄCHE">
        <div className="px-4 py-3">
          <FieldLabel>Größe (m²)</FieldLabel>
          <EmbeddedInput
            value={value.square_meters ?? ""}
            onChange={(e) => set({ square_meters: e.target.value })}
            inputMode="decimal"
            placeholder="z. B. 78,50"
          />
        </div>
      </SectionCard>

      <SectionCard label="WEITERE EINHEITEN (z. B. Stellplatz, Keller)">
        <div className="px-4 pt-3 pb-1">
          <p className="text-[12px] text-muted-foreground">
            Optional. Tragen Sie hier zusätzliche Einheiten ein, die zu Ihrer Wohnung gehören
            (z. B. Tiefgaragen-Stellplatz, Keller, Hobbyraum, Gartenanteil).
          </p>
        </div>
        <MultiEntryList<SecondaryUnitDraft>
          items={secondaryUnits}
          onChange={(next) => set({ secondary_units: next })}
          newItem={newSecondaryUnit}
          minItems={0}
          addLabel="Weitere Einheit hinzufügen"
          renderItem={(item, update) => (
            <div className="space-y-2.5 py-1">
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <FieldLabel>Art</FieldLabel>
                  <Select
                    value={item.unit_kind}
                    onValueChange={(v) => update({ unit_kind: v as UnitKind })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_KIND_OPTIONS.filter((o) => o.value !== "apartment").map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Nr./Bez.</FieldLabel>
                  <EmbeddedInput
                    value={item.unit_number ?? ""}
                    onChange={(e) => update({ unit_number: e.target.value })}
                    placeholder="z. B. TG-04"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>MEA-Anteil (optional)</FieldLabel>
                <EmbeddedInput
                  value={item.mea_share ?? ""}
                  onChange={(e) => update({ mea_share: e.target.value })}
                  inputMode="decimal"
                  placeholder="z. B. 5"
                />
              </div>

              <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2.5">
                <Label className="text-[12px] text-muted-foreground">Abrechnung</Label>
                <RadioGroup
                  value={item.billing_mode}
                  onValueChange={(v) => update({ billing_mode: v as BillingMode })}
                  className="mt-1.5 space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="distribution_only" id={`bm-dist-${item.unit_kind}-${item.unit_number}`} className="mt-0.5" />
                    <Label
                      htmlFor={`bm-dist-${item.unit_kind}-${item.unit_number}`}
                      className="text-[13px] font-normal leading-snug cursor-pointer"
                    >
                      Nur Verteilung — kein eigenes Hausgeld, MEA fließt zur Wohnung.
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="own_billing" id={`bm-own-${item.unit_kind}-${item.unit_number}`} className="mt-0.5" />
                    <Label
                      htmlFor={`bm-own-${item.unit_kind}-${item.unit_number}`}
                      className="text-[13px] font-normal leading-snug cursor-pointer"
                    >
                      Eigene Abrechnung &amp; eigenes Hausgeld.
                    </Label>
                  </div>
                </RadioGroup>

                {item.billing_mode === "own_billing" && (
                  <div className="mt-2.5">
                    <FieldLabel>Hausgeld dieser Einheit (€/Monat)</FieldLabel>
                    <EmbeddedInput
                      value={item.monthly_fee ?? ""}
                      onChange={(e) => update({ monthly_fee: e.target.value })}
                      inputMode="decimal"
                      placeholder="z. B. 25,00"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
};
