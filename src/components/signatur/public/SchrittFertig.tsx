import { FehlerHinweis, Fortschritt, Fusszeile, Haken, Kopf, SekundaerButton, TELEFON, ueberschrift } from "./ui";
import { datumZeit, grussName, type SignErgebnis, type SignInfo } from "./api";

type Props = {
  info: SignInfo;
  ergebnis: SignErgebnis;
  name: string;
  onDownload: () => void;
  busy: boolean;
  downloadFehler: string | null;
};

/** Schritt 3 · Bestätigung (Mockup v06 oben). */
export default function SchrittFertig({ info, ergebnis, name, onDownload, busy, downloadFehler }: Props) {
  const kopie = ergebnis.kopie_an ?? null;
  const zeilen: [string, string][] = [
    ["Dokument", info.titel],
    ["Unterschrieben am", datumZeit(ergebnis.signed_at)],
    ["Vorgangs-Nr.", ergebnis.nummer || info.nummer],
  ];

  return (
    <>
      <Kopf links={null} />
      <div className="flex flex-1 flex-col">
        <Fortschritt schritt={3} />
        <div className="px-2 pt-[45px] text-center">
          <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#D4EDDA] text-[#1E6B34]">
            <Haken className="h-[44px] w-[44px]" strich={2.2} />
          </div>
          <h1 className={`${ueberschrift} mt-[17px] px-3 text-[24px] leading-[30px]`}>Vielen Dank, {grussName(name || info.name, info.anrede)}!</h1>
          <p className="mx-auto mt-[15px] px-4 text-[15px] leading-[23.5px] text-[#2B2B2B]">
            {kopie ? (
              <>
                Ihre Unterschrift ist eingegangen. Eine Kopie des unterschriebenen Dokuments haben wir an <b className="font-semibold">{kopie}</b> gesendet.
              </>
            ) : info.typ === "etv_protokoll" ? (
              <>Ihre Unterschrift ist eingegangen. Sobald alle unterschrieben haben, erhalten Sie das fertige Protokoll per E-Mail.</>
            ) : (
              <>Ihre Unterschrift ist eingegangen. Bitte laden Sie das unterschriebene Dokument jetzt herunter und bewahren Sie es auf.</>
            )}
          </p>

          <dl className="mt-[19px] rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-4 py-[12px] text-left text-[13px] leading-[21px]">
            {zeilen.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="shrink-0 text-[#6B6B6B]">{k}</dt>
                <dd className="text-right text-[#2B2B2B]">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="px-4 pt-[18px]">
            {downloadFehler && <div className="mb-2 text-left"><FehlerHinweis>{downloadFehler}</FehlerHinweis></div>}
            <SekundaerButton onClick={onDownload} busy={busy}>PDF jetzt herunterladen</SekundaerButton>
          </div>
          <p className="mx-auto mt-[19px] px-4 text-[12px] leading-[18px] text-[#6B6B6B]">
            Sie können dieses Fenster schließen. Bei Fragen erreichen Sie uns unter{" "}
            <a href="tel:+498363960656" className="whitespace-nowrap">{TELEFON}</a>.
          </p>
        </div>
        <Fusszeile className="mt-auto pt-10" />
      </div>
    </>
  );
}
