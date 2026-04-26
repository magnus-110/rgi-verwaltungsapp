import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepSliderProps {
  steps: string[];
  currentStep: number; // 1-based
  completed: Record<number, boolean>;
  onStepClick?: (n: number) => void;
  lockedFromStep?: number; // steps >= this are not clickable
}

export const StepSlider = ({
  steps,
  currentStep,
  completed,
  onStepClick,
  lockedFromStep,
}: StepSliderProps) => {
  return (
    <div className="flex items-start justify-between px-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const isDone = !!completed[n];
        const isActive = n === currentStep;
        const isLast = n === steps.length;
        const isLocked = lockedFromStep != null && n >= lockedFromStep;
        const segmentDone = completed[n] || (n < currentStep);

        return (
          <div key={n} className="flex-1 flex flex-col items-center min-w-0 relative">
            <div className="flex items-center w-full">
              <div className="flex-1 h-0.5 -mr-1">
                {n > 1 && (
                  <div
                    className={cn(
                      "h-0.5 w-full",
                      completed[n - 1] ? "bg-primary/60" : "bg-border"
                    )}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => !isLocked && onStepClick?.(n)}
                disabled={isLocked}
                className={cn(
                  "size-7 shrink-0 rounded-full grid place-items-center text-[11px] font-medium transition",
                  "disabled:cursor-not-allowed",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                )}
                aria-label={`Schritt ${n}: ${label}`}
              >
                {isDone ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </button>
              <div className="flex-1 h-0.5 -ml-1">
                {!isLast && (
                  <div
                    className={cn(
                      "h-0.5 w-full",
                      segmentDone ? "bg-primary/60" : "bg-border"
                    )}
                  />
                )}
              </div>
            </div>
            <div
              className={cn(
                "mt-1.5 text-[9px] text-center leading-tight px-0.5 truncate w-full",
                isActive ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
