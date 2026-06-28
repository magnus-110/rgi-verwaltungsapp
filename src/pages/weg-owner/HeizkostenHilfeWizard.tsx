import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RGI = {
  primary: "#ee7202",
  bg: "#faf8f5",
  card: "#ffffff",
  border: "#e7e0d8",
  text: "#1f1a14",
  muted: "#7a6f63",
  green: "#22863a",
  greenBg: "#e8f5ec",
  amber: "#a86b00",
  amberBg: "#fdf3dc",
  red: "#b42318",
  redBg: "#fdecec",
};

/** Leicht änderbare Anbieter-Hilfetexte. Bilder unter /public/help/heizkosten/. */
export const MESSDIENST_HILFE = {
  techem: {
    name: "Techem",
    schritte: [
      {
        text: "Seite 1, Kasten oben rechts: Nehmen Sie „Ihr Anteil an den Gesamtkosten“ (Heizung + Warmwasser).",
        bild: "/help/heizkosten/techem-1.png",
      },
      {
        text: "Auf der CO2-Seite die Zeile „Diesen Betrag muss Ihnen Ihr Vermieter gemäß CO2KostAufG erstatten“ (Vermieteranteil) – diesen Betrag abziehen.",
        bild: "/help/heizkosten/techem-2.png",
      },
    ],
    beispiel: { betrag: "990,50", co2: "52,13", ergebnis: "938,37" },
  },
  allgaeu: {
    name: "Allgäu Messpartner",
    schritte: [
      {
        text: "Nehmen Sie „Summe Heizung und Warmwasser“ (NICHT den „Gesamtbetrag“ – der enthält auch Kaltwasser).",
        bild: "/help/heizkosten/allgaeu-1.png",
      },
      {
        text: "Im CO2-Absatz die Zeile „CO2-Kosten-Vermieteranteil noch enthalten“ – diesen Betrag abziehen.",
        bild: "/help/heizkosten/allgaeu-2.png",
      },
    ],
    beispiel: { betrag: "1.451,70", co2: "34,87", ergebnis: "1.416,83" },
  },
  ista: {
    name: "ista",
    schritte: [
      {
        text: "Im Abschnitt „Aufteilung der Gesamtkosten“ die Zeile „Ihre Heiz- und Warmwasserkosten“ (NICHT „Ihre Gesamtkosten“ – die enthalten Wasser/Hausnebenkosten).",
        bild: "/help/heizkosten/ista-1.png",
      },
      {
        text: "Im CO2-Abschnitt die Zeile „… der Wohnungseigentümer … Anteil von 30 % zu tragen“ – diesen Betrag abziehen.",
        bild: "/help/heizkosten/ista-2.png",
      },
    ],
    beispiel: { betrag: "658,11", co2: "12,65", ergebnis: "645,46" },
  },
  brunata: {
    name: "Brunata",
    schritte: [
      {
        text: "Im Abschnitt „Ihre Kosten“ die Zeile „Summe Kosten für Heizung und Warmwasser“ (= Gesamtbetrag, solange kein Kaltwasser dabei ist).",
        bild: "/help/heizkosten/brunata-1.png",
      },
      {
        text: "Auf der CO2-Seite die Zeile „Kostenübernahme durch den Vermieter in Höhe von …“ – diesen Betrag abziehen.",
        bild: "/help/heizkosten/brunata-2.png",
      },
    ],
    beispiel: { betrag: "180,24", co2: "5,14", ergebnis: "175,10" },
  },
  regiomess: {
    name: "RegioMess",
    schritte: [
      {
        text: "Auf Ihrer Wohnungs-Abrechnung die Zeile „Summe Heizung und Warmwasser“ (NICHT „Gesamtkosten“ – die enthalten Wasser/Kanal).",
        bild: "/help/heizkosten/regiomess-1.png",
      },
      {
        text: "CO2 prüfen: Steht „keine abzugsfähigen CO2-Gebühren“ (z. B. Fernwärme), nichts abziehen. Steht im Abschnitt „Aufteilung CO2-Kosten“ ein „Anteil Eigentümer … CO2“ (Betrag), diesen abziehen.",
        bild: "/help/heizkosten/regiomess-2.png",
      },
    ],
    beispiel: { betrag: "381,66", co2: "0,00", ergebnis: "381,66" },
  },
} as const;

type AnbieterKey = keyof typeof MESSDIENST_HILFE;

const HEIZUNGSARTEN: Array<{
  art: "ja" | "nein" | "kommt-drauf-an";
  name: string;
}> = [
  { art: "ja", name: "Erdgas (Gas)" },
  { art: "ja", name: "Heizöl (Öl)" },
  { art: "ja", name: "Flüssiggas" },
  { art: "kommt-drauf-an", name: "Fernwärme" },
  { art: "nein", name: "Wärmepumpe" },
  { art: "nein", name: "Holzpellets / Biomasse" },
];

function StatusIcon({ art }: { art: "ja" | "nein" | "kommt-drauf-an" }) {
  if (art === "ja")
    return <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: RGI.green }} />;
  if (art === "nein")
    return <XCircle className="w-5 h-5 shrink-0" style={{ color: RGI.red }} />;
  return <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: RGI.amber }} />;
}

