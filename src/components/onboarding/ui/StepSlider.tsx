import { cn } from "@/lib/utils";

interface StepSliderProps {
  steps: string[];
  currentStep: number; // 1-based; 0 = Welcome
  completed: Record<number, boolean>;
  onStepClick?: (n: number) => void;
  lockedFromStep?: number;
}

export const StepSlider = ({
  steps,
  currentStep,
  completed,
  onStepClick,
  lockedFromStep,
}: StepSliderProps) => {
  const total = steps.length;
  const filledCount = Math.max(
    0,
    Math.min(total, Object.values(completed).filter(Boolean).length)
  );
  const displayCurrent = Math.max(filledCount, Math.min(total, currentStep));

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 flex items-center gap-1.5">
        {steps.map((label, i) => {
          const n = i + 1;
          const isFilled = completed[n] || n <= currentStep;
          const isLocked = lockedFromStep != null && n >= lockedFromStep;
          return (
            <button
              key={n}
              type="button"
              onClick={() => !isLocked && onStepClick?.(n)}
              disabled={isLocked}
              aria-label={`Schritt ${n}: ${label}`}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors disabled:cursor-not-allowed",
                isFilled ? "bg-primary" : "bg-muted"
              )}
            />
          );
        })}
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
        {displayCurrent} / {total}
      </span>
    </div>
  );
};
