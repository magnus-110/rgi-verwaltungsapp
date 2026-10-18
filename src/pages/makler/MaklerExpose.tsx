import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBrokerImages, useBrokerProperty } from "@/hooks/useMakler";
import { RGI_LOGO_URL, datum, euro, fotoUrl, zahl, type BrokerProperty } from "@/lib/makler";

/**
 * Exposé zum Drucken / als PDF speichern (Browser-Druck).
 * Enthält nur öffentliche Angaben – keine Eigentümer, keine Notizen.
 */
export default function MaklerExpose() {
  const { user, profile, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  if (loading) return <Laden />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Laden />;
  const darf = profile.role === "admin" || (profile.role === "employee" && !!profile.broker_mode_enabled);
  if (!darf) return <div className="p-10 text-center">Kein Zugriff.</div>;
  return <Expose id={id!} />;
}

function Laden() {
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Wird geladen…</div>;
}

function fakten(p: BrokerProperty): [string, string][] {
  const f: [string, string][] = [];
  const add = (l: string, v: string | null | undefined) => { if (v) f.push([l, v]); };
  if (p.listing_type === "sale") {
    add("Kaufpreis", euro(p.price_eur));
  } else {
    add("Kaltmiete", p.cold_rent_eur != null ? `${euro(p.cold_rent_eur, true)} / Monat` : null);
    add("Nebenkosten", p.service_charge_eur != null ? euro(p.service_charge_eur, true) : null);
    add("Heizkosten", p.heating_cost_eur != null ? euro(p.heating_cost_eur, true) : null);
    add("Warmmiete", p.warm_rent_eur != null ? `${euro(p.warm_rent_eur, true)} / Monat` : null);
    add("Kaution", p.deposit_eur != null ? euro(p.deposit_eur) : null);
  }
  add("Provision", p.commission_text);
  add("Objektart", [p.property_type, p.property_subtype].filter(Boolean).join(" · "));
  add("Wohnfläche", p.living_space_sqm != null ? `ca. ${zahl(p.living_space_sqm)} m²` : null);
  add("Grundstück", p.plot_size_sqm != null ? `ca. ${zahl(p.plot_size_sqm)} m²` : null);
  add("Zimmer", p.rooms != null ? zahl(p.rooms) : null);
  add("Schlafzimmer", p.bedrooms != null ? String(p.bedrooms) : null);
  add("Badezimmer", p.bathrooms != null ? String(p.bathrooms) : null);
  add("Etage", p.floor != null ? (p.total_floors != null ? `${p.floor} von ${p.total_floors}` : String(p.floor)) : null);
  add("Baujahr", p.year_built != null ? String(p.year_built) : null);
  add("Zustand", p.condition);
  add("Frei ab", p.available_from ? datum(p.available_from) : null);
  return f;
}

function Expose({ id }: { id: string }) {
  const { data: p, isLoading } = useBrokerProperty(id);
  const { data: bilder = [] } = useBrokerImages(id);

  useEffect(() => {
    if (p) document.title = `Exposé – ${p.title}`;
  }, [p]);

  if (isLoading) return <Laden />;
  if (!p) return <div className="p-10 text-center">Objekt nicht gefunden.</div>;

  const titelbild = bilder[0];
  const weitere = bilder.slice(1, 13);
  const ort = [p.postal_code, p.city].filter(Boolean).join(" ") + (p.district ? ` – ${p.district}` : "");
  const strasse = [p.street, p.house_number].filter(Boolean).join(" ");
  const energie: [string, string][] = (
    [
      ["Energieausweis", p.energy_certificate_type],
      ["Energiekennwert", p.energy_value != null ? `${zahl(p.energy_value)} kWh/(m²·a)` : null],
      ["Energieeffizienzklasse", p.energy_class],
      ["Wesentlicher Energieträger", p.energy_source],
      ["Heizungsart", p.heating_type],
      ["Ausgestellt am", p.energy_certificate_date ? datum(p.energy_certificate_date) : null],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => !!x[1]);

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm 14mm 16mm; }
        @media print {
          html, body { background: #fff !important; }
          .expose-blatt { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
          .keine-trennung { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="print:hidden sticky top-0 z-10 bg-white/95 backdrop-blur border-b">
        <div className="max-w-[210mm] mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-muted-foreground truncate">Exposé: {p.title}</span>
          <Button className="h-11" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Drucken / Als PDF speichern
          </Button>
        </div>
      </div>

      <article className="expose-blatt mx-auto my-6 bg-white text-neutral-900 shadow-xl w-full max-w-[210mm] px-6 sm:px-[14mm] py-[14mm]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#EE7202] pb-4 mb-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-[#EE7202] font-semibold">
              {p.listing_type === "sale" ? "Zum Kauf" : "Zur Miete"}
            </p>
            <h1 className="font-display text-[26px] leading-tight font-semibold mt-1">{p.title}</h1>
            {(strasse || ort) && <p className="text-sm text-neutral-600 mt-1">{[strasse, ort].filter(Boolean).join(", ")}</p>}
          </div>
          <img src={RGI_LOGO_URL} alt="RGI Immobilien" className="h-14 w-auto shrink-0 object-contain" />
        </header>

        {titelbild && (
          <img
            src={fotoUrl(titelbild.storage_path)}
            alt={titelbild.caption ?? ""}
            className="w-full aspect-[3/2] object-cover rounded-sm mb-6 keine-trennung"
          />
        )}

        <section className="keine-trennung mb-6">
          <h2 className="font-display text-lg font-semibold mb-2">Auf einen Blick</h2>
          <table className="w-full text-sm">
            <tbody>
              {fakten(p).map(([l, v]) => (
                <tr key={l} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-4 text-neutral-500 w-[40%]">{l}</td>
                  <td className="py-1.5 font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {(p.features ?? []).length > 0 && (
          <section className="keine-trennung mb-6">
            <h2 className="font-display text-lg font-semibold mb-2">Ausstattung</h2>
            <p className="text-sm leading-relaxed">{(p.features ?? []).join(" · ")}</p>
          </section>
        )}

        {p.description && (
          <section className="mb-6">
            <h2 className="font-display text-lg font-semibold mb-2">Beschreibung</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line">{p.description}</p>
          </section>
        )}

        {energie.length > 0 && (
          <section className="keine-trennung mb-6 rounded-sm border border-neutral-300 p-4">
            <h2 className="font-display text-base font-semibold mb-2">Energieangaben</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {energie.map(([l, v]) => (
                <div key={l} className="flex justify-between gap-3 border-b border-neutral-100 py-1">
                  <dt className="text-neutral-500">{l}</dt>
                  <dd className="font-medium text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {weitere.length > 0 && (
          <section className="mb-6">
            <h2 className="font-display text-lg font-semibold mb-2">Weitere Bilder</h2>
            <div className="grid grid-cols-2 gap-3">
              {weitere.map((b) => (
                <figure key={b.id} className="keine-trennung">
                  <img src={fotoUrl(b.storage_path)} alt={b.caption ?? ""} className="w-full aspect-[4/3] object-cover rounded-sm" />
                  {b.caption && <figcaption className="text-xs text-neutral-500 mt-1">{b.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="keine-trennung mt-8 border-t-2 border-[#EE7202] pt-4 text-sm">
          <p className="font-semibold">Ihr Ansprechpartner</p>
          <p className="text-neutral-700 mt-1">
            RGI Immobilien GmbH &amp; Co. KG · Telefon +49 8363 960656 · info@rgi-immobilien.de
          </p>
          <p className="text-[11px] text-neutral-500 mt-3">
            Alle Angaben beruhen auf Informationen des Eigentümers. Für die Richtigkeit und Vollständigkeit übernehmen wir keine Gewähr. Irrtum und {p.listing_type === "sale" ? "Zwischenverkauf" : "Zwischenvermietung"} vorbehalten.
          </p>
        </footer>
      </article>
    </div>
  );
}
