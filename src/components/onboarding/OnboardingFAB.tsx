import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList, X } from "lucide-react";
import { useOnboardingContext } from "./useOnboardingContext";
import { OnboardingWizardModal } from "./OnboardingWizardModal";
import { useGuidedTour } from "@/components/weg-owner/onboarding/GuidedTourProvider";

/**
 * Floating Action Button shown to weg-owners with an active onboarding.
 * Cannot be permanently dismissed — the X only minimizes it to a small icon.
 */
export const OnboardingFAB = () => {
  const { loading, isActive, progress, buildingName, assignments, refresh } = useOnboardingContext();
  const { isActive: isTourActive, loading: tourLoading } = useGuidedTour();
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Sperre: Eine Tour wurde angefordert (z. B. über "Geführte Einführung
  // starten"), läuft aber evtl. noch nicht. Solange die Sperre aktiv ist,
  // darf sich das Onboarding NICHT automatisch öffnen.
  //
  // Der Initialwert kommt aus einem Fenster-Flag, das der Willkommens-Dialog
  // synchron BEIM KLICK setzt – also bevor dieser FAB überhaupt gemountet ist.
  // Damit ist die Sperre garantiert schon aktiv, wenn die Auto-Open-Prüfung
  // das erste Mal läuft (schließt das 300-ms-Zeitfenster bis zum Tour-Event).
  const [tourPending, setTourPending] = useState<boolean>(
    () => typeof window !== "undefined" && (window as any).__rgiOnboardingWaitForTour === true,
  );
  const tourWasActiveRef = useRef(false);

  const clearTourPending = () => {
    if (typeof window !== "undefined") {
      (window as any).__rgiOnboardingWaitForTour = false;
    }
    setTourPending(false);
  };

  // Falls die Tour (verzögert) über das Event angefordert wird, Sperre setzen.
  // Bei "Später"/"Überspringen" wird kein Event ausgelöst → Sperre bleibt aus
  // → Onboarding öffnet sofort.
  useEffect(() => {
    const handler = () => setTourPending(true);
    window.addEventListener("start-guided-tour", handler);
    return () => window.removeEventListener("start-guided-tour", handler);
  }, []);

  // Tour-Lebenszyklus verfolgen: Sobald die Tour aktiv war und dann endet
  // (regulär beendet ODER abgebrochen/übersprungen), Sperre wieder lösen.
  useEffect(() => {
    if (isTourActive()) {
      tourWasActiveRef.current = true;
      return;
    }
    if (tourWasActiveRef.current) {
      tourWasActiveRef.current = false;
      clearTourPending();
    }
  }, [isTourActive]);

  // Sicherheitsnetz: Falls nach dem Anfordern doch keine Tour startet
  // (z. B. keine Tour-Schritte im DOM), Sperre nach kurzer Zeit lösen,
  // damit das Onboarding nicht dauerhaft blockiert bleibt.
  useEffect(() => {
    if (!tourPending) return;
    const t = window.setTimeout(() => {
      if (!isTourActive() && !tourWasActiveRef.current) clearTourPending();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [tourPending, isTourActive]);

  // Auto-open when step 1 is missing (hard requirement) – aber erst, wenn
  // nichts anderes mehr im Weg ist: keine laufende Tour, keine angeforderte
  // Tour (tourPending). Dadurch startet das Onboarding genau dann, wenn die
  // Tour vorbei/abgebrochen ist – oder sofort, wenn keine Tour gestartet wurde.
  useEffect(() => {
    if (loading || tourLoading) return;
    if (isTourActive() || tourPending) return;
    if (progress && !progress.step1_completed_at && !progress.is_repeat_owner && !autoOpened) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [loading, tourLoading, isTourActive, tourPending, progress, autoOpened]);

  // Allow other components (e.g. FirstLoginWelcomeDialog) to open the wizard
  useEffect(() => {
    const handler = () => {
      setMinimized(false);
      setOpen(true);
    };
    window.addEventListener("open-onboarding-wizard", handler);
    return () => window.removeEventListener("open-onboarding-wizard", handler);
  }, []);

  if (loading || !isActive || !progress) return null;
  if (progress.fully_completed_at) return null;
  // Defensive: step 5 done implies the whole onboarding is done,
  // even if (legacy) fully_completed_at was never set on the row.
  if (progress.step5_completed_at) return null;

  const completedCount = [
    progress.step1_completed_at,
    progress.step2_completed_at,
    progress.step3_completed_at,
    progress.step4_completed_at,
    progress.step5_completed_at,
  ].filter(Boolean).length;

  const canMinimize = !!progress.step1_completed_at;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        {minimized ? (
          <Button
            onClick={() => {
              setMinimized(false);
              setOpen(true);
            }}
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            aria-label="Onboarding öffnen"
          >
            <ClipboardList className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            onClick={() => setOpen(true)}
            size="lg"
            className="h-14 rounded-full shadow-lg pl-5 pr-6 gap-3"
          >
            <ClipboardList className="h-5 w-5" />
            <span className="font-medium">
              {completedCount === 0
                ? "Onboarding starten"
                : `${completedCount} von 5 erledigt`}
            </span>
            {canMinimize && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMinimized(true);
                }}
                className="ml-1 -mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary-foreground/20"
                aria-label="Verkleinern"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
          </Button>
        )}
      </div>

      <OnboardingWizardModal
        open={open}
        onOpenChange={setOpen}
        progress={progress}
        buildingName={buildingName}
        assignments={assignments}
        onComplete={() => {
          setOpen(false);
          refresh();
        }}
      />
    </>
  );
};
