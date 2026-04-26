import { Info, Check } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { InlineField, InlineInput, EmbeddedInput } from "../ui/InlineField";

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
          Optional — wir gleichen Ihre Angaben mit unseren Unterlagen ab. Sie können auch alles überspringen.
        </p>
      </div>

      <SectionCard label="WOHNUNG">
        <InlineField
          label="Wohnungs-Nr."
          hint={
            value.unit_number ? (
              <span className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-success inline-block" />
                Stimmt mit unseren Unterlagen überein
              </span>
            ) : null
          }
        >
          <InlineInput
            value={value.unit_number ?? ""}
            onChange={(e) => set({ unit_number: e.target.value })}
            placeholder="z. B. 2.OG rechts"
            className="max-w-[200px]"
          />
        </InlineField>
      </SectionCard>

      <SectionCard label="FINANZIELLE ECKDATEN">
        <div className="grid grid-cols-2">
          <div className="p-3 border-r border-foreground/[0.05]">
            <div className="text-[11px] text-muted-foreground mb-1.5">Hausgeld</div>
            <EmbeddedInput
              value={value.monthly_fee ?? ""}
              onChange={(e) => set({ monthly_fee: e.target.value })}
              inputMode="decimal"
              placeholder="350,00"
            />
            <div className="text-[11px] text-muted-foreground mt-1.5">€/Monat</div>
          </div>
          <div className="p-3">
            <div className="text-[11px] text-muted-foreground mb-1.5">MEA-Anteile</div>
            <EmbeddedInput
              value={value.mea_share ?? ""}
              onChange={(e) => set({ mea_share: e.target.value })}
              placeholder="125/1000"
            />
            <div className="text-[11px] text-muted-foreground mt-1.5">Anteile</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="WOHNFLÄCHE">
        <InlineField label="Größe">
          <div className="flex items-baseline gap-1.5 w-full justify-end">
            <InlineInput
              value={value.square_meters ?? ""}
              onChange={(e) => set({ square_meters: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="max-w-[120px]"
            />
            <span className="text-[13px] text-muted-foreground shrink-0">m²</span>
          </div>
        </InlineField>
      </SectionCard>
    </div>
  );
};
