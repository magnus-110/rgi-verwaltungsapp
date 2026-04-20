import type { PlaceholderSamples } from "./usePlaceholderSamples";

interface Props {
  subject: string;
  body: string;
  format: "html" | "plain";
  samples?: PlaceholderSamples;
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSubject(subject: string, samples?: PlaceholderSamples): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let i = 0;
  for (const m of subject.matchAll(PLACEHOLDER_REGEX)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) parts.push(subject.slice(lastIdx, idx));
    const key = m[1];
    const value = samples?.[key];
    parts.push(
      <span key={`p-${i++}`} className="text-muted-foreground" title={`Platzhalter: {{${key}}}`}>
        {value || `{{${key}}}`}
      </span>
    );
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < subject.length) parts.push(subject.slice(lastIdx));
  return parts.length === 0 ? <span className="text-muted-foreground italic">(kein Betreff)</span> : <>{parts}</>;
}

function renderPlainBody(body: string, samples?: PlaceholderSamples): React.ReactNode {
  return renderSubject(body, samples); // same logic; preserves \n via <pre>
}

function renderHtmlBody(body: string, samples?: PlaceholderSamples): string {
  // Replace placeholders inside HTML with a styled span (muted gray).
  return body.replace(PLACEHOLDER_REGEX, (_m, key) => {
    const value = samples?.[key];
    const display = value ? escapeHtml(value) : escapeHtml(`{{${key}}}`);
    return `<span style="color:hsl(var(--muted-foreground));" title="Platzhalter: {{${key}}}">${display}</span>`;
  });
}

export const EmailPreviewPane = ({ subject, body, format, samples }: Props) => {
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Betreff</div>
        <div className="text-sm font-medium">{renderSubject(subject, samples)}</div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-3 pt-2">Inhalt</div>
        {format === "plain" ? (
          <pre className="p-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">
            {body.trim() === "" ? (
              <span className="text-muted-foreground italic">(kein Inhalt)</span>
            ) : (
              renderPlainBody(body, samples)
            )}
          </pre>
        ) : (
          <iframe
            sandbox=""
            className="w-full min-h-[320px] rounded-b-md bg-background"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;padding:12px;color:#0f172a;}</style></head><body>${renderHtmlBody(body, samples) || '<em style="color:#94a3b8">(kein Inhalt)</em>'}</body></html>`}
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        Grau dargestellte Werte sind Platzhalter — bei jedem Empfänger werden die echten Daten eingesetzt.
      </p>
    </div>
  );
};
