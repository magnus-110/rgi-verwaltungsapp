import { Check, Home, Building2, ArrowUpDown, Archive, DoorOpen, MoreHorizontal, Flame } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ProblemAreaId = "dach" | "fassade" | "treppenhaus" | "keller" | "eingang" | "sonstiges";

export type HeatingTypeId = "gas" | "oel" | "fernwaerme" | "waermepumpe" | "pellets" | "strom" | "unbekannt" | "sonstiges";

export interface Step3Data {
  /** 1 = schlecht, 5 = gut */
  general_impression_score?: number;
  problem_areas?: ProblemAreaId[];
  problem_notes?: Record<string, string>;
  heating_type?: HeatingTypeId | string;
  heating_other?: string;
  notes?: string;
  // legacy fields tolerated
  general_impression?: "gut" | "mittel" | "schlecht";
  reorder_contact?: string;
  etv_location?: string;
}

interface Props {
  value: Step3Data;
  onChange: (next: Step3Data) => void;
}

const AREAS: { id: ProblemAreaId; name: string; subtitle: string; Icon: typeof Home }[] = [
  { id: "dach", name: "Dach", subtitle: "Undichte / Schäden", Icon: Home },
  { id: "fassade", name: "Fassade", subtitle: "Risse / Putz", Icon: Building2 },
  { id: "treppenhaus", name: "Treppenhaus", subtitle: "Zustand", Icon: ArrowUpDown },
  { id: "keller", name: "Keller", subtitle: "Feuchte / Ordnung", Icon: Archive },
  { id: "eingang", name: "Eingang", subtitle: "Türen / Klingel", Icon: DoorOpen },
  { id: "sonstiges", name: "Sonstiges", subtitle: "Frei beschreibbar", Icon: MoreHorizontal },
];

const HEATING_TYPES: { id: HeatingTypeId; label: string }[] = [
  { id: "gas", label: "Gas" },
  { id: "oel", label: "Öl" },
  { id: "fernwaerme", label: "Fernwärme" },
  { id: "waermepumpe", label: "Wärmepumpe" },
  { id: "pellets", label: "Pellets" },
  { id: "strom", label: "Strom" },
  { id: "unbekannt", label: "Weiß ich nicht" },
  { id: "sonstiges", label: "Sonstiges" },
];

export const Step3Gebaeude = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step3Data>) => onChange({ ...value, ...patch });
  const areas = value.problem_areas ?? [];
  const problemNotes = value.problem_notes ?? {};

  const toggleArea = (id: ProblemAreaId) => {
    if (areas.includes(id)) {
      const nextNotes = { ...problemNotes };
      delete nextNotes[id];
      set({ problem_areas: areas.filter((a) => a !== id), problem_notes: nextNotes });
    } else {
      set({ problem_areas: [...areas, id] });
    }
  };

  const setProblemNote = (id: ProblemAreaId, note: string) => {
    set({ problem_notes: { ...problemNotes, [id]: note } });
  };

  return (
    <div className="space-y-2.5">
      <SectionCard label="BEREICHE MIT AUFFÄLLIGKEITEN (OPTIONAL)" flat>
        <div className="p-3 space-y-2">
          {AREAS.map(({ id, name, subtitle, Icon }) => {
            const sel = areas.includes(id);
            return (
              <div
                key={id}
                className={cn(
                  "rounded-xl border-[1.5px] transition overflow-hidden",
                  sel ? "border-primary bg-accent/40" : "border-border/60 bg-card"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleArea(id)}
                  className="w-full p-3 flex items-center gap-2.5 text-left"
                >
                  <span
                    className={cn(
                      "size-[34px] rounded-[9px] grid place-items-center shrink-0 transition",
                      sel ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold leading-tight">{name}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{subtitle}</div>
                  </div>
                  <span
                    className={cn(
                      "size-5 rounded-full border-[1.5px] grid place-items-center shrink-0 transition",
                      sel ? "border-primary bg-primary" : "border-border bg-card"
                    )}
                  >
                    {sel && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
                  </span>
                </button>
                {sel && (
                  <div className="px-3 pb-3 pt-1">
                    <div className="text-[11px] text-muted-foreground mb-1">Notiz (optional)</div>
                    <Textarea
                      rows={2}
                      value={problemNotes[id] ?? ""}
                      onChange={(e) => setProblemNote(id, e.target.value)}
                      placeholder={`Was ist Ihnen am ${name} aufgefallen?`}
                      className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 focus-visible:bg-[hsl(35_25%_92%)] resize-none rounded-lg px-3 py-2.5 text-[14px]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard label="HINWEISE (OPTIONAL)">
        <div className="p-3">
          <div className="text-[12px] text-muted-foreground mb-1">Was sollten wir noch wissen?</div>
          <Textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="z. B. besondere Beobachtungen am Gebäude"
            className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 focus-visible:bg-[hsl(35_25%_92%)] resize-none rounded-lg px-3 py-2.5 text-[14px]"
          />
        </div>
      </SectionCard>
    </div>
  );
};
