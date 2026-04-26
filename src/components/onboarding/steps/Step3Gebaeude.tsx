import { Check, Home, Building2, ArrowUpDown, Archive, DoorOpen, MoreHorizontal } from "lucide-react";
import { SectionCard } from "../ui/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type GeneralImpression = "gut" | "mittel" | "schlecht";
export type ProblemAreaId = "dach" | "fassade" | "treppenhaus" | "keller" | "eingang" | "sonstiges";

export interface Step3Data {
  general_impression?: GeneralImpression;
  problem_areas?: ProblemAreaId[];
  notes?: string;
  // legacy fields tolerated
  heating_type?: string;
  heating_other?: string;
  reorder_contact?: string;
  etv_location?: string;
}

interface Props {
  value: Step3Data;
  onChange: (next: Step3Data) => void;
}

const IMPRESSIONS: { id: GeneralImpression; emoji: string; label: string; cls: string }[] = [
  { id: "gut", emoji: "😊", label: "Gut", cls: "border-success bg-success/10 text-success" },
  { id: "mittel", emoji: "😐", label: "Mittel", cls: "border-warning bg-warning/10 text-foreground" },
  { id: "schlecht", emoji: "😟", label: "Schlecht", cls: "border-destructive bg-destructive/10 text-destructive" },
];

const AREAS: { id: ProblemAreaId; name: string; subtitle: string; Icon: typeof Home }[] = [
  { id: "dach", name: "Dach", subtitle: "Undichte / Schäden", Icon: Home },
  { id: "fassade", name: "Fassade", subtitle: "Risse / Putz", Icon: Building2 },
  { id: "treppenhaus", name: "Treppenhaus", subtitle: "Zustand", Icon: ArrowUpDown },
  { id: "keller", name: "Keller", subtitle: "Feuchte / Ordnung", Icon: Archive },
  { id: "eingang", name: "Eingang", subtitle: "Türen / Klingel", Icon: DoorOpen },
  { id: "sonstiges", name: "Sonstiges", subtitle: "Frei beschreibbar", Icon: MoreHorizontal },
];

export const Step3Gebaeude = ({ value, onChange }: Props) => {
  const set = (patch: Partial<Step3Data>) => onChange({ ...value, ...patch });
  const areas = value.problem_areas ?? [];
  const toggleArea = (id: ProblemAreaId) =>
    set({ problem_areas: areas.includes(id) ? areas.filter((a) => a !== id) : [...areas, id] });

  return (
    <div className="space-y-2.5">
      <SectionCard label="GESAMTEINDRUCK">
        <div className="p-3 flex gap-2">
          {IMPRESSIONS.map((opt) => {
            const sel = value.general_impression === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => set({ general_impression: opt.id })}
                className={cn(
                  "flex-1 rounded-[10px] border-[1.5px] py-3 flex flex-col items-center gap-1 transition",
                  sel ? opt.cls : "border-border/60 bg-card hover:border-border"
                )}
              >
                <span className="text-[18px]">{opt.emoji}</span>
                <span className="text-[10px] font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard label="BEREICHE MIT AUFFÄLLIGKEITEN (OPTIONAL)">
        <div className="p-3 grid grid-cols-2 gap-2">
          {AREAS.map(({ id, name, subtitle, Icon }) => {
            const sel = areas.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleArea(id)}
                className={cn(
                  "rounded-xl border-[1.5px] p-3 flex items-center gap-2.5 text-left transition",
                  sel ? "border-primary bg-accent" : "border-border/60 bg-card hover:border-border"
                )}
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
                  {sel && <Check className="size-3 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard label="HINWEISE (OPTIONAL)">
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
