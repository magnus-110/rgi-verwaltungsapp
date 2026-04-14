import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  X, ChevronLeft, ChevronRight, Copy, CheckCircle, CreditCard,
  AlertTriangle, FileText, Loader2
} from "lucide-react";

interface Invoice {
  id: string;
  vendor_name: string | null;
  vendor_iban: string | null;
  invoice_number: string | null;
  description: string | null;
  due_date: string | null;
  invoice_date: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  vat_amount: number | null;
  file_path: string | null;
  status: string;
  review_status: string;
  paid_at?: string | null;
  payment_notes?: string;
  buildings?: { name: string; building_code: string } | null;
}

interface Props {
  invoices: Invoice[];
  initialIndex: number;
  onClose: () => void;
  onRefetch: () => void;
}

const formatCurrency = (val: number | null) => {
  if (val == null) return "–";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const generatePurpose = (inv: Invoice) => {
  const parts: string[] = [];
  if (inv.invoice_number) parts.push(`Re. Nr. ${inv.invoice_number}`);
  if (inv.description) {
    const short = inv.description.split(/\s+/).slice(0, 3).join(" ");
    parts.push(short);
  }
  return parts.join(", ") || "–";
};

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-lg font-semibold break-all ${mono ? "font-mono text-base" : ""}`}>
          {value || "–"}
        </p>
      </div>
      {value && value !== "–" && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 mt-3"
          onClick={handleCopy}
        >
          {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function TransferReviewMode({ invoices, initialIndex, onClose, onRefetch }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const invoice = invoices[index];
  const isPaid = invoice?.status === "paid";

  const isOverdue = invoice?.due_date && isPast(new Date(invoice.due_date)) && !isToday(new Date(invoice.due_date));

  useEffect(() => {
    if (!invoice) return;
    setNotes((invoice as any).payment_notes || "");
    setPdfUrl(null);
    if (invoice.file_path) {
      setLoadingPdf(true);
      supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.file_path, 300)
        .then(({ data }) => {
          setPdfUrl(data?.signedUrl || null);
          setLoadingPdf(false);
        });
    }
  }, [invoice?.id]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" && index > 0) setIndex(i => i - 1);
    if (e.key === "ArrowRight" && index < invoices.length - 1) setIndex(i => i + 1);
    if (e.key === "Escape") onClose();
  }, [index, invoices.length, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!invoice) return null;

  const saveNotes = async () => {
    await supabase
      .from("invoices")
      .update({ payment_notes: notes } as any)
      .eq("id", invoice.id);
  };

  const handleVerify = async () => {
    setSaving(true);
    await saveNotes();
    await supabase
      .from("invoices")
      .update({ review_status: "verified" } as any)
      .eq("id", invoice.id);
    toast.success("Rechnung als geprüft markiert");
    onRefetch();
    if (index < invoices.length - 1) {
      setIndex(i => i + 1);
    } else {
      onClose();
    }
    setSaving(false);
  };

  const handleMarkPaid = async () => {
    setSaving(true);
    await saveNotes();
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() } as any)
      .eq("id", invoice.id);
    toast.success("Rechnung als bezahlt markiert");
    onRefetch();
    setSaving(false);
    if (index >= invoices.length - 1 && index > 0) {
      setIndex(i => i - 1);
    }
  };

  const purpose = generatePurpose(invoice);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">
            {isPaid ? "Rechnungsdetails" : "Prüfmodus — Überweisungen"}
          </h2>
          {isPaid && <Badge variant="secondary">Bezahlt</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums min-w-[60px] text-center">
            {index + 1} / {invoices.length}
          </span>
          <Button variant="outline" size="sm" disabled={index === invoices.length - 1} onClick={() => setIndex(i => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Transfer data */}
        <div className="w-1/2 border-r overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">
              {isPaid ? "Rechnungsinformationen" : "Überweisungsdaten"}
            </h3>
            {invoice.review_status === "verified" && (
              <Badge variant="default">Geprüft</Badge>
            )}
          </div>

          {!isPaid && isOverdue && (
            <div className="flex items-center gap-2 text-sm bg-destructive/10 text-destructive rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4" />
              Überfällig seit {invoice.due_date ? format(new Date(invoice.due_date), "dd.MM.yyyy") : ""}
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <CopyField label="Empfänger" value={invoice.vendor_name || "–"} />
            <Separator />
            <CopyField label="IBAN" value={invoice.vendor_iban || "–"} mono />
            <Separator />
            <CopyField label="Betrag" value={invoice.gross_amount != null ? formatCurrency(invoice.gross_amount) : "–"} />
            <Separator />
            <CopyField label="Verwendungszweck" value={purpose} />
            <Separator />
            <CopyField label="Rechnungsnummer" value={invoice.invoice_number || "–"} />
          </div>

          <div className="space-y-1.5">
            <InfoRow label="Fällig am" value={invoice.due_date ? format(new Date(invoice.due_date), "dd.MM.yyyy") : "–"} />
            <InfoRow label="Rechnungsdatum" value={invoice.invoice_date ? format(new Date(invoice.invoice_date), "dd.MM.yyyy") : "–"} />
            <InfoRow label="Liegenschaft" value={(invoice as any).buildings?.name || "–"} />
            {invoice.net_amount != null && (
              <InfoRow label="Netto" value={`${formatCurrency(invoice.net_amount)} €`} />
            )}
            {invoice.vat_amount != null && (
              <InfoRow label="MwSt." value={`${formatCurrency(invoice.vat_amount)} €`} />
            )}
            {invoice.description && (
              <InfoRow label="Beschreibung" value={invoice.description} />
            )}
            {isPaid && invoice.paid_at && (
              <InfoRow label="Bezahlt am" value={format(new Date(invoice.paid_at as string), "dd.MM.yyyy")} />
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">Notiz</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Zahlungsnotiz..."
              rows={3}
              onBlur={saveNotes}
            />
          </div>

          {!isPaid && (
            <>
              <Separator />
              <div className="flex gap-2">
                <Button
                  onClick={handleVerify}
                  disabled={saving}
                  className="flex-1"
                  variant={invoice.review_status === "verified" ? "secondary" : "default"}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Geprüft & Weiter
                </Button>
                <Button
                  onClick={handleMarkPaid}
                  disabled={saving}
                  variant="outline"
                  className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Als bezahlt markieren
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right: PDF preview */}
        <div className="w-1/2 flex flex-col bg-muted/30">
          <div className="p-3 border-b flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            Rechnungs-PDF
          </div>
          <div className="flex-1">
            {loadingPdf ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full" title="Rechnung PDF" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Kein PDF vorhanden
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
