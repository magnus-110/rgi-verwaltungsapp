import { AblageView } from '@/components/ablage/AblageView';

/**
 * Büro-Ablage als eigene Seite (Aufgaben → Ablage).
 * Dieselbe Ablage gibt es jederzeit über das Korb-Symbol oben.
 */
export default function Ablage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4">
        <h1 className="text-[17px] font-semibold text-foreground">Ablage</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Dateien und Notizen fürs Büro hinlegen — statt sich gegenseitig E-Mails zu schreiben.
          Standard ist „für alle“; mit „Nur für …“ sieht es nur, wen du auswählst.
        </p>
      </div>
      <AblageView variant="page" />
    </div>
  );
}
