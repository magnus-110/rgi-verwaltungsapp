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
    backdrop-filter: blur(2px);
  }

  .driver-popover.rgi-tour-popover {
    font-family: inherit;
    max-width: 360px;
    width: calc(100vw - 32px);
    border-radius: 18px;
    border: 1px solid hsl(var(--border));
    box-shadow:
      0 24px 60px -12px hsl(0 0% 0% / 0.28),
      0 8px 24px -8px hsl(0 0% 0% / 0.18);
    padding: 0;
    overflow: hidden;
    background: hsl(var(--card));
    animation: rgi-tour-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes rgi-tour-pop {
    0%   { opacity: 0; transform: scale(0.96) translateY(6px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Akzent-Streifen oben */
  .driver-popover.rgi-tour-popover::before {
    content: "";
    display: block;
    height: 4px;
    background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.55));
  }

  .driver-popover.rgi-tour-popover .driver-popover-title {
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.3;
    color: hsl(var(--foreground));
    padding: 1rem 1.25rem 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-title::before {
    content: "";
    display: inline-block;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: hsl(var(--primary) / 0.12);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ea580c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'/><path d='M9 18h6'/><path d='M10 22h4'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 18px 18px;
    flex-shrink: 0;
  }

  .driver-popover.rgi-tour-popover .driver-popover-description {
    font-size: 1rem;
    line-height: 1.55;
    color: hsl(var(--muted-foreground));
    padding: 0.25rem 1.25rem 0.75rem;
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer {
    gap: 0.5rem;
    padding: 0.75rem 1.25rem 1rem;
    margin-top: 0;
    border-top: 1px solid hsl(var(--border) / 0.6);
    background: hsl(var(--muted) / 0.25);
  }

  .driver-popover.rgi-tour-popover .driver-popover-footer button {
    min-height: 44px;
    padding: 0 1rem;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 10px;
    transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
    border: none;
    text-shadow: none;
  }
  .driver-popover.rgi-tour-popover .driver-popover-footer button:hover {
    transform: translateY(-1px);
  }

  .driver-popover.rgi-tour-popover .driver-popover-next-btn {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }
  .driver-popover.rgi-tour-popover .driver-popover-next-btn:hover {
    background: hsl(var(--primary) / 0.92);
  }

  .driver-popover.rgi-tour-popover .driver-popover-prev-btn {
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
  }
  .driver-popover.rgi-tour-popover .driver-popover-prev-btn:hover {
    background: hsl(var(--muted));
  }

  .driver-popover.rgi-tour-popover .driver-popover-close-btn {
    color: hsl(var(--muted-foreground));
    font-size: 1.2rem;
    width: 32px;
    height: 32px;
    top: 8px;
    right: 8px;
    border-radius: 8px;
    transition: background 120ms ease, color 120ms ease;
  }
  .driver-popover.rgi-tour-popover .driver-popover-close-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .driver-popover.rgi-tour-popover .driver-popover-progress-text {
    font-size: 0.85rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    letter-spacing: 0.01em;
  }

  /* Spotlight-Aussparung: dezenter Glow */
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
