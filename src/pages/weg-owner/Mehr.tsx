/**
 * Eigentümerportal › Mehr: alles, was nicht in der Leiste unten steht.
 * Terminabfrage, Umfragen und Kassenprüfung erscheinen nur, wenn gerade etwas läuft.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ClipboardCheck, HelpCircle, ListChecks, LogOut, MessageSquare, Receipt, Scale, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHasVisibleSurveys } from "@/hooks/useSurvey";
import { PortalAbschnitt, PortalSeitenkopf, PortalZeile } from "@/components/weg-owner/PortalListe";

export default function WegOwnerMehr() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { hasSurveys } = useHasVisibleSurveys(profile?.user_id);
  const [hatTerminabfrage, setHatTerminabfrage] = useState(false);
  const [hatKassenpruefung, setHatKassenpruefung] = useState(false);

  useEffect(() => {
    if (!profile?.user_id) return;
    const heute = new Date().toISOString().split("T")[0];
    supabase
      .from("etv_date_polls")
      .select("id")
      .eq("status", "open")
      .gte("closes_at", heute)
      .limit(1)
      .then(({ data }) => setHatTerminabfrage(!!data && data.length > 0));

    (async () => {
      const { data: kontakte } = await supabase.from("contacts").select("id").eq("user_id", profile.user_id);
      if (!kontakte?.length) return;
      const { data } = await supabase
        .from("cash_audits")
        .select("id")
        .in("auditor_contact_id", kontakte.map((k) => k.id))
        .neq("status", "completed")
        .gt("visible_in_portal_until", new Date().toISOString())
        .limit(1);
      setHatKassenpruefung(!!data && data.length > 0);
    })();
  }, [profile?.user_id]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-5 space-y-5">
        <PortalSeitenkopf titel="Mehr" />

        <PortalAbschnitt titel="Gemeinschaft">
          <PortalZeile icon={HelpCircle} titel="Fragen" untertitel="Antworten aus den Unterlagen Ihres Hauses" onClick={() => navigate("/weg-owner/chatbot")} />
          <PortalZeile icon={MessageSquare} titel="Schwarzes Brett" onClick={() => navigate("/weg-owner/forum")} />
          <PortalZeile icon={Scale} titel="Beschlüsse" onClick={() => navigate("/weg-owner/resolutions")} />
          {hatTerminabfrage && (
            <PortalZeile
              icon={CalendarClock}
              titel="Terminabfrage"
              onClick={() => navigate("/weg-owner/terminabfrage")}
              rechts={<span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-primary/10 text-[#8A4100]">Offen</span>}
            />
          )}
          {hasSurveys && <PortalZeile icon={ListChecks} titel="Umfragen" onClick={() => navigate("/weg-owner/umfragen")} />}
          {hatKassenpruefung && <PortalZeile icon={ClipboardCheck} titel="Kassenprüfung" onClick={() => navigate("/weg-owner/kassenpruefung")} />}
        </PortalAbschnitt>

        <PortalAbschnitt titel="Service">
          <PortalZeile icon={Receipt} titel="Nebenkostenabrechnung für Mieter" onClick={() => navigate("/weg-owner/service-hub")} />
        </PortalAbschnitt>

        <PortalAbschnitt titel="Konto">
          <PortalZeile icon={Settings} titel="Einstellungen" onClick={() => navigate("/weg-owner/settings")} />
          <PortalZeile icon={LogOut} titel="Abmelden" gefahr pfeil={false} onClick={() => signOut()} />
        </PortalAbschnitt>
      </div>
    </div>
  );
}
