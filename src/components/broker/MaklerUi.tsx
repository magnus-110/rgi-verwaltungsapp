import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBrokerAccess } from "@/hooks/useMakler";
import { cn } from "@/lib/utils";
import {
  LEAD_FARBE,
  LEAD_LABEL,
  STATUS_FARBE,
  STATUS_LABEL,
  quelleLabel,
  type LeadStatus,
  type ObjektStatus,
} from "@/lib/makler";

/** Nur Admins und freigeschaltete Mitarbeiter sehen den Maklerbereich. */
export function MaklerGuard({ children, nurAdmin }: { children: ReactNode; nurAdmin?: boolean }) {
  const { canUse, isAdmin, profile } = useBrokerAccess();
  if (!profile) return null;
  if (!canUse || (nurAdmin && !isAdmin)) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="font-display text-xl font-semibold mb-2">Kein Zugang</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {nurAdmin
            ? "Diese Seite können nur Administratoren öffnen."
            : "Der Makler-Bereich ist für Sie nicht freigeschaltet. Bitte wenden Sie sich an die Geschäftsleitung."}
        </p>
        <Button asChild className="h-11">
          <Link to={nurAdmin ? "/makler" : "/dashboard"}>Zurück</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function SeitenKopf({ titel, unter, rechts }: { titel: string; unter?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{titel}</h1>
        {unter && <p className="text-sm text-muted-foreground mt-1">{unter}</p>}
      </div>
      {rechts && <div className="flex flex-wrap items-center gap-2">{rechts}</div>}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: ObjektStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_FARBE[status] ?? STATUS_FARBE.entwurf, className)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function LeadBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", LEAD_FARBE[status] ?? LEAD_FARBE.neu, className)}>
      {LEAD_LABEL[status] ?? status}
    </span>
  );
}

export function QuelleChip({ quelle }: { quelle: string | null | undefined }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {quelleLabel(quelle)}
    </span>
  );
}

/** Segment-Auswahl (groß genug zum Tippen). */
export function Segmente<T extends string>({
  wert,
  optionen,
  onChange,
  className,
  disabled,
}: {
  wert: T;
  optionen: { key: NoInfer<T>; label: string }[];
  onChange: (v: NoInfer<T>) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-1 gap-1", className)} role="radiogroup">
      {optionen.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={wert === o.key}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex-1 min-h-10 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50",
            wert === o.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Eingabefeld, das erst beim Verlassen speichert (nie bei jedem Tastendruck).
 * Übernimmt neue Werte vom Server nur, solange man nicht gerade tippt.
 */
export function BlurInput({
  value,
  onSave,
  className,
  ...rest
}: {
  value: string | null | undefined;
  onSave: (v: string) => Promise<void> | void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  const [lokal, setLokal] = useState(value ?? "");
  const fokus = useRef(false);
  useEffect(() => {
    if (!fokus.current) setLokal(value ?? "");
  }, [value]);
  const speichern = async () => {
    fokus.current = false;
    if (lokal.trim() !== (value ?? "").trim()) await onSave(lokal.trim());
  };
  return (
    <Input
      {...rest}
      className={cn("h-11", className)}
      value={lokal}
      onFocus={() => (fokus.current = true)}
      onChange={(e) => setLokal(e.target.value)}
      onBlur={speichern}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLokal(value ?? "");
          fokus.current = false;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Einfache Rückfrage („Wirklich löschen?"). */
export function Rueckfrage({
  open,
  onOpenChange,
  titel,
  text,
  ja = "Löschen",
  nein = "Abbrechen",
  gefaehrlich = true,
  onJa,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titel: string;
  text?: ReactNode;
  ja?: string;
  nein?: string;
  gefaehrlich?: boolean;
  onJa: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titel}</AlertDialogTitle>
          {text && <AlertDialogDescription>{text}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">{nein}</AlertDialogCancel>
          <AlertDialogAction
            className={cn("h-11", gefaehrlich && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={() => void onJa()}
          >
            {ja}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LeerHinweis({ icon: Icon, titel, text, aktion }: { icon: typeof Lock; titel: string; text?: string; aktion?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{titel}</p>
      {text && <p className="text-sm text-muted-foreground mt-1">{text}</p>}
      {aktion && <div className="mt-4">{aktion}</div>}
    </div>
  );
}
