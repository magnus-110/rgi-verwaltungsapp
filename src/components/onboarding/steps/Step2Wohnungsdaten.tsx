import { Info } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { EmbeddedInput } from "../ui/InlineField";

export interface Step2Data {
  unit_number?: string;
  monthly_fee?: string;
  mea_share?: string;
  square_meters?: string;
}

interface Props {
  value: Step2Data;
  onChange: (next: Step2Data) => void;
}

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
        <div className="px-4 py-3 space-y-2">
          <EmbeddedInput
            value={value.unit_number ?? ""}
            onChange={(e) => set({ unit_number: e.target.value })}
            placeholder="Wohnungs-Nr. (z. B. 2.OG rechts)"
          />
        </div>
      </SectionCard>

      <SectionCard label="FINANZIELLE ECKDATEN">
        <div className="px-4 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <EmbeddedInput
              value={value.monthly_fee ?? ""}
              onChange={(e) => set({ monthly_fee: e.target.value })}
              inputMode="decimal"
              placeholder="Hausgeld (€/Monat)"
            />
            <EmbeddedInput
              value={value.mea_share ?? ""}
              onChange={(e) => set({ mea_share: e.target.value })}
              placeholder="Miteigentumsanteile (z. B. 125/1000)"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard label="WOHNFLÄCHE">
        <div className="px-4 py-3 space-y-2">
          <EmbeddedInput
            value={value.square_meters ?? ""}
            onChange={(e) => set({ square_meters: e.target.value })}
            inputMode="decimal"
            placeholder="Größe in m²"
          />
        </div>
      </SectionCard>
    </div>
  );
};
