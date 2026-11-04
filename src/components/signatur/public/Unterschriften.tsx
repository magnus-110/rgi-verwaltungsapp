import { datumZeit, type SignUnterschrift, type UnterschriftLage } from "./api";

const TINTE = "#14142B";
const GRAU = "#6B6B6B";
/** Gleiche Werte wie UNTERSCHRIFT in supabase/functions/_shared/signatur/bild.ts (Backend liefert sie mit). */
const STANDARD: UnterschriftLage = { UEBERSTAND: 0, EINZUG: 6, ZEILE_ABSTAND: 17, ZEILE_GROESSE: 6 };

/**
 * Unterschriften anderer Unterzeichner, die schon unterschrieben haben – als fester Inhalt
 * an ihrer Stelle im Dokument, genau wie stempeln() in _shared/signatur/pdf.ts:
 * zugeschnittenes Bild unten bündig auf der Linie, links mit kleinem Einzug, darf etwas nach oben
 * über das Feld ragen (sonst getippter Name kursiv); darunter – unter der Beschriftung –
 * klein und grau „Name · elektronisch unterschrieben am …“.
 */
export function UnterschriftenEbene({ liste, seite, scale, lage }: { liste: SignUnterschrift[]; seite: number; scale: number; lage?: UnterschriftLage }) {
  const hier = liste.filter((u) => u.page === seite);
  if (!hier.length) return null;
  const l = lage ?? STANDARD;
  return (
    <div className="pointer-events-none absolute inset-0">
      {hier.map((u, i) => {
        const unterzeile = u.ort
          ? `${u.name} · elektronisch unterschrieben in ${u.ort} am ${datumZeit(u.signed_at)}`
          : `${u.name} · elektronisch unterschrieben am ${datumZeit(u.signed_at)}`;
        const ueber = u.h * l.UEBERSTAND;
        const ein = Math.min(l.EINZUG ?? 6, u.w / 4);
        return (
          <div key={`${u.signed_at}-${i}`} aria-label={unterzeile} title={unterzeile}>
            <div
              className="absolute flex items-end justify-start overflow-visible"
              style={{ left: (u.x + ein) * scale, top: (u.y - ueber) * scale, width: (u.w - ein) * scale, height: (u.h + ueber) * scale }}
            >
              {u.signature_png ? (
                <img src={u.signature_png} alt={`Unterschrift ${u.name}`} className="block max-h-full max-w-full object-contain" draggable={false} />
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
              className="absolute whitespace-nowrap"
              style={{
                left: u.x * scale,
                // Grundlinie ZEILE_ABSTAND pt unter der Linie (Oberkante ≈ Grundlinie − 0,8 × Schriftgröße)
                top: (u.y + u.h + l.ZEILE_ABSTAND - l.ZEILE_GROESSE * 0.8) * scale,
                fontSize: l.ZEILE_GROESSE * scale,
                lineHeight: 1,
                color: GRAU,
                fontFamily: "Helvetica, Arial, sans-serif",
              }}
            >
              {unterzeile}
            </div>
          </div>
        );
      })}
    </div>
  );
}
