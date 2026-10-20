import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Calendar, ClipboardList, FileText, Home, Megaphone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { PortalAbschnitt, PortalBlatt, PortalZeile } from "@/components/weg-owner/PortalListe";
import { useOwnerPortalEinstellungen, usePortalImmobilienStatus, type OwnerEinstellungen } from "@/hooks/usePortalImmobilien";

type Schalter = keyof OwnerEinstellungen;

/**
 * Einstellungen › Benachrichtigungen: eine Zeile; erst nach dem Antippen
 * erscheinen alle Schalter. Öffnet sich auch über den Link in den E-Mails
 * (?bereich=benachrichtigungen).
 */
export function BenachrichtigungenEinstellungen() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [offen, setOffen] = useState(false);
  const { data, setzen } = useOwnerPortalEinstellungen();
  const immobilien = usePortalImmobilienStatus();

  useEffect(() => {
    if (params.get("bereich") === "benachrichtigungen") setOffen(true);
  }, [params]);

  const schliessen = (o: boolean) => {
    setOffen(o);
    if (!o && params.get("bereich")) {
      const p = new URLSearchParams(params);
      p.delete("bereich");
      setParams(p, { replace: true });
    }
  };

  const umschalten = async (feld: Schalter, wert: boolean) => {
    try {
      await setzen({ [feld]: wert } as Partial<OwnerEinstellungen>);
    } catch {
      toast.error("Konnte nicht gespeichert werden.");
    }
  };

  const email = profile?.email && !profile.email.toLowerCase().endsWith("@users.rgi-immobilien.app") ? profile.email : null;
  const zeilen: { feld: Schalter; icon: typeof Bell; titel: string; text: string }[] = [
    { feld: "mail_meldungen", icon: MessageSquare, titel: "Antworten auf meine Meldungen", text: "Wenn RGI antwortet oder etwas erledigt ist" },
    { feld: "mail_versammlungen", icon: Calendar, titel: "Versammlungen", text: "Einladung, Erinnerung und Terminumfragen" },
    { feld: "mail_umfragen", icon: ClipboardList, titel: "Neue Umfragen", text: "Wenn Ihre Meinung gefragt ist" },
    { feld: "mail_dokumente", icon: FileText, titel: "Neue Dokumente", text: "Einmal am Tag zusammengefasst" },
    { feld: "mail_aushaenge", icon: Megaphone, titel: "Aushänge von RGI", text: "Wichtige Hinweise zu Ihrem Haus" },
    ...(immobilien.sichtbar
      ? [{ feld: "angebote_hinweis" as Schalter, icon: Home, titel: "Neue Immobilien-Angebote", text: "Nur wenn Sie möchten" }]
      : []),
  ];
  const an = zeilen.filter((z) => data[z.feld]).length;

  return (
    <>
      <PortalAbschnitt titel="Benachrichtigungen">
        <PortalZeile icon={Bell} titel="E-Mail-Benachrichtigungen" untertitel={an === 0 ? "Alle aus" : `${an} von ${zeilen.length} an`} onClick={() => setOffen(true)} />
      </PortalAbschnitt>

      <PortalBlatt offen={offen} onOffen={schliessen} titel="E-Mail-Benachrichtigungen" text={email ? `E-Mails gehen an ${email}` : "Für E-Mails bitte zuerst eine E-Mail-Adresse hinterlegen."}>
        <PortalAbschnitt titel="Was möchten Sie per E-Mail bekommen?">
          {zeilen.map((z) => (
            <PortalZeile
              key={z.feld}
              icon={z.icon}
              titel={z.titel}
              untertitel={z.text}
              rechts={<Switch aria-label={z.titel} checked={!!data[z.feld]} onCheckedChange={(v) => umschalten(z.feld, v)} />}
            />
          ))}
        </PortalAbschnitt>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Ankündigungen von Lastschriften und Änderungen beim Hausgeld bekommen Sie immer per E-Mail – die brauchen Sie für Ihr Konto. Zwischen 21 und 7 Uhr schicken wir keine E-Mails.
        </p>
      </PortalBlatt>
    </>
  );
}