function parseNum(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function HeizkostenHilfeWizard({
  onUebernehmen,
}: {
  onUebernehmen: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [anbieter, setAnbieter] = useState<AnbieterKey | null>(null);
  const [betrag, setBetrag] = useState("");
  const [co2, setCo2] = useState("");
  const [co2InfoOpen, setCo2InfoOpen] = useState(false);

  const reset = () => {
    setStep(1);
    setAnbieter(null);
    setBetrag("");
    setCo2("");
    setCo2InfoOpen(false);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-medium underline-offset-2 hover:underline"
        style={{ color: RGI.primary }}
      >
        <HelpCircle className="w-4 h-4" />
        Wo finde ich diesen Wert?
      </button>
    );
  }

  const result = parseNum(betrag) - parseNum(co2);
  const ans = anbieter ? MESSDIENST_HILFE[anbieter] : null;
  const anbieterKeys = Object.keys(MESSDIENST_HILFE) as AnbieterKey[];

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 max-w-[720px] mx-auto"
      style={{ border: `1px solid ${RGI.border}`, background: RGI.bg }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div
            className="text-[11px] uppercase tracking-wide font-semibold"
            style={{ color: RGI.muted }}
          >
            Schritt {step} von 2
          </div>
          <div
            className="text-base sm:text-lg font-semibold mt-0.5"
            style={{ color: RGI.text }}
          >
            {step === 1 && "Wer ist Ihr Messdienstleister?"}
            {step === 2 && ans && `Anleitung für ${ans.name}`}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Schließen"
          className="p-1 rounded-md hover:bg-black/5"
        >
          <X className="w-5 h-5" style={{ color: RGI.muted }} />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {step === 1 && (
          <div className="flex flex-col gap-2">
            {anbieterKeys.map((key) => {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAnbieter(key);
                    setStep(2);
                  }}
                  aria-pressed={anbieter === key}
                  className={cn(
                    "w-full min-h-[48px] flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    "hover:bg-muted/40 active:scale-[0.99]",
                  )}
                  style={{
                    borderColor: anbieter === key ? RGI.primary : RGI.border,
                    background: anbieter === key ? "rgba(238,114,2,0.05)" : RGI.card,
                  }}
                >
                  <div
                    className="flex-1 min-w-0 font-medium text-[15px]"
                    style={{ color: RGI.text }}
                  >
                    {MESSDIENST_HILFE[key].name}
                  </div>
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: RGI.primary, color: "white" }}
                  >
                    <ChevronRight className="h-3 w-3" strokeWidth={3} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && ans && (
          <>
            {/* CO2-Info aufklappbar (schlank) */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${RGI.border}`, background: RGI.card }}
            >
              <button
                type="button"
                onClick={() => setCo2InfoOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span className="text-sm font-medium" style={{ color: RGI.text }}>
                  Welche Heizungsarten haben eine CO2-Umlage?
                </span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform shrink-0",
                    co2InfoOpen && "rotate-180"
                  )}
                  style={{ color: RGI.muted }}
                />
              </button>
              {co2InfoOpen && (
                <ul
                  className="divide-y"
                  style={{ borderTop: `1px solid ${RGI.border}` }}
                >
                  {HEIZUNGSARTEN.map((h) => (
                    <li
                      key={h.name}
                      className="flex items-center gap-3 px-3 py-2 text-[14px]"
                      style={{ color: RGI.text }}
                    >
                      <StatusIcon art={h.art} />
                      <span>{h.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ol className="space-y-5">
              {ans.schritte.map((s, i) => (
                <li key={i} className="space-y-2">
                  <div
                    className="flex items-start gap-3 text-[15px]"
                    style={{ color: RGI.text }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                      style={{ background: RGI.primary, color: "white" }}
                    >
                      {i + 1}
                    </span>
                    <span>{s.text}</span>
                  </div>
                  <div className="max-w-[720px] mx-auto">
                    <img
                      src={s.bild}
                      alt={`${ans.name} Schritt ${i + 1}`}
                      style={{
                        maxWidth: "100%",
                        height: "auto",
                        display: "block",
                        margin: "0 auto",
                        borderRadius: "0.5rem",
                        border: `1px solid ${RGI.border}`,
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>

            <div
              className="text-sm rounded-xl p-3"
              style={{
                background: RGI.greenBg,
                color: RGI.text,
                border: `1px solid ${RGI.border}`,
              }}
            >
              <strong>Beispiel:</strong> {ans.beispiel.betrag} € −{" "}
              {ans.beispiel.co2} € CO2 = <strong>{ans.beispiel.ergebnis} €</strong>
            </div>

            {/* Mini-Rechner */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: RGI.card, border: `1px solid ${RGI.border}` }}
            >
              <div
                className="text-[15px] font-semibold"
                style={{ color: RGI.text }}
              >
                Ihr Wert ausrechnen
              </div>
              <div className="space-y-2">
                <Label className="text-sm">
                  Betrag Heizung + Warmwasser (€)
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={betrag}
                  onChange={(e) => setBetrag(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">CO2-Vermieteranteil (€)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={co2}
                  onChange={(e) => setCo2(e.target.value)}
                  className="h-11"
                />
              </div>
              <div
                className="rounded-lg px-3 py-2 text-[15px]"
                style={{
                  background: RGI.amberBg,
                  color: RGI.text,
                  border: `1px solid ${RGI.border}`,
                }}
              >
                Einzutragen: <strong>{fmt(result)} €</strong>
              </div>
              <Button
                type="button"
                className="w-full h-11 text-base"
                style={{ background: RGI.primary, color: "white" }}
                disabled={result <= 0}
                onClick={() => {
                  onUebernehmen(Math.round(result * 100) / 100);
                  close();
                }}
              >
                Wert übernehmen
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {step === 2 && (
        <div className="flex items-center justify-between gap-3 mt-5">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setStep(1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Zurück
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={close}>
            Schließen
          </Button>
        </div>
      )}
    </div>
  );
}
