import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, ArrowLeft, ArrowRight, X } from "lucide-react";
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

const STEP_LABELS = ["Stammdaten", "Wohnung", "Gebäude", "Dienstleister", "Weiteres"];
const STEP_TITLES: Record<number, string> = {
  1: "Ihre Stammdaten",
  2: "Wohnungsdaten",
  3: "Gebäude",
  4: "Dienstleister",
  5: "Weiteres",
};
const STEP_SUBTITLES: Record<number, string> = {
  1: "Pflichtangaben für Ihre Eigentümerakte.",
  2: "Optional — Ihre Angaben helfen uns, Ihre Liegenschaft von Beginn an optimal zu betreuen.",
  3: "Optional — Ihre Angaben helfen uns, Ihre Liegenschaft von Beginn an optimal zu betreuen.",
  4: "Optional — Ihre Angaben helfen uns, Ihre Liegenschaft von Beginn an optimal zu betreuen.",
  5: "Optional — Ihre Angaben helfen uns, Ihre Liegenschaft von Beginn an optimal zu betreuen.",
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
  const [justFinished, setJustFinished] = useState(false);

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

  const { flush } = useStepAutoSave(progress.building_id, step, stepData);

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
  const allDone = justFinished || completedCount === 5 || !!progress.fully_completed_at || !!progress.step5_completed_at;

  const isStep1HardLocked =
    step === 1 && !progress.step1_completed_at && !progress.is_repeat_owner;

  const isEmptyData = (data: any) =>
    !data || Object.values(data).every((v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));

  const [pendingSepaWarning, setPendingSepaWarning] = useState(false);

  const doSubmitStep = async () => {
    if (step === 1) {
      const err = validateStep1(currentData as Step1Data);
      if (err) {
        toast({ title: "Bitte vervollständigen", description: err, variant: "destructive" });
        return;
      }
    }

    // Steps 2-4 sind optional: bei leeren Daten einfach weiter ohne Submit.
    if (step > 1 && step < 5 && isEmptyData(currentData)) {
      await flush();
      setStep(step + 1);
      return;
    }

    setSubmitting(true);
    try {
      await flush();
      const { error } = await supabase.functions.invoke("submit-onboarding-step", {
        body: { building_id: progress.building_id, step, payload: currentData },
      });
      if (error) throw error;
      if (step < 5) {
        toast({
          title: step === 1 ? "Stammdaten gespeichert" : "Eingabe übermittelt",
          description:
            step === 1
              ? "Ihre Daten wurden direkt übernommen."
              : "Die Verwaltung prüft Ihre Angaben.",
        });
        setStep(step + 1);
      } else {
        setJustFinished(true);
      }
    } catch (e: any) {
      if (step > 1) {
        if (step < 5) setStep(step + 1);
        else setJustFinished(true);
      } else {
        toast({
          title: "Fehler",
          description: e?.message ?? "Eingabe konnte nicht gespeichert werden.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitStep = async () => {
    // Bei Step 1: Wenn IBAN da ist, aber SEPA-Mandat-Checkbox NICHT angeklickt → Warn-Dialog
    if (step === 1) {
      const d = currentData as Step1Data;
      const ibanFilled = !!d.iban?.trim();
      const mandateAccepted = !!(d as any).sepa_mandate_accepted;
      if (ibanFilled && !mandateAccepted) {
        setPendingSepaWarning(true);
        return;
      }
    }
    await doSubmitStep();
  };

  const acceptMandateAndContinue = async () => {
    const now = new Date().toISOString();
    const next = {
      ...(currentData as Step1Data),
      sepa_mandate_accepted: true,
      sepa_mandate_signed_at: now,
    };
    setCurrentData(next);
    setPendingSepaWarning(false);
    // kurzer Tick, damit State propagiert wird
    setTimeout(() => doSubmitStep(), 0);
  };

  const continueWithoutMandate = async () => {
    setPendingSepaWarning(false);
    setTimeout(() => doSubmitStep(), 0);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Step1Stammdaten
            value={currentData as Step1Data}
            onChange={setCurrentData}
            buildingId={progress.building_id}
          />
        );
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
            : "max-w-2xl h-[92vh] rounded-[20px] border-border/50 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)]"
        )}
        onPointerDownOutside={(e) => isStep1HardLocked && e.preventDefault()}
        onEscapeKeyDown={(e) => isStep1HardLocked && e.preventDefault()}
        onKeyDown={(e) => {
          // Welcome-Screen: Enter startet das Wizard
          if (showWelcome && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            setShowWelcome(false);
          }
        }}
      >
        <DialogTitle className="sr-only">
          Onboarding{buildingName ? ` – ${buildingName}` : ""}
        </DialogTitle>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!allDone && !showWelcome && !submitting) {
              handleSubmitStep();
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          {/* Top Bar */}
          <div className="bg-card border-b border-border/40 px-5 h-[56px] flex items-center shrink-0">
            <RgiWordmark />
          </div>

          {/* Step Slider */}
          {!allDone && (
            <div className="bg-card border-b border-border/40 px-5 py-3.5 shrink-0">
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
              <CompletionScreen
                onClose={() => {
                  onComplete();
                  onOpenChange(false);
                }}
                completed={justFinished || progress.step5_completed_at ? { 1: true, 2: true, 3: true, 4: true, 5: true } : completed}
              />
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={async () => { await flush(); setStep(step - 1); }}
                disabled={submitting || isStep1HardLocked || step <= 1}
                className="border-border/60"
                aria-label="Zurück"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                size="icon"
                aria-label={step === 5 ? "Abschließen" : "Weiter"}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step === 5 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </form>

        {/* SEPA Warn-Dialog */}
        <AlertDialog open={pendingSepaWarning} onOpenChange={setPendingSepaWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-left">
                <span className="block">
                  Ohne SEPA-Lastschriftmandat entsteht für die Verwaltung ein deutlich
                  höherer Aufwand bei der Erfassung und Zuordnung Ihrer Zahlungen.
                </span>
                <span className="block">
                  Diesen Mehraufwand müssen wir mit{" "}
                  <strong>5,00 € pro Monat</strong> zusätzlich zum Hausgeld in Rechnung
                  stellen.
                </span>
                <span className="block">Möchten Sie das Mandat doch erteilen?</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={continueWithoutMandate}>
                Nein, ohne Mandat fortfahren
              </AlertDialogCancel>
              <AlertDialogAction onClick={acceptMandateAndContinue}>
                Ja, Mandat jetzt erteilen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  const stepNames = ["Stammdaten", "Wohnungsdaten", "Gebäude", "Dienstleister", "Weiteres"];
  return (
    <div className="max-w-md mx-auto space-y-7 py-3">
      <div className="bg-card rounded-[16px] border border-border/50 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="h-1 bg-primary" />
        <div className="px-5 py-6 space-y-5 text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 mx-auto">
            <Check className="size-7 text-primary" strokeWidth={2.5} />
          </div>
          <h1 className="font-display !font-normal text-[26px] leading-[1.2] tracking-[-0.01em] text-foreground">
            Vielen <span className="text-primary font-medium">Dank!</span>
          </h1>
          <div className="space-y-3 text-[14px] leading-[1.7] text-foreground/75 text-left">
            <p>
              Sie haben das Onboarding erfolgreich abgeschlossen. Wir freuen uns
              sehr, Sie als Eigentümer begrüßen zu dürfen.
            </p>
            <p>
              Ihre Stammdaten wurden direkt übernommen. Die übrigen Angaben
              werden von der Verwaltung geprüft.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-[16px] border border-border/50 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase mb-3">
          Ihre Eingaben
        </div>
        <ul className="divide-y divide-border/40">
          {stepNames.map((name, i) => {
            const n = i + 1;
            const isDone = completed[n];
            const status = !isDone ? "Übersprungen" : n === 1 ? "Übernommen" : "In Prüfung";
            const statusCls = !isDone
              ? "bg-secondary text-muted-foreground"
              : n === 1
                ? "bg-success/15 text-success"
                : "bg-primary/10 text-primary";
            return (
              <li key={n} className="flex items-center gap-3.5 py-3 first:pt-1 last:pb-1">
                <span
                  className={cn(
                    "size-7 shrink-0 rounded-full grid place-items-center transition-colors",
                    isDone
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={3} /> : n}
                </span>
                <span className="flex-1 text-[14px] text-foreground font-medium">{name}</span>
                <span
                  className={cn(
                    "text-[10.5px] px-2.5 py-1 rounded-full font-semibold tracking-wide uppercase",
                    statusCls
                  )}
                >
                  {status}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2.5">
        <Button
          onClick={onClose}
          className="w-full h-12 text-[15px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-[12px] shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.4)]"
        >
          Zur App
        </Button>
      </div>
    </div>
  );
};
