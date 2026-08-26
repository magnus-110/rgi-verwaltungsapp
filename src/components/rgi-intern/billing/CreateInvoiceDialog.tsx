// Ebene 3: aus den angehakten Posten wird ein Rechnungsentwurf.
//
// Der Dialog fragt nur, was die Posten nicht schon wissen: Datum,
// Leistungszeitraum, Word-Vorlage, Einleitungstext — und ob der
// Betrag per Selbstentnahme fließt oder überwiesen wird.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Wallet, AlertTriangle, RefreshCw } from "lucide-react";
import type { RgiTemplate } from "@/hooks/useRgi";
import { type BillingRow, rowNet, rowsNet } from "@/types/rgiBilling";
import { FEE_DEBTOR_LABEL, formatEur } from "@/types/rgiContracts";

export interface InvoiceOptions {
  paidByWithdrawal: boolean;
  issueDate: string;
  dueDate: string | null;
  servicePeriodFrom: string | null;
  servicePeriodTo: string | null;
  introText: string;
  templateId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: BillingRow[];
  buildingName: string;
  templates: RgiTemplate[];
  year: number;
  pending: boolean;
  onConfirm: (opts: InvoiceOptions) => void | Promise<void>;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CreateInvoiceDialog({
  open, onOpenChange, rows, buildingName, templates, year, pending, onConfirm,
}: Props) {
  // Selbstentnahme ist bei RGI der Regelfall: das Honorar wird vom
  // Objektkonto abgebucht, die Rechnung ist der Beleg dazu.
  const [withdrawal, setWithdrawal] = useState(true);
  const [issueDate, setIssueDate] = useState(iso(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [intro, setIntro] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const net = rowsNet(rows);
    const vat = rows.reduce((s, r) => s + (rowNet(r) * r.vatRate) / 100, 0);
    return { net, vat: Math.round(vat * 100) / 100, gross: Math.round((net + vat) * 100) / 100 };
  }, [rows]);

  // Stehen Posten mit verschiedenen Schuldnern in der Auswahl, gehört
  // das auf getrennte Rechnungen — das kann die App nicht entscheiden.
  const debtors = useMemo(() => [...new Set(rows.map((r) => r.debtor))], [rows]);

  const hasYearFee = rows.some((r) => r.periodKey);

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setIssueDate(iso(today));
    setDueDate(iso(due));
    setTemplateId(
      templates.find((t) => t.is_default && t.template_kind === "invoice")?.id ??
      templates.find((t) => t.template_kind === "invoice")?.id ??
      templates[0]?.id ?? null,
    );
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
    setIntro(
      withdrawalIntro(withdrawal, buildingName, hasYearFee, year),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Einleitungstext mitziehen, solange er nicht von Hand geändert wurde.
  const [introTouched, setIntroTouched] = useState(false);
  useEffect(() => {
    if (!open || introTouched) return;
    setIntro(withdrawalIntro(withdrawal, buildingName, hasYearFee, year));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rechnungsentwurf erstellen</DialogTitle>
          <DialogDescription>
            {rows.length} {rows.length === 1 ? "Position" : "Positionen"} · {buildingName}
          </DialogDescription>
        </DialogHeader>

        {debtors.length > 1 && (
          <div className="flex gap-2 items-start rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium">Verschiedene Zahlungspflichtige in einer Rechnung</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                Die Auswahl enthält Posten für {debtors.map((d) => FEE_DEBTOR_LABEL[d]).join(" und ")}.
                Üblicherweise gehört das auf getrennte Rechnungen. Du kannst trotzdem fortfahren.
              </div>
            </div>
          </div>
        )}

        {/* Zahlungsweg */}
        <div className="rounded-md border p-3 space-y-2">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="flex items-start gap-2.5">
              {withdrawal
                ? <Wallet className="w-4 h-4 mt-0.5 text-primary" />
                : <Landmark className="w-4 h-4 mt-0.5 text-muted-foreground" />}
              <span className="text-sm">
                {withdrawal ? "Selbstentnahme vom Objektkonto" : "Überweisung durch den Empfänger"}
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {withdrawal
                    ? "Die Rechnung ist der Beleg zur Entnahme — sie zeigt keine Bankverbindung und kein Zahlungsziel."
                    : "Die Rechnung zeigt Bankverbindung und Zahlungsziel."}
                </span>
              </span>
            </span>
            <Switch checked={withdrawal} onCheckedChange={setWithdrawal} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rechnungsdatum</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{withdrawal ? "Zahlungsziel (entfällt)" : "Fällig am"}</Label>
            <Input type="date" value={dueDate} disabled={withdrawal}
              onChange={(e) => setDueDate(e.target.value)} />
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
          <Label className="text-xs">Word-Vorlage</Label>
          <Select value={templateId ?? "none"} onValueChange={(v) => setTemplateId(v === "none" ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— später wählen —</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " (Standard)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Einleitungstext</Label>
          <Textarea
            rows={3}
            value={intro}
            onChange={(e) => { setIntro(e.target.value); setIntroTouched(true); }}
          />
        </div>

        {/* Positionsvorschau */}
        <div className="rounded-md border divide-y max-h-52 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2 flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{r.label}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {r.quantity.toLocaleString("de-DE")} {r.unit}
              </span>
              <span className="font-mono w-24 text-right">{formatEur(rowNet(r))}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <div className="text-sm space-y-1 min-w-[220px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Netto</span><span className="font-mono">{formatEur(totals.net)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Umsatzsteuer</span><span className="font-mono">{formatEur(totals.vat)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t">
              <span>Gesamt</span><span className="font-mono">{formatEur(totals.gross)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <span className="mr-auto text-xs text-muted-foreground self-center">
            Wird als <Badge variant="outline" className="font-normal">Entwurf</Badge> angelegt —
            die Rechnungsnummer entsteht erst beim Versenden.
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            disabled={pending || rows.length === 0}
            onClick={() =>
              onConfirm({
                paidByWithdrawal: withdrawal,
                issueDate,
                dueDate: withdrawal ? null : (dueDate || null),
                servicePeriodFrom: from || null,
                servicePeriodTo: to || null,
                introText: intro,
                templateId,
              })
            }
            className="gap-1.5"
          >
            {pending && <RefreshCw className="w-4 h-4 animate-spin" />}
            Entwurf erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function withdrawalIntro(withdrawal: boolean, building: string, yearFee: boolean, year: number): string {
  const lead = yearFee
    ? `vereinbarungsgemäß berechnen wir Ihnen die Verwaltervergütung für das Wirtschaftsjahr ${year} sowie die angefallenen Zusatzleistungen.`
    : `vereinbarungsgemäß berechnen wir Ihnen die nachstehenden Leistungen für das Objekt ${building}.`;
  const tail = withdrawal
    ? "\nDer Betrag wird gemäß Verwaltervertrag vom Objektkonto entnommen."
    : "";
  return `Sehr geehrte Damen und Herren,\n${lead}${tail}`;
}
