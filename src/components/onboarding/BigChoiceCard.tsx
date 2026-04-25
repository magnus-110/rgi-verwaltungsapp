import { Check, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface BigChoiceCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * Large tap-friendly choice card for onboarding wizard.
 * Min height 80px, designed for mobile-first single-tap selection.
 */
export const BigChoiceCard = ({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
  className,
}: BigChoiceCardProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full min-h-[80px] flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all",
        "hover:border-primary/60 hover:bg-muted/40 active:scale-[0.99]",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card",
        className
      )}
      aria-pressed={selected}
    >
      {Icon && (
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground">{title}</div>
        {description && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </div>
        )}
      </div>
      {selected && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-4 w-4" strokeWidth={3} />
        </div>
      )}
    </button>
  );
};
