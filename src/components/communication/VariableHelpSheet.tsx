import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const GROUPS: { title: string; vars: { key: string; desc: string }[] }[] = [
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
      { key: "firma", desc: "Firmenname (falls vorhanden)" },
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
      { key: "einheit", desc: "Wohnungs-/Einheits-Nr. (bei mehreren Einheiten desselben Eigentümers: Komma-Liste)" },
      { key: "rolle", desc: "Eigentümer / Mieter" },
      { key: "mea", desc: "Miteigentumsanteil (bei mehreren Einheiten: Summe)" },
      { key: "einheiten", desc: 'Komma-Liste aller Einheiten des Eigentümers, z. B. „1, 3, 7"' },
      { key: "einheiten_count", desc: "Anzahl der Einheiten des Eigentümers" },
      { key: "mea_summe", desc: "Summe der MEA aller Einheiten" },
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
  {
    title: "Eigentümerversammlung (nur bei ETV-Einladung)",
    vars: [
      { key: "meeting_title", desc: "Titel der Versammlung" },
      { key: "meeting_date", desc: "z. B. 15. März 2026" },
      { key: "meeting_date_short", desc: "z. B. 15.03.2026" },
      { key: "meeting_weekday", desc: "z. B. Mittwoch" },
      { key: "meeting_time", desc: "z. B. 18:00" },
      { key: "meeting_location", desc: "Versammlungsort" },
      { key: "meeting_chair", desc: "Versammlungsleiter" },
      { key: "minutes_taker", desc: "Protokollführer" },
      { key: "agenda_list", desc: "Komplette TOP-Liste mit Beschreibungen (mehrzeilig)" },
      { key: "agenda_titles", desc: "Nur die TOP-Titel (mehrzeilig)" },
      { key: "top_count", desc: "Anzahl der TOPs" },
    ],
  },
  {
    title: "Frei (vor Versand befüllbar)",
    vars: [
      { key: "betreff", desc: "Eigener Betreff" },
      { key: "freitext_1", desc: "Beliebiger Text" },
      { key: "betrag", desc: "Beliebige Zahl" },
      { key: "stichtag", desc: "Beliebiges Datum" },
    ],
  },
];

interface VariableHelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const VariableHelpSheet = ({ open, onOpenChange }: VariableHelpSheetProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (k: string) => {
    const text = `{{${k}}}`;
    navigator.clipboard.writeText(text);
    setCopied(k);
    setTimeout(() => setCopied(null), 1200);
    toast({ title: "Kopiert", description: text });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Verfügbare Platzhalter</SheetTitle>
          <SheetDescription>
            Schreiben Sie die Platzhalter einfach in Word an die gewünschte Stelle:
            <br />
            <code className="bg-muted px-2 py-1 rounded text-foreground inline-block mt-2">
              Sehr geehrter {"{{anrede}}"} {"{{nachname}}"},
            </code>
            <br />
            <span className="text-xs mt-2 inline-block">
              Keine Word-Mergefelder oder Sonderfunktionen nötig — einfach mit der Tastatur tippen.
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold mb-2">{group.title}</h4>
              <div className="space-y-1">
                {group.vars.map((v) => (
                  <div key={v.key} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{`{{${v.key}}}`}</code>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.desc}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(v.key)} className="flex-shrink-0">
                      {copied === v.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="border-t pt-4 mt-6">
            <h4 className="text-sm font-semibold mb-2">So gehts in Word</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4">
              <li>Word-Dokument wie gewohnt schreiben.</li>
              <li>An jeder Stelle, wo personalisierter Text erscheinen soll, einen Platzhalter wie <code>{"{{vorname}}"}</code> tippen.</li>
              <li>Formatierung (fett, Schriftgröße, Tabellen) bleibt erhalten.</li>
              <li>Als <Badge variant="outline">.docx</Badge> speichern und hier hochladen.</li>
            </ol>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
