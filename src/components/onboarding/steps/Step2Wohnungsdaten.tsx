import { Info } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";

export interface Step2Data {
  unit_number?: string;
  unit_description?: string;
  monthly_fee?: string;
  mea_share?: string;
  square_meters?: string;
}

interface Props {
  value: Step2Data;
  onChange: (next: Step2Data) => void;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[12px] text-muted-foreground mb-1">{children}</div>
);

export const Step2Wohnungsdaten = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step2Data>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      <div className="bg-accent rounded-xl p-3 flex gap-3 items-start">
        <span className="size-5 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0 mt-0.5">
          <Info className="size-3" />
        </span>
        <p className="text-[12px] text-foreground leading-snug">
          Optional — Ihre Angaben helfen uns, Ihre Liegenschaft von Beginn an optimal zu betreuen.
        </p>
      </div>

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
              placeholder="z. B. 125,5/1000"
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
    </div>
  );
};
