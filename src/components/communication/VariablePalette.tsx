import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type PlaceholderStats = Record<string, { filled: number; total: number }>;

export const VARIABLE_GROUPS: { title: string; vars: { key: string; desc: string }[] }[] = [
  {
    title: "Person",
    vars: [
      { key: "anrede", desc: "Herr / Frau" },
      { key: "anrede_brief", desc: "Sehr geehrter Herr Müller," },
      { key: "vorname", desc: "Max" },
      { key: "nachname", desc: "Müller" },
      { key: "vollname", desc: "Max Müller" },
      { key: "titel", desc: "Position / Titel" },
    ],
  },
  {
    title: "Adresse",
    vars: [
      { key: "firma", desc: "Firmenname" },
      { key: "strasse", desc: "Straße + Nr." },
      { key: "plz", desc: "Postleitzahl" },
      { key: "ort", desc: "Wohnort" },
      { key: "adresse_block", desc: "Mehrzeiliger Adressblock" },
    ],
  },
  {
    title: "Kontakt",
    vars: [
      { key: "email", desc: "Primäre E-Mail" },
      { key: "telefon", desc: "Telefonnummer" },
    ],
  },
  {
    title: "Gebäude / Einheit",
    vars: [
      { key: "gebaeude_name", desc: "Liegenschaftsname" },
      { key: "gebaeude_strasse", desc: "Adresse der Liegenschaft" },
      { key: "einheit", desc: "Wohnungs-/Einheits-Nr." },
      { key: "rolle", desc: "Eigentümer / Mieter" },
      { key: "mea", desc: "Miteigentumsanteil" },
    ],
  },
  {
    title: "Verwaltung",
    vars: [
      { key: "verwalter_name", desc: "Verwalter-Name" },
      { key: "verwalter_email", desc: "Verwalter-E-Mail" },
      { key: "verwalter_telefon", desc: "Verwalter-Telefon" },
      { key: "datum_heute", desc: "z. B. 13. April 2026" },
      { key: "ort_datum", desc: "z. B. Schwangau, 13.04.2026" },
    ],
  },
];

interface Props {
  onInsert: (placeholder: string) => void;
  className?: string;
  stats?: PlaceholderStats;
}

export const VariablePalette = ({ onInsert, className, stats }: Props) => {
  const [q, setQ] = useState("");

  const filter = (key: string, desc: string) =>
    !q || key.toLowerCase().includes(q.toLowerCase()) || desc.toLowerCase().includes(q.toLowerCase());

  return (
    <div className={className}>
      <div className="px-1 pb-2 sticky top-0 bg-background z-10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Platzhalter suchen..."
            className="h-8 pl-7 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
          Klick = an Cursor einfügen · Ziehen = beliebig platzieren
        </p>
      </div>

      <ScrollArea className="h-[420px] pr-2">
        <div className="space-y-3">
          {VARIABLE_GROUPS.map((group) => {
            const visible = group.vars.filter((v) => filter(v.key, v.desc));
            if (visible.length === 0) return null;
            return (
              <div key={group.title}>
                <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-1">
                  {group.title}
                </h5>
                <div className="space-y-0.5">
                  {visible.map((v) => {
                    const ph = `{{${v.key}}}`;
                    const s = stats?.[v.key];
                    const allEmpty = s && s.total > 0 && s.filled === 0;
                    const someEmpty = s && s.total > 0 && s.filled > 0 && s.filled < s.total;
                    return (
                      <TooltipProvider key={v.key} delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", ph);
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                              onClick={() => onInsert(ph)}
                              className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-accent hover:text-accent-foreground cursor-grab active:cursor-grabbing transition-colors group ${allEmpty ? "opacity-60" : ""}`}
                            >
                              <div className="flex items-center gap-1">
                                <code className="font-mono text-[11px]">{ph}</code>
                                {allEmpty && <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />}
                                {someEmpty && <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                              </div>
                              <span className="block text-[10px] text-muted-foreground group-hover:text-accent-foreground/80 truncate">
                                {v.desc}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            <div className="font-medium">{v.desc}</div>
                            {s && s.total > 0 && (
                              <div className={`mt-1 ${allEmpty ? "text-destructive" : someEmpty ? "text-amber-500" : "text-muted-foreground"}`}>
                                {allEmpty
                                  ? `Keine Daten (0 / ${s.total})`
                                  : someEmpty
                                  ? `Teilweise vorhanden (${s.filled} / ${s.total})`
                                  : `Vollständig (${s.filled} / ${s.total})`}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
