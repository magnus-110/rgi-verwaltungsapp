import { useNavigate } from "react-router-dom";
import { Home, Search } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { PortalAbschnitt, PortalZeile } from "@/components/weg-owner/PortalListe";
import { useOwnerPortalEinstellungen, usePortalGesuche, usePortalImmobilienStatus } from "@/hooks/usePortalImmobilien";

/** Einstellungen › Immobilien von RGI (nur sichtbar, wenn der Bereich an ist bzw. zur Vorschau). */
export function ImmobilienEinstellungen() {
  const navigate = useNavigate();
  const status = usePortalImmobilienStatus();
  const { data, setzen } = useOwnerPortalEinstellungen();
  const { data: gesuche = [] } = usePortalGesuche(status.sichtbar);
  if (!status.sichtbar) return null;
  const eigene = gesuche.filter((g) => g.eigen);

  const umschalten = async (patch: Parameters<typeof setzen>[0]) => {
    try {
      await setzen(patch);
    } catch {
      toast.error("Konnte nicht gespeichert werden.");
    }
  };

  return (
    <PortalAbschnitt titel="Immobilien von RGI">
      <PortalZeile
        icon={Home}
        titel="Neue Angebote auf der Startseite"
        untertitel="Sonst nur unter „Mehr“"
        rechts={<Switch aria-label="Neue Angebote auf der Startseite zeigen" checked={data.angebote_startseite} onCheckedChange={(v) => umschalten({ angebote_startseite: v })} />}
      />
      {/* „Hinweis bei neuen Angeboten“ (Handy) kommt, sobald das Senden gebaut ist – Spalte angebote_hinweis ist vorbereitet. */}
      <PortalZeile
        icon={Search}
        titel={eigene.length > 0 ? (eigene.length === 1 ? "Mein Suchauftrag" : `Meine Suchaufträge (${eigene.length})`) : "Suchauftrag hinzufügen"}
        untertitel={eigene[0]?.titel}
        onClick={() => navigate("/weg-owner/immobilien?tab=gesuche")}
      />
    </PortalAbschnitt>
  );
}
