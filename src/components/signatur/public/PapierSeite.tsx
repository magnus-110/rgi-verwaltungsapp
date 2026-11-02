import { useRef, useState, type ReactNode } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { FehlerHinweis, Fusszeile, Haken, Kopf, PrimaerButton, TELEFON, UntenLeiste, ueberschrift } from "./ui";
import { datum, papierHochladen, type SignInfo } from "./api";
import { dateiVorbereiten, type Upload } from "./dateien";

type Props = {
  token: string;
  info: SignInfo;
  onZurueck: () => void;
  onDownload: () => void;
  downloadBusy: boolean;
  downloadFehler: string | null;
  onFertig: (seiten: number) => void;
};

function Schritt({ nr, titel, children }: { nr: number; titel: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-[1px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-[13px] font-bold text-[#B35300]">{nr}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-[20px] text-[#2B2B2B]">{titel}</div>
        {children}
      </div>
    </div>
  );
}

/** Papier-Seite (Mockup v08 oben): drucken, unterschreiben, alle Seiten zurückgeben. */
export default function PapierSeite({ token, info, onZurueck, onDownload, downloadBusy, downloadFehler, onFertig }: Props) {
  const n = Math.max(1, info.seitenzahl || 1);
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [verarbeite, setVerarbeite] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [senden, setSenden] = useState(false);

  const x = uploads.reduce((s, u) => s + u.seiten, 0);
  const fehlt = n - x;
  const kacheln: { nr: number; upload?: Upload; erste?: boolean }[] = [];
  uploads.forEach((u) => {
    for (let i = 0; i < u.seiten; i++) kacheln.push({ nr: kacheln.length + 1, upload: u, erste: i === 0 });
  });
  while (kacheln.length < n) kacheln.push({ nr: kacheln.length + 1 });

  const hinzufuegen = async (files: FileList | null) => {
    if (!files?.length) return;
    setHinweis(null);
    setFehler(null);
    setVerarbeite(true);
    const neu: Upload[] = [];
    const meldungen: string[] = [];
    for (const f of Array.from(files)) {
      try {
        neu.push(await dateiVorbereiten(f));
      } catch (e: any) {
        meldungen.push(e?.message || `„${f.name}“ konnte nicht verarbeitet werden.`);
      }
    }
    setUploads((u) => [...u, ...neu]);
    if (meldungen.length) setHinweis(meldungen.join(" "));
    setVerarbeite(false);
    if (input.current) input.current.value = "";
  };

  const entfernen = (id: string) => setUploads((u) => u.filter((x) => x.id !== id));

  const absenden = async () => {
    setSenden(true);
    setFehler(null);
    try {
      const r = await papierHochladen(token, uploads.map(({ name, mime, base64 }) => ({ name, mime, base64 })));
      onFertig(r?.seiten || x);
    } catch (e: any) {
      setFehler(e?.message || "Das Hochladen hat nicht geklappt. Bitte versuchen Sie es erneut.");
    } finally {
      setSenden(false);
    }
  };

  const seitenWort = (k: number) => (k === 1 ? "Seite" : "Seiten");
  const ziel = info.unterschriftsseite || n;
  const titelZeile = [info.titel, info.frist ? `Frist ${datum(info.frist)}` : null].filter(Boolean).join(" · ");

  let knopf: ReactNode;
  if (fehlt > 0) knopf = <PrimaerButton disabled>{fehlt === 1 ? "Noch 1 Seite fehlt" : `Noch ${fehlt} Seiten fehlen`}</PrimaerButton>;
  else if (fehlt < 0) knopf = <PrimaerButton disabled>{`${-fehlt} ${seitenWort(-fehlt)} zu viel`}</PrimaerButton>;
  else knopf = <PrimaerButton busy={senden} onClick={absenden}>{`Alle ${n} ${seitenWort(n)} senden`}</PrimaerButton>;

  return (
    <>
      <Kopf links="zurueck" onZurueck={onZurueck} />
      <div className="flex flex-1 flex-col">
        <div className="px-5 pt-[14px]">
          <h1 className={`${ueberschrift} text-[20px] leading-[26px]`}>Auf Papier unterschreiben</h1>
          <p className="mt-[1px] text-[13px] leading-[17px] text-[#6B6B6B]">{titelZeile}</p>

          <div className="mt-[13px] space-y-[14px]">
            <Schritt nr={1} titel="PDF herunterladen und ausdrucken">
              <button
                type="button"
                onClick={onDownload}
                disabled={downloadBusy}
                className="mt-[7px] flex h-[45px] w-full items-center justify-center gap-2 rounded-[8px] border border-[#CCCCCC] bg-white text-[14px] font-semibold text-[#2B2B2B] hover:bg-[#FAFAFA]"
              >
                {downloadBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                PDF zum Drucken ({n} {seitenWort(n)})
              </button>
              {downloadFehler && <div className="mt-2"><FehlerHinweis>{downloadFehler}</FehlerHinweis></div>}
            </Schritt>

            <Schritt nr={2} titel={`Auf Seite ${ziel} unterschreiben`}>
              <p className="mt-[2px] text-[13px] leading-[19px] text-[#595959]">
                {info.unterschriftsseite ? "Das Unterschriftsfeld ist mit Ihrem Namen markiert." : "Unterschreiben Sie an der vorgesehenen Stelle."}
              </p>
            </Schritt>

            <Schritt nr={3} titel={`Alle ${n} ${seitenWort(n)} zurückgeben`}>
              <p className="mt-[5px] text-[13px] leading-[19px] text-[#595959]">Bitte das ganze Dokument, nicht nur die Seite mit der Unterschrift.</p>

              <div className="mt-[8px] flex flex-wrap gap-[6px]">
                {kacheln.map((k) => (
                  <div
                    key={k.nr}
                    className={`relative flex h-[69px] w-[calc((100%-30px)/6)] items-end justify-center rounded-[4px] pb-[3px] text-[10.5px] font-bold ${
                      k.upload
                        ? k.nr > n
                          ? "border-[1.5px] border-[#C0392B] bg-[#FDF1EF] text-[#C0392B]"
                          : "border-[1.5px] border-[#B35300] bg-[#FFF7ED] text-[#B35300]"
                        : "border border-dashed border-[#B5B5B5] bg-[#FAFAFA] text-[#6B6B6B]"
                    }`}
                  >
                    {k.nr}
                    {k.upload && k.erste && (
                      <button
                        type="button"
                        onClick={() => entfernen(k.upload!.id)}
                        aria-label={k.upload.seiten > 1 ? `${k.upload.name} (${k.upload.seiten} Seiten) entfernen` : `Seite ${k.nr} entfernen`}
                        title={k.upload.seiten > 1 ? `„${k.upload.name}“ (${k.upload.seiten} Seiten) entfernen` : "Seite entfernen"}
                        className="absolute right-[1px] top-[1px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[#B35300]/70 hover:bg-white hover:text-[#B35300]"
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-[8px] flex items-center justify-between gap-3">
                <span className="text-[14px] font-bold text-[#B35300]">
                  {x} von {n} {seitenWort(n)}
                </span>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={verarbeite}
                  className="flex h-[44px] items-center gap-[9px] rounded-[8px] border-2 border-[#B35300] bg-white px-[15px] text-[14px] font-bold text-[#B35300] hover:bg-[#FFF7ED] disabled:opacity-60"
                >
                  {verarbeite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-[15px] w-[15px]" strokeWidth={2.2} />}
                  Seite hinzufügen
                </button>
                <input
                  ref={input}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => hinzufuegen(e.target.files)}
                />
              </div>
              {hinweis && <div className="mt-2"><FehlerHinweis>{hinweis}</FehlerHinweis></div>}
              {fehlt < 0 && (
                <p className="mt-2 text-[12px] leading-[18px] text-[#C0392B]">
                  Das Dokument hat nur {n} {seitenWort(n)}. Bitte entfernen Sie überzählige Seiten.
                </p>
              )}
              <p className="mt-[7px] text-[12px] leading-[18px] text-[#595959]">Oder auf die Einladungs-E-Mail antworten und den vollständigen Scan anhängen.</p>
            </Schritt>
          </div>

          <div className="mt-[17px] rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-[14px] py-[12px] text-[13px] leading-[19px] text-[#2B2B2B]">
            <b className="font-semibold">Bitte nicht per Post senden.</b> Ein gut lesbares Foto oder ein Scan per E-Mail genügt.
          </div>

          {fehler && <div className="mt-3"><FehlerHinweis>{fehler}</FehlerHinweis></div>}
        </div>
        <Fusszeile className="mt-auto pt-10" />
      </div>
      <UntenLeiste>{knopf}</UntenLeiste>
    </>
  );
}

/** Bestätigung nach dem Hochladen der Papier-Seiten. */
export function PapierDanke({ seiten }: { seiten: number }) {
  return (
    <>
      <Kopf links={null} />
      <div className="flex flex-1 flex-col">
        <div className="px-5 pt-[48px] text-center">
          <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#D4EDDA] text-[#1E6B34]">
            <Haken className="h-[44px] w-[44px]" strich={2.2} />
          </div>
          <h1 className={`${ueberschrift} mt-[19px] text-[22px] leading-[28px]`}>Vielen Dank!</h1>
          <p className="mx-auto mt-[14px] max-w-[340px] text-[14.5px] leading-[23.5px] text-[#2B2B2B]">
            Ihre {seiten} {seiten === 1 ? "Seite ist" : "Seiten sind"} eingegangen. Wir prüfen die Unterschrift und melden uns, sobald alle unterschrieben haben.
          </p>
          <p className="mx-auto mt-[24px] max-w-[350px] text-[11.5px] leading-[18px] text-[#6B6B6B]">
            Sie können dieses Fenster schließen. Bei Fragen erreichen Sie uns unter{" "}
            <a href="tel:+498363960656" className="whitespace-nowrap">{TELEFON}</a>.
          </p>
        </div>
        <Fusszeile className="mt-auto pt-10" />
      </div>
    </>
  );
}
