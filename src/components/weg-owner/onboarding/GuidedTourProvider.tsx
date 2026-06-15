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
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

/**
 * Styles für die Sprechblase – senior-tauglich, an die App-Designtokens angelehnt.
 * Eigene Klasse `.rgi-tour-popover`, damit driver.js Defaults nicht stören.
 */
const SENIOR_STYLES = `
  .driver-overlay {
    backdrop-filter: blur(3px);
  }

  .driver-popover.rgi-tour-popover {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    max-width: 380px;
    width: calc(100vw - 32px);
    border-radius: 20px;
    border: 1px solid hsl(var(--border) / 0.6);
    box-shadow:
      0 32px 80px -24px hsl(0 0% 0% / 0.35),
      0 12px 32px -12px hsl(0 0% 0% / 0.18),
      0 0 0 1px hsl(0 0% 100% / 0.04) inset;
    padding: 0;
    overflow: hidden;
    background: hsl(var(--card));
    animation: rgi-tour-pop 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes rgi-tour-pop {
    0%   { opacity: 0; transform: scale(0.97) translateY(8px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  .driver-popover.rgi-tour-popover::before {
    content: "";
    display: block;
    height: 3px;
    background: linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) 100%);
  }

  .driver-popover.rgi-tour-popover .driver-popover-title {
    font-family: 'Instrument Serif', 'Cormorant Garamond', Georgia, serif;
    font-size: 1.5rem;
    font-weight: 400;
    letter-spacing: -0.01em;
    line-height: 1.2;
    color: hsl(var(--foreground));
    padding: 1.25rem 1.5rem 0.35rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-description {
    font-size: 0.95rem;
    line-height: 1.6;
    letter-spacing: 0.005em;
    color: hsl(var(--muted-foreground));
    padding: 0.25rem 1.5rem 1rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer {
    gap: 0.5rem;
    padding: 0.85rem 1.5rem 1.1rem;
    margin-top: 0;
    border-top: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--muted) / 0.18);
    align-items: center;
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer button {
    min-height: 38px;
    padding: 0 0.95rem;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    border-radius: 8px;
    transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
    border: none;
    text-shadow: none;
  }

  .driver-popover.rgi-tour-popover .driver-popover-next-btn {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    box-shadow: 0 2px 8px -2px hsl(var(--primary) / 0.4);
  }
  .driver-popover.rgi-tour-popover .driver-popover-next-btn:hover {
    background: hsl(var(--primary) / 0.92);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px -2px hsl(var(--primary) / 0.5);
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
    color: hsl(var(--muted-foreground) / 0.6);
    font-size: 1.1rem;
    width: 28px;
    height: 28px;
    top: 10px;
    right: 10px;
    border-radius: 6px;
    transition: all 140ms ease;
  }
  .driver-popover.rgi-tour-popover .driver-popover-close-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .driver-popover.rgi-tour-popover .driver-popover-progress-text {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground) / 0.7);
  }

  .driver-active-element,
  .driver-active-element * {
    z-index: 10000;
  }
`;

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

  // CSS einmal injizieren
  useEffect(() => {
    if (document.getElementById("rgi-tour-styles")) return;
    const style = document.createElement("style");
    style.id = "rgi-tour-styles";
    style.innerHTML = SENIOR_STYLES;
    document.head.appendChild(style);
  }, []);

  const startTour = useCallback(
    async (tourId: string) => {
      const tour = TOURS_BY_ID[tourId];
      if (!tour || tour.steps.length === 0) return;

      // Vorhandene Instanz aufräumen
      try {
        driverRef.current?.destroy();
      } catch {
        /* noop */
      }

      // Schritte: nur die behalten, deren Element existiert (oder zentriert ohne element)
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
        // Wenigstens das erste Modal zeigen, damit etwas erscheint
        resolvedSteps.push(tour.steps[0]);
      }

      activeTourRef.current = tourId;
      setActiveTick((t) => t + 1);
      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 10,
        stageRadius: 10,
        popoverOffset: 18,
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
            // Bevorzugt unten; driver.js positioniert automatisch um, wenn zu wenig Platz
            side: s.element ? "bottom" : "over",
            align: "center",
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
    [markTour]
  );

  const hasSeen = useCallback(
    (tourId: string) => Boolean(progress?.[tourId]),
    [progress]
  );

  const isActive = useCallback(() => activeTourRef.current !== null, [activeTick]);

  // Globale Tour beim ersten Login automatisch starten
  useEffect(() => {
    if (loading || !user?.id || !progress) return;
    if (!progress.global) {
      const t = window.setTimeout(() => startTour("global"), 800);
      return () => window.clearTimeout(t);
    }
  }, [loading, user?.id, progress, startTour]);

  // Aufräumen bei Unmount
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
    () => ({ startTour, hasSeen, isActive, loading }),
    [startTour, hasSeen, isActive, loading]
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
    } as GuidedTourContextValue;
  }
  return ctx;
}

/**
 * Startet automatisch beim ersten Aufruf einer Seite die jeweilige Tour.
 * - läuft nur, wenn der Nutzer die Tour noch nie gesehen hat
 * - wartet, bis die globale Einführungstour beendet ist
 */
export function useAutoStartPageTour(tourId: string, options?: { delayMs?: number }) {
  const { startTour, hasSeen, isActive, loading } = useGuidedTour();
  const started = useRef(false);
  useEffect(() => {
    if (loading || started.current) return;
    if (hasSeen(tourId)) return;
    // Wenn aktuell eine Tour läuft (z. B. die globale Einführung), warten und später erneut prüfen
    if (isActive()) {
      const poll = window.setInterval(() => {
        if (!isActive() && !started.current && !hasSeen(tourId)) {
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
  }, [loading, hasSeen, isActive, startTour, tourId, options?.delayMs]);
}
