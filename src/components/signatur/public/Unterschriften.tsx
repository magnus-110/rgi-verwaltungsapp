import { datumZeit, type SignUnterschrift } from "./api";

const TINTE = "#14142B";
const GRAU = "#6B6B6B";

/**
 * Unterschriften anderer Unterzeichner, die schon unterschrieben haben – als fester Inhalt
 * an ihrer Stelle im Dokument. Aufbau wie stempeln() in _shared/signatur/pdf.ts:
 * Bild unten bündig und waagrecht mittig im Feld (sonst getippter Name kursiv),
 * darunter klein und grau „Name · elektronisch unterschrieben am …“.
 */
export function UnterschriftenEbene({ liste, seite, scale }: { liste: SignUnterschrift[]; seite: number; scale: number }) {
  const hier = liste.filter((u) => u.page === seite);
  if (!hier.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {hier.map((u, i) => {
        const unterzeile = u.ort
          ? `${u.name} · elektronisch unterschrieben in ${u.ort} am ${datumZeit(u.signed_at)}`
          : `${u.name} · elektronisch unterschrieben am ${datumZeit(u.signed_at)}`;
        return (
          <div
            key={`${u.signed_at}-${i}`}
            className="absolute"
            style={{ left: u.x * scale, top: u.y * scale, width: u.w * scale, height: u.h * scale }}
            aria-label={unterzeile}
            title={unterzeile}
          >
            <div className="flex h-full w-full items-end justify-center overflow-hidden">
              {u.signature_png ? (
                <img src={u.signature_png} alt={`Unterschrift ${u.name}`} className="max-h-full max-w-full object-contain object-bottom" draggable={false} />
              ) : (
                <span
                  className="truncate italic leading-none"
                  style={{ color: TINTE, fontFamily: "'Times New Roman', Times, serif", fontSize: Math.min(u.h * 0.7, 26) * scale, paddingBottom: u.h * 0.18 * scale }}
                >
                  {u.typed_name || u.name}
                </span>
              )}
            </div>
            <div
              className="absolute left-0 whitespace-nowrap leading-none"
              style={{ top: u.h * scale + 1.5 * scale, fontSize: Math.max(5, 6 * scale), color: GRAU }}
            >
              {unterzeile}
            </div>
          </div>
        );
      })}
    </div>
  );
}
