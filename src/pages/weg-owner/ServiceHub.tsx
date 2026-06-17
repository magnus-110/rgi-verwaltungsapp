import { useNavigate } from "react-router-dom";
import { Receipt, FileText, FileSignature, Sparkles, ChevronRight } from "lucide-react";
import { useServicePricing, formatPrice } from "@/hooks/useServicePricing";

const RGI = {
  primary: "#ee7202",
  bg: "#faf8f5",
  card: "#ffffff",
  border: "#e7e0d8",
  text: "#1f1a14",
  muted: "#7a6f63",
};

const headingFont = "Century Gothic, Arial, sans-serif";

export function WegOwnerServiceHub() {
  const navigate = useNavigate();
  const { pricing } = useServicePricing();

  const tools = [
    {
      key: "nebenkosten" as const,
      icon: Receipt,
      title: "Nebenkostenabrechnung für Mieter",
      desc: "Aus Ihrer WEG-Abrechnung und den Vorauszahlungen Ihres Mieters erstellen wir ein fertiges PDF.",
      available: true,
      onClick: () => navigate("/weg-owner/service-hub/nebenkosten"),
    },
    {
      key: "anlage_v" as const,
      icon: FileText,
      title: "Anlage V (Steuererklärung)",
      desc: "Alle Einnahmen und Werbungskosten für Ihre Vermietungseinkünfte – passend zur Anlage V.",
      available: false,
    },
    {
      key: "mietvertrag" as const,
      icon: FileSignature,
      title: "Mietvertrag",
      desc: "Rechtssicherer Mietvertrag auf Basis Ihrer Stammdaten – in wenigen Klicks.",
      available: false,
    },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ background: RGI.bg, color: RGI.text, fontFamily: "'Work Sans', system-ui, sans-serif" }}
    >
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 text-xs mb-2" style={{ color: RGI.muted }}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>Service-Hub</span>
        </div>
        <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: headingFont }}>
          Hilfreiche Dokumente auf Knopfdruck
        </h1>
        <p className="text-sm mt-2 max-w-xl" style={{ color: RGI.muted }}>
          Wir verbinden Ihre Stammdaten mit der WEG-Abrechnung und liefern ein
          fertiges PDF. Sie prüfen, drucken, fertig.
        </p>

        <div
          className="mt-6 grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}
        >
          {tools.map((t) => {
            const price = pricing?.[t.key];
            const Icon = t.icon;
            return (
              <div
                key={t.key}
                className="rounded-2xl p-5 flex flex-col"
                style={{
                  background: RGI.card,
                  border: `1px solid ${RGI.border}`,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  opacity: t.available ? 1 : 0.65,
                  cursor: t.available ? "pointer" : "default",
                }}
                onClick={t.available ? t.onClick : undefined}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "#fdf0e3" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: RGI.primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-semibold text-base leading-snug"
                      style={{ fontFamily: headingFont }}
                    >
                      {t.title}
                    </h3>
                  </div>
                </div>
                <p className="text-sm flex-1" style={{ color: RGI.muted }}>
                  {t.desc}
                </p>
                <div
                  className="mt-4 pt-3 flex items-center justify-between"
                  style={{ borderTop: `1px solid ${RGI.border}` }}
                >
                  <span
                    className="text-base font-bold"
                    style={{ fontFamily: headingFont }}
                  >
                    {price ? formatPrice(price.price_cents, price.currency) : "—"}
                  </span>
                  {t.available ? (
                    <button
                      type="button"
                      className="h-11 px-4 rounded-lg font-semibold text-sm flex items-center gap-1"
                      style={{ background: RGI.primary, color: "#fff" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        t.onClick?.();
                      }}
                    >
                      Erstellen <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <span
                      className="text-[11px] uppercase tracking-wide px-2 py-1 rounded"
                      style={{ background: "#f3efea", color: RGI.muted }}
                    >
                      Bald verfügbar
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs mt-8 max-w-2xl" style={{ color: RGI.muted }}>
          Die erzeugten Dokumente sind automatisiert erstellt und ersetzen keine
          Rechts- oder Steuerberatung. Bitte prüfen Sie das Ergebnis vor der
          Weitergabe.
        </p>
      </div>
    </div>
  );
}
