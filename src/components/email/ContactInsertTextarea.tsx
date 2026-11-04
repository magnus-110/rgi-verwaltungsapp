import * as React from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2, User, ChevronLeft } from "lucide-react";
import { useContactCards } from "@/hooks/useContactCards";
import {
  findTrigger,
  searchContacts,
  contactFields,
  initialSelection,
  rememberSelection,
  formatBlock,
  insertBlock,
  type ContactCard,
} from "@/lib/contactInsert";

interface Props extends Omit<TextareaProps, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
}

// Pixelposition des Cursors im Textfeld (Spiegel-Div-Technik)
function caretCoords(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement("div");
  const cs = window.getComputedStyle(el);
  const props = [
    "boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight",
    "fontStretch", "fontSize", "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
    "letterSpacing", "wordSpacing", "tabSize",
  ] as const;
  for (const p of props) (div.style as unknown as Record<string, string>)[p] = cs[p];
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.overflow = "hidden";
  div.textContent = el.value.slice(0, pos);
  const span = document.createElement("span");
  span.textContent = el.value.slice(pos) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const top = span.offsetTop - el.scrollTop + lh;
  const left = span.offsetLeft - el.scrollLeft;
  document.body.removeChild(div);
  return { top, left };
}

/**
 * Textfeld für den Mailtext: "#" + Name tippt → Kontaktliste → Angaben anhaken → als Block einfügen.
 */
export const ContactInsertTextarea = React.forwardRef<HTMLTextAreaElement, Props>(
  ({ value, onValueChange, wrapperClassName, onKeyDown, className, ...rest }, fwdRef) => {
    const ref = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(fwdRef, () => ref.current as HTMLTextAreaElement);

    const [trigger, setTrigger] = React.useState<{ start: number; query: string; caret: number } | null>(null);
    const [active, setActive] = React.useState(0);
    const [picked, setPicked] = React.useState<ContactCard | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [pos, setPos] = React.useState({ top: 0, left: 0 });
    const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);

    const { data: cards = [], isLoading } = useContactCards(true);
    const matches = React.useMemo(
      () => (trigger && !picked ? searchContacts(cards, trigger.query) : []),
      [cards, trigger, picked],
    );
    const fields = React.useMemo(() => (picked ? contactFields(picked) : []), [picked]);
    const open = !!trigger && (picked !== null || matches.length > 0 || isLoading);

    const close = React.useCallback(() => {
      if (trigger) setDismissedAt(trigger.start);
      setTrigger(null);
      setPicked(null);
      setActive(0);
    }, [trigger]);

    const evaluate = React.useCallback(() => {
      const el = ref.current;
      if (!el) return;
      const caret = el.selectionStart ?? 0;
      if (el.selectionEnd !== caret) return setTrigger(null);
      const t = findTrigger(el.value, caret);
      if (!t || t.start === dismissedAt) {
        if (!t) setDismissedAt(null);
        setTrigger(null);
        setPicked(null);
        return;
      }
      setTrigger({ ...t, caret });
      setActive(0);
      setPicked(null);
      const c = caretCoords(el, t.start);
      const maxLeft = Math.max(0, el.clientWidth - 340);
      setPos({ top: el.offsetTop + c.top + 4, left: el.offsetLeft + Math.min(Math.max(0, c.left), maxLeft) });
    }, [dismissedAt]);

    const choose = (c: ContactCard) => {
      const fs = contactFields(c);
      setPicked(c);
      setSelected(initialSelection(c, fs));
    };

    const doInsert = () => {
      const el = ref.current;
      if (!el || !trigger || !picked || selected.size === 0) return;
      const block = formatBlock(fields, selected);
      rememberSelection(picked.id, fields.filter((f) => selected.has(f.key)).map((f) => f.key));
      const res = insertBlock(value, trigger.start, trigger.caret, block);
      onValueChange(res.text);
      setTrigger(null);
      setPicked(null);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(res.caret, res.caret);
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (picked) setPicked(null);
          else close();
          return;
        }
        if (!picked && matches.length) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            choose(matches[active] ?? matches[0]);
            return;
          }
        } else if (picked && e.key === "Enter") {
          e.preventDefault();
          doInsert();
          return;
        }
      }
      onKeyDown?.(e);
    };

    const toggle = (k: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });

    return (
      <div className={cn("relative flex flex-col", wrapperClassName)}>
        <Textarea
          {...rest}
          ref={ref}
          value={value}
          className={className}
          onChange={(e) => {
            onValueChange(e.target.value);
            requestAnimationFrame(evaluate);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) evaluate();
          }}
          onClick={evaluate}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.parentElement?.contains(next)) return;
            setTimeout(() => {
              if (!ref.current?.parentElement?.contains(document.activeElement)) {
                setTrigger(null);
                setPicked(null);
              }
            }, 150);
          }}
        />
        {open && (
          <div
            className="absolute z-50 w-[min(340px,calc(100%-1rem))] rounded-md border bg-popover text-popover-foreground shadow-md"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={(e) => {
              if (!(e.target as HTMLElement).closest("button,[role=checkbox],label")) e.preventDefault();
            }}
          >
            {!picked ? (
              <div className="py-1 max-h-72 overflow-y-auto">
                {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Kontakte werden geladen …</div>}
                {matches.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-1.5 flex items-start gap-2 text-sm",
                      i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                  >
                    {c.companyName ? (
                      <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <User className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.displayName}</span>
                      {c.subtitle && <span className="block truncate text-xs text-muted-foreground">{c.subtitle}</span>}
                    </span>
                  </button>
                ))}
                <div className="px-3 pt-1 pb-1 text-[11px] text-muted-foreground border-t mt-1">
                  ↑↓ auswählen · Enter übernehmen · Esc schließen
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1 px-2 py-2 border-b bg-muted/40">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPicked(null)} aria-label="Zurück zur Liste">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{picked.displayName}</div>
                    {picked.subtitle && <div className="text-xs text-muted-foreground truncate">{picked.subtitle}</div>}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-1.5">
                  {fields.map((f) => (
                    <label key={f.key} className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selected.has(f.key)} onCheckedChange={() => toggle(f.key)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="text-muted-foreground">{f.label}: </span>
                        <span className="break-words">{f.value}</span>
                      </span>
                    </label>
                  ))}
                  {fields.length <= 1 && (
                    <div className="text-xs text-muted-foreground">Keine Telefonnummer oder E-Mail hinterlegt.</div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t">
                  <span className="text-[11px] text-muted-foreground">Enter einfügen · Esc zurück</span>
                  <Button type="button" size="sm" onClick={doInsert} disabled={selected.size === 0}>
                    Einfügen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
ContactInsertTextarea.displayName = "ContactInsertTextarea";
