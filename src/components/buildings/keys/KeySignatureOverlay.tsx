import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "./SignaturePad";
import { RgiWordmark } from "@/components/onboarding/ui/RgiWordmark";
import { KeyTag } from "./types";
import { X, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (signaturePng: string) => void;
  tag: KeyTag;
  borrowerName: string;
  dueDate: string; // yyyy-MM-dd
  buildingLabel?: string;
}

export const KeySignatureOverlay = ({ open, onCancel, onConfirm, tag, borrowerName, dueDate, buildingLabel }: Props) => {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => { if (open) setPng(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onCancel]);

  if (!open) return null;

  const today = format(new Date(), "dd. MMMM yyyy", { locale: de });
  const dueLabel = dueDate ? format(new Date(dueDate + "T00:00:00"), "dd. MMMM yyyy", { locale: de }) : "—";

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="min-h-full flex items-start md:items-center justify-center p-4 md:p-10">
        <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start justify-between px-8 pt-8 pb-6 border-b border-border">
            <div className="flex items-center gap-4">
              <RgiWordmark />
              <div className="hidden md:block h-10 w-px bg-border" />
              <div className="hidden md:block">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Übergabeprotokoll</div>
                <div className="text-sm font-medium">Schlüssel-Quittung</div>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground transition-colors rounded-full p-1.5 hover:bg-muted"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-8 py-8 space-y-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Schlüssel-Übergabeprotokoll</h1>
              <div className="mt-1 text-sm text-muted-foreground">Ausgestellt am {today}</div>
              <div className="mt-4 h-px w-16 bg-primary" />
            </div>

            {/* Schlüssel-Details */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 rounded-xl border border-border bg-muted/30 px-6 py-5">
              <Detail label="Schlüssel-Nr." value={tag.tag_number} mono />
              <Detail label="Objekt" value={buildingLabel || "—"} />
              <Detail label="Rückgabe bis" value={dueLabel} />
            </div>

            {/* Vertragstext */}
            <div className="space-y-4 text-[15px] leading-relaxed text-foreground">
              <p>
                Hiermit bestätige ich, <span className="font-semibold">{borrowerName || "—"}</span>,
                am <span className="font-semibold">{today}</span> den oben bezeichneten Schlüssel
                von der <span className="font-semibold">RGI Immobilien GmbH &amp; Co. KG</span> in
                einwandfreiem Zustand erhalten zu haben.
              </p>
              <p className="text-muted-foreground">
                Ich verpflichte mich, den Schlüssel sorgfältig zu verwahren, nicht an Dritte
                weiterzugeben und ihn spätestens am <span className="font-semibold text-foreground">{dueLabel}</span>{" "}
                zurückzugeben. Bei Verlust oder Beschädigung ist die RGI Immobilien GmbH &amp; Co. KG
                unverzüglich zu informieren; etwaige Kosten für Ersatz oder den Austausch der
                Schließanlage trage ich gemäß den gesetzlichen Bestimmungen.
              </p>
            </div>

            {/* Signatur */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unterschrift Empfänger</div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Rechtsverbindlich erfasst
                </div>
              </div>
              <SignaturePad value={png} onChange={setPng} height={320} />
              <div className="pt-2">
                <div className="h-px bg-foreground/60 max-w-xs" />
                <div className="mt-1.5 text-xs text-muted-foreground">{borrowerName || "Empfänger"} · {today}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-8 py-5 border-t border-border bg-muted/20">
            <div className="text-[11px] text-muted-foreground">
              Mit dem Bestätigen wird die Unterschrift kryptografisch dem Vorgang zugeordnet.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
              <Button disabled={!png} onClick={() => png && onConfirm(png)}>
                Unterschrift bestätigen
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Detail = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
  </div>
);
