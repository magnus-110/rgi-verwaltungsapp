import * as React from "react";
import { cn } from "@/lib/utils";

// Stabile E-Mail-Textarea. Die frühere Live-Link-Hervorhebung nutzte ein
// transparentes Textarea-Overlay über einem Backdrop-Div. Das ist bei Browser-
// Zoom, Resize und abweichenden Font-Metriken zu fragil: sichtbarer Text und
// native Cursor-/Klickposition können auseinanderlaufen. Deshalb rendert diese
// Komponente den Text wieder nativ in einer einzelnen <textarea>. Links werden
// weiterhin beim Senden über textToHtmlWithLinks in HTML umgewandelt.
const BASE_BOX =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans leading-6 tracking-normal text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap break-words box-border";

export interface LinkHighlightTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const LinkHighlightTextarea = React.forwardRef<
  HTMLTextAreaElement,
  LinkHighlightTextareaProps
>(({ className, style, ...props }, ref) => (
  <textarea
    className={cn(BASE_BOX, className)}
    style={{ caretColor: "hsl(var(--foreground))", ...(style || {}) }}
    ref={ref}
    {...props}
  />
));
LinkHighlightTextarea.displayName = "LinkHighlightTextarea";
