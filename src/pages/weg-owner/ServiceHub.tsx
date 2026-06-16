import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, FileText, FileSignature, Sparkles } from "lucide-react";
import { useServicePricing, formatPrice } from "@/hooks/useServicePricing";

export function WegOwnerServiceHub() {
  const navigate = useNavigate();
  const { pricing } = useServicePricing();

  const tools = [
    {
      key: "nebenkosten" as const,
      icon: Receipt,
      title: "Nebenkostenabrechnung für Mieter",
      desc:
        "Auf Basis Ihrer WEG-Abrechnung und Ihrer eigenen Mieter-Vorauszahlungen erzeugen wir ein fertiges PDF, das Sie Ihrem Mieter weitergeben können.",
      available: true,
      onClick: () => navigate("/weg-owner/service-hub/nebenkosten"),
    },
    {
      key: "anlage_v" as const,
      icon: FileText,
      title: "Anlage V (Steuererklärung)",
      desc:
        "Wir bereiten alle Einnahmen und Werbungskosten für Ihre Vermietungseinkünfte vor – passend zur Anlage V Ihrer Einkommensteuererklärung.",
      available: false,
    },
    {
      key: "mietvertrag" as const,
      icon: FileSignature,
      title: "Mietvertrag",
      desc:
        "Erstellen Sie einen rechtssicheren Mietvertrag für Ihre Wohnung auf Basis Ihrer Stammdaten in wenigen Klicks.",
      available: false,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Sparkles className="w-4 h-4" />
          <span>Service-Hub</span>
        </div>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "Century Gothic, sans-serif" }}
        >
          Hilfreiche Dokumente auf Knopfdruck
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Wir verbinden Ihre Stammdaten mit der bereits erstellten WEG-Abrechnung
          und liefern Ihnen ein fertiges Dokument als PDF. Sie prüfen, drucken,
          fertig.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {tools.map((t) => {
          const price = pricing?.[t.key];
          return (
            <Card
              key={t.key}
              className={`p-6 flex flex-col ${
                t.available
                  ? "cursor-pointer hover:shadow-lg transition-shadow"
                  : "opacity-60"
              }`}
              onClick={t.available ? t.onClick : undefined}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <t.icon className="w-6 h-6 text-primary" />
                </div>
                {!t.available && <Badge variant="secondary">Bald verfügbar</Badge>}
              </div>
              <h3 className="font-semibold text-lg mb-2">{t.title}</h3>
              <p className="text-sm text-muted-foreground flex-1">{t.desc}</p>
              {price && (
                <div className="mt-4 pt-4 border-t flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    pro Dokument
                  </span>
                  <span
                    className="text-xl font-bold"
                    style={{ fontFamily: "Century Gothic, sans-serif" }}
                  >
                    {formatPrice(price.price_cents, price.currency)}
                  </span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-8 max-w-3xl">
        Die erzeugten Dokumente sind Entwürfe und ersetzen keine Rechts- oder
        Steuerberatung. Bitte prüfen Sie das Ergebnis vor der Weitergabe.
      </p>
    </div>
  );
}
