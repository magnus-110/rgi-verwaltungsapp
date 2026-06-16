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
import { AgbText, DatenschutzText } from "@/components/legal/LegalTexts";

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
  const pages = useMemo<("terms" | "passkey" | "start")[]>(
    () => (passkeySupported ? ["terms", "passkey", "start"] : ["terms", "start"]),
    [passkeySupported],
  );

  const [pageIdx, setPageIdx] = useState(0);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [datenschutzAcknowledged, setDatenschutzAcknowledged] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (open) {
      setPageIdx(0);
      setAgbAccepted(false);
      setDatenschutzAcknowledged(false);
    }
  }, [open]);

  const currentPage = pages[pageIdx];
  const isLast = pageIdx === pages.length - 1;

  const goNext = () => setPageIdx((i) => Math.min(i + 1, pages.length - 1));
  const goBack = () => setPageIdx((i) => Math.max(i - 1, 0));

  const handleAcceptTerms = async () => {
    if (!agbAccepted || !datenschutzAcknowledged) {
      toast.error("Bitte bestätigen Sie beide Punkte.");
      return;
    }
    setSavingTerms(true);
    try {
      const { recordLegalAcceptance } = await import("@/lib/legalAcceptance");
      await recordLegalAcceptance(userId);
      goNext();
    } catch (e) {
      console.error("legal acceptance failed", e);
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
              <DialogTitle>Willkommen – rechtliche Hinweise</DialogTitle>
              <DialogDescription>
                Damit Sie die App nutzen können, benötigen wir einmalig Ihre Bestätigung.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="agb" className="w-full">
              <TabsList variant="pill" className="grid w-full grid-cols-2">
                <TabsTrigger variant="pill" value="agb">AGB</TabsTrigger>
                <TabsTrigger variant="pill" value="datenschutz">Datenschutz</TabsTrigger>
              </TabsList>

              <TabsContent value="agb">
                <div className="w-full rounded-md border p-4 max-h-[40vh] overflow-y-auto">
                  <AgbText />
                </div>
              </TabsContent>

              <TabsContent value="datenschutz">
                <div className="w-full rounded-md border p-4 max-h-[40vh] overflow-y-auto">
                  <DatenschutzText />
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="welcome-agb"
                  checked={agbAccepted}
                  onCheckedChange={(c) => setAgbAccepted(c === true)}
                />
                <label htmlFor="welcome-agb" className="text-sm leading-snug">
                  Ich habe die <strong>Allgemeinen Geschäftsbedingungen (AGB)</strong> gelesen und akzeptiere sie.
                </label>
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="welcome-ds"
                  checked={datenschutzAcknowledged}
                  onCheckedChange={(c) => setDatenschutzAcknowledged(c === true)}
                />
                <label htmlFor="welcome-ds" className="text-sm leading-snug">
                  Ich habe die <strong>Datenschutzerklärung</strong> zur Kenntnis genommen.
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAcceptTerms}
                  disabled={!agbAccepted || !datenschutzAcknowledged || savingTerms}
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
