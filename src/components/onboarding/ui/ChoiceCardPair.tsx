import { cn } from "@/lib/utils";

interface ChoiceOption<T extends string | number | boolean> {
  value: T;
  title: string;
  subtitle?: string;
  /** Override selected color: 'primary' (default) or 'muted' */
  selectedTone?: "primary" | "muted";
}

interface ChoiceCardPairProps<T extends string | number | boolean> {
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: [ChoiceOption<T>, ChoiceOption<T>];
  className?: string;
}

export function ChoiceCardPair<T extends string | number | boolean>({
  value,
  onChange,
  options,
  className,
}: ChoiceCardPairProps<T>) {
  return (
    <div className={cn("flex gap-2.5", className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        const tone = opt.selectedTone ?? "primary";
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 p-3.5 rounded-xl border-[1.5px] text-left transition",
              "flex flex-col gap-1.5",
              selected
                ? tone === "primary"
                  ? "border-primary bg-accent"
                  : "border-muted-foreground/40 bg-muted"
                : "border-border/60 bg-card hover:border-border"
            )}
            aria-pressed={selected}
          >
            <span
              className={cn(
                "size-[18px] rounded-full border-[1.5px] grid place-items-center",
                selected
                  ? tone === "primary"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/60 bg-muted-foreground/60"
                  : "border-border bg-card"
              )}
            >
              {selected && <span className="size-2 rounded-full bg-white" />}
            </span>
            <span className="text-[14px] font-semibold text-foreground leading-tight">
              {opt.title}
            </span>
            {opt.subtitle && (
              <span className="text-[11px] text-muted-foreground leading-snug">
                {opt.subtitle}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
