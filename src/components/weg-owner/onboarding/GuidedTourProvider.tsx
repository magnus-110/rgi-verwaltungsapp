import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { TOURS_BY_ID, type TourStep } from "./tours";
import { useTourProgress } from "./tourProgress";

interface GuidedTourContextValue {
  startTour: (tourId: string) => void;
  hasSeen: (tourId: string) => boolean;
  isActive: () => boolean;
  loading: boolean;
  isDisabled: () => boolean;
  enableTours: () => void;
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

const DISABLE_KEY = "rgi:tour-disabled";

const isToursDisabled = () => {
  try {
    return localStorage.getItem(DISABLE_KEY) === "1";
  } catch {
    return false;
  }
};

const SENIOR_STYLES = `
  .driver-overlay {
    /* kein Backdrop-Blur – fokussiertes Element bleibt gestochen scharf */
  }

  .driver-popover.rgi-tour-popover {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    max-width: 320px;
    width: calc(100vw - 28px);
    border-radius: 16px;
    border: 1px solid hsl(var(--border) / 0.7);
    box-shadow:
      0 24px 60px -20px hsl(0 0% 0% / 0.32),
      0 8px 20px -8px hsl(0 0% 0% / 0.16);
    padding: 0;
    overflow: hidden;
    background: hsl(var(--card));
    animation: rgi-tour-pop 260ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes rgi-tour-pop {
    0%   { opacity: 0; transform: scale(0.97) translateY(6px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  .driver-popover.rgi-tour-popover::before {
    content: "";
    display: block;
    height: 2px;
    background: linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.35) 100%);
  }

  .driver-popover.rgi-tour-popover .driver-popover-title {
    font-family: 'Instrument Serif', 'Cormorant Garamond', Georgia, serif;
    font-size: 1.25rem;
    font-weight: 400;
    letter-spacing: -0.005em;
    line-height: 1.2;
    color: hsl(var(--foreground));
    padding: 1rem 1.15rem 0.3rem;
    padding-right: 2.5rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-description {
    font-size: 0.875rem;
    line-height: 1.55;
    color: hsl(var(--muted-foreground));
    padding: 0.25rem 1.15rem 0.85rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer {
    gap: 0.45rem;
    padding: 0.7rem 1.15rem 0.9rem;
    margin-top: 0;
    border-top: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--muted) / 0.18);
    align-items: center;
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer button {
    min-height: 34px;
    padding: 0 0.85rem;
    font-size: 0.82rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
    border: none;
    text-shadow: none;
  }

  .driver-popover.rgi-tour-popover .driver-popover-next-btn {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    box-shadow: 0 2px 6px -2px hsl(var(--primary) / 0.4);
  }
  .driver-popover.rgi-tour-popover .driver-popover-next-btn:hover {
    background: hsl(var(--primary) / 0.92);
    transform: translateY(-1px);
  }

  .driver-popover.rgi-tour-popover .driver-popover-prev-btn {
    background: transparent;
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border));
  }
  .driver-popover.rgi-tour-popover .driver-popover-prev-btn:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .driver-popover.rgi-tour-popover .driver-popover-close-btn {
    color: hsl(var(--muted-foreground) / 0.55);
    font-size: 1rem;
    width: 26px;
    height: 26px;
    top: 9px;
    right: 9px;
    border-radius: 6px;
    transition: all 140ms ease;
    line-height: 1;
  }
  .driver-popover.rgi-tour-popover .driver-popover-close-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .driver-popover.rgi-tour-popover .driver-popover-progress-text {
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground) / 0.65);
  }

  /* Dauerhaft-Schließen Link */
  .rgi-tour-dismiss-row {
    display: flex;
    justify-content: center;
    padding: 0.4rem 1.15rem 0.7rem;
    background: hsl(var(--muted) / 0.18);
    border-top: 1px dashed hsl(var(--border) / 0.5);
  }
  .rgi-tour-dismiss-btn {
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground) / 0.8);
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    transition: color 140ms ease, background 140ms ease;
  }
  .rgi-tour-dismiss-btn:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--muted) / 0.6);
  }

  .driver-active-element,
  .driver-active-element * {
    z-index: 10000;
  }
`;

const STYLE_ID = "rgi-tour-styles-v3";

function waitForElement(selector: string, timeoutMs = 1500): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = performance.now();
    const interval = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el || performance.now() - start > timeoutMs) {
        window.clearInterval(interval);
        resolve(el);
      }
    }, 80);
  });
}

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { progress, loading, markTour } = useTourProgress(user?.id);
  const driverRef = useRef<Driver | null>(null);
  const activeTourRef = useRef<string | null>(null);
  const [activeTick, setActiveTick] = useState(0);
  const [disabledTick, setDisabledTick] = useState(0);

  // CSS injizieren (versionierte ID, damit Updates wirken)
  useEffect(() => {
    // Alte Style-Tags entfernen
    document.querySelectorAll('style[id^="rgi-tour-styles"]').forEach((el) => {
      if (el.id !== STYLE_ID) el.remove();
    });
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.innerHTML = SENIOR_STYLES;
    document.head.appendChild(style);
  }, []);

  const disableTours = useCallback(() => {
    try {
      localStorage.setItem(DISABLE_KEY, "1");
    } catch {
      /* noop */
    }
    setDisabledTick((t) => t + 1);
    try {
      driverRef.current?.destroy();
    } catch {
      /* noop */
    }
  }, []);

  const enableTours = useCallback(() => {
    try {
      localStorage.removeItem(DISABLE_KEY);
    } catch {
      /* noop */
    }
    setDisabledTick((t) => t + 1);
  }, []);

  const isDisabled = useCallback(() => isToursDisabled(), [disabledTick]);

  const startTour = useCallback(
    async (tourId: string) => {
      const tour = TOURS_BY_ID[tourId];
      if (!tour || tour.steps.length === 0) return;

      try {
        driverRef.current?.destroy();
      } catch {
        /* noop */
      }

      const resolvedSteps: TourStep[] = [];
      for (const step of tour.steps) {
        if (!step.element) {
          resolvedSteps.push(step);
          continue;
        }
        const el = await waitForElement(step.element, 1500);
        if (el) resolvedSteps.push(step);
      }
      if (resolvedSteps.length === 0) {
        resolvedSteps.push(tour.steps[0]);
      }

      activeTourRef.current = tourId;
      setActiveTick((t) => t + 1);
      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 10,
        popoverOffset: 14,
        smoothScroll: true,
        popoverClass: "rgi-tour-popover",
        nextBtnText: "Weiter →",
        prevBtnText: "← Zurück",
        doneBtnText: "Verstanden",
        progressText: "Schritt {{current}} von {{total}}",
        steps: resolvedSteps.map((s) => ({
          element: s.element,
          popover: {
            title: s.title,
            description: s.description,
            side: s.element ? "bottom" : "over",
            align: "center",
            onPopoverRender: (popover: any) => {
              const root = popover?.wrapper as HTMLElement | undefined;
              if (!root) return;
              if (root.querySelector(".rgi-tour-dismiss-row")) return;
              const row = document.createElement("div");
              row.className = "rgi-tour-dismiss-row";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "rgi-tour-dismiss-btn";
              btn.textContent = "Hilfe dauerhaft ausblenden";
              btn.addEventListener("click", () => {
                disableTours();
              });
              row.appendChild(btn);
              root.appendChild(row);
            },
          },
        })),
        onDestroyStarted: () => {
          const active = d.isActive();
          const idx = d.getActiveIndex() ?? 0;
          const last = idx >= resolvedSteps.length - 1;
          if (active && !last) {
            markTour(tourId, "skipped");
          }
          d.destroy();
        },
        onDestroyed: () => {
          activeTourRef.current = null;
          setActiveTick((t) => t + 1);
        },
        onNextClick: () => {
          const idx = d.getActiveIndex() ?? 0;
          const last = idx >= resolvedSteps.length - 1;
          if (last) {
            markTour(tourId, "completed");
            d.destroy();
          } else {
            d.moveNext();
          }
        },
      });
      driverRef.current = d;
      d.drive();
    },
    [markTour, disableTours]
  );

  const guardedStartTour = useCallback(
    (tourId: string) => {
      if (isToursDisabled()) return;
      void startTour(tourId);
    },
    [startTour]
  );

  const hasSeen = useCallback(
    (tourId: string) => Boolean(progress?.[tourId]),
    [progress]
  );

  const isActive = useCallback(() => activeTourRef.current !== null, [activeTick]);

  useEffect(() => {
    if (loading || !user?.id || !progress) return;
    if (isToursDisabled()) return;
    if (!progress.global) {
      const t = window.setTimeout(() => guardedStartTour("global"), 800);
      return () => window.clearTimeout(t);
    }
  }, [loading, user?.id, progress, guardedStartTour]);

  useEffect(() => {
    return () => {
      try {
        driverRef.current?.destroy();
      } catch {
        /* noop */
      }
    };
  }, []);

  const value = useMemo<GuidedTourContextValue>(
    () => ({
      startTour: guardedStartTour,
      hasSeen,
      isActive,
      loading,
      isDisabled,
      enableTours,
    }),
    [guardedStartTour, hasSeen, isActive, loading, isDisabled, enableTours]
  );

  return (
    <GuidedTourContext.Provider value={value}>{children}</GuidedTourContext.Provider>
  );
}

