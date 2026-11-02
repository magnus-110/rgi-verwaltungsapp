import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { anzeigeStatus, STATUS_STIL, SIG, type SignRequest } from "@/lib/signatur";

/** Pill-Badge wie im Mockup (v02): Offen · Gesendet · Abgeschlossen · Abgelaufen · Zurückgezogen. */
export function SignaturStatusBadge({
  request, className,
}: { request: Pick<SignRequest, "status" | "signers">; className?: string }) {
  const stil = STATUS_STIL[anzeigeStatus(request)];
  return <Pill color={stil.color} bg={stil.bg} className={className}>{stil.text}</Pill>;
}

/** Allgemeine Pille (z. B. „2 von 3“, „1 von 3 unterschrieben“). */
export function Pill({
  children, color = SIG.button, bg = SIG.orangeBg, className, style,
}: { children: ReactNode; color?: string; bg?: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-4", className)}
      style={{ color, backgroundColor: bg, ...style }}
    >
      {children}
    </span>
  );
}
