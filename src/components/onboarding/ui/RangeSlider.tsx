import { cn } from "@/lib/utils";

interface RangeSliderProps {
  value: number; // 1..max
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  descriptions?: string[]; // length = max-min+1
  lowLabel?: string;
  highLabel?: string;
  className?: string;
}

export const RangeSlider = ({
  value,
  onChange,
  min = 1,
  max = 5,
  descriptions = [],
  lowLabel = "Schlecht",
  highLabel = "Ausgezeichnet",
  className,
}: RangeSliderProps) => {
  const safe = value || min;
  const pct = ((safe - min) / (max - min)) * 100;
  const description = descriptions[safe - min] ?? "";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline gap-3">
        <div className="font-display text-[28px] leading-none text-primary">
          {safe} <span className="text-muted-foreground/60 text-[18px]">/ {max}</span>
        </div>
        <div className="text-[13px] text-foreground">{description}</div>
      </div>

      <div className="px-1">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={safe}
          onChange={(e) => onChange(Number(e.target.value))}
          className="onb-range w-full"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${pct}%, hsl(35 25% 88%) ${pct}%, hsl(35 25% 88%) 100%)`,
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>

      <style>{`
        .onb-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          outline: none;
        }
        .onb-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid hsl(var(--primary));
          cursor: pointer;
          margin-top: -11px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .onb-range::-moz-range-thumb {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid hsl(var(--primary));
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};
