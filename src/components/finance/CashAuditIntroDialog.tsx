import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Sparkles, ArrowLeft, ArrowRight, FileText, Repeat, CheckCircle2, AlertTriangle,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  buildingName?: string;
  fiscalYear?: number | string;
}

const TOTAL_STEPS = 5;

export function CashAuditIntroDialog({ open, onClose, buildingName, fiscalYear }: Props) {
  const [step, setStep] = useState(1);
  const [dontShow, setDontShow] = useState(true);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));
  const finish = () => onClose(dontShow);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background">
        <DialogTitle className="sr-only">Einführung Kassenprüfung</DialogTitle>

        <div className="px-10 pt-10 pb-7 h-[720px] flex flex-col">
          {/* Card */}
          <div className="flex-1 min-h-0 bg-card rounded-[20px] border border-border/50 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            <div className="h-1 bg-primary shrink-0" />
            <div className="px-10 py-8 flex-1 min-h-0 overflow-y-auto">
              {step === 1 && <StepWelcome buildingName={buildingName} fiscalYear={fiscalYear} onStart={next} />}
              {step === 2 && <StepTabs />}
              {step === 3 && <StepBookings />}
              {step === 4 && <StepTemplates />}
              {step === 5 && <StepInternal />}
            </div>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i + 1 === step ? "w-7 bg-primary" : "w-1.5 bg-muted"
                )}
              />
            ))}
          </div>

          {/* Footer */}
          {step > 1 && (
            <div className="mt-6 space-y-3">
              {step === TOTAL_STEPS && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer justify-center">
                  <Checkbox checked={dontShow} onCheckedChange={(c) => setDontShow(!!c)} />
                  Nicht mehr automatisch anzeigen
                </label>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={back} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </Button>
                <div className="flex-1" />
                {step < TOTAL_STEPS ? (
                  <Button onClick={next} className="gap-1.5 h-11 px-7 rounded-[12px]">
                    Weiter <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={finish} className="h-11 px-7 rounded-[12px]">
                    Verstanden, los geht's
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----- Shared ----- */

function StepTitle({ kicker, title, lead }: { kicker?: string; title: string; lead?: string }) {
  return (
    <div className="space-y-3 mb-7">
      {kicker && (
        <div className="text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
          {kicker}
        </div>
      )}
      <h2 className="font-display !font-normal text-[30px] leading-[1.15] tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {lead && <p className="text-[15px] leading-[1.6] text-muted-foreground max-w-[55ch]">{lead}</p>}
    </div>
  );
}

/* ----- Steps ----- */

function StepWelcome({
  buildingName, fiscalYear, onStart,
}: { buildingName?: string; fiscalYear?: number | string; onStart: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-6">
      <div className="size-14 rounded-full bg-primary/10 grid place-items-center mb-6">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h1 className="font-display !font-normal text-[34px] leading-[1.15] tracking-[-0.01em] text-foreground max-w-[22ch]">
        Herzlich willkommen
        <br />
        zur <span className="text-primary font-medium">digitalen Kassenprüfung</span>
      </h1>
      <p className="mt-5 text-[15.5px] leading-[1.7] text-muted-foreground max-w-[48ch]">
        Schön, dass Sie sich Zeit für die Prüfung nehmen.
        {buildingName && (
          <> Sie prüfen die Kasse der <span className="font-medium text-foreground">WEG {buildingName}</span>
          {fiscalYear && <> für das Wirtschaftsjahr <span className="font-medium text-foreground">{fiscalYear}</span></>}.</>
        )}{" "}
        In wenigen Schritten erklären wir Ihnen, wie alles funktioniert.
      </p>
      <Button onClick={onStart} className="mt-9 h-12 px-8 text-[15px] rounded-[12px] shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.4)]">
        Jetzt loslegen
      </Button>
    </div>
  );
}

/* Renders the actual TabsList visual that the auditor will see */
function FakeTabsPreview({ active }: { active: "konten" | "journal" | "dokumente" | "hinweise" }) {
  const tabs: { id: typeof active; label: string }[] = [
    { id: "konten", label: "Kontenblätter" },
    { id: "journal", label: "Buchungsjournal" },
    { id: "dokumente", label: "Dokumente" },
    { id: "hinweise", label: "Hinweise" },
  ];
  return (
    <div className="rounded-[10px] border border-border/60 bg-background overflow-hidden">
      <div className="flex border-b border-border/60">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              className={cn(
                "flex-1 min-w-0 px-1.5 py-2 text-[10px] font-medium border-b-2 -mb-px text-center truncate",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {t.label}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2.5 text-[10.5px] text-muted-foreground bg-muted/20">
        Inhalt von <span className="font-medium text-foreground">{tabs.find((t) => t.id === active)?.label}</span>
      </div>
    </div>
  );
}

function StepTabs() {
  const rows = [
    {
      tab: "konten" as const,
      title: "Kontenblätter",
      body: "Zeigt jedes Konto (z. B. Bank, Hausgeld-Eingänge, Versicherung) mit Anfangs- und Endsaldo sowie allen Einzelbuchungen darunter. Ideal, um systematisch Konto für Konto zu prüfen und abzuhaken.",
    },
    {
      tab: "journal" as const,
      title: "Buchungsjournal",
      body: "Alle Buchungen des Wirtschaftsjahres in chronologischer Reihenfolge. Mit Such- und Monatsfilter eignet es sich für stichprobenartige Prüfungen.",
    },
    {
      tab: "dokumente" as const,
      title: "Dokumente",
      body: "Sammlung aller relevanten Belege: Bankauszüge, Rechnungen, Verträge und Versicherungspolicen zum Quervergleich.",
    },
    {
      tab: "hinweise" as const,
      title: "Hinweise",
      body: "Notizen des Verwalters zu Besonderheiten des Wirtschaftsjahres – z. B. ungewöhnliche Ausgaben, Vorabklärungen oder Sondersituationen.",
    },
  ];
  return (
    <div>
      <StepTitle kicker="Schritt 1" title="Die vier Tabs der Prüfung" lead="Oben in der Kassenprüfung finden Sie diese vier Bereiche. So sehen sie aus:" />
      <div className="space-y-5">
        {rows.map((r) => (
          <div key={r.tab} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 items-start">
            <FakeTabsPreview active={r.tab} />
            <div>
              <div className="text-[15px] font-semibold text-foreground mb-1">{r.title}</div>
              <p className="text-[13.5px] text-muted-foreground leading-relaxed">{r.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepBookings() {
  return (
    <div>
      <StepTitle
        kicker="Schritt 2"
        title="Buchungen prüfen"
        lead="Klicken Sie im Journal oder Kontenblatt auf eine beliebige Buchung – es öffnet sich eine Detailansicht mit dem dazugehörigen Beleg."
      />

      {/* Fake booking row, identisch zum echten Look */}
      <div className="rounded-[12px] border bg-card p-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5 px-1.5 py-0.5 rounded bg-muted/50">
            14.03.2025
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Stadtwerke – Stromabrechnung Allgemein</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground">4360 Strom Allgemein</span>
              <span className="text-[11px] text-muted-foreground">↔ 1200 Bank</span>
              <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                <FileText className="h-2.5 w-2.5" /> Rechnung
              </Badge>
            </div>
          </div>
          <span className="text-sm font-mono font-semibold text-red-700">−248,50 €</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[12px] border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-[13.5px] font-medium">Verknüpfte Rechnung</span>
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Wird automatisch als PDF angezeigt. Sie können Betrag, Datum und Empfänger direkt mit der Buchung vergleichen.
          </p>
        </div>
        <div className="rounded-[12px] border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Repeat className="h-4 w-4 text-primary" />
            <span className="text-[13.5px] font-medium">Verknüpfte Vorlage</span>
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Bei wiederkehrenden Zahlungen sehen Sie statt einer Rechnung die hinterlegte Vorlage mit Betrag, Empfänger und Intervall.
          </p>
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground mt-5 leading-relaxed">
        Markieren Sie die Buchung anschließend mit
        <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px]"><CheckCircle2 className="h-3 w-3" /> Geprüft</span>
        oder
        <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px]"><AlertTriangle className="h-3 w-3" /> Auffällig</span>.
        Bei Auffälligkeiten können Sie eine kurze Notiz hinterlassen.
      </p>
    </div>
  );
}

function StepTemplates() {
  const examples = [
    { name: "Hausgeld", desc: "Monatliche Vorauszahlung der Eigentümer auf die laufenden Bewirtschaftungskosten." },
    { name: "Verwaltergebühr", desc: "Festes Honorar der Hausverwaltung gemäß Vertrag, meist monatlich oder quartalsweise." },
    { name: "Abschlagszahlungen", desc: "Regelmäßige Vorauszahlungen z. B. an Stadtwerke für Strom, Wasser oder Heizung." },
  ];
  return (
    <div>
      <StepTitle
        kicker="Schritt 3"
        title="Was sind Buchungsvorlagen?"
        lead={`Eine Buchungsvorlage steht für eine wiederkehrende Zahlung. Statt für jede Einzelzahlung eine neue Rechnung anzulegen, verweist die Buchung auf die Vorlage – diese definiert Empfänger, Betrag und Intervall und dient als „Vertrags-Beleg".`}
      />
      <div className="space-y-3">
        {examples.map((e) => (
          <div key={e.name} className="flex items-start gap-4 rounded-[12px] border border-border/50 bg-background px-5 py-4">
            <div className="size-9 shrink-0 rounded-full bg-primary/10 grid place-items-center">
              <Repeat className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-[14.5px] font-medium text-foreground">{e.name}</div>
              <div className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">{e.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepInternal() {
  const examples = [
    { name: "Umbuchungen zwischen Konten", desc: "Z. B. Übertrag vom Girokonto auf das Rücklagenkonto." },
    { name: "Heizkostenumlagen", desc: "Verteilung der jährlichen Heizkosten auf die Eigentümerkonten." },
    { name: "Rechnungsabgrenzungen", desc: "Periodengerechte Zuordnung von Kosten ins richtige Wirtschaftsjahr." },
    { name: "Eröffnungs- und Schlussbuchungen", desc: "Übertrag der Salden zwischen den Wirtschaftsjahren." },
  ];
  return (
    <div>
      <StepTitle
        kicker="Schritt 4"
        title="Interne Buchungen ohne Beleg"
        lead="Manche Buchungen brauchen keinen externen Beleg, weil sie innerhalb der Buchhaltung entstehen. Das ist völlig normal."
      />
      <div className="grid grid-cols-2 gap-3">
        {examples.map((e) => (
          <div key={e.name} className="rounded-[12px] border border-border/50 bg-background px-4 py-3.5">
            <div className="text-[14px] font-medium text-foreground mb-0.5">{e.name}</div>
            <div className="text-[12.5px] text-muted-foreground leading-relaxed">{e.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
