import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle, X, Send,
  FileText, LayoutTemplate, Building2, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionReviewModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: any[];
  buildingId: string;
}

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export function TransactionReviewMode({ open, onOpenChange, transactions, buildingId }: TransactionReviewModeProps) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bookedCount, setBookedCount] = useState(0);
  const [bookingSingle, setBookingSingle] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const currentTxn = transactions[currentIndex];

  // Load invoice details for matched transactions
  const { data: invoiceDetail } = useQuery({
    queryKey: ["txn-review-invoice", currentTxn?.matched_invoice_id],
    queryFn: async () => {
      if (!currentTxn?.matched_invoice_id) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, vendor_name, gross_amount, net_amount, vat_amount, invoice_number, invoice_date, description")
        .eq("id", currentTxn.matched_invoice_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!currentTxn?.matched_invoice_id,
  });

  // Load template details
  const { data: templateDetail } = useQuery({
    queryKey: ["txn-review-template", currentTxn?.matched_template_id],
    queryFn: async () => {
      if (!currentTxn?.matched_template_id) return null;
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, expected_amount, amount_tolerance, vat_rate, interval, category, description, chart_of_accounts(account_number, account_name)")
        .eq("id", currentTxn.matched_template_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!currentTxn?.matched_template_id,
  });

  // Load PDF for invoice
  useEffect(() => {
    setPdfUrl(null);
    if (!invoiceDetail?.file_path) return;
    const loadPdf = async () => {
      const cleanPath = invoiceDetail.file_path.replace(/^\/+/, "").replace(/^invoices\//, "");
      const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    };
    loadPdf();
  }, [invoiceDetail?.file_path]);

  const handleBook = useCallback(async () => {
    if (!currentTxn || bookingSingle) return;
    setBookingSingle(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-data", {
        body: { transactionIds: [currentTxn.id] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBookedCount(c => c + 1);
      toast.success("Transaktion gebucht", { duration: 1500 });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-building"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-all"] });
      // Move to next
      if (currentIndex < transactions.length - 1) {
        setCurrentIndex(i => i + 1);
      }
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBookingSingle(false);
    }
  }, [currentTxn, bookingSingle, currentIndex, transactions.length, queryClient]);

  const handleNext = useCallback(() => {
    if (currentIndex < transactions.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, transactions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    let shiftOnly = false;
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftOnly = true;
      else if (e.shiftKey) shiftOnly = false;
      if (e.key === "ArrowRight") { e.preventDefault(); handleNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" && shiftOnly) { e.preventDefault(); handleBook(); }
      shiftOnly = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
  }, [open, handleBook, handleNext, handlePrev]);

  const amountMatch = useMemo(() => {
    if (!currentTxn) return false;
    if (invoiceDetail?.gross_amount != null) {
      return Math.abs(Math.abs(currentTxn.amount) - Math.abs(invoiceDetail.gross_amount)) < 0.01;
    }
    if (templateDetail?.expected_amount != null) {
      const tol = (templateDetail as any).amount_tolerance || 0;
      return Math.abs(Math.abs(currentTxn.amount) - Math.abs(templateDetail.expected_amount)) <= tol;
    }
    return false;
  }, [currentTxn, invoiceDetail, templateDetail]);

  const progressPercent = transactions.length > 0
    ? ((bookedCount) / (bookedCount + transactions.length)) * 100
    : 100;

  useEffect(() => { setCurrentIndex(0); setBookedCount(0); }, [open]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] max-h-[94vh] w-full h-[94vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" /> Schließen
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <span className="text-sm font-medium">
              Transaktion {transactions.length > 0 ? currentIndex + 1 : 0} / {transactions.length}
            </span>
            {bookedCount > 0 && (
              <Badge variant="default" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                {bookedCount} gebucht
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Progress value={progressPercent} className="w-40 h-2" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">Shift</kbd>
              <span className="text-[11px]">Buchen</span>
              <span className="mx-1 text-border">|</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[11px] font-mono">→</kbd>
              <span className="text-[11px]">Nav</span>
            </div>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <CheckCircle className="h-16 w-16 opacity-30" />
            <p className="text-lg font-medium">Alle Transaktionen geprüft!</p>
            <p className="text-sm">{bookedCount} Transaktionen wurden gebucht.</p>
            <Button onClick={() => onOpenChange(false)}>Schließen</Button>
          </div>
        ) : currentTxn ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Transaction details */}
            <div className="w-1/2 border-r overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  Transaktionsdetails
                </h3>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={currentIndex === 0} onClick={handlePrev}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentIndex >= transactions.length - 1} onClick={handleNext}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Buchungsdatum</span>
                  <p className="text-sm font-medium">{format(new Date(currentTxn.booking_date), "dd.MM.yyyy", { locale: de })}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Betrag</span>
                  <p className={cn("text-lg font-bold", currentTxn.amount < 0 ? "text-destructive" : "text-green-600", amountMatch && "ring-2 ring-green-500 rounded px-1")}>
                    {currentTxn.amount < 0 ? "" : "+"}{formatCurrency(currentTxn.amount)}
                  </p>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-xs text-muted-foreground">{currentTxn.amount < 0 ? "Empfänger" : "Auftraggeber"}</span>
                  <p className="text-sm font-medium">{currentTxn.amount < 0 ? currentTxn.creditor_name : currentTxn.debtor_name || "–"}</p>
                </div>
                {(currentTxn.creditor_iban || currentTxn.debtor_iban) && (
                  <div className="space-y-1 col-span-2">
                    <span className="text-xs text-muted-foreground">IBAN</span>
                    <p className="text-sm font-mono">{(currentTxn.amount < 0 ? currentTxn.creditor_iban : currentTxn.debtor_iban) || "–"}</p>
                  </div>
                )}
                <div className="space-y-1 col-span-2">
                  <span className="text-xs text-muted-foreground">Verwendungszweck</span>
                  <p className="text-sm">{currentTxn.purpose || "–"}</p>
                </div>
                {currentTxn.end_to_end_ref && (
                  <div className="space-y-1 col-span-2">
                    <span className="text-xs text-muted-foreground">End-to-End-Referenz</span>
                    <p className="text-sm font-mono text-xs">{currentTxn.end_to_end_ref}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant="outline" className="text-xs capitalize">{currentTxn.match_status?.replace("_", " ")}</Badge>
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleBook} disabled={bookingSingle} className="w-full">
                  {bookingSingle ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Transaktion buchen
                </Button>
              </div>
            </div>

            {/* Right: Matched document */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              {invoiceDetail ? (
                <>
                  <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Zugeordnete Rechnung</span>
                    {invoiceDetail.vendor_name && (
                      <Badge variant="outline" className="text-xs">{invoiceDetail.vendor_name}</Badge>
                    )}
                  </div>
                  <div className="px-4 py-2 border-b space-y-1 shrink-0">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">Brutto</span>
                        <p className={cn("font-medium", amountMatch && "text-green-600")}>{formatCurrency(invoiceDetail.gross_amount)}</p>
                      </div>
                      {invoiceDetail.invoice_number && (
                        <div>
                          <span className="text-xs text-muted-foreground">Re-Nr.</span>
                          <p className="font-medium">{invoiceDetail.invoice_number}</p>
                        </div>
                      )}
                      {invoiceDetail.invoice_date && (
                        <div>
                          <span className="text-xs text-muted-foreground">Re-Datum</span>
                          <p className="font-medium">{format(new Date(invoiceDetail.invoice_date), "dd.MM.yyyy", { locale: de })}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {pdfUrl ? (
                    <iframe src={pdfUrl} className="flex-1 w-full border-0" title="Rechnung PDF" />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      PDF wird geladen...
                    </div>
                  )}
                </>
              ) : templateDetail ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <LayoutTemplate className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Zugeordnete Vorlage</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Name</span>
                      <p className="font-medium">{templateDetail.name}</p>
                    </div>
                    {(templateDetail as any).vendor_name && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Lieferant</span>
                        <p className="font-medium">{(templateDetail as any).vendor_name}</p>
                      </div>
                    )}
                    {templateDetail.expected_amount != null && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Erwarteter Betrag</span>
                        <p className={cn("font-medium", amountMatch && "text-green-600")}>
                          {formatCurrency(templateDetail.expected_amount)}
                          {(templateDetail as any).amount_tolerance > 0 && ` ±${formatCurrency((templateDetail as any).amount_tolerance)}`}
                        </p>
                      </div>
                    )}
                    {templateDetail.vat_rate != null && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">MwSt</span>
                        <p className="font-medium">{templateDetail.vat_rate}%</p>
                      </div>
                    )}
                    {templateDetail.interval && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Intervall</span>
                        <p className="font-medium capitalize">{templateDetail.interval}</p>
                      </div>
                    )}
                    {(templateDetail as any).chart_of_accounts && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Konto</span>
                        <p className="font-medium">{(templateDetail as any).chart_of_accounts.account_number} – {(templateDetail as any).chart_of_accounts.account_name}</p>
                      </div>
                    )}
                    {templateDetail.description && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Beschreibung</span>
                        <p className="text-sm">{templateDetail.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Kein Beleg zugeordnet</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
