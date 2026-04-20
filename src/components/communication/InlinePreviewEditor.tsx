import { forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Eye } from "lucide-react";
import type { PlaceholderSamples } from "./usePlaceholderSamples";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onDrop?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  format: "html" | "plain";
  samples?: PlaceholderSamples;
  placeholder?: string;
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Editor that shows the raw text with {{placeholders}} in the textarea
 * and renders a live, fully-resolved preview directly below — so the user
 * sees the actual recipient values appear as they type.
 */
export const InlinePreviewEditor = forwardRef<HTMLTextAreaElement, Props>(
  ({ value, onChange, onFocus, onDrop, rows = 14, format, samples, placeholder }, ref) => {
    const renderedNodes = (() => {
      const parts: React.ReactNode[] = [];
      let lastIdx = 0;
      let i = 0;
      for (const m of value.matchAll(PLACEHOLDER_REGEX)) {
        const idx = m.index ?? 0;
        if (idx > lastIdx) parts.push(value.slice(lastIdx, idx));
        const key = m[1];
        const val = samples?.[key];
        parts.push(
          <span
            key={`p-${i++}`}
            className="text-muted-foreground bg-muted/50 rounded px-0.5"
            title={`Platzhalter: {{${key}}}`}
          >
            {val || `{{${key}}}`}
          </span>
        );
        lastIdx = idx + m[0].length;
      }
      if (lastIdx < value.length) parts.push(value.slice(lastIdx));
      return parts;
    })();

    return (
      <div className="space-y-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          onDrop={onDrop}
          rows={rows}
          className={format === "html" ? "font-mono text-sm" : "text-sm"}
          placeholder={placeholder}
        />
        <div className="rounded-md border bg-muted/20">
          <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3 w-3" /> Live-Vorschau (erster Empfänger)
          </div>
          {format === "plain" ? (
            <pre className="p-3 text-sm whitespace-pre-wrap font-sans leading-relaxed min-h-[120px]">
              {value.trim() === "" ? (
                <span className="text-muted-foreground italic">(noch kein Inhalt)</span>
              ) : (
                renderedNodes
              )}
            </pre>
          ) : (
            <iframe
              sandbox=""
              className="w-full min-h-[200px] rounded-b-md bg-background"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;padding:12px;color:#0f172a;} .ph{color:#64748b;background:#f1f5f9;border-radius:3px;padding:0 2px;}</style></head><body>${
                value.replace(PLACEHOLDER_REGEX, (_m, key) => {
                  const v = samples?.[key];
                  const text = (v || `{{${key}}}`).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                  return `<span class="ph" title="{{${key}}}">${text}</span>`;
                }) || '<em style="color:#94a3b8">(noch kein Inhalt)</em>'
              }</body></html>`}
            />
          )}
        </div>
      </div>
    );
  }
);
InlinePreviewEditor.displayName = "InlinePreviewEditor";
