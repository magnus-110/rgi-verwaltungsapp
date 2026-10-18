/**
 * Eigentümerportal › Mehr › Angebote: aktuelle Immobilien von RGI.
 * Zeigt nur Objekte, die der Makler für die Nutzer-App freigegeben hat.
 * „Ich habe Interesse“ schickt eine Anfrage, die beim Makler als Interessent ankommt.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Building2, Check, Loader2, MapPin, Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PortalBlatt, PortalSeitenkopf } from "@/components/weg-owner/PortalListe";

export interface Angebot {
  id: string;
  listing_type: "rent" | "sale";
  website_state: string;
  title: string;
  description: string | null;
  postal_code: string | null;
  city: string | null;
  district: string | null;
  property_type: string | null;
  price_eur: number | null;
  cold_rent_eur: number | null;
  warm_rent_eur: number | null;
  commission_text: string | null;
  living_space_sqm: number | null;
  plot_size_sqm: number | null;
  rooms: number | null;
  year_built: number | null;
  available_from: string | null;
  energy_class: string | null;
  features: string[] | null;
  images: { path: string; caption: string | null }[];
}

const FOTO_BASIS = "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/makler-fotos/";
export const fotoUrl = (p: string) => FOTO_BASIS + p.split("/").map(encodeURIComponent).join("/");

const euro = (v: number | null | undefined) =>
  v == null ? null : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const zahl = (v: number | null | undefined) => (v == null ? null : new Intl.NumberFormat("de-DE").format(v));

export function preisText(a: Angebot) {
  if (a.listing_type === "sale") return a.price_eur ? euro(a.price_eur) : "Preis auf Anfrage";
  if (a.cold_rent_eur) return `${euro(a.cold_rent_eur)} kalt`;
  if (a.warm_rent_eur) return `${euro(a.warm_rent_eur)} warm`;
  return "Miete auf Anfrage";
}

export function useAngebote() {
  return useQuery({
    queryKey: ["portal-angebote"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Angebot[]> => {
      const { data, error } = await (supabase as any).rpc("portal_listings");
      if (error) return [];
      return Array.isArray(data) ? (data as Angebot[]) : [];
    },
  });
}

export default function WegOwnerAngebote() {
  const { data: angebote = [], isLoading } = useAngebote();
  const [offen, setOffen] = useState<Angebot | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-3xl mx-auto px-4 py-5 space-y-5">
        <PortalSeitenkopf titel="Angebote" text="Aktuelle Immobilien von RGI – vielleicht ist etwas für Sie oder Ihre Familie dabei." />
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Einen Moment …</div>
        ) : angebote.length === 0 ? (
          <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-6 text-center text-sm text-muted-foreground">
            Zurzeit gibt es keine Angebote. Schauen Sie gern später wieder vorbei.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {angebote.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOffen(a)}
                className="text-left bg-card rounded-[14px] border border-border/60 shadow-sm overflow-hidden transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {a.images?.[0] ? (
                    <img src={fotoUrl(a.images[0].path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><Building2 className="h-10 w-10 opacity-40" /></div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-foreground">
                    {a.listing_type === "sale" ? "Kauf" : "Miete"}
                  </span>
                  {a.website_state === "reserviert" && (
                    <span className="absolute right-3 top-3 rounded-full bg-[#2B2622] px-2.5 py-1 text-[12px] font-semibold text-white">Reserviert</span>
                  )}
                </div>
                <div className="p-4 space-y-1.5">
                  <div className="text-[15px] font-semibold leading-snug">{a.title}</div>
                  <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[a.postal_code, a.city].filter(Boolean).join(" ")}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    {a.living_space_sqm && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{zahl(a.living_space_sqm)} m²</span>}
                    {a.rooms && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{zahl(a.rooms)} Zimmer</span>}
                  </div>
                  <div className="pt-1 text-[16px] font-semibold text-[#B35500]">{preisText(a)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {offen && <AngebotBlatt angebot={offen} onClose={() => setOffen(null)} />}
    </div>
  );
}

function AngebotBlatt({ angebot: a, onClose }: { angebot: Angebot; onClose: () => void }) {
  const { profile, user } = useAuth();
  const [nachricht, setNachricht] = useState("");
  const [senden, setSenden] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const fakten = useMemo(
    () =>
      [
        ["Preis", preisText(a)],
        ["Provision", a.commission_text],
        ["Wohnfläche", a.living_space_sqm ? `${zahl(a.living_space_sqm)} m²` : null],
        ["Grundstück", a.plot_size_sqm ? `${zahl(a.plot_size_sqm)} m²` : null],
        ["Zimmer", zahl(a.rooms)],
        ["Baujahr", a.year_built ? String(a.year_built) : null],
        ["Frei ab", a.available_from ? new Date(a.available_from).toLocaleDateString("de-DE") : null],
        ["Energieklasse", a.energy_class],
      ].filter(([, v]) => v) as [string, string][],
    [a],
  );

  const interesse = async () => {
    setSenden(true);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user?.email || "";
    try {
      const { data, error } = await supabase.functions.invoke("website-anfrage", {
        body: {
          formType: "objekt",
          source: "nutzer_app",
          data: {
            name,
            email: profile?.email || user?.email,
            phone: profile?.phone || "",
            broker_property_id: a.id,
            property_title: a.title,
            property_address: [a.postal_code, a.city].filter(Boolean).join(" "),
            nachricht: nachricht.trim(),
          },
          page_url: window.location.href,
          elapsed_ms: 60000,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || "Senden fehlgeschlagen");
      setGesendet(true);
    } catch (e) {
      toast.error("Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.");
    } finally {
      setSenden(false);
    }
  };

  return (
    <PortalBlatt
      offen
      onOffen={(o) => !o && onClose()}
      titel={a.title}
      text={[a.postal_code, a.city, a.district].filter(Boolean).join(" ")}
      fuss={
        gesendet ? (
          <div className="flex items-center gap-2 rounded-[10px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check className="h-4 w-4" /> Danke! Wir melden uns bei Ihnen.</div>
        ) : (
          <Button className="h-12 w-full text-base" onClick={interesse} disabled={senden}>
            {senden && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ich habe Interesse
          </Button>
        )
      }
    >
      {a.images?.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
          {a.images.map((img, i) => (
            <img key={i} src={fotoUrl(img.path)} alt={img.caption ?? ""} loading="lazy" className="h-56 w-[85%] shrink-0 snap-center rounded-[12px] object-cover md:w-[60%]" />
          ))}
        </div>
      )}
      <dl className="bg-card rounded-[14px] border border-border/60 shadow-sm divide-y divide-foreground/[0.055]">
        {fakten.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-[15px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {a.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{a.description}</p>}
      {a.features && a.features.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.features.map((f) => (
            <span key={f} className="rounded-full bg-primary/10 px-3 py-1 text-[13px] text-[#8A4100]">{f}</span>
          ))}
        </div>
      )}
      {!gesendet && (
        <div className="space-y-2">
          <label htmlFor="angebot-nachricht" className="text-[13px] text-muted-foreground">Nachricht an uns (freiwillig)</label>
          <Textarea id="angebot-nachricht" value={nachricht} onChange={(e) => setNachricht(e.target.value)} rows={3} className="text-base" placeholder="z. B. Wann wäre eine Besichtigung möglich?" />
          <p className="text-xs text-muted-foreground">Wir schicken Ihre Kontaktdaten aus der App mit, damit wir uns bei Ihnen melden können.</p>
        </div>
      )}
    </PortalBlatt>
  );
}
