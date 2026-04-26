import { SectionCard } from "../ui/SectionCard";
import { RangeSlider } from "../ui/RangeSlider";
import { ChoiceCardPair } from "../ui/ChoiceCardPair";
import { Textarea } from "@/components/ui/textarea";

export interface Step5Data {
  willing_cash_audit?: boolean | null;
  building_condition?: number;
  notes?: string;
}

interface Props {
  value: Step5Data;
  onChange: (next: Step5Data) => void;
}

const CONDITION_DESCRIPTIONS = [
  "Stark sanierungsbedürftig",
  "Renovierungsbedarf",
  "Zustand in Ordnung",
  "Gut gepflegt",
  "Ausgezeichneter Zustand",
];

export const Step5Einschaetzung = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step5Data>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      <SectionCard label="GEBÄUDEZUSTAND">
        <div className="p-4">
          <RangeSlider
            value={value.building_condition ?? 3}
            onChange={(v) => set({ building_condition: v })}
            descriptions={CONDITION_DESCRIPTIONS}
            lowLabel="Schlecht"
            highLabel="Ausgezeichnet"
          />
        </div>
      </SectionCard>

      <SectionCard label="KASSENPRÜFUNG">
        <div className="p-3.5">
          <p className="text-[13px] text-muted-foreground mb-3">
            Wären Sie bereit, einmal jährlich die Kassenprüfung zu übernehmen?
          </p>
          <ChoiceCardPair<boolean>
            value={value.willing_cash_audit ?? null}
            onChange={(v) => set({ willing_cash_audit: v })}
            options={[
              {
                value: true,
                title: "Ja, gerne",
                subtitle: "Ich helfe einmal jährlich aktiv mit.",
              },
              {
                value: false,
                title: "Lieber nicht",
                subtitle: "Bitte einen anderen Eigentümer fragen.",
                selectedTone: "muted",
              },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard label="HINWEISE AN DIE VERWALTUNG (OPTIONAL)">
        <div className="p-3">
          <Textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Was sollten wir noch wissen?"
            className="border-0 bg-transparent focus-visible:ring-0 resize-none px-1"
          />
        </div>
      </SectionCard>
    </div>
  );
};
