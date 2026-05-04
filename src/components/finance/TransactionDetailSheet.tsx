import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, ExternalLink, CheckCircle2, LayoutTemplate, FileQuestion, EyeOff, Calendar, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface TransactionDetailSheetProps {
  transactionId: string | null;
  onClose: () => void;
}

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  matched_invoice: { label: "Rechnung zugeordnet", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  matched_template: { label: "Vorlage zugeordnet", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: LayoutTemplate },
  manually_matched: { label: "Manuell zugeordnet", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: CheckCircle2 },
  unmatched: { label: "Nicht zugeordnet", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: FileQuestion },
  ignored: { label: "Ignoriert", color: "bg-muted text-muted-foreground", icon: EyeOff },
};

export function TransactionDetailSheet({ transactionId, onClose }: TransactionDetailSheetProps) {
  const { data: txn } = useQuery({
    queryKey: ["bank-transaction-detail", transactionId],
    queryFn: async () => {
      if (!transactionId) return null;
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("id", transactionId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!transactionId,
  });

  const { data: invoice } = useQuery({
    queryKey: ["matched-invoice", txn?.matched_invoice_id],
    queryFn: async () => {
      if (!txn?.matched_invoice_id) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", txn.matched_invoice_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!txn?.matched_invoice_id,
  });

  const { data: template } = useQuery({
    queryKey: ["matched-template", txn?.matched_template_id],
    queryFn: async () => {
      if (!txn?.matched_template_id) return null;
      const { data, error } = await supabase
        .from("booking_templates")
        .select("*, chart_of_accounts:account_id(account_number, account_name)")
        .eq("id", txn.matched_template_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!txn?.matched_template_id,
  });

  const openInvoicePdf = async () => {
    if (!invoice?.file_path) {
      toast.error("Keine PDF-Datei vorhanden");
      return;
    }
    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Fehler beim Öffnen der Rechnung");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (!txn) return null;

  const config = MATCH_STATUS_CONFIG[txn.match_status] || MATCH_STATUS_CONFIG.unmatched;
  const StatusIcon = config.icon;
  const isDebit = txn.amount < 0;

  return (
    <Sheet open={!!transactionId} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isDebit ? <ArrowUpRight className="h-5 w-5 text-destructive" /> : <ArrowDownLeft className="h-5 w-5 text-green-600" />}
            Transaktionsdetails
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Amount */}
          <div className="text-center">
            <p className={`text-3xl font-bold font-mono ${isDebit ? "text-destructive" : "text-green-600"}`}>
              {isDebit ? "" : "+"}{Number(txn.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} {txn.currency}
            </p>
            <Badge className={`mt-2 ${config.color}`} variant="outline">
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
            {txn.booked_at && (
              <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                ✓ Gebucht am {format(new Date(txn.booked_at), "dd.MM.yyyy HH:mm", { locale: de })}
              </Badge>
            )}
          </div>

          <Separator />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <InfoRow icon={Calendar} label="Buchungsdatum" value={format(new Date(txn.booking_date), "dd.MM.yyyy", { locale: de })} />
            <InfoRow icon={Calendar} label="Valuta" value={txn.value_date ? format(new Date(txn.value_date), "dd.MM.yyyy", { locale: de }) : "–"} />
          </div>

          <Separator />

          {editMode ? (
            <div className="space-y-3">
              {isDebit ? (
                <>
                  <div>
                    <Label className="text-xs">Empfänger</Label>
                    <Input value={draft.creditor_name} onChange={(e) => setDraft({ ...draft, creditor_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Empfänger-IBAN</Label>
                    <Input value={draft.creditor_iban} onChange={(e) => setDraft({ ...draft, creditor_iban: e.target.value })} className="font-mono" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Auftraggeber</Label>
                    <Input value={draft.debtor_name} onChange={(e) => setDraft({ ...draft, debtor_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Auftraggeber-IBAN</Label>
                    <Input value={draft.debtor_iban} onChange={(e) => setDraft({ ...draft, debtor_iban: e.target.value })} className="font-mono" />
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs">Verwendungszweck</Label>
                <Textarea rows={4} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Tipp: Korrektur sinnvoll, wenn der PDF-Import Felder vertauscht hat.
              </p>
            </div>
          ) : (
            <>
              {/* Debtor */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Auftraggeber</h4>
                <p className="text-sm font-medium">{txn.debtor_name || "–"}</p>
                {txn.debtor_iban && <p className="text-xs font-mono text-muted-foreground">{txn.debtor_iban}</p>}
              </div>

              {/* Creditor */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Empfänger</h4>
                <p className="text-sm font-medium">{txn.creditor_name || "–"}</p>
                {txn.creditor_iban && <p className="text-xs font-mono text-muted-foreground">{txn.creditor_iban}</p>}
              </div>

              <Separator />

              {/* Purpose */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Verwendungszweck</h4>
                <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{txn.purpose || "–"}</p>
              </div>

              {txn.end_to_end_ref && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-1">End-to-End-Referenz</h4>
                  <p className="text-sm font-mono">{txn.end_to_end_ref}</p>
                </div>
              )}
            </>
          )}

          {/* Matched Invoice */}
          {invoice && !editMode && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Zugeordnete Rechnung
                </h4>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Rechnungsnr.</span>
                    <span className="font-medium">{invoice.invoice_number || "–"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Kreditor</span>
                    <span className="font-medium">{invoice.vendor_name || "–"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Brutto</span>
                    <span className="font-mono">{invoice.gross_amount ? `${Number(invoice.gross_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Netto</span>
                    <span className="font-mono">{invoice.net_amount ? `${Number(invoice.net_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}</span>
                  </div>
                  {invoice.file_path && (
                    <Button size="sm" variant="outline" className="w-full mt-2" onClick={openInvoicePdf}>
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Rechnung als PDF anzeigen
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Matched Template */}
          {template && !editMode && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" />
                  Zugeordnete Vorlage
                </h4>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Name</span>
                    <span className="font-medium">{template.name}</span>
                  </div>
                  {template.chart_of_accounts && (
                    <div className="flex justify-between text-sm">
                      <span>Konto</span>
                      <span className="font-medium">{template.chart_of_accounts.account_number} {template.chart_of_accounts.account_name}</span>
                    </div>
                  )}
                  {template.is_35a_relevant && (
                    <Badge variant="outline" className="text-xs mt-1">§35a relevant</Badge>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
