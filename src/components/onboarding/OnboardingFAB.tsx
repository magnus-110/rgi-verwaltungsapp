import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingContext } from "./useOnboardingContext";
import { OnboardingWizardModal } from "./OnboardingWizardModal";

/**
 * Floating Action Button shown to weg-owners with an active onboarding.
 * Visibility rules — see plan section 9.
 */
export const OnboardingFAB = () => {
  const { loading, isActive, progress, buildingName, refresh } = useOnboardingContext();
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  // Auto-open when step 1 is missing (hard requirement)
  useEffect(() => {
    if (!loading && progress && !progress.step1_completed_at && !progress.is_repeat_owner && !autoOpened) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [loading, progress, autoOpened]);

  if (loading || !isActive || !progress) return null;
  if (progress.fully_completed_at) return null;
  if (progress.fab_dismissed_at) return null;

  // After step 1 done, hide after 30 days
  if (progress.step1_completed_at) {
    const days =
      (Date.now() - new Date(progress.step1_completed_at).getTime()) / 86400000;
    if (days > 30) return null;
  }

  const completedCount = [
    progress.step1_completed_at,
    progress.step2_completed_at,
    progress.step3_completed_at,
    progress.step4_completed_at,
    progress.step5_completed_at,
  ].filter(Boolean).length;

  const dismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!progress.step1_completed_at) return; // cannot dismiss until step 1 done
    await supabase
      .from("onboarding_progress" as any)
      .update({ fab_dismissed_at: new Date().toISOString() })
      .eq("id", progress.id);
    refresh();
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
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
          {progress.step1_completed_at && (
            <span
              role="button"
              onClick={dismiss}
              className="ml-1 -mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary-foreground/20"
              aria-label="Ausblenden"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </div>

      <OnboardingWizardModal
        open={open}
        onOpenChange={setOpen}
        progress={progress}
        buildingName={buildingName}
        onComplete={() => {
          setOpen(false);
          refresh();
        }}
      />
    </>
  );
};
