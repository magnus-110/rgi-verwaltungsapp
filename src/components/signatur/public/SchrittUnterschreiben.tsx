import { useRef, useState } from "react";
import { RotateCw, X } from "lucide-react";
import { FehlerHinweis, Fortschritt, Fusszeile, Haken, Kopf, PrimaerButton, Spalte, UntenLeiste, ueberschrift } from "./ui";
import { Zeichenflaeche, type ZeichenflaecheRef } from "./Zeichenflaeche";
import type { SignInfo } from "./api";

type Props = {
  info: SignInfo;
  name: string;
  setName: (v: string) => void;
  png: string | null;
  setPng: (v: string | null) => void;
  zustimmung: boolean;
  setZustimmung: (v: boolean) => void;
  busy: boolean;
  fehler: string | null;
  onZurueck: () => void;
  onSenden: () => void;
};

/** Schritt 2 · Online unterschreiben (Mockup v05). */
export default function SchrittUnterschreiben(p: Props) {
  const pad = useRef<ZeichenflaecheRef>(null);
  const bereit = p.name.trim().length >= 2 && p.zustimmung;
  const [tippZu, setTippZu] = useState(false);

  const loeschen = () => {
    pad.current?.loeschen();
    p.setPng(null);
  };

  return (
    <>
      <Kopf links="zurueck" onZurueck={p.onZurueck} />
      <div className="flex flex-1 flex-col">
        <div className="[@media(orientation:landscape)_and_(max-height:500px)]:hidden"><Fortschritt schritt={2} /></div>
        <Spalte className="flex flex-col px-5 pt-[15px] min-[641px]:pt-7 [@media(orientation:landscape)_and_(max-height:500px)]:pt-3">
          <h1 className={`${ueberschrift} text-[21px] leading-[24px] min-[641px]:text-[26px] min-[641px]:leading-[32px] [@media(orientation:landscape)_and_(max-height:500px)]:hidden`}>Ihre Unterschrift</h1>

          <label htmlFor="sig-name" className="mt-[14px] block text-[14px] font-semibold leading-[18px] text-[#2B2B2B]">
            Vollständiger Name
          </label>
          <input
            id="sig-name"
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            autoComplete="name"
            className="mt-[6px] block h-[50px] w-full rounded-[8px] border border-[#CCCCCC] bg-white px-[14px] text-[16px] text-[#2B2B2B] outline-none focus:border-[#B35300] focus:ring-2 focus:ring-[#B35300]/20"
          />
          <p className="mt-[5px] text-[12px] leading-[16px] text-[#6B6B6B]">Bitte genau so, wie Sie im Dokument genannt sind.</p>

          <div className="[@media(orientation:landscape)_and_(max-height:500px)]:order-first">
          <div className="mt-[19px] flex items-baseline justify-between [@media(orientation:landscape)_and_(max-height:500px)]:mt-0">
            <span className="text-[14px] leading-[18px] text-[#2B2B2B]">
              <b className="font-semibold">Unterschrift zeichnen</b> <span className="text-[#6B6B6B]">(freiwillig)</span>
            </span>
            <button type="button" onClick={loeschen} className="pr-1.5 text-[14px] leading-[18px] text-[#B35300] hover:underline">
              Löschen
            </button>
          </div>
          {!tippZu && (
            <div
              role="note"
              className="mt-[11px] hidden items-start gap-2.5 rounded-[10px] border border-[#F6D3AE] bg-[#FFF7ED] py-2.5 pl-3 pr-1.5 text-[13px] leading-[18px] text-[#2B2B2B] [@media(orientation:portrait)_and_(max-width:640px)]:flex"
            >
              <RotateCw className="mt-[1px] h-[18px] w-[18px] shrink-0 text-[#B35300]" strokeWidth={2.2} aria-hidden />
              <span className="flex-1">
                <b className="font-semibold">Tipp:</b> Drehen Sie Ihr Handy quer – dann haben Sie mehr Platz zum Unterschreiben.
              </span>
              <button
                type="button"
                onClick={() => setTippZu(true)}
                aria-label="Hinweis schließen"
                className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#595959] hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="relative mt-[11px] h-[118px] overflow-hidden rounded-[8px] border border-dashed border-[#B5B5B5] bg-[#FAFAFA] min-[641px]:h-[200px] [@media(orientation:landscape)_and_(max-height:500px)]:h-[max(150px,calc(100dvh-125px))]">
            <div className="pointer-events-none absolute inset-x-5 bottom-[22px] h-px bg-[#CCCCCC]" />
            <Zeichenflaeche ref={pad} value={p.png} onChange={p.setPng} />
          </div>
          </div>

          <label className="mt-4 flex cursor-pointer gap-[12px] rounded-[10px] bg-[#FFF7ED] px-[14px] py-[14px]">
            <input type="checkbox" className="peer sr-only" checked={p.zustimmung} onChange={(e) => p.setZustimmung(e.target.checked)} />
            <span
              aria-hidden
              className={`mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-2 border-[#B35300] peer-focus-visible:ring-2 peer-focus-visible:ring-[#B35300]/30 ${p.zustimmung ? "bg-[#B35300] text-white" : "bg-white"}`}
            >
              {p.zustimmung && <Haken className="h-[19px] w-[19px]" strich={3.4} />}
            </span>
            <span className="text-[14px] leading-[20.5px] text-[#2B2B2B]">
              Ich habe das Dokument „{p.info.titel}“ gelesen und stimme seinem Inhalt verbindlich zu. Mir ist bekannt, dass diese elektronische Erklärung in Textform rechtsverbindlich ist.
            </span>
          </label>

          <p className="mt-[18px] text-[12px] leading-[18px] text-[#6B6B6B]">
            Zur Nachvollziehbarkeit speichern wir Name, Zeitpunkt, IP-Adresse und Gerät.{" "}
            <a href="/legal/datenschutz" target="_blank" rel="noopener noreferrer" className="text-[#B35300] underline underline-offset-2">
              Datenschutzhinweise
            </a>
          </p>

          {p.fehler && (
            <div className="mt-4">
              <FehlerHinweis>{p.fehler}</FehlerHinweis>
            </div>
          )}
        </Spalte>
        <Fusszeile className="mt-auto pt-10" />
      </div>
      <UntenLeiste>
        <PrimaerButton disabled={!bereit} busy={p.busy} onClick={p.onSenden}>
          Verbindlich unterschreiben
        </PrimaerButton>
      </UntenLeiste>
    </>
  );
}
