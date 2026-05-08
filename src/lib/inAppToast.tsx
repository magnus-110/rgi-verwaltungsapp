import { toast } from "sonner";
import { X } from "lucide-react";
import React from "react";

export function showInAppToast(opts: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  detail?: string;
  onClick?: () => void;
}) {
  toast.custom(
    (t) => (
      <div
        onClick={() => {
          opts.onClick?.();
          toast.dismiss(t);
        }}
        className="group relative flex w-[400px] cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3.5 pr-10 shadow-2xl ring-1 ring-black/5 transition hover:shadow-2xl hover:ring-primary/20"
        style={{ fontFamily: "'Work Sans', system-ui, sans-serif" }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          {opts.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[13px] font-semibold leading-tight text-foreground"
            style={{ fontFamily: "'Century Gothic', Arial, sans-serif" }}
          >
            {opts.title}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-primary">RGI Verwaltung</span>
            <span className="text-[11px] text-muted-foreground">· jetzt</span>
          </div>
          {opts.subtitle && (
            <div className="mt-1.5 truncate text-[13px] font-medium text-foreground/90">{opts.subtitle}</div>
          )}
          {opts.detail && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{opts.detail}</div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t);
          }}
          className="absolute right-2.5 top-2.5 rounded p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          aria-label="Schließen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    { duration: 4000, position: "bottom-right" }
  );
}
