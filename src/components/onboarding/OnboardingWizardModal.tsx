import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  OnboardingProgress,
  useStepAutoSave,
} from "./useOnboardingContext";
import { Step1Stammdaten, Step1Data, validateStep1 } from "./steps/Step1Stammdaten";
import { Step2Wohnungsdaten, Step2Data } from "./steps/Step2Wohnungsdaten";
import { Step3Gebaeude, Step3Data } from "./steps/Step3Gebaeude";
import { Step4Dienstleister, Step4Data } from "./steps/Step4Dienstleister";
import { Step5Einschaetzung, Step5Data } from "./steps/Step5Einschaetzung";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: OnboardingProgress;
  buildingName: string | null;
  onComplete: () => void;
}

const STEP_LABELS = [
  "Stammdaten",
  "Wohnung",
  "Gebäude",
  "Dienstleister",
  "Einschätzung",
];

export const OnboardingWizardModal = ({
  open,
  onOpenChange,
  progress,
  buildingName,
  onComplete,
}: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<number>(progress.current_step || 1);
  const [stepData, setStepData] = useState<Record<string, any>>(
    progress.step_data || {}
  );
  const [submitting, setSubmitting] = useState(false);

  // Skip step 1 for repeat owners
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

  const completed = useMemo(
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
        body: {
          progress_id: progress.id,
          step,
          data: currentData,
        },
      });
      if (error) throw error;
      toast({
        title: step === 1 ? "Stammdaten gespeichert" : "Eingabe übermittelt",
        description:
          step === 1
            ? "Ihre Daten wurden direkt übernommen."
            : "Die Verwaltung prüft Ihre Angaben.",
      });
      if (step < 5) {
        setStep(step + 1);
      } else {
        onComplete();
      }
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
        if (!o && isStep1HardLocked) return; // hard-block
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0"
        onPointerDownOutside={(e) => isStep1HardLocked && e.preventDefault()}
        onEscapeKeyDown={(e) => isStep1HardLocked && e.preventDefault()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle className="text-xl">Willkommen{buildingName ? ` – ${buildingName}` : ""}</DialogTitle>
            <span className="text-sm text-muted-foreground shrink-0">
              {completedCount} von 5 erledigt
            </span>
          </div>
          <Progress value={(completedCount / 5) * 100} className="h-2" />
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const isDone = (completed as any)[n];
              const isCurrent = step === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => !isStep1HardLocked && setStep(n)}
                  disabled={isStep1HardLocked && n !== 1}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isDone
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" /> : <span>{n}</span>}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {allDone ? (
            <div className="text-center py-10 space-y-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Vielen Dank!</h3>
              <p className="text-muted-foreground">
                Alle Schritte sind abgeschlossen. Die Verwaltung meldet sich, sobald Eingaben geprüft sind.
              </p>
              <Button onClick={() => onOpenChange(false)}>Schließen</Button>
            </div>
          ) : (
            renderStep()
          )}
        </div>

        {/* Footer */}
        {!allDone && (
          <div className="sticky bottom-0 z-10 bg-background border-t p-4 flex items-center justify-between gap-2">
            <div>
              {!isStep1HardLocked && step > 1 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={submitting}>
                  Zurück
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!isStep1HardLocked && step > 1 && (
                <Button variant="outline" onClick={handleSkip} disabled={submitting}>
                  Überspringen
                </Button>
              )}
              <Button onClick={handleSubmitStep} disabled={submitting}>
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
