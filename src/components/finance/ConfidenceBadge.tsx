import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface ConfidenceBadgeProps {
  value: number | null | undefined;
  className?: string;
  showIcon?: boolean;
}

/**
 * Visualisiert die KI-Konfidenz eines Buchungsvorschlags.
 * grün ≥ 80% | gelb ≥ 50% | rot < 50%
 */
export function ConfidenceBadge({ value, className, showIcon = true }: ConfidenceBadgeProps) {
  if (value == null || isNaN(value)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  const tone =
    pct >= 80
      ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/30 dark:text-green-200 dark:border-green-800"
      : pct >= 50
      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800"
      : "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/30 dark:text-red-200 dark:border-red-800";

  const label =
    pct >= 80 ? "Hohe Konfidenz" : pct >= 50 ? "Mittlere Konfidenz" : "Niedrige Konfidenz";

  return (
    <Badge
      variant="outline"
      title={label}
      className={cn("text-[11px] gap-1 border", tone, className)}
    >
      {showIcon && <Sparkles className="h-3 w-3" />}
      KI {pct}%
    </Badge>
  );
}
