import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList, X } from "lucide-react";
import { useOnboardingContext } from "./useOnboardingContext";
import { OnboardingWizardModal } from "./OnboardingWizardModal";

/**
 * Floating Action Button shown to weg-owners with an active onboarding.
 * Cannot be permanently dismissed — the X only minimizes it to a small icon.
 */
export const OnboardingFAB = () => {
  const { loading, isActive, progress, buildingName, assignments, refresh } = useOnboardingContext();
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Auto-open when step 1 is missing (hard requirement)
  useEffect(() => {
    if (!loading && progress && !progress.step1_completed_at && !progress.is_repeat_owner && !autoOpened) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [loading, progress, autoOpened]);

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
