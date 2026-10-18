import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { fotoUrl, preisText, useOwnerPortalEinstellungen, usePortalAngebote, usePortalImmobilienStatus, zahl } from "@/hooks/usePortalImmobilien";

const TAGE = 7;
const lsKey = (id: string) => `rgi:angebot-ausgeblendet:${id}`;
const ausgeblendet = (id: string) => {
  try { return localStorage.getItem(lsKey(id)) === "1"; } catch { return false; }
};

/**
 * Höchstens eine Karte mit einem neuen Angebot auf der Startseite – nur wenn
 * der Eigentümer das in den Einstellungen eingeschaltet hat und der Makler es
 * beim Objekt erlaubt („Darf auf der Startseite erscheinen“).
 */
export function AngebotStartKarte() {
  const navigate = useNavigate();
  const status = usePortalImmobilienStatus();
  const { data: einst } = useOwnerPortalEinstellungen();
  const an = status.sichtbar && einst.angebote_startseite;
  const { data: angebote = [] } = usePortalAngebote(an);
  const [weg, setWeg] = useState<string | null>(null);
  if (!an) return null;

  const a = angebote
    .filter((x) => x.startseite && !x.gemeldet && x.id !== weg && !ausgeblendet(x.id))
    .filter((x) => Date.now() - new Date(x.created_at).getTime() < TAGE * 86400000)
    .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
  if (!a) return null;

  const ausblenden = () => {
    try { localStorage.setItem(lsKey(a.id), "1"); } catch { /* egal */ }
    setWeg(a.id);
  };

  return (
    <section className="bg-card rounded-[14px] border border-border/60 shadow-sm overflow-hidden">
      <button type="button" onClick={() => navigate("/weg-owner/immobilien")} className="block w-full text-left">
        <div className="relative h-36 bg-muted">
          {a.images?.[0] ? (
            <img src={fotoUrl(a.images[0].path)} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><Building2 className="h-8 w-8 opacity-40" /></div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-foreground">Neu bei RGI</span>
        </div>
        <div className="px-4 pt-3">
          <div className="text-[15.5px] font-semibold leading-snug">{a.title}</div>
          <div className="text-[13.5px] text-muted-foreground mt-0.5">
            {[a.city, a.living_space_sqm ? `${zahl(a.living_space_sqm)} m²` : null, preisText(a)].filter(Boolean).join(" · ")}
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between px-4 pb-2 pt-1">
        <button type="button" onClick={() => navigate("/weg-owner/immobilien")} className="min-h-11 text-[14px] font-semibold text-[#8A4100]">Ansehen</button>
        <button type="button" onClick={ausblenden} className="min-h-11 px-2 text-[13px] text-muted-foreground">Ausblenden</button>
      </div>
    </section>
  );
}
