import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  OnboardingProgress,
  useStepAutoSave,
} from "./useOnboardingContext";
import { Step1Stammdaten, Step1Data, validateStep1 } from "./steps/Step1Stammdaten";
import { Step2Wohnungsdaten, Step2Data } from "./steps/Step2Wohnungsdaten";
import { Step3Gebaeude, Step3Data } from "./steps/Step3Gebaeude";
import { Step4Dienstleister, Step4Data } from "./steps/Step4Dienstleister";
import { Step5Einschaetzung, Step5Data } from "./steps/Step5Einschaetzung";
import { StepSlider } from "./ui/StepSlider";
import { RgiWordmark } from "./ui/RgiWordmark";
import { WelcomeScreen } from "./ui/WelcomeScreen";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: OnboardingProgress;
  buildingName: string | null;
  onComplete: () => void;
}

const STEP_LABELS = ["Stammdaten", "Wohnung", "Gebäude", "Dienstleister", "Einschätzung"];
const STEP_TITLES: Record<number, string> = {
  1: "Ihre Stammdaten",
  2: "Wohnungsdaten",
  3: "Gebäude-Eindruck",
  4: "Dienstleister",
  5: "Einschätzung",
};
const STEP_SUBTITLES: Record<number, string> = {
  1: "Pflichtangaben für Ihre Eigentümerakte.",
  2: "Optional — hilft uns beim Datenabgleich.",
  3: "Optional — Ihr persönlicher Eindruck.",
  4: "Optional — wer hat sich bewährt?",
  5: "Optional — letzte Einschätzungen.",
};

