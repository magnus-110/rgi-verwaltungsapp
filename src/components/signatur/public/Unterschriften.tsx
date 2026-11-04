import { type SignUnterschrift, type UnterschriftLage } from "./api";

const TINTE = "#14142B";
const GRAU = "#6B6B6B";
/** Gleiche Werte wie UNTERSCHRIFT in supabase/functions/_shared/signatur/bild.ts (Backend liefert sie mit). */
const STANDARD: UnterschriftLage = { UEBERSTAND: 0, EINZUG: 6 };

/**
 * Unterschriften anderer Unterzeichner, die schon unterschrieben haben – als fester Inhalt
 * an ihrer Stelle im Dokument, genau wie stempeln() in _shared/signatur/pdf.ts:
 * zugeschnittenes Bild unten bündig auf der Linie, links mit kleinem Einzug (sonst getippter Name
 * kursiv). Die graue Zeile „Name · elektronisch unterschrieben am …“ setzt der Server
 * (_shared/signatur/unterzeile.ts) – hier nur zeichnen.
 */
export function UnterschriftenEbene({ liste, seite, scale, lage }: { liste: SignUnterschrift[]; seite: number; scale: number; lage?: UnterschriftLage }) {
  const hier = liste.filter((u) => u.page === seite);
  if (!hier.length) return null;
  const l = lage ?? STANDARD;
  return (
    <div className="pointer-events-none absolute inset-0">
      {hier.map((u, i) => {
        const beschreibung = (u.unterzeilen ?? []).map((z) => z.text).join(" · ") || `Unterschrift ${u.name}`;
        const ueber = u.h * l.UEBERSTAND;
        const ein = Math.min(l.EINZUG ?? 6, u.w / 4);
        return (
          <div key={`${u.signed_at}-${i}`} aria-label={beschreibung} title={beschreibung}>
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
            {(u.unterzeilen ?? []).map((z, k) => (
              <div
                key={k}
                className="absolute whitespace-nowrap"
                style={{
                  left: z.x * scale,
                  // Oberkante = Grundlinie − Oberlänge (0,75 × Schriftgröße, wie unterzeile.ts)
                  top: (z.basis - z.groesse * 0.75) * scale,
                  fontSize: z.groesse * scale,
                  lineHeight: 1,
                  color: GRAU,
                  fontFamily: "Helvetica, Arial, sans-serif",
                }}
              >
                {z.text}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
