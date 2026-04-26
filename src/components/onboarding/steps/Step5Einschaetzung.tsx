import { SectionCard } from "../ui/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Step5Data {
  willing_cash_audit?: boolean | null;
  /** Ist die Person bereits gewähltes Mitglied im Verwaltungsbeirat? */
  is_beirat_member?: boolean | null;
  /** Legacy: frühere Bereitschaftsfrage */
  willing_beirat?: boolean | null;
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
          <div className="text-[12px] text-muted-foreground">
            Haben Sie einen Vorschlag, wo die nächste Eigentümerversammlung stattfinden könnte?
          </div>
          <Input
            value={value.etv_location ?? ""}
            onChange={(e) => set({ etv_location: e.target.value })}
            placeholder="z. B. Hotel Krone"
            className="border-0 bg-[hsl(var(--input))] focus-visible:ring-0 rounded-lg h-10"
          />
        </div>
      </SectionCard>

      <SectionCard label="KASSENPRÜFUNG">
        <div className="p-3 space-y-2">
          <div className="text-[12px] text-muted-foreground">
            Möchten Sie sich als Kassenprüfer für diese WEG zur Verfügung stellen?
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { v: true, label: "Ja, gerne" },
              { v: false, label: "Lieber nicht" },
            ].map(({ v, label }) => {
              const sel = value.willing_cash_audit === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set({ willing_cash_audit: v })}
                  className={cn(
                    "h-12 rounded-[10px] border px-3 flex items-center gap-2.5 text-[13.5px] font-medium transition",
                    sel
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : "border-border/60 bg-card text-foreground hover:bg-accent/40"
                  )}
                >
                  <span
                    className={cn(
                      "size-[18px] shrink-0 rounded-full border-[1.5px] grid place-items-center transition",
                      sel ? "border-primary" : "border-muted-foreground/40"
                    )}
                  >
                    {sel && <span className="size-[9px] rounded-full bg-primary" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard label="VERWALTUNGSBEIRAT">
        <div className="p-3 space-y-2">
          <div className="text-[12px] text-muted-foreground">
            Sind Sie aktuell Mitglied des Verwaltungsbeirats?
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { v: true, label: "Ja" },
              { v: false, label: "Nein" },
            ].map(({ v, label }) => {
              const current = value.is_beirat_member ?? value.willing_beirat ?? null;
              const sel = current === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set({ is_beirat_member: v, willing_beirat: undefined })}
                  className={cn(
                    "h-12 rounded-[10px] border px-3 flex items-center gap-2.5 text-[13.5px] font-medium transition",
                    sel
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : "border-border/60 bg-card text-foreground hover:bg-accent/40"
                  )}
                >
                  <span
                    className={cn(
                      "size-[18px] shrink-0 rounded-full border-[1.5px] grid place-items-center transition",
                      sel ? "border-primary" : "border-muted-foreground/40"
                    )}
                  >
                    {sel && <span className="size-[9px] rounded-full bg-primary" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
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
