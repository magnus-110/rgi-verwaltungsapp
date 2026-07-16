import * as React from "react";
import { cn } from "@/lib/utils";

// Textarea mit Link-Hervorhebung: URLs werden beim Schreiben blau/unterstrichen
// dargestellt. Technik: Ein deckungsgleiches Backdrop-Div rendert den Text
// (Links eingefärbt), die eigentliche Textarea darüber schreibt transparent —
// nur der Cursor bleibt sichtbar. Scroll wird synchronisiert.
//
// WICHTIG: Backdrop und Textarea MÜSSEN pixelgenau identische Textmetriken
// haben (font-family, font-size, line-height, letter-spacing, padding, border,
// box-sizing, whitespace/word-break). Sonst driftet der Backdrop-Text gegen-
// über der echten (unsichtbaren) Textarea, was sich als „verschobener" Text
// und daneben klickender Cursor äußert. Browser haben für <textarea> eigene
// Default-Fonts (oft Monospace) — deshalb erzwingen wir `font: inherit` per
// inline-style zusätzlich zu den Tailwind-Klassen.

const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

// Muss den Basis-Klassen von components/ui/textarea.tsx entsprechen (Box/Font)
// + explizite Font-Metriken, damit Backdrop und Textarea deckungsgleich sind.
const BASE_BOX =
  "min-h-[80px] w-full rounded-md border px-3 py-2 text-sm font-sans leading-6 tracking-normal whitespace-pre-wrap break-words box-border";

const SHARED_STYLE: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.875rem", // text-sm
  lineHeight: "1.5rem", // leading-6
  letterSpacing: "normal",
  fontFamily: "inherit",
  tabSize: 4,
};

function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(URL_REGEX)) {
    parts.push(text.slice(last, m.index));
    let url = m[0];
    const trail = url.match(/[),.;:!?\]}>»"']+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, url.length - trail.length);
    parts.push(
      <span key={key++} className="text-blue-600 underline dark:text-blue-400">
        {url}
      </span>,
    );
    if (trail) parts.push(trail);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  // Zero-width space, damit eine leere letzte Zeile Höhe bekommt
  parts.push("​");
  return parts;
}

export interface LinkHighlightTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const LinkHighlightTextarea = React.forwardRef<
  HTMLTextAreaElement,
  LinkHighlightTextareaProps
>(({ className, value, onScroll, style, ...props }, ref) => {
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  const syncScroll = (e?: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current && innerRef.current) {
      backdropRef.current.scrollTop = innerRef.current.scrollTop;
      backdropRef.current.scrollLeft = innerRef.current.scrollLeft;
    }
    if (e && onScroll) onScroll(e);
  };

  const text = typeof value === "string" ? value : "";

  return (
    <div className="relative w-full">
      {/* Backdrop: gerenderter Text mit eingefärbten Links */}
      <div
        ref={backdropRef}
        aria-hidden
        className={cn(
          BASE_BOX,
          "border-transparent text-foreground",
          className,
          "absolute inset-0 overflow-hidden pointer-events-none select-none",
        )}
        style={SHARED_STYLE}
      >
        {renderWithLinks(text)}
      </div>
      {/* Echte Textarea: transparenter Text, sichtbarer Cursor */}
      <textarea
        className={cn(
          BASE_BOX,
          "flex border-input bg-transparent ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
          "relative text-transparent",
        )}
        style={{ ...SHARED_STYLE, caretColor: "hsl(var(--foreground))", ...(style || {}) }}
        ref={setRefs}
        value={value}
        onScroll={syncScroll}
        {...props}
      />
    </div>
  );
});
LinkHighlightTextarea.displayName = "LinkHighlightTextarea";
