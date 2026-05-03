import * as React from "react";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

/**
 * Hook für mobile Split-View-Steuerung in Prüfmodi.
 *
 * Stellt:
 *  - mobileView ("list" | "detail")
 *  - touchHandlers (auf den Container)
 *  - showList / showDetail (was rendern)
 *  - openDetail / openList (programmatischer Wechsel, z.B. nach Auswahl)
 *
 * Auf Desktop sind showList und showDetail immer true.
 */
export function useMobileSplitView() {
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = React.useState<"list" | "detail">("list");

  const touchStart = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    if (e.touches.length > 1) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, [isMobile]);

  const onTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStart.current) return;
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    const THRESHOLD = 60;
    const MAX_OFF_AXIS_RATIO = 0.7;
    const MAX_TIME = 800;
    if (dt > MAX_TIME) return;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < THRESHOLD) return;
    if (absDy > absDx * MAX_OFF_AXIS_RATIO) return;
    // Ignore swipes that originate on interactive scroll/draggable elements? -> Skip, kept simple.
    if (dx < 0) {
      // swipe left → detail
      setMobileView("detail");
    } else {
      // swipe right → list
      setMobileView("list");
    }
  }, [isMobile]);

  return {
    isMobile,
    mobileView,
    setMobileView,
    openDetail: React.useCallback(() => setMobileView("detail"), []),
    openList: React.useCallback(() => setMobileView("list"), []),
    showList: !isMobile || mobileView === "list",
    showDetail: !isMobile || mobileView === "detail",
    touchHandlers: { onTouchStart, onTouchEnd },
  };
}

interface MobileViewSwitcherProps {
  mobileView: "list" | "detail";
  onChange: (v: "list" | "detail") => void;
  listLabel?: string;
  detailLabel?: string;
  className?: string;
}

/** Sichtbare Pill-Leiste mit Page-Indicator für mobile Split-Views. */
export function MobileViewSwitcher({
  mobileView,
  onChange,
  listLabel = "Liste",
  detailLabel = "Detail",
  className,
}: MobileViewSwitcherProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 md:hidden", className)}>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
          mobileView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {listLabel}
      </button>
      <div className="flex items-center gap-1" aria-hidden>
        <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", mobileView === "list" ? "bg-primary" : "bg-muted-foreground/30")} />
        <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", mobileView === "detail" ? "bg-primary" : "bg-muted-foreground/30")} />
      </div>
      <button
        type="button"
        onClick={() => onChange("detail")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
          mobileView === "detail" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        )}
      >
        {detailLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Kleiner Zurück-Button für den Detail-Header (Mobile only). */
export function MobileBackToListButton({ onClick, label = "Zurück" }: { onClick: () => void; label?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="md:hidden gap-1 -ml-2"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
