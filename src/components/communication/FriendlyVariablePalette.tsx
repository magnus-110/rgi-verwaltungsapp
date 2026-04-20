import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle, Plus } from "lucide-react";
import { VARIABLE_GROUPS, type PlaceholderStats } from "./VariablePalette";
import type { PlaceholderSamples } from "./usePlaceholderSamples";

const LABELS: Record<string, string> = {
  anrede: "Anrede",
  anrede_brief: "Anrede (Brief)",
  vorname: "Vorname",
  nachname: "Nachname",
  vollname: "Vollständiger Name",
  titel: "Titel / Position",
  firma: "Firma",
  strasse: "Straße",
  plz: "Postleitzahl",
  ort: "Ort",
  adresse_block: "Adressblock",
  email: "E-Mail-Adresse",
  telefon: "Telefonnummer",
  gebaeude_name: "Liegenschaftsname",
  gebaeude_strasse: "Liegenschaftsadresse",
  einheit: "Wohnungs-Nr.",
  rolle: "Rolle (Eigent./Mieter)",
  mea: "Miteigentumsanteil",
  verwalter_name: "Verwalter-Name",
  verwalter_email: "Verwalter-E-Mail",
  verwalter_telefon: "Verwalter-Telefon",
  datum_heute: "Heutiges Datum",
  ort_datum: "Ort, Datum",
};

interface Props {
  onInsert: (placeholder: string) => void;
  className?: string;
  stats?: PlaceholderStats;
  samples?: PlaceholderSamples;
}

export const FriendlyVariablePalette = ({ onInsert, className, stats, samples }: Props) => {
  const [q, setQ] = useState("");

  const filter = (key: string, label: string, sample: string) =>
    !q ||
    key.toLowerCase().includes(q.toLowerCase()) ||
    label.toLowerCase().includes(q.toLowerCase()) ||
    sample.toLowerCase().includes(q.toLowerCase());

  return (
    <div className={className}>
      <div className="px-1 pb-2 sticky top-0 bg-background z-10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen..."
            className="h-8 pl-7 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
          Klick zum Einfügen · Beispielwerte vom ersten Empfänger
        </p>
      </div>

      <ScrollArea className="h-[460px] pr-2">
        <div className="space-y-3">
          {VARIABLE_GROUPS.map((group) => {
            const visible = group.vars.filter((v) =>
              filter(v.key, LABELS[v.key] || v.desc, samples?.[v.key] || "")
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.title}>
                <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
                  {group.title}
                </h5>
                <div className="space-y-1.5">
                  {visible.map((v) => {
                    const ph = `{{${v.key}}}`;
                    const label = LABELS[v.key] || v.desc;
                    const sample = samples?.[v.key] || v.desc;
                    const s = stats?.[v.key];
                    const allEmpty = s && s.total > 0 && s.filled === 0;
                    const someEmpty = s && s.total > 0 && s.filled > 0 && s.filled < s.total;

                    return (
                      <button
                        key={v.key}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", ph);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => onInsert(ph)}
                        className={`group relative w-full text-left rounded-md border bg-card hover:border-primary hover:shadow-sm cursor-grab active:cursor-grabbing transition-all p-2.5 ${
                          allEmpty ? "opacity-60" : ""
                        }`}
                      >
                        {(allEmpty || someEmpty) && (
                          <AlertCircle
                            className={`absolute top-1.5 right-1.5 h-3 w-3 ${
                              allEmpty ? "text-destructive" : "text-amber-500"
                            }`}
                          />
                        )}
                        <div className="text-sm font-medium text-foreground line-clamp-2 pr-4 leading-snug">
                          {sample || <span className="italic text-muted-foreground">— leer —</span>}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                            <Plus className="h-2.5 w-2.5" /> Einfügen
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
