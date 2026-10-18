import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Monitor, Play, Square, ExternalLink } from 'lucide-react';
import { DisplaySettings, DisplaySlide, SlideConfig, SlideKind } from '@/lib/schaufenster';

interface DisplayPreviewProps {
  /** Die gerade bearbeitete Folie – wird live übertragen */
  slide: { kind: SlideKind; config: SlideConfig } | null;
  /** Alle aktiven Folien, für die Abspielen-Ansicht */
  alleSlides: DisplaySlide[];
  settings: DisplaySettings;
}

// Die Anzeigeseite liegt auf der Website und holt ihre Daten aus der App.
const DISPLAY_ORIGIN = 'https://rgi-immobilien.de';
const BREITE = 1080;
const HOEHE = 1920;

/**
 * Zeigt die echte Anzeigeseite in einem Rahmen.
 *
 * Es ist bewusst keine Nachbildung: eingebettet wird /display/
 * selbst, nur im Vorschaumodus. Dadurch sieht man exakt dieselbe
 * Schrift, dieselben Abstände und dieselbe Logik wie später im
 * Schaufenster – die beiden können gar nicht auseinanderlaufen.
 */
const DisplayPreview: React.FC<DisplayPreviewProps> = ({ slide, alleSlides, settings }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const huelleRef = useRef<HTMLDivElement>(null);
  const [bereit, setBereit] = useState(false);
  const [spieltAb, setSpieltAb] = useState(false);
  const [skalierung, setSkalierung] = useState(0.25);

  // Auf die Bereitmeldung der Anzeigeseite warten
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== DISPLAY_ORIGIN) return;
      if (ev.data && ev.data.typ === 'rgi-display-bereit') setBereit(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Vorschau in die verfügbare Breite einpassen
  useEffect(() => {
    const messen = () => {
      const el = huelleRef.current;
      if (!el) return;
      const verfuegbar = el.clientWidth;
      setSkalierung(Math.max(0.12, Math.min(0.5, verfuegbar / BREITE)));
    };
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, []);

  const senden = useCallback((nachricht: Record<string, unknown>) => {
    const fenster = iframeRef.current?.contentWindow;
    if (!fenster) return;
    fenster.postMessage({ typ: 'rgi-display', ...nachricht }, DISPLAY_ORIGIN);
  }, []);

  // Bei jeder Änderung im Editor sofort neu zeichnen
  useEffect(() => {
    if (!bereit || spieltAb || !slide) return;
    senden({ aktion: 'folie', slide, settings });
  }, [bereit, spieltAb, slide, settings, senden]);

  const abspielen = () => {
    setSpieltAb(true);
    senden({
      aktion: 'schleife',
      slides: alleSlides.filter((s) => s.is_active),
      settings,
    });
  };

  const anhalten = () => {
    setSpieltAb(false);
    if (slide) senden({ aktion: 'folie', slide, settings });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Monitor className="w-4 h-4 text-primary" />
          Vorschau
          <span className="text-xs font-normal text-gray-400">
            1080 × 1920 · {Math.round(skalierung * 100)} %
          </span>
        </div>
        <div className="flex items-center gap-2">
          {spieltAb ? (
            <Button size="sm" variant="outline" onClick={anhalten}>
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Anhalten
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={abspielen}>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Schleife abspielen
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <a href={`${DISPLAY_ORIGIN}/display/`} target="_blank" rel="noopener noreferrer" title="In neuem Tab öffnen">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div
        ref={huelleRef}
        className="rounded-xl border border-gray-200 bg-gray-100 p-3 overflow-hidden"
      >
        <div
          className="relative mx-auto bg-white shadow-lg rounded-lg overflow-hidden"
          style={{ width: BREITE * skalierung, height: HOEHE * skalierung }}
        >
          <iframe
            ref={iframeRef}
            title="Vorschau der Schaufensteranzeige"
            src={`${DISPLAY_ORIGIN}/display/?vorschau=1`}
            width={BREITE}
            height={HOEHE}
            className="border-0 origin-top-left"
            style={{ transform: `scale(${skalierung})` }}
          />
          {!bereit && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-gray-500">
              Vorschau wird geladen …
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Die Vorschau zeigt die echte Anzeigeseite, nicht eine Nachbildung. Änderungen im Editor
        erscheinen sofort – gespeichert sind sie damit noch nicht.
      </p>
    </div>
  );
};

export default DisplayPreview;
