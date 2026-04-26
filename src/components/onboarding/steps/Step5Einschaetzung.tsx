import { SectionCard } from "../ui/SectionCard";
import { ChoiceCardPair } from "../ui/ChoiceCardPair";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export interface Step5Data {
  willing_cash_audit?: boolean | null;
  etv_location?: string;
  notes?: string;
}

interface Props {
  value: Step5Data;
  onChange: (next: Step5Data) => void;
}

export const Step5Einschaetzung = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step5Data>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      <SectionCard label="ORT DER EIGENTÜMERVERSAMMLUNG">
        <div className="p-3.5 space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Wo wird die Eigentümerversammlung üblicherweise abgehalten?
          </p>
          <Input
            value={value.etv_location ?? ""}
            onChange={(e) => set({ etv_location: e.target.value })}
            placeholder="z. B. Gemeindesaal, Hinterhof, Restaurant XY"
            className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 rounded-lg h-10"
          />
        </div>
      </SectionCard>

      <SectionCard label="KASSENPRÜFUNG">
        <div className="p-3.5">
          <p className="text-[13px] text-muted-foreground mb-3">
            Wären Sie bereit, einmal jährlich die Kassenprüfung zu übernehmen?
          </p>
          <ChoiceCardPair
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
