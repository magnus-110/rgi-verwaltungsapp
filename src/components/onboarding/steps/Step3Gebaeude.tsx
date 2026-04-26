import {
  Check, Home, Building2, ArrowUpDown, Archive, DoorOpen, MoreHorizontal,
  Flame, Droplet, Radio, Snowflake, Trees, Zap, MoreHorizontal as Dots,
} from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ProblemAreaId = "dach" | "fassade" | "treppenhaus" | "keller" | "eingang" | "sonstiges";

export type HeatingTypeId = "gas" | "oel" | "fernwaerme" | "waermepumpe" | "pellets" | "strom" | "sonstiges";

export interface Step3Data {
  /** 1 = schlecht, 5 = gut */
  general_impression_score?: number;
  problem_areas?: ProblemAreaId[];
  problem_notes?: Record<string, string>;
  /** Mehrfachauswahl möglich (z. B. Hybrid) */
  heating_types?: HeatingTypeId[];
  heating_other?: string;
  notes?: string;
  // legacy fields tolerated
  heating_type?: HeatingTypeId | string;
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

const HEATING_TYPES: { id: HeatingTypeId; label: string; Icon: typeof Flame }[] = [
  { id: "gas", label: "Gas", Icon: Flame },
  { id: "oel", label: "Öl", Icon: Droplet },
  { id: "fernwaerme", label: "Fernwärme", Icon: Radio },
  { id: "waermepumpe", label: "Wärmepumpe", Icon: Snowflake },
  { id: "pellets", label: "Pellets", Icon: Trees },
  { id: "strom", label: "Strom", Icon: Zap },
  { id: "sonstiges", label: "Sonstiges", Icon: Dots },
];

export const Step3Gebaeude = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step3Data>) => onChange({ ...value, ...patch });
  const areas = value.problem_areas ?? [];
  const problemNotes = value.problem_notes ?? {};

  // Migrate legacy single heating_type to heating_types[]
  const heatings: HeatingTypeId[] =
    value.heating_types && value.heating_types.length
      ? value.heating_types
      : value.heating_type
        ? [value.heating_type as HeatingTypeId]
        : [];

  const toggleHeating = (id: HeatingTypeId) => {
    const next = heatings.includes(id)
      ? heatings.filter((h) => h !== id)
      : [...heatings, id];
    const patch: Partial<Step3Data> = { heating_types: next, heating_type: undefined };
    if (!next.includes("sonstiges")) patch.heating_other = undefined;
    set(patch);
  };

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
      <SectionCard label="HEIZUNGSART (MEHRFACHAUSWAHL MÖGLICH)">
        <div className="p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {HEATING_TYPES.map(({ id, label, Icon }) => {
              const sel = heatings.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleHeating(id)}
                  className={cn(
                    "h-11 rounded-[10px] border px-3 flex items-center gap-2 text-[13px] font-medium transition",
                    sel
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : "border-border/60 bg-card text-foreground hover:bg-accent/40"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", sel ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate flex-1 text-left">{label}</span>
                  {sel && <Check className="size-3.5 text-primary shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          {heatings.includes("sonstiges") && (
            <Textarea
              rows={2}
              value={value.heating_other ?? ""}
              onChange={(e) => set({ heating_other: e.target.value })}
              placeholder="Bitte beschreiben"
              className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 resize-none rounded-lg px-3 py-2.5 text-[14px]"
            />
          )}
        </div>
      </SectionCard>

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
