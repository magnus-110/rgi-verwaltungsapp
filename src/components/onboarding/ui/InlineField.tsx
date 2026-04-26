import { ReactNode, InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InlineFieldProps {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Row layout: fixed-width label on the left, input/control on the right.
 * Used inside SectionCard.
 */
export const InlineField = ({
  label,
  required,
  hint,
  children,
  className,
}: InlineFieldProps) => {
  return (
    <div className={cn("px-4", className)}>
      <div className="min-h-[50px] flex items-center gap-3">
        <div className="w-[110px] shrink-0 text-[13px] text-muted-foreground">
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </div>
        <div className="flex-1 min-w-0 flex justify-end">{children}</div>
      </div>
      {hint && <div className="pb-2 -mt-1 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
};

/** Transparent input that lives inside an InlineField on the right side. */
export const InlineInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full text-right bg-transparent border-0 outline-none text-[14px] text-foreground",
        "placeholder:text-muted-foreground/60",
        className
      )}
      {...props}
    />
  )
);
InlineInput.displayName = "InlineInput";

/** Embedded input (filled bg) for grids like PLZ/Ort. */
export const EmbeddedInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-[hsl(var(--input))] rounded-lg px-3 py-2.5 text-[14px] text-foreground",
        "border-0 outline-none focus:bg-[hsl(35_25%_92%)] transition-colors",
        "placeholder:text-muted-foreground/60",
        className
      )}
      {...props}
    />
  )
);
EmbeddedInput.displayName = "EmbeddedInput";