export const OnboardingWizardModal = ({
  open,
  onOpenChange,
  progress,
  buildingName,
  onComplete,
}: Props) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [step, setStep] = useState<number>(progress.current_step || 1);
  const [stepData, setStepData] = useState<Record<string, any>>(progress.step_data || {});
  const [submitting, setSubmitting] = useState(false);

  // Welcome-Screen nur beim allerersten Öffnen anzeigen
  const initialStep1 = (progress.step_data as any)?.step1;
  const step1HasData =
    !!initialStep1 && Object.keys(initialStep1).length > 0;
  const [showWelcome, setShowWelcome] = useState<boolean>(
    !progress.step1_completed_at &&
      !progress.is_repeat_owner &&
      !step1HasData &&
      (progress.current_step ?? 1) <= 1
  );

  useEffect(() => {
    if (progress.is_repeat_owner && step === 1 && !progress.step1_completed_at) {
      setStep(2);
    }
  }, [progress.is_repeat_owner, progress.step1_completed_at, step]);

  const currentStepKey = `step${step}` as const;
  const currentData = stepData[currentStepKey] || {};

  const setCurrentData = (next: any) => {
    setStepData((prev) => ({ ...prev, [currentStepKey]: next }));
  };

  useStepAutoSave(progress.id, step, stepData);

  const completed = useMemo<Record<number, boolean>>(
    () => ({
      1: !!progress.step1_completed_at,
      2: !!progress.step2_completed_at,
      3: !!progress.step3_completed_at,
      4: !!progress.step4_completed_at,
      5: !!progress.step5_completed_at,
    }),
    [progress]
  );

  const completedCount = Object.values(completed).filter(Boolean).length;
  const allDone = completedCount === 5 || !!progress.fully_completed_at;

  const isStep1HardLocked =
    step === 1 && !progress.step1_completed_at && !progress.is_repeat_owner;

  const handleSubmitStep = async () => {
    if (step === 1) {
      const err = validateStep1(currentData as Step1Data);
      if (err) {
        toast({ title: "Bitte vervollständigen", description: err, variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-onboarding-step", {
        body: { progress_id: progress.id, step, data: currentData },
      });
      if (error) throw error;
      toast({
        title: step === 1 ? "Stammdaten gespeichert" : "Eingabe übermittelt",
        description:
          step === 1
            ? "Ihre Daten wurden direkt übernommen."
            : "Die Verwaltung prüft Ihre Angaben.",
      });
      if (step < 5) setStep(step + 1);
      else onComplete();
    } catch (e: any) {
      toast({
        title: "Fehler",
        description: e?.message ?? "Eingabe konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (step < 5) setStep(step + 1);
    else onComplete();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1Stammdaten value={currentData as Step1Data} onChange={setCurrentData} />;
      case 2:
        return <Step2Wohnungsdaten value={currentData as Step2Data} onChange={setCurrentData} />;
      case 3:
        return <Step3Gebaeude value={currentData as Step3Data} onChange={setCurrentData} />;
      case 4:
        return (
          <Step4Dienstleister
            buildingId={progress.building_id}
            value={currentData as Step4Data}
            onChange={setCurrentData}
          />
        );
      case 5:
        return <Step5Einschaetzung value={currentData as Step5Data} onChange={setCurrentData} />;
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isStep1HardLocked) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        className={cn(
          "p-0 gap-0 bg-background flex flex-col overflow-hidden",
          isMobile
            ? "max-w-full w-full h-[100dvh] max-h-[100dvh] rounded-none border-0"
            : "max-w-2xl h-[92vh] rounded-2xl"
        )}
        onPointerDownOutside={(e) => isStep1HardLocked && e.preventDefault()}
        onEscapeKeyDown={(e) => isStep1HardLocked && e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          Onboarding{buildingName ? ` – ${buildingName}` : ""}
        </DialogTitle>

        {/* Top Bar */}
        <div className="bg-card border-b border-border/60 px-4 h-[52px] flex items-center shrink-0">
          <RgiWordmark />
        </div>

        {/* Step Slider */}
        {!allDone && (
          <div className="bg-card border-b border-border/60 px-4 py-3 shrink-0">
            <StepSlider
              steps={STEP_LABELS}
              currentStep={showWelcome ? 0 : step}
              completed={showWelcome ? {} : completed}
              onStepClick={(n) =>
                !showWelcome && !isStep1HardLocked && setStep(n)
              }
              lockedFromStep={
                showWelcome ? 1 : isStep1HardLocked ? 2 : undefined
              }
            />
          </div>
        )}

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          {allDone ? (
            <CompletionScreen onClose={() => onOpenChange(false)} completed={completed} />
          ) : showWelcome ? (
            <WelcomeScreen onStart={() => setShowWelcome(false)} />
          ) : (
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-[20px] text-foreground leading-tight">
                  {STEP_TITLES[step]}
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {STEP_SUBTITLES[step]}
                </p>
              </div>
              {renderStep()}
            </div>
          )}
        </div>

        {/* Footer */}
        {!allDone && !showWelcome && (
          <div className="bg-card border-t border-border/60 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
            <div>
              {!isStep1HardLocked && step > 1 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={submitting}>
                  Zurück
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!isStep1HardLocked && step > 1 && (
                <Button
                  variant="outline"
                  onClick={handleSkip}
                  disabled={submitting}
                  className="border-border/60"
                >
                  Schritt überspringen
                </Button>
              )}
              <Button onClick={handleSubmitStep} disabled={submitting} className="min-w-[110px]">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {step === 5 ? "Abschließen" : "Weiter"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
const CompletionScreen = ({
  onClose,
  completed,
}: {
  onClose: () => void;
  completed: Record<number, boolean>;
}) => {
  const stepNames = ["Stammdaten", "Wohnungsdaten", "Gebäude-Eindruck", "Dienstleister", "Einschätzung"];
  return (
    <div className="text-center py-6 space-y-5 max-w-md mx-auto">
      <div className="inline-flex size-16 items-center justify-center rounded-full bg-primary mx-auto">
        <Check className="size-8 text-primary-foreground" strokeWidth={3} />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl text-foreground">Onboarding abgeschlossen</h2>
        <p className="text-[13px] text-muted-foreground">
          Vielen Dank! Die Verwaltung meldet sich, sobald Ihre Angaben geprüft sind.
        </p>
      </div>

      <div className="bg-card rounded-[14px] border border-border/60 p-4 space-y-2.5 text-left">
        {stepNames.map((name, i) => {
          const n = i + 1;
          const isDone = completed[n];
          const status = n === 1 ? "Übernommen" : "In Prüfung";
          const statusCls = n === 1 ? "text-success" : "text-muted-foreground";
          return (
            <div key={n} className="flex items-center gap-3">
              <span
                className={cn(
                  "size-5 rounded-full grid place-items-center shrink-0",
                  isDone ? "bg-primary" : "bg-muted"
                )}
              >
                {isDone && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="flex-1 text-[14px] text-foreground">{name}</span>
              <span className={cn("text-[12px]", statusCls)}>{isDone ? status : "Übersprungen"}</span>
            </div>
          );
        })}
      </div>

      <Button onClick={onClose} className="w-full sm:w-auto px-8">
        Zur App
      </Button>
    </div>
  );
};
