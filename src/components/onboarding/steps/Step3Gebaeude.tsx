import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Flame, Thermometer, TreePine, Droplet, HelpCircle } from "lucide-react";
import { BigChoiceCard } from "../BigChoiceCard";

export interface Step3Data {
  heating_type?: "gas" | "fernwaerme" | "pellets" | "oel" | "sonstige";
  heating_other?: string;
  reorder_contact?: string;
  etv_location?: string;
  notes?: string;
}

interface Props {
  value: Step3Data;
  onChange: (next: Step3Data) => void;
}

const HEATING_OPTIONS = [
  { id: "gas", label: "Gas", icon: Flame },
  { id: "fernwaerme", label: "Fernwärme", icon: Thermometer },
  { id: "pellets", label: "Pellets", icon: TreePine },
  { id: "oel", label: "Heizöl", icon: Droplet },
  { id: "sonstige", label: "Sonstige", icon: HelpCircle },
] as const;

export const Step3Gebaeude = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step3Data>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Gebäude-Informationen</h3>
        <p className="text-sm text-muted-foreground">
          Helfen Sie uns, das Haus besser zu verstehen.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Heizungsform</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {HEATING_OPTIONS.map((opt) => (
            <BigChoiceCard
              key={opt.id}
              icon={opt.icon}
              title={opt.label}
              selected={value.heating_type === opt.id}
              onClick={() => set({ heating_type: opt.id as Step3Data["heating_type"] })}
            />
          ))}
        </div>
        {value.heating_type === "sonstige" && (
          <Input
            value={value.heating_other ?? ""}
            onChange={(e) => set({ heating_other: e.target.value })}
            placeholder="Welche Heizungsart?"
          />
        )}
      </div>

      <div>
        <Label htmlFor="reorder">Wer informiert bei Brennstoff-Nachbestellung?</Label>
        <Input
          id="reorder"
          value={value.reorder_contact ?? ""}
          onChange={(e) => set({ reorder_contact: e.target.value })}
          placeholder="Name / Kontakt"
        />
      </div>

      <div>
        <Label htmlFor="etv_location">Üblicher Ort der Eigentümerversammlung</Label>
        <Input
          id="etv_location"
          value={value.etv_location ?? ""}
          onChange={(e) => set({ etv_location: e.target.value })}
          placeholder="z. B. Gemeindesaal"
        />
      </div>

      <div>
        <Label htmlFor="notes">Besonderheiten am Gebäude</Label>
        <Textarea
          id="notes"
          rows={3}
          value={value.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
};
