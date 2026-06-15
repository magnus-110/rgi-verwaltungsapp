import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { TOURS_BY_ID, type TourStep } from "./tours";
import { useTourProgress } from "./tourProgress";

interface GuidedTourContextValue {
  startTour: (tourId: string) => void;
  hasSeen: (tourId: string) => boolean;
  loading: boolean;
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

const SENIOR_STYLES = `
  .driver-popover.rgi-tour-popover { font-family: inherit; max-width: 420px; border-radius: 14px; box-shadow: 0 20px 60px hsl(0 0% 0% / 0.25); }
  .driver-popover.rgi-tour-popover .driver-popover-title { font-size: 1.25rem; font-weight: 700; line-height: 1.3; margin-bottom: 0.5rem; }
  .driver-popover.rgi-tour-popover .driver-popover-description { font-size: 1.0625rem; line-height: 1.55; }
  .driver-popover.rgi-tour-popover .driver-popover-footer { gap: 0.5rem; margin-top: 1rem; }
  .driver-popover.rgi-tour-popover .driver-popover-footer button { min-height: 44px; padding: 0 1rem; font-size: 1rem; border-radius: 8px; }
  .driver-popover.rgi-tour-popover .driver-popover-next-btn { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); text-shadow: none; border: none; }
  .driver-popover.rgi-tour-popover .driver-popover-prev-btn { background: hsl(var(--muted)); color: hsl(var(--foreground)); text-shadow: none; border: none; }
  .driver-popover.rgi-tour-popover .driver-popover-close-btn { font-size: 1.5rem; width: 32px; height: 32px; }
  .driver-popover.rgi-tour-popover .driver-popover-progress-text { font-size: 0.9rem; color: hsl(var(--muted-foreground)); }
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
        const el = await waitForElement(step.element, 800);
        if (el) resolvedSteps.push(step);
      }
      if (resolvedSteps.length === 0) {
        // Wenigstens das erste Modal zeigen, damit etwas erscheint
        resolvedSteps.push(tour.steps[0]);
      }

      activeTourRef.current = tourId;
      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.65,
        stagePadding: 6,
        stageRadius: 8,
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
          },
        })),
        onDestroyStarted: () => {
          // Bei "X" zuerst nachfragen-light: einfach markieren als skipped, wenn nicht durch
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
        },
      });
      driverRef.current = d;
      // Hook: wenn der Nutzer durchklickt bis zum Ende, markieren wir completed
      const origDone = (d as unknown as { drive: () => void }).drive;
      d.drive();
      void origDone;

      // Auf das "Verstanden"-Klick reagieren: driver.js destroyt; wir prüfen Index in onDestroyStarted.
      // Zusätzlich: completed setzen, wenn letzter Schritt erreicht und geschlossen wird.
      const observer = () => {
        if (!d.isActive() && activeTourRef.current === tourId) {
          const idx = d.getActiveIndex() ?? 0;
          if (idx >= resolvedSteps.length - 1) {
            markTour(tourId, "completed");
          }
          window.removeEventListener("click", observer, true);
        }
      };
      window.addEventListener("click", observer, true);
    },
    [markTour]
  );

  const hasSeen = useCallback(
    (tourId: string) => Boolean(progress?.[tourId]),
    [progress]
  );

  // Globale Tour beim ersten Login automatisch starten
  useEffect(() => {
    if (loading || !user?.id || !progress) return;
    if (!progress.global) {
      // kurze Verzögerung, damit Layout & Logo gerendert sind
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
    () => ({ startTour, hasSeen, loading }),
    [startTour, hasSeen, loading]
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
      loading: true,
    } as GuidedTourContextValue;
  }
  return ctx;
}

/**
 * Startet automatisch beim ersten Aufruf einer Seite die jeweilige Tour.
 * Sobald `hasSeen(tourId)` true ist, passiert nichts mehr.
 */
export function useAutoStartPageTour(tourId: string, options?: { delayMs?: number }) {
  const { startTour, hasSeen, loading } = useGuidedTour();
  const started = useRef(false);
  useEffect(() => {
    if (loading || started.current) return;
    if (hasSeen(tourId)) return;
    started.current = true;
    const t = window.setTimeout(() => startTour(tourId), options?.delayMs ?? 600);
    return () => window.clearTimeout(t);
  }, [loading, hasSeen, startTour, tourId, options?.delayMs]);
}
