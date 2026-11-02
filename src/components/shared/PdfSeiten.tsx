import PdfAnsichtInner from "./pdf/PdfAnsichtInner";

/**
 * Zeigt alle Seiten eines PDFs untereinander, so breit wie der Platz.
 * Dünne Hülle um die gemeinsame PDF-Anzeige (wird schon verzögert geladen).
 */
export default function PdfSeiten({ datei, onFehler, dateiName }: { datei: Blob; onFehler?: () => void; dateiName?: string }) {
  return <PdfAnsichtInner quelle={datei} dateiName={dateiName} onFehler={() => onFehler?.()} />;
}
