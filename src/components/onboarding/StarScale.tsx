import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarScaleProps {
  value: number;
  onChange: (value: number) => void;
  labels?: [string, string]; // [low, high]
  className?: string;
}

/**
 * 5-star scale with large touch targets (min 56px).
 * Hover/Tap feedback, optional low/high labels.
 */
export const StarScale = ({
  value,
  onChange,
  labels = ["Sehr schlecht", "Sehr gut"],
  className,
}: StarScaleProps) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex justify-center gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} von 5 Sternen`}
            className="h-14 w-14 sm:h-16 sm:w-16 flex items-center justify-center rounded-lg transition-transform active:scale-95 hover:bg-muted/60"
          >
            <Star
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 transition-colors",
                n <= display
                  ? "fill-primary text-primary"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
};
