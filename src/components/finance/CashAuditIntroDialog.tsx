import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Sparkles, ArrowLeft, ArrowRight, LayoutGrid, BookOpen, FolderOpen, MessageSquare,
  MousePointerClick, FileText, Repeat, CheckCircle2, AlertTriangle, ArrowLeftRight,
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
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background">
        <DialogTitle className="sr-only">Einführung Kassenprüfung</DialogTitle>

        <div className="px-6 pt-8 pb-5 min-h-[460px] flex flex-col">
          {/* Card */}
          <div className="flex-1 bg-card rounded-[16px] border border-border/50 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="h-1 bg-primary" />
            <div className="px-6 py-7">
              {step === 1 && <StepWelcome buildingName={buildingName} fiscalYear={fiscalYear} />}
              {step === 2 && <StepTabs />}
              {step === 3 && <StepBookings />}
              {step === 4 && <StepTemplates />}
              {step === 5 && <StepInternal />}
            </div>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i + 1 === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                )}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="mt-5 space-y-3">
            {step === TOTAL_STEPS && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer justify-center">
                <Checkbox checked={dontShow} onCheckedChange={(c) => setDontShow(!!c)} />
                Nicht mehr automatisch anzeigen
              </label>
            )}
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <Button variant="ghost" onClick={back} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </Button>
              ) : <div />}
              <div className="flex-1" />
              {step < TOTAL_STEPS ? (
                <Button onClick={next} className="gap-1.5 h-11 px-6 rounded-[12px]">
                  {step === 1 ? "Jetzt starten" : "Weiter"} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={finish} className="h-11 px-6 rounded-[12px]">
                  Verstanden, los geht's
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----- Steps ----- */

function StepHeader({ icon: Icon, title, lead }: { icon: any; title: string; lead?: string }) {
  return (
    <div className="space-y-3 mb-5">
      <div className="size-11 rounded-full bg-primary/10 grid place-items-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h2 className="font-display !font-normal text-[24px] leading-[1.2] tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {lead && <p className="text-[14px] leading-[1.6] text-muted-foreground">{lead}</p>}
    </div>
  );
}

function StepWelcome({ buildingName, fiscalYear }: { buildingName?: string; fiscalYear?: number | string }) {
  const items = [
    "Die vier Tabs der Prüfung",
    "Buchungen prüfen",
    "Vorlagen verstehen",
    "Interne Buchungen",
  ];
  return (
    <div>
      <StepHeader
        icon={Sparkles}
        title="Willkommen zur Kassenprüfung"
        lead={
          buildingName
            ? `Sie prüfen die Kasse der ${buildingName}${fiscalYear ? ` für das Wirtschaftsjahr ${fiscalYear}.` : "."}`
            : "Eine kurze Einführung in vier Schritten."
        }
      />
      <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase mb-3">
        Was Sie erwartet
      </div>
      <ul className="divide-y divide-border/40">
        {items.map((t, i) => (
          <li key={i} className="flex items-center gap-3.5 py-2.5">
            <span className="size-6 shrink-0 rounded-full border border-border bg-background grid place-items-center text-[11px] font-semibold text-muted-foreground">
              {i + 1}
            </span>
            <span className="text-[14px] text-foreground">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepTabs() {
  const tabs = [
    { icon: BookOpen, name: "Kontenblätter", desc: "Salden & Buchungen je Konto." },
    { icon: LayoutGrid, name: "Buchungsjournal", desc: "Alle Buchungen chronologisch." },
    { icon: FolderOpen, name: "Dokumente", desc: "Bankauszüge, Rechnungen, Verträge." },
    { icon: MessageSquare, name: "Hinweise", desc: "Anmerkungen des Verwalters." },
  ];
  return (
    <div>
      <StepHeader icon={LayoutGrid} title="Die vier Tabs" lead="Hier finden Sie alles, was Sie zur Prüfung brauchen." />
      <ul className="space-y-2.5">
        {tabs.map((t) => (
          <li key={t.name} className="flex items-start gap-3 rounded-[12px] border border-border/40 px-3.5 py-3 bg-background">
            <div className="size-9 shrink-0 rounded-full bg-primary/10 grid place-items-center">
              <t.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-foreground">{t.name}</div>
              <div className="text-[12.5px] text-muted-foreground leading-snug">{t.desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepBookings() {
  return (
    <div>
      <StepHeader
        icon={MousePointerClick}
        title="Buchungen prüfen"
        lead="Klicken Sie auf eine Buchung – im Journal oder Kontenblatt – und Sie sehen sofort den passenden Beleg."
      />
      <div className="space-y-2.5">
        <div className="flex items-center gap-3 rounded-[12px] border border-border/40 px-3.5 py-3">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="text-[13.5px]">Verknüpfte <strong>Rechnung</strong> als PDF</span>
        </div>
        <div className="flex items-center gap-3 rounded-[12px] border border-border/40 px-3.5 py-3">
          <Repeat className="h-4 w-4 text-primary shrink-0" />
          <span className="text-[13.5px]">Oder verknüpfte <strong>Buchungsvorlage</strong></span>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground mt-4 leading-relaxed">
        Markieren Sie die Buchung mit
        <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px]"><CheckCircle2 className="h-3 w-3" /> Geprüft</span>
        oder
        <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px]"><AlertTriangle className="h-3 w-3" /> Auffällig</span>.
      </p>
    </div>
  );
}

function StepTemplates() {
  const examples = ["Hausgeld", "Verwaltergebühr", "Abschlagszahlungen (Strom, Wasser, Heizung)"];
  return (
    <div>
      <StepHeader
        icon={Repeat}
        title="Was sind Vorlagen?"
        lead="Eine Buchungsvorlage steht für eine wiederkehrende Zahlung. Sie ersetzt die monatliche Einzelrechnung."
      />
      <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase mb-3">
        Typische Beispiele
      </div>
      <ul className="space-y-2">
        {examples.map((e) => (
          <li key={e} className="flex items-center gap-3 rounded-[12px] bg-muted/40 px-3.5 py-2.5 text-[13.5px]">
            <span className="size-1.5 rounded-full bg-primary" />
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepInternal() {
  const examples = [
    "Umbuchungen zwischen Konten",
    "Heizkostenumlagen",
    "Rechnungsabgrenzungen",
    "Eröffnungs- und Schlussbuchungen",
  ];
  return (
    <div>
      <StepHeader
        icon={ArrowLeftRight}
        title="Interne Buchungen"
        lead="Manche Buchungen brauchen keinen externen Beleg – sie entstehen innerhalb der Buchhaltung."
      />
      <ul className="space-y-2">
        {examples.map((e) => (
          <li key={e} className="flex items-center gap-3 rounded-[12px] bg-muted/40 px-3.5 py-2.5 text-[13.5px]">
            <span className="size-1.5 rounded-full bg-primary" />
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}
