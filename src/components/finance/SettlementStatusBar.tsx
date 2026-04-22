import { Card } from "@/components/ui/card";
import { Check, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "ok" | "warning" | "todo";

export interface SettlementStep {
  id: string;
  label: string;
  status: StepStatus;
  hint?: string;
}

interface SettlementStatusBarProps {
  steps: SettlementStep[];
  activeStepId?: string;
  onStepClick?: (id: string) => void;
}

/**
 * SettlementStatusBar
 * -------------------
 * Sticky 5-Schritt-Ampel oberhalb des Abrechnungsflusses. Zeigt jedem
 * Schritt einen Status (✅ ok / ⚠️ warning / ⏳ todo) und erlaubt 1-Klick-
 * Navigation zum jeweiligen Schritt. Ersetzt das frühere Validierungs-Panel
 * am Ende der Seite – Probleme werden sofort sichtbar, nicht versteckt.
 */
export function SettlementStatusBar({ steps, activeStepId, onStepClick }: SettlementStatusBarProps) {
  return (
    <Card className="sticky top-0 z-20 p-2 shadow-sm">
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {steps.map((step, idx) => {
          const isActive = step.id === activeStepId;
          const Icon =
            step.status === "ok" ? Check :
            step.status === "warning" ? AlertTriangle : Clock;
          const colorClasses =
            step.status === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900" :
            step.status === "warning" ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900" :
            "text-muted-foreground bg-muted/30 border-border";

          return (
            <button
              key={step.id}
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                "flex-1 min-w-[140px] flex items-center gap-2 px-3 py-2 rounded-md border text-left transition-colors",
                colorClasses,
                isActive && "ring-2 ring-primary ring-offset-1"
              )}
              title={step.hint}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-background border flex items-center justify-center text-[11px] font-semibold">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{step.label}</div>
                {step.hint && (
                  <div className="text-[10px] truncate opacity-80">{step.hint}</div>
                )}
              </div>
              <Icon className="h-4 w-4 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}
