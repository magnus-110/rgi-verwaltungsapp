import { ReactNode, Children, isValidElement, cloneElement } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  label?: string;
  children: ReactNode;
  className?: string;
  /** No internal dividers between children */
  flat?: boolean;
}

/**
 * White rounded card with optional uppercase section label.
 * Children are auto-separated by a 0.5px hairline divider unless `flat`.
 */
export const SectionCard = ({ label, children, className, flat }: SectionCardProps) => {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <div
      className={cn(
        "bg-card rounded-[14px] border border-border/60 overflow-hidden",
        className
      )}
    >
      {label && (
        <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.6px] text-muted-foreground/80">
          {label}
        </div>
      )}
      {items.map((child, i) => (
        <div key={i}>
          {i > 0 && !flat && <div className="h-px bg-foreground/[0.055]" />}
          {child}
        </div>
      ))}
    </div>
  );
};