export function useGuidedTour() {
  const ctx = useContext(GuidedTourContext);
  if (!ctx) {
    return {
      startTour: () => undefined,
      hasSeen: () => false,
      isActive: () => false,
      loading: true,
      isDisabled: () => false,
      enableTours: () => undefined,
    } as GuidedTourContextValue;
  }
  return ctx;
}

export function useAutoStartPageTour(tourId: string, options?: { delayMs?: number }) {
  const { startTour, hasSeen, isActive, loading, isDisabled } = useGuidedTour();
  const started = useRef(false);
  useEffect(() => {
    if (loading || started.current) return;
    if (isDisabled()) return;
    if (hasSeen(tourId)) return;
    if (isActive()) {
      const poll = window.setInterval(() => {
        if (!isActive() && !started.current && !hasSeen(tourId) && !isDisabled()) {
          window.clearInterval(poll);
          started.current = true;
          window.setTimeout(() => startTour(tourId), options?.delayMs ?? 600);
        }
      }, 500);
      return () => window.clearInterval(poll);
    }
    started.current = true;
    const t = window.setTimeout(() => startTour(tourId), options?.delayMs ?? 800);
    return () => window.clearTimeout(t);
  }, [loading, hasSeen, isActive, startTour, tourId, options?.delayMs, isDisabled]);
}
