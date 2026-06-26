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
  X,
} from "lucide-react";

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
  hinweis: string;
}> = [
  { art: "ja", name: "Erdgas (Gas)", hinweis: "CO2-Anteil vorhanden" },
  { art: "ja", name: "Heizöl (Öl)", hinweis: "CO2-Anteil vorhanden" },
  { art: "ja", name: "Flüssiggas", hinweis: "CO2-Anteil vorhanden" },
  {
    art: "kommt-drauf-an",
    name: "Fernwärme",
    hinweis:
      "nur, wenn aus fossilen Brennstoffen erzeugt; ob ein CO2-Anteil anfällt, steht auf der Abrechnung",
  },
  { art: "nein", name: "Wärmepumpe", hinweis: "kein CO2-Anteil" },
  {
    art: "nein",
    name: "Holzpellets / Holz (Biomasse)",
    hinweis: "kein CO2-Anteil",
  },
];

function StatusIcon({ art }: { art: "ja" | "nein" | "kommt-drauf-an" }) {
  if (art === "ja")
    return <CheckCircle2 className="w-6 h-6 shrink-0" style={{ color: RGI.green }} />;
  if (art === "nein")
    return <XCircle className="w-6 h-6 shrink-0" style={{ color: RGI.red }} />;
  return <AlertTriangle className="w-6 h-6 shrink-0" style={{ color: RGI.amber }} />;
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [anbieter, setAnbieter] = useState<AnbieterKey | null>(null);
  const [betrag, setBetrag] = useState("");
  const [co2, setCo2] = useState("");

  const reset = () => {
    setStep(1);
    setAnbieter(null);
    setBetrag("");
    setCo2("");
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

  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{ border: `1px solid ${RGI.border}`, background: RGI.bg }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div
            className="text-[11px] uppercase tracking-wide font-semibold"
            style={{ color: RGI.muted }}
          >
            Schritt {step} von 3
          </div>
          <div
            className="text-base sm:text-lg font-semibold mt-0.5"
            style={{ color: RGI.text }}
          >
            {step === 1 && "Hat Ihre Heizung überhaupt eine CO2-Umlage?"}
            {step === 2 && "Wer ist Ihr Messdienstleister?"}
            {step === 3 && ans && `Anleitung für ${ans.name}`}
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
          <>
            <ul className="space-y-2">
              {HEIZUNGSARTEN.map((h) => (
                <li
                  key={h.name}
                  className="flex items-start gap-3 rounded-xl p-3"
                  style={{
                    border: `1px solid ${RGI.border}`,
                    background: RGI.card,
                  }}
                >
                  <StatusIcon art={h.art} />
                  <div className="min-w-0">
                    <div
                      className="font-medium text-[15px]"
                      style={{ color: RGI.text }}
                    >
                      {h.name}
                    </div>
                    <div className="text-sm" style={{ color: RGI.muted }}>
                      {h.hinweis}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div
              className="text-sm rounded-xl p-3"
              style={{
                background: RGI.amberBg,
                color: RGI.text,
                border: `1px solid ${RGI.border}`,
              }}
            >
              Hat Ihre Heizung keinen CO2-Anteil, tragen Sie einfach den
              Heizungs-/Warmwasser-Wert ein. Kaltwasser/Hausnebenkosten gehören{" "}
              <strong>NICHT</strong> in dieses Feld.
            </div>
          </>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.keys(MESSDIENST_HILFE) as AnbieterKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAnbieter(key);
                  setStep(3);
                }}
                className="rounded-xl px-3 py-4 text-[15px] font-medium min-h-[64px] transition-colors"
                style={{
                  border: `1px solid ${anbieter === key ? RGI.primary : RGI.border}`,
                  background: RGI.card,
                  color: RGI.text,
                }}
              >
                {MESSDIENST_HILFE[key].name}
              </button>
            ))}
          </div>
        )}

        {step === 3 && ans && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: RGI.muted }}>
                Anbieter: <strong style={{ color: RGI.text }}>{ans.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-sm underline underline-offset-2"
                style={{ color: RGI.primary }}
              >
                Anbieter wechseln
              </button>
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
                      style={{
                        background: RGI.primary,
                        color: "white",
                      }}
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
      <div className="flex items-center justify-between gap-3 mt-5">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={step === 1}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Zurück
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            className="h-11"
            style={{ background: RGI.primary, color: "white" }}
            disabled={step === 2 && !anbieter}
            onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3))}
          >
            Weiter
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-11" onClick={close}>
            Schließen
          </Button>
        )}
      </div>
    </div>
  );
}
