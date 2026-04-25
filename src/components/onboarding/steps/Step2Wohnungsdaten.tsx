import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Ihre Wohnungsdaten</h3>
        <p className="text-sm text-muted-foreground">
          Optional — wir gleichen Ihre Angaben mit unseren Unterlagen ab.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="unit_number">Wohnungs-Nr.</Label>
          <Input
            id="unit_number"
            value={value.unit_number ?? ""}
            onChange={(e) => set({ unit_number: e.target.value })}
            placeholder="z. B. 2.OG rechts"
          />
        </div>
        <div>
          <Label htmlFor="monthly_fee">Hausgeld (€)</Label>
          <Input
            id="monthly_fee"
            value={value.monthly_fee ?? ""}
            onChange={(e) => set({ monthly_fee: e.target.value })}
            inputMode="decimal"
            placeholder="z. B. 350,00"
          />
        </div>
        <div>
          <Label htmlFor="mea_share">MEA-Anteile</Label>
          <Input
            id="mea_share"
            value={value.mea_share ?? ""}
            onChange={(e) => set({ mea_share: e.target.value })}
            placeholder="z. B. 125/1000"
          />
        </div>
        <div>
          <Label htmlFor="square_meters">Wohnfläche (m²)</Label>
          <Input
            id="square_meters"
            value={value.square_meters ?? ""}
            onChange={(e) => set({ square_meters: e.target.value })}
            inputMode="decimal"
          />
        </div>
      </div>
    </div>
  );
};
