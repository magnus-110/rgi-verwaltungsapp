// Eine festgeschriebene Rechnung ansehen.
//
// Bis hierher ging es ums Schreiben, ab hier ums Nachhalten:
// Dokumente, Zahlungseingänge, Stand. Deshalb sind die Zahlungen
// aus dem Editor hierher gewandert — im Schreibformular gab es
// nichts zu buchen, weil die Rechnung noch gar nicht draußen war.

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  FileType, Download, RefreshCw, CheckCircle, Wallet, Landmark, Receipt, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useRgiInvoice, useRgiInvoiceItems, useRgiPayments, useAddRgiPayment,
  rgiRenderInvoice, rgiSignedUrl,
} from "@/hooks/useRgi";
import { formatDate, formatEur } from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
  buildingName: (id: string | null) => string | null;
  clientName: (id: string) => string;
}

export function InvoiceDetailDialog({
  open, onOpenChange, invoiceId, buildingName, clientName,
}: Props) {
  const { data: invoice } = useRgiInvoice(open ? invoiceId : null);
  const { data: items } = useRgiInvoiceItems(open ? invoiceId : null);
  const { data: payments } = useRgiPayments(open ? invoiceId : null);
  const addPayment = useAddRgiPayment();

  const [amount, setAmount] = useState("");
  const [rendering, setRendering] = useState(false);

  if (!invoice) return null;

  const gross = Number(invoice.total_gross);
  const paid = Number(invoice.paid_amount);
  const rest = Math.round((gross - paid) * 100) / 100;
  const withdrawal = (invoice as any).paid_by_withdrawal === true;
  const overdue =
    !withdrawal && invoice.due_date && rest > 0 &&
    invoice.due_date < new Date().toISOString().slice(0, 10);

  const openFile = async (path: string) => {
    try {
      window.open(await rgiSignedUrl("invoices", path), "_blank");
    } catch (e: any) {
      toast.error(`Datei nicht abrufbar: ${e.message}`);
    }
  };

  const rerender = async () => {
    setRendering(true);
    try {
      const r = await rgiRenderInvoice(invoice.id);
      toast.success("Dokument neu erzeugt");
      if (r?.pdf_path) await openFile(r.pdf_path);
    } catch (e: any) {
      toast.error(`Rendern fehlgeschlagen: ${e.message}`);
    } finally {
      setRendering(false);
    }
  };

  const book = async (value: number) => {
    if (!value) return;
    await addPayment.mutateAsync({
      invoice_id: invoice.id,
      amount: value,
      paid_on: new Date().toISOString().slice(0, 10),
      note: withdrawal ? "Selbstentnahme" : undefined,
    });
    setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 text-left">
            <span className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
              <Receipt className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-lg">{invoice.invoice_number ?? "ohne Nummer"}</span>
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                {[
                  buildingName(invoice.building_id) ?? clientName(invoice.client_id),
                  `Rechnung vom ${formatDate(invoice.issue_date)}`,
                  invoice.service_period_from
                    ? `Leistung ${formatDate(invoice.service_period_from)}–${formatDate(invoice.service_period_to)}`
                    : null,
                ].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Badge variant={rest <= 0 ? "secondary" : overdue ? "destructive" : "default"}
              className="ml-auto shrink-0">
              {rest <= 0 ? "bezahlt" : overdue ? "überfällig" : "offen"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {overdue && (
          <div className="flex gap-2 items-center rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            Zahlungsziel war der {formatDate(invoice.due_date)} — offen sind noch {formatEur(rest)}.
          </div>
        )}

        {/* Zahlungsweg */}
        <div className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
          {withdrawal
            ? <Wallet className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            : <Landmark className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
          <span>
            {withdrawal ? "Selbstentnahme vom Objektkonto" : "Überweisung durch den Empfänger"}
            <span className="block text-xs text-muted-foreground mt-0.5">
              {withdrawal
                ? "Die Rechnung ist der Beleg zur Entnahme. Trag den Betrag ein, sobald er abgebucht ist."
                : invoice.due_date
                  ? `Zahlungsziel ${formatDate(invoice.due_date)}`
                  : "Kein Zahlungsziel hinterlegt"}
            </span>
          </span>
        </div>

        {/* Positionen */}
        <div className="rounded-md border divide-y">
          {(items ?? []).map((it) => (
            <div key={it.id} className="px-3 py-2 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{it.description}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                {Number(it.quantity).toLocaleString("de-DE")} {it.unit}
              </span>
              <span className="font-mono w-24 text-right tabular-nums">
                {formatEur(Number(it.line_net))}
              </span>
            </div>
          ))}
          {(items ?? []).length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">Keine Positionen.</div>
          )}
        </div>

        <div className="flex justify-end">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 min-w-[240px] text-sm">
            <dt className="text-muted-foreground">Netto</dt>
            <dd className="text-right font-mono tabular-nums">{formatEur(Number(invoice.subtotal_net))}</dd>
            <dt className="text-muted-foreground">Umsatzsteuer</dt>
            <dd className="text-right font-mono tabular-nums">{formatEur(Number(invoice.vat_total))}</dd>
            <dt className="font-semibold pt-1 border-t">Gesamt</dt>
            <dd className="text-right font-mono tabular-nums font-semibold pt-1 border-t">{formatEur(gross)}</dd>
            {paid > 0 && (
              <>
                <dt className="text-muted-foreground">davon bezahlt</dt>
                <dd className="text-right font-mono tabular-nums">{formatEur(paid)}</dd>
                <dt className={rest > 0 ? "font-medium" : "text-muted-foreground"}>Rest</dt>
                <dd className="text-right font-mono tabular-nums">{formatEur(rest)}</dd>
              </>
            )}
          </dl>
        </div>

        <Separator />

        {/* Dokumente */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted-foreground mr-1">Dokumente</span>
          {invoice.pdf_storage_path && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => openFile(invoice.pdf_storage_path!)}>
              <Download className="w-3.5 h-3.5" />PDF
            </Button>
          )}
          {invoice.docx_storage_path && (
            <Button variant="ghost" size="sm" className="gap-1.5"
              onClick={() => openFile(invoice.docx_storage_path!)}>
              <FileType className="w-3.5 h-3.5" />Word
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5" disabled={rendering} onClick={rerender}>
            <RefreshCw className={`w-3.5 h-3.5 ${rendering ? "animate-spin" : ""}`} />Neu erzeugen
          </Button>
        </div>

        {/* Zahlungen */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Zahlungseingänge
          </div>
          <div className="space-y-1 mb-3">
            {(payments ?? []).map((p) => (
              <div key={p.id} className="text-sm flex justify-between border-b pb-1">
                <span>{formatDate(p.paid_on)}{p.note ? ` · ${p.note}` : ""}</span>
                <span className="font-mono tabular-nums">{formatEur(Number(p.amount))}</span>
              </div>
            ))}
            {(payments ?? []).length === 0 && (
              <span className="text-sm text-muted-foreground">Noch nichts eingegangen.</span>
            )}
          </div>
          {rest > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Input
                type="number" step="0.01" placeholder="Betrag (€)"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="max-w-[160px]"
              />
              <Button onClick={() => book(Number(amount))} disabled={!amount} className="gap-1.5">
                <CheckCircle className="w-4 h-4" />Erfassen
              </Button>
              <Button variant="outline" onClick={() => book(rest)} className="gap-1.5">
                Vollständig bezahlt ({formatEur(rest)})
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
