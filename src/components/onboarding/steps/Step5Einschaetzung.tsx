import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { YesNoChoice } from "../YesNoChoice";
import { StarScale } from "../StarScale";

export interface Step5Data {
  willing_cash_audit?: boolean | null;
  building_condition?: number;
  notes?: string;
}

interface Props {
  value: Step5Data;
  onChange: (next: Step5Data) => void;
}

export const Step5Einschaetzung = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step5Data>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-1">Ihre Einschätzung</h3>
        <p className="text-sm text-muted-foreground">
          Letzter Schritt — danke, dass Sie sich Zeit nehmen.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Wären Sie bereit, einmal jährlich die Kassenprüfung zu übernehmen?</Label>
        <YesNoChoice
          value={value.willing_cash_audit ?? null}
          onChange={(v) => set({ willing_cash_audit: v })}
          yesDescription="Ich helfe gerne mit"
          noDescription="Lieber nicht"
        />
      </div>

      <div className="space-y-3">
        <Label>Wie würden Sie den allgemeinen Zustand des Hauses bewerten?</Label>
        <StarScale
          value={value.building_condition ?? 0}
          onChange={(v) => set({ building_condition: v })}
        />
      </div>

      <div>
        <Label htmlFor="notes">Hinweise an die Verwaltung</Label>
        <Textarea
          id="notes"
          rows={3}
          value={value.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Was sollten wir noch wissen?"
        />
      </div>
    </div>
  );
};
