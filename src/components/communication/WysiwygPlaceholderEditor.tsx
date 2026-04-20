import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PlaceholderSamples } from "./usePlaceholderSamples";

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export interface WysiwygPlaceholderEditorHandle {
  /** Insert a placeholder token like "{{anrede_brief}}" at the current caret. */
  insert: (token: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  samples?: PlaceholderSamples;
  placeholder?: string;
  singleLine?: boolean;
  minHeight?: number;
  monospace?: boolean;
  ariaLabel?: string;
}

/* ---------------- Serialization helpers ---------------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build a pill <span> for a placeholder key. */
function pillHtml(key: string, samples?: PlaceholderSamples): string {
  const display = samples?.[key] || `{{${key}}}`;
  // Use a non-breaking outer wrapper; contenteditable=false makes it atomic.
  return `<span data-placeholder="${escapeHtml(key)}" contenteditable="false" class="inline-block align-baseline px-1 py-px mx-px rounded bg-muted/60 text-muted-foreground border border-border/60 text-[0.95em] leading-tight cursor-default select-none" title="Platzhalter: {{${escapeHtml(key)}}}">${escapeHtml(display)}</span>`;
}

/** Convert a stored template string ("Hallo {{anrede_brief}}\n...") to editor HTML. */
function stringToHtml(value: string, samples: PlaceholderSamples | undefined, singleLine: boolean): string {
  if (!value) return "";
  let out = "";
  let last = 0;
  for (const m of value.matchAll(PLACEHOLDER_REGEX)) {
    const idx = m.index ?? 0;
    if (idx > last) out += escapeHtml(value.slice(last, idx)).replace(/\n/g, singleLine ? " " : "<br>");
    out += pillHtml(m[1], samples);
    last = idx + m[0].length;
  }
  if (last < value.length) out += escapeHtml(value.slice(last)).replace(/\n/g, singleLine ? " " : "<br>");
  return out;
}

/** Walk the editor DOM and reconstruct the template string with {{key}} tokens. */
function htmlToString(root: HTMLElement, singleLine: boolean): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const ph = el.getAttribute("data-placeholder");
    if (ph) {
      out += `{{${ph}}}`;
      return;
    }
    const tag = el.tagName;
    if (tag === "BR") {
      if (!singleLine) out += "\n";
      return;
    }
    // Block-ish elements introduce a newline before their content (after first).
    const isBlock = tag === "DIV" || tag === "P";
    if (isBlock && out.length > 0 && !out.endsWith("\n") && !singleLine) out += "\n";
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  // Normalize: collapse trailing spaces on lines
  if (singleLine) return out.replace(/\s+/g, " ").trim();
  return out;
}

/* ---------------- Component ---------------- */

export const WysiwygPlaceholderEditor = forwardRef<WysiwygPlaceholderEditorHandle, Props>(
  ({ value, onChange, onFocus, samples, placeholder, singleLine = false, minHeight = 220, monospace = false, ariaLabel }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    // Track the value we last wrote/read so we don't fight the user's caret on every keystroke.
    const lastSerialized = useRef<string>("");
    // Track the samples key so we know when to re-render pills only.
    const samplesSig = JSON.stringify(samples || {});

    /* Initialize / external value change */
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      if (value === lastSerialized.current) return; // came from our own onChange
      el.innerHTML = stringToHtml(value, samples, singleLine);
      lastSerialized.current = value;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, singleLine]);

    /* Refresh pill display text when samples change (keeps caret intact) */
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      const pills = el.querySelectorAll<HTMLElement>("[data-placeholder]");
      pills.forEach((p) => {
        const key = p.getAttribute("data-placeholder") || "";
        const display = samples?.[key] || `{{${key}}}`;
        if (p.textContent !== display) p.textContent = display;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [samplesSig]);

    /* Imperative API for parent (insert / focus) */
    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.focus(),
      insert: (token: string) => {
        const el = editorRef.current;
        if (!el) return;
        const m = token.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
        if (!m) {
          // Fallback: insert as plain text
          insertHtmlAtCaret(el, escapeHtml(token));
        } else {
          insertHtmlAtCaret(el, pillHtml(m[1], samples) + "&#8203;");
        }
        emitChange();
      },
    }));

    const emitChange = () => {
      const el = editorRef.current;
      if (!el) return;
      const next = htmlToString(el, singleLine);
      lastSerialized.current = next;
      onChange(next);
    };

    const handleInput = () => emitChange();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }
      if (!singleLine && e.key === "Enter") {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      const safe = singleLine ? text.replace(/\s+/g, " ") : text;
      // Convert {{key}} in pasted text into pills as well.
      const html = stringToHtml(safe, samples, singleLine);
      insertHtmlAtCaret(editorRef.current!, html);
      emitChange();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      e.preventDefault();
      // Place caret at drop point if browser supports it
      const docAny = document as any;
      if (typeof docAny.caretRangeFromPoint === "function") {
        const range: Range | null = docAny.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
      const m = data.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
      if (m) insertHtmlAtCaret(editorRef.current!, pillHtml(m[1], samples) + "&#8203;");
      else insertHtmlAtCaret(editorRef.current!, escapeHtml(data));
      emitChange();
    };

    const isEmpty = value.trim() === "";

    return (
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline={!singleLine}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          onFocus={onFocus}
          spellCheck
          className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 whitespace-pre-wrap break-words overflow-y-auto ${monospace ? "font-mono" : ""} ${singleLine ? "overflow-x-hidden" : ""}`}
          style={singleLine ? { minHeight: 38 } : { minHeight }}
        />
        {isEmpty && placeholder && (
          <div
            className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground/70 whitespace-pre-wrap"
            aria-hidden
          >
            {placeholder}
          </div>
        )}
      </div>
    );
  }
);
WysiwygPlaceholderEditor.displayName = "WysiwygPlaceholderEditor";

/* ---------------- caret helpers ---------------- */

function insertHtmlAtCaret(container: HTMLElement, html: string) {
  container.focus();
  const sel = window.getSelection();
  let range: Range;
  if (!sel || sel.rangeCount === 0 || !container.contains(sel.anchorNode)) {
    // Place caret at end
    range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
  } else {
    range = sel.getRangeAt(0);
  }
  range.deleteContents();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const frag = tpl.content;
  const lastNode = frag.lastChild;
  range.insertNode(frag);
  if (lastNode) {
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
  }
}
