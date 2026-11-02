import { AlertCircle, Clock, Loader2, RefreshCw, Undo2, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { FehlerHinweis, Fusszeile, Haken, Kopf, SekundaerButton, TELEFON, ueberschrift } from "./ui";
import { datumZeit, type SignInfo } from "./api";

export type UngueltigGrund = "abgelaufen" | "zurueckgezogen" | "unterschrieben" | "papier_eingegangen" | "unbekannt";

const TEXTE: Record<UngueltigGrund, string> = {
  abgelaufen: "Dieser Link ist abgelaufen.",
  zurueckgezogen: "Diese Unterschriftsanfrage wurde zurückgezogen.",
  unterschrieben: "Sie haben dieses Dokument bereits unterschrieben.",
  papier_eingegangen: "Ihre Papier-Unterschrift ist eingegangen.",
  unbekannt: "Dieser Link ist ungültig.",
};

function Symbol({ grund }: { grund: UngueltigGrund }) {
  const ok = grund === "unterschrieben" || grund === "papier_eingegangen";
  if (ok) {
    return (
      <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#D4EDDA] text-[#1E6B34]">
        <Haken className="h-[44px] w-[44px]" strich={2.2} />
      </div>
    );
  }
  const Icon = grund === "abgelaufen" ? Clock : grund === "zurueckgezogen" ? Undo2 : AlertCircle;
  return (
    <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#FFF7ED] text-[#B35300]">
      <Icon className="h-[34px] w-[34px]" strokeWidth={2} />
    </div>
  );
}

function Telefon({ prefix = "Bei Fragen erreichen Sie uns unter" }: { prefix?: string }) {
  return (
    <p className="mx-auto mt-[22px] max-w-[350px] text-[13px] leading-[20px] text-[#595959]">
      {prefix}{" "}
      <a href="tel:+498363960656" className="whitespace-nowrap font-semibold text-[#B35300]">{TELEFON}</a>.
    </p>
  );
}

function Huelle({ children }: { children: ReactNode }) {
  return (
    <>
      <Kopf links="sicher" />
      <div className="flex flex-1 flex-col">
        <div className="px-5 pt-[48px] text-center min-[641px]:mx-auto min-[641px]:w-full min-[641px]:max-w-[520px] min-[641px]:pt-20">{children}</div>
        <Fusszeile className="mt-auto pt-10" />
      </div>
    </>
  );
}

export function LinkUngueltig({
  grund,
  info,
  onDownload,
  downloadBusy,
  downloadFehler,
}: {
  grund: UngueltigGrund;
  info?: SignInfo | null;
  onDownload?: () => void;
  downloadBusy?: boolean;
  downloadFehler?: string | null;
}) {
  return (
    <Huelle>
      <Symbol grund={grund} />
      <h1 className={`${ueberschrift} mt-[19px] text-[21px] leading-[28px]`}>{TEXTE[grund]}</h1>
      {info?.titel && grund !== "unbekannt" && (
        <p className="mt-[8px] text-[13px] leading-[19px] text-[#6B6B6B]">
          {info.titel}
          {grund === "unterschrieben" && info.signed_at ? ` · unterschrieben am ${datumZeit(info.signed_at)}` : ""}
        </p>
      )}
      {grund === "abgelaufen" && (
        <p className="mx-auto mt-[14px] max-w-[340px] text-[14px] leading-[22px]">Gerne senden wir Ihnen einen neuen Link.</p>
      )}
      {grund === "unterschrieben" && onDownload && (
        <div className="mt-[22px] px-0">
          {downloadFehler && <div className="mb-2 text-left"><FehlerHinweis>{downloadFehler}</FehlerHinweis></div>}
          <SekundaerButton onClick={onDownload} busy={downloadBusy}>PDF herunterladen</SekundaerButton>
        </div>
      )}
      <Telefon />
    </Huelle>
  );
}

export function Laden() {
  return (
    <>
      <Kopf links="sicher" />
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-[#B35300]" aria-label="Wird geladen" />
      </div>
      <Fusszeile />
    </>
  );
}

export function Stoerung({ text, netz, onNochmal }: { text: string; netz: boolean; onNochmal: () => void }) {
  return (
    <Huelle>
      <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#FFF7ED] text-[#B35300]">
        {netz ? <WifiOff className="h-[34px] w-[34px]" /> : <AlertCircle className="h-[34px] w-[34px]" />}
      </div>
      <h1 className={`${ueberschrift} mt-[19px] text-[21px] leading-[28px]`}>
        {netz ? "Gerade keine Verbindung" : "Das hat leider nicht geklappt"}
      </h1>
      <p className="mx-auto mt-[12px] max-w-[340px] text-[14px] leading-[22px] text-[#2B2B2B]">{text}</p>
      <div className="mt-[22px]">
        <SekundaerButton onClick={onNochmal}>
          <RefreshCw className="h-4 w-4" /> Erneut versuchen
        </SekundaerButton>
      </div>
      <Telefon prefix="Falls es weiterhin nicht klappt, erreichen Sie uns unter" />
    </Huelle>
  );
}
