import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fingerprint, ShieldCheck, Zap, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FirstLoginWelcomeDialogProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

const browserSupportsPasskeys = () =>
  typeof window !== "undefined" && !!(window as any).PublicKeyCredential;

export const FirstLoginWelcomeDialog = ({
  open,
  userId,
  onClose,
}: FirstLoginWelcomeDialogProps) => {
  const passkeySupported = useMemo(() => browserSupportsPasskeys(), []);
  const pages = useMemo(
    () => (passkeySupported ? ["terms", "passkey", "start"] : ["terms", "start"]) as const,
    [passkeySupported],
  );

  const [pageIdx, setPageIdx] = useState(0);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [datenschutzAccepted, setDatenschutzAccepted] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (open) {
      setPageIdx(0);
      setAgbAccepted(false);
      setDatenschutzAccepted(false);
    }
  }, [open]);

  const currentPage = pages[pageIdx];
  const isLast = pageIdx === pages.length - 1;

  const goNext = () => setPageIdx((i) => Math.min(i + 1, pages.length - 1));
  const goBack = () => setPageIdx((i) => Math.max(i - 1, 0));

  const handleAcceptTerms = async () => {
    if (!agbAccepted || !datenschutzAccepted) {
      toast.error("Bitte akzeptieren Sie beide Dokumente.");
      return;
    }
    setSavingTerms(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      goNext();
    } catch (e) {
      console.error("terms accept failed", e);
      toast.error("Fehler beim Speichern. Bitte erneut versuchen.");
    } finally {
      setSavingTerms(false);
    }
  };

  const markPasskeyResolved = async () => {
    try {
      await supabase
        .from("profiles")
        .update({ passkey_prompt_dismissed_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch (e) {
      console.error("passkey dismiss failed", e);
    }
  };

  const handleRegisterPasskey = async () => {
    const auth = supabase.auth as any;
    if (typeof auth.registerPasskey !== "function") {
      toast.error("Passkey-Funktion ist im Browser nicht verfügbar.");
      return;
    }
    setRegistering(true);
    try {
      const { error } = await auth.registerPasskey();
      if (error) {
        if (error.name === "NotAllowedError" || error.code === "user_cancelled") {
          return;
        }
        toast.error(error.message ?? "Passkey konnte nicht registriert werden.");
        return;
      }
      toast.success("Passkey erfolgreich eingerichtet.");
      await markPasskeyResolved();
      goNext();
    } catch (e: any) {
      console.error("registerPasskey failed", e);
      toast.error(e?.message ?? "Passkey konnte nicht registriert werden.");
    } finally {
      setRegistering(false);
    }
  };

  const handlePostponePasskey = () => {
    goNext();
  };

  const handleNeverAskPasskey = async () => {
    await markPasskeyResolved();
    goNext();
  };

  const finishAndOpenTour = () => {
    onClose();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-onboarding-wizard"));
    }, 200);
  };

  const finishAndClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 pb-2">
          {pages.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === pageIdx ? "w-8 bg-primary" : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>

        {currentPage === "terms" && (
          <>
            <DialogHeader>
              <DialogTitle>Willkommen – bitte AGB & Datenschutz akzeptieren</DialogTitle>
              <DialogDescription>
                Damit Sie die App nutzen können, benötigen wir einmalig Ihre Zustimmung.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="agb" className="w-full">
              <TabsList variant="pill" className="grid w-full grid-cols-2">
                <TabsTrigger variant="pill" value="agb">AGB</TabsTrigger>
                <TabsTrigger variant="pill" value="datenschutz">Datenschutz</TabsTrigger>
              </TabsList>

              <TabsContent value="agb">
                <div className="w-full rounded-md border p-4 max-h-[40vh] overflow-y-auto">
                  <div className="prose prose-sm max-w-none">
                    <h2 className="text-lg font-bold mb-4">Allgemeine Geschäftsbedingungen (AGB)</h2>
                    <p className="text-sm text-muted-foreground mb-4">für die Nutzung der RGI-Immobilien App</p>

                    <h3 className="font-semibold mt-4 mb-2">§ 1 Geltungsbereich und Anbieter</h3>
                    <p className="text-sm mb-2">(1) Diese AGB regeln die Nutzung der RGI-Immobilien App, bereitgestellt von der RGI-Immobilien GmbH & Co. KG.</p>
                    <p className="text-sm mb-2">(2) Die App dient der Kommunikation, dem Dokumentenmanagement sowie der Bereitstellung von Informationen für Nutzer, die in einem direkten Verwaltungs- oder Mietverhältnis zur RGI stehen.</p>

                    <h3 className="font-semibold mt-4 mb-2">§ 2 Nutzungsberechtigung und Zugang</h3>
                    <p className="text-sm mb-2">Die Nutzung der App ist Mietern in direkter RGI-Mietverwaltung sowie Wohnungseigentümern in einer RGI-WEG-Verwaltung vorbehalten. Mieter von Sondereigentümern (WEG-Mieter) sind ausgeschlossen.</p>

                    <h3 className="font-semibold mt-4 mb-2">§ 3 Leistungsumfang</h3>
                    <p className="text-sm mb-2">Schadensmeldungen, Einsicht in objektbezogene Dokumente, digitales Schwarzes Brett und KI-Chatbot.</p>

                    <h3 className="font-semibold mt-4 mb-2">§ 4 KI-Chatbot (Mistral AI)</h3>
                    <p className="text-sm mb-2">Antworten werden automatisiert erstellt. RGI übernimmt keine Gewähr für Richtigkeit. Chatverläufe können zur Qualitätssicherung von Mitarbeitern eingesehen werden.</p>

                    <h3 className="font-semibold mt-4 mb-2">§ 5–9 Schwarzes Brett, Haftung, Pflichten, Datenschutz, Schlussbestimmungen</h3>
                    <p className="text-sm mb-2">Die vollständigen Bestimmungen finden Sie jederzeit unter „Einstellungen → Rechtliches". Es gilt deutsches Recht. Backend auf Supabase (Frankfurt, EU), verschlüsselte Übertragung.</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="datenschutz">
                <div className="w-full rounded-md border p-4 max-h-[40vh] overflow-y-auto">
                  <div className="prose prose-sm max-w-none">
                    <h2 className="text-lg font-bold mb-4">Datenschutzerklärung</h2>
                    <p className="text-sm mb-4">Wir nehmen den Schutz Ihrer Daten sehr ernst und verarbeiten diese gemäß DSGVO.</p>

                    <h3 className="font-semibold mt-4 mb-2">1. Verantwortlicher</h3>
                    <p className="text-sm mb-2">RGI-Immobilien GmbH & Co. KG, Andreas Göttinger, Schützenstraße 16, 87459 Pfronten · info@rgi-immobilien.de</p>

                    <h3 className="font-semibold mt-4 mb-2">2. Ihre Rechte</h3>
                    <p className="text-sm mb-2">Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde bei einer Aufsichtsbehörde.</p>

                    <h3 className="font-semibold mt-4 mb-2">3. Datenerhebung in der App</h3>
                    <p className="text-sm mb-2">Bestandsdaten, Kontaktdaten und Objektzuordnung. Zugang nur für direkte Mieter und Eigentümer der RGI. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

                    <h3 className="font-semibold mt-4 mb-2">4. KI-Chatbot (Mistral AI)</h3>
                    <p className="text-sm mb-2">Eingaben werden an Mistral AI (Paris, EU) übertragen. Chatverläufe können durch RGI-Mitarbeiter eingesehen werden. Protokolle werden nach 6 Monaten gelöscht.</p>

                    <h3 className="font-semibold mt-4 mb-2">5. Hosting</h3>
                    <p className="text-sm mb-2">Backend: Supabase, Serverstandort Frankfurt am Main. TLS-Verschlüsselung. AV-Vertrag gem. Art. 28 DSGVO liegt vor.</p>

                    <h3 className="font-semibold mt-4 mb-2">6. Speicherdauer</h3>
                    <p className="text-sm mb-2">Allg. Chat-Daten: 6 Monate · Makler-Unterlagen: 5 Jahre (§ 14 MaBV) · Steuerlich relevante Unterlagen: 10 Jahre (§ 147 AO).</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="welcome-agb"
                  checked={agbAccepted}
                  onCheckedChange={(c) => setAgbAccepted(c === true)}
                />
                <label htmlFor="welcome-agb" className="text-sm">
                  Ich habe die <strong>AGB</strong> gelesen und akzeptiere diese.
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="welcome-ds"
                  checked={datenschutzAccepted}
                  onCheckedChange={(c) => setDatenschutzAccepted(c === true)}
                />
                <label htmlFor="welcome-ds" className="text-sm">
                  Ich habe die <strong>Datenschutzerklärung</strong> gelesen und akzeptiere diese.
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAcceptTerms}
                  disabled={!agbAccepted || !datenschutzAccepted || savingTerms}
                >
                  {savingTerms ? "Wird gespeichert…" : "Weiter"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {currentPage === "passkey" && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Fingerprint className="h-7 w-7 text-primary" />
              </div>
              <DialogTitle className="text-center text-xl">Passkey einrichten?</DialogTitle>
              <DialogDescription className="text-center">
                Melden Sie sich künftig schneller und sicherer an – ohne Passwort.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Zap className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Blitzschneller Login</p>
                  <p className="text-xs text-muted-foreground">
                    Mit Face ID, Touch ID, Windows Hello oder Sicherheitsschlüssel.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Mehr Sicherheit</p>
                  <p className="text-xs text-muted-foreground">
                    Passkeys sind phishing-resistent und werden sicher auf Ihrem Gerät gespeichert.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button onClick={handleRegisterPasskey} disabled={registering} className="w-full">
                <Fingerprint className="h-4 w-4 mr-2" />
                {registering ? "Wird eingerichtet…" : "Passkey jetzt einrichten"}
              </Button>
              <Button
                variant="outline"
                onClick={handlePostponePasskey}
                disabled={registering}
                className="w-full"
              >
                Später erinnern
              </Button>
              <Button
                variant="ghost"
                onClick={handleNeverAskPasskey}
                disabled={registering}
                className="w-full text-muted-foreground"
              >
                Nicht mehr fragen
              </Button>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={goBack}>
                  Zurück
                </Button>
                <Button variant="ghost" size="sm" onClick={goNext}>
                  Überspringen
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {currentPage === "start" && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <DialogTitle className="text-center text-xl">Willkommen in der RGI-App</DialogTitle>
              <DialogDescription className="text-center">
                Sie können sofort loslegen – oder sich zuerst durch eine kurze Einführung leiten lassen.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm text-muted-foreground">
              <p>
                Die geführte Einführung zeigt Ihnen Schritt für Schritt, wo Sie Ihre Dokumente,
                Versammlungen, Meldungen und Kontakte finden – und wie Sie die wichtigsten Funktionen nutzen.
              </p>
              <p>
                Sie können die Einführung jederzeit über den Hilfe-Knopf unten rechts erneut starten.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button onClick={finishAndOpenTour} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Geführte Einführung starten
              </Button>
              <Button variant="outline" onClick={finishAndClose} className="w-full">
                Später
              </Button>
              {pageIdx > 0 && (
                <div className="flex justify-start pt-1">
                  <Button variant="ghost" size="sm" onClick={goBack}>
                    Zurück
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
