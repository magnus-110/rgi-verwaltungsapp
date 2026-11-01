import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Zeigt eine HTML-Signatur so an, wie sie beim Empfänger erscheint.
 * Gerendert in einem abgeschotteten iframe (keine Skripte, keine App-Styles),
 * die Höhe passt sich dem Inhalt an.
 */
export function SignaturePreview({
  html,
  text,
  className,
}: {
  html?: string | null;
  text?: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;}body{padding:4px 2px;display:flow-root;}a{pointer-events:none;}</style></head><body>${html}</body></html>`
    : "";

  useEffect(() => {
    const frame = ref.current;
    if (!frame || !html) return;
    let ro: ResizeObserver | undefined;
    // Höhe am Inhalt (body) messen – nicht am iframe selbst, sonst wächst es endlos mit.
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      setHeight(Math.ceil(body.getBoundingClientRect().height) + 12);
    };
    const onLoad = () => {
      measure();
      const win = frame.contentWindow as (Window & typeof globalThis) | null;
      const body = frame.contentDocument?.body;
      if (win?.ResizeObserver && body) {
        ro = new win.ResizeObserver(measure);
        ro.observe(body);
      }
      frame.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [html]);

  if (!html && !text) return null;

  if (!html) {
    return (
      <pre className={cn("whitespace-pre-wrap font-sans text-xs text-muted-foreground", className)}>{text}</pre>
    );
  }

  return (
    <iframe
      ref={ref}
      title="Signatur-Vorschau"
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      className={cn("w-full border-0 bg-white rounded", className)}
      style={{ height }}
    />
  );
}

/**
 * Signatur-Block im Schreibfenster: zeigt die Signatur des gewählten
 * Absender-Postfachs unter dem Textfeld, mit Schalter zum Abwählen.
 */
export function ComposeSignatureBlock({
  account,
  include,
  onIncludeChange,
  hasQuote,
  className,
}: {
  account?: { signature_rich_html?: string | null; signature_text?: string | null; signature_html?: string | null } | null;
  include: boolean;
  onIncludeChange: (v: boolean) => void;
  hasQuote?: boolean;
  className?: string;
}) {
  const html = (account?.signature_rich_html || "").trim();
  const text = (account?.signature_text || account?.signature_html || "").trim();
  if (!html && !text) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer w-fit">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={include}
          onChange={(e) => onIncludeChange(e.target.checked)}
        />
        Signatur anhängen
        {include && hasQuote && <span className="text-[11px]">(wird über der zitierten Nachricht eingefügt)</span>}
      </label>
      {include && (
        <div className="border rounded-md p-2 bg-white">
          <SignaturePreview html={html || null} text={html ? null : text} />
        </div>
      )}
    </div>
  );
}
