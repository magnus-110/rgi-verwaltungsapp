interface ActivitySparklineProps {
  /** Ein Wert je Woche, älteste zuerst. */
  weeks: number[];
  /** Kompakt für die Liste, groß für die Akte. */
  size?: 'klein' | 'gross';
}

/**
 * Zwölf Wochen Aktivität als Balken.
 *
 * Bewusst ohne Achsen und Zahlen: Die Frage ist nicht „wie viele Mails",
 * sondern „lief das mal und ist dann abgerissen".
 */
export function ActivitySparkline({ weeks, size = 'klein' }: ActivitySparklineProps) {
  const max = Math.max(1, ...weeks);
  const hoehe = size === 'gross' ? 44 : 26;
  const breite = size === 'gross' ? 10 : 6;
  const luecke = size === 'gross' ? 3 : 2;

  return (
    <div
      className="flex items-end"
      style={{ gap: `${luecke}px`, height: `${hoehe}px` }}
      role="img"
      aria-label={`Aktivität der letzten ${weeks.length} Wochen`}
    >
      {weeks.map((n, i) => {
        const h = n === 0 ? 4 : Math.max(6, Math.round((n / max) * hoehe));
        return (
          <span
            key={i}
            className={`rounded-[1px] ${n > 0 ? 'bg-[#C9C3B8]' : 'bg-[#E4E0D8]'}`}
            style={{ width: `${breite}px`, height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Derselbe Streifen in Worten — für die Akte, wo eine Zeile Klartext
 * mehr hilft als das Bild allein.
 */
export function beschreibeVerlauf(weeks: number[]): string {
  if (weeks.length === 0) return '';
  const aktive = weeks.filter(n => n > 0).length;
  if (aktive === 0) return 'In zwölf Wochen ist nichts passiert.';

  // Wie viele Wochen am Ende sind leer?
  let stilleAmEnde = 0;
  for (let i = weeks.length - 1; i >= 0 && weeks[i] === 0; i--) stilleAmEnde++;

  if (stilleAmEnde === 0) return 'Läuft bis zuletzt.';
  if (stilleAmEnde >= weeks.length - 1) return 'Einmal etwas, seitdem nichts.';

  const liefWochen = weeks.length - stilleAmEnde;
  return `Lief ${liefWochen} ${liefWochen === 1 ? 'Woche' : 'Wochen'}, dann Abbruch.`;
}
