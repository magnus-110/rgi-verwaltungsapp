// Ebene 3: aus den angehakten Posten werden Rechnungsentwürfe.
//
// Der Dialog fragt nur, was die Posten nicht schon wissen: Datum,
// Leistungszeitraum und Einleitungstext. Bezahlt wird immer durch
// die Hausverwaltung vom Gemeinschaftskonto – deshalb gibt es hier
// keine Wahl des Zahlungswegs und keine Word-Vorlage mehr.
//
// Gehören die Posten zu verschiedenen Zahlungspflichtigen (z. B.
// Eigentümerwechsel → einzelner Eigentümer), entsteht je
// Zahlungspflichtigem ein eigener Entwurf.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Landmark, RefreshCw, Split } from "lucide-react";
import { type BillingRow } from "@/types/rgiBilling";

export interface InvoiceOptions {
  issueDate: string;
  dueDate: string | null;
  servicePeriodFrom: string | null;
  servicePeriodTo: string | null;
  introText: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: BillingRow[];
  /** Wie viele Entwürfe entstehen (je Zahlungspflichtigem einer). */
  invoiceCount: number;
  buildingName: string;
  year: number;
  pending: boolean;
  onConfirm: (opts: InvoiceOptions) => void | Promise<void>;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CreateInvoiceDialog({
  open, onOpenChange, rows, invoiceCount, buildingName, year, pending, onConfirm,
}: Props) {
  const [issueDate, setIssueDate] = useState(iso(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [intro, setIntro] = useState("");

  const hasYearFee = useMemo(() => rows.some((r) => r.periodKey), [rows]);

  useEffect(() => {
    if (!open) return;
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setIssueDate(iso(new Date()));
    setDueDate(iso(due));
    // Leistungszeitraum aus den Posten ableiten: ist ein Honorarjahr
    // dabei, ist es das ganze Jahr, sonst die Spanne der Vorgänge.
    if (hasYearFee) {
      setFrom(`${year}-01-01`);
      setTo(`${year}-12-31`);
    } else {
      const dates = rows.map((r) => r.occurredOn).filter(Boolean).sort();
      setFrom(dates[0] ?? "");
      setTo(dates[dates.length - 1] ?? "");
    }
    setIntro(defaultIntro(buildingName, hasYearFee, year));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoiceCount > 1 ? `${invoiceCount} Rechnungsentwürfe erstellen` : "Rechnungsentwurf erstellen"}</DialogTitle>
          <DialogDescription>
            {rows.length} {rows.length === 1 ? "Position" : "Positionen"} · {buildingName}
          </DialogDescription>
        </DialogHeader>

        {invoiceCount > 1 && (
          <div className="flex gap-2.5 items-start rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 p-3 text-sm">
            <Split className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
            <div>
              <div className="font-medium">Getrennt nach Zahlungspflichtigem</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                Posten für einzelne Eigentümer kommen auf einen eigenen Entwurf. Den Empfänger
                wählst du dort unter „Ändern“.
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2.5 items-start rounded-lg bg-muted/50 p-3 text-sm">
          <Landmark className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <div>
            Überweisung durch die Hausverwaltung
            <div className="text-muted-foreground text-xs mt-0.5">
              Die Rechnung landet nach dem Festschreiben automatisch im Zahlungslauf des Objekts.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rechnungsdatum</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Überweisen bis</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Leistung von</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Leistung bis</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Einleitungstext</Label>
          <Textarea rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>

        <DialogFooter className="gap-2">
          <span className="mr-auto text-xs text-muted-foreground self-center">
            Wird als <Badge variant="outline" className="font-normal">Entwurf</Badge> angelegt –
            die Nummer entsteht erst beim Festschreiben.
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            disabled={pending || rows.length === 0}
            onClick={() =>
              onConfirm({
                issueDate,
                dueDate: dueDate || null,
                servicePeriodFrom: from || null,
                servicePeriodTo: to || null,
                introText: intro,
              })
            }
            className="gap-1.5"
          >
            {pending && <RefreshCw className="w-4 h-4 animate-spin" />}
            {invoiceCount > 1 ? "Entwürfe erstellen" : "Entwurf erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultIntro(building: string, yearFee: boolean, year: number): string {
  const lead = yearFee
    ? `vereinbarungsgemäß berechnen wir Ihnen die Verwaltervergütung für das Wirtschaftsjahr ${year} sowie die angefallenen Zusatzleistungen.`
    : `vereinbarungsgemäß berechnen wir Ihnen die nachstehenden Leistungen für das Objekt ${building}.`;
  return `Sehr geehrte Damen und Herren,\n${lead}`;
}
