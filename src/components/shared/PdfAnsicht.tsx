/**
 * Gemeinsame Dokument-Anzeige für die ganze App.
 *
 * - <PdfAnsicht>: PDF mit allen Seiten untereinander (react-pdf, verzögert geladen)
 * - <DokumentAnsicht>: erkennt den Dateityp selbst – PDF → PdfAnsicht,
 *   Bild → Bild, Text/XML → einfache Anzeige, sonst „Herunterladen“
 * - <DokumentVorschauDialog>: dasselbe groß (Handy: echtes Vollbild)
 * - useDokumentVorschau(): Dialog mit einer Zeile öffnen
 */
import { lazy, Suspense, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { istBildTyp, istPdfTyp, istTextTyp, useDateiBlob, type DateiQuelle } from "./pdf/datei";
import type { PdfAnsichtProps } from "./pdf/PdfAnsichtInner";

export { istBildTyp, istPdfTyp, kannVorschau, useDateiBlob, type DateiQuelle } from "./pdf/datei";
export type { PdfAnsichtProps } from "./pdf/PdfAnsichtInner";

const PdfAnsichtInner = lazy(() => import("./pdf/PdfAnsichtInner"));

function Laden({ text = "Wird geladen …" }: { text?: string }) {
  return (
    <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 bg-[#EDEDED] text-[13px] text-[#6B6B6B]">
      <Loader2 className="h-6 w-6 animate-spin" />
      {text}
    </div>
  );
}

/** PDF-Anzeige (alle Seiten, Zoom, Seitenzahl, Download). Füllt den Platz des Elternelements. */
export function PdfAnsicht(props: PdfAnsichtProps) {
  return (
    <Suspense fallback={<div className={cn("h-full w-full", props.className)}><Laden text="PDF wird geladen …" /></div>}>
      <PdfAnsichtInner {...props} />
    </Suspense>
  );
}

export interface DokumentAnsichtProps {
  quelle: DateiQuelle;
  dateiName?: string;
  mimeType?: string | null;
  startSeite?: number;
  className?: string;
  /** Download-Knopf in der PDF-Leiste (Standard: ja) */
  download?: boolean;
}

/** Zeigt PDF, Bild oder Text passend an. Füllt den Platz des Elternelements. */
export function DokumentAnsicht({ quelle, dateiName, mimeType, startSeite, className, download = true }: DokumentAnsichtProps) {
  const d = useDateiBlob(quelle, { dateiName, mimeType });
  const name = dateiName || (quelle instanceof File ? quelle.name : "") || "Dokument";
  const typ = d.typ || mimeType || null;

  if (!quelle) return null;
  if (d.laedt) return <div className={cn("h-full w-full", className)}><Laden /></div>;

  if (istPdfTyp(typ, d.typ ? "" : name)) {
    return (
      <PdfAnsicht
        quelle={d.blob ?? d.url}
        dateiName={name}
        startSeite={startSeite}
        download={download}
        className={className}
      />
    );
  }
  if (istBildTyp(typ, name) && d.url) {
    return (
      <div className={cn("flex h-full w-full overflow-auto bg-[#EDEDED] p-3 sm:p-4", className)}>
        <img src={d.url} alt={name} className="m-auto max-w-full rounded-sm bg-white object-contain shadow-[0_2px_10px_rgba(0,0,0,0.12)]" />
      </div>
    );
  }
  if (istTextTyp(typ, name) && d.url) {
    return (
      <div className={cn("h-full w-full bg-white", className)}>
        <iframe src={d.url} title={name} className="h-full w-full border-0 bg-white" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 bg-[#EDEDED] px-6 text-center", className)}>
      <FileText className="h-8 w-8 text-[#6B6B6B]" />
      <p className="text-[14px] text-[#595959]">Für diesen Dateityp gibt es keine Vorschau.</p>
      {d.url && (
        <a
          href={d.url}
          download={name}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#D6D6D6] bg-white px-4 text-[14px] font-semibold text-[#2B2B2B] hover:bg-[#FAFAFA]"
        >
          <Download className="h-4 w-4" /> Datei herunterladen
        </a>
      )}
    </div>
  );
}

export interface DokumentVorschauDialogProps extends Omit<DokumentAnsichtProps, "className"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Überschrift (Standard: Dateiname) */
  titel?: string;
  /** Zusätzliche Knöpfe oben rechts, z. B. „Unterschreiben“ */
  aktionen?: ReactNode;
  /** Knopf „Neuer Tab“ (nur am Computer) – Standard: ja */
  neuerTab?: boolean;
}

/** Große Vorschau: am Handy echtes Vollbild, am Computer großer Dialog. */
export function DokumentVorschauDialog({
  open, onOpenChange, quelle, dateiName, mimeType, startSeite, titel, aktionen, neuerTab = true, download = true,
}: DokumentVorschauDialogProps) {
  const name = dateiName || "Dokument";
  const d = useDateiBlob(open ? quelle : null, { dateiName, mimeType });
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-[70] flex flex-col overflow-hidden bg-white font-sans shadow-2xl outline-none",
            "pt-[env(safe-area-inset-top)] sm:pt-0",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[92vh] sm:w-[94vw] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#E5E5E5] pl-4 pr-2 sm:pl-5 sm:pr-3">
            <FileText className="hidden h-5 w-5 shrink-0 text-[#B35300] sm:block" />
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#2B2B2B]" title={titel || name}>
              {titel || name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Vorschau von {name}</DialogPrimitive.Description>
            {aktionen}
            {neuerTab && d.url && (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-9 items-center gap-1.5 rounded-lg border border-[#D6D6D6] bg-white px-3 text-[13px] font-semibold text-[#2B2B2B] hover:bg-[#FAFAFA] md:inline-flex"
              >
                <ExternalLink className="h-4 w-4" /> Neuer Tab
              </a>
            )}
            {download && d.url && (
              <a
                href={d.url}
                download={name}
                title="Herunterladen"
                aria-label="Herunterladen"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D6D6D6] bg-white text-[#2B2B2B] hover:bg-[#FAFAFA] sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-[13px] sm:font-semibold"
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <DialogPrimitive.Close
              className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#2B2B2B] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202]"
              aria-label="Schließen"
              title="Schließen"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1">
            {open && (
              <DokumentAnsicht
                quelle={d.blob ?? (d.laedt ? null : d.url)}
                dateiName={name}
                mimeType={d.typ || mimeType}
                startSeite={startSeite}
                download={false}
              />
            )}
            {open && d.laedt && <Laden />}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

export interface VorschauDaten {
  quelle: DateiQuelle;
  dateiName: string;
  mimeType?: string | null;
  startSeite?: number;
  titel?: string;
}

/**
 * Vorschau-Dialog per Funktionsaufruf:
 *   const vorschau = useDokumentVorschau();
 *   vorschau.oeffnen({ quelle: url, dateiName: "Rechnung.pdf" });
 *   …{vorschau.dialog}
 */
export function useDokumentVorschau(opts: { aktionen?: ReactNode } = {}) {
  const [daten, setDaten] = useState<VorschauDaten | null>(null);
  const [offen, setOffen] = useState(false);
  const dialog = (
    <DokumentVorschauDialog
      open={offen}
      onOpenChange={setOffen}
      quelle={daten?.quelle ?? null}
      dateiName={daten?.dateiName ?? ""}
      mimeType={daten?.mimeType}
      startSeite={daten?.startSeite}
      titel={daten?.titel}
      aktionen={opts.aktionen}
    />
  );
  return {
    oeffnen: (d: VorschauDaten) => {
      setDaten(d);
      setOffen(true);
    },
    schliessen: () => setOffen(false),
    offen,
    daten,
    dialog,
  };
}
