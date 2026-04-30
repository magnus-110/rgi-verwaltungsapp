import { useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Building2, FileText, CalendarDays, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (amount: number | null | undefined) =>
  amount != null && !isNaN(amount)
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount)
    : "–";

interface InvoiceLineItemsViewProps {
  invoice: any;
  /** Indices of items selected for the currently-active booking row */
  selectedIndices: number[];
  /** Map of item index -> "Buchung N" badge if used in another row */
  usedInOtherRows: Record<number, number>;
  onToggleItem: (index: number) => void;
  onCreateNewBookingFromSelection?: () => void;
  hasActiveRow: boolean;
}

export function InvoiceLineItemsView({
  invoice,
  selectedIndices,
  usedInOtherRows,
  onToggleItem,
  onCreateNewBookingFromSelection,
  hasActiveRow,
}: InvoiceLineItemsViewProps) {
  const items: Array<{ description: string; amount: number; vat_rate?: number; quantity?: number }> =
    useMemo(() => {
      const raw = invoice?.line_items;
      if (!Array.isArray(raw)) return [];
      return raw.map((it: any) => ({
        description: String(it?.description ?? "").trim(),
        amount: typeof it?.amount === "number" ? it.amount : parseFloat(it?.amount) || 0,
        vat_rate: it?.vat_rate != null ? Number(it.vat_rate) : undefined,
        quantity: it?.quantity != null ? Number(it.quantity) : undefined,
      }));
    }, [invoice?.line_items]);

  const selectedSet = new Set(selectedIndices);
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
  const selectedTotal = items.reduce((s, i, idx) => (selectedSet.has(idx) ? s + i.amount : s), 0);

  const net = invoice?.net_amount ?? null;
  const vat = invoice?.vat_amount ?? null;
  const gross = invoice?.gross_amount ?? null;

  // If line items appear to be net amounts but invoice is gross, show a hint
  const itemsLookLikeNet = net != null && Math.abs(itemsTotal - net) < Math.abs(itemsTotal - (gross ?? 0));

  const invoiceDate = invoice?.invoice_date ? safeFormat(invoice.invoice_date) : null;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/20">
      <div className="max-w-3xl mx-auto p-6">
        {/* Invoice header card – styled like a real invoice */}
        <div className="bg-background rounded-md border shadow-sm p-6 space-y-5">
          {/* Top: Vendor + Invoice meta */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Building2 className="h-3.5 w-3.5" />
                Kreditor
              </div>
              <div className="text-lg font-semibold text-foreground">
                {invoice?.vendor_name || "Unbekannter Kreditor"}
              </div>
              {invoice?.description && (
                <div className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
                  {invoice.description}
                </div>
              )}
            </div>
            <div className="text-right space-y-1.5">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Rechnung</div>
              {invoice?.invoice_number && (
                <div className="flex items-center justify-end gap-1.5 text-sm font-mono font-medium">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  {invoice.invoice_number}
                </div>
              )}
              {invoiceDate && (
                <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {invoiceDate}
                </div>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Positionen
              </h4>
              <span className="text-xs text-muted-foreground">
                Klick = der aktuellen Buchung zuordnen
              </span>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
                Keine OCR-Positionen vorhanden.
              </div>
            ) : (
              <>
                <div className="border rounded-md overflow-hidden divide-y">
                  {/* Column headers */}
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    <span className="w-5">#</span>
                    <span>Beschreibung</span>
                    <span className="text-right w-14">MwSt</span>
                    <span className="text-right w-24">Betrag</span>
                  </div>
                  {items.map((item, idx) => {
                    const selected = selectedSet.has(idx);
                    const usedInRow = usedInOtherRows[idx];
                    const dimmed = !selected && (selectedSet.size > 0 || usedInRow != null);

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => hasActiveRow && onToggleItem(idx)}
                        disabled={!hasActiveRow}
                        className={cn(
                          "w-full grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2.5 text-left transition-colors text-sm",
                          "hover:bg-accent/50 focus:bg-accent/50 focus:outline-none",
                          selected &&
                            "bg-primary/10 hover:bg-primary/15 ring-1 ring-inset ring-primary/40",
                          dimmed && "opacity-40 hover:opacity-70",
                          !hasActiveRow && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span
                          className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5",
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30 text-muted-foreground"
                          )}
                        >
                          {selected ? "✓" : idx + 1}
                        </span>
                        <span
                          className={cn(
                            "leading-snug",
                            selected ? "font-medium text-foreground" : "text-foreground/90"
                          )}
                        >
                          {item.description || <em className="text-muted-foreground">(ohne Bezeichnung)</em>}
                          {usedInRow != null && (
                            <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4">
                              → Buchung {usedInRow}
                            </Badge>
                          )}
                        </span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums w-14">
                          {item.vat_rate != null ? `${item.vat_rate}%` : "–"}
                        </span>
                        <span
                          className={cn(
                            "text-right tabular-nums w-24",
                            selected ? "font-semibold" : "font-medium"
                          )}
                        >
                          {formatCurrency(item.amount)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selection summary */}
                <div className="mt-3 flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                  <div className="text-muted-foreground">
                    {selectedSet.size > 0 ? (
                      <>
                        <span className="font-medium text-foreground">{selectedSet.size}</span> /{" "}
                        {items.length} Positionen ausgewählt
                      </>
                    ) : (
                      <>Nichts ausgewählt</>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Summe Auswahl</div>
                    <div className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(selectedTotal)}
                    </div>
                  </div>
                </div>

                {onCreateNewBookingFromSelection && selectedSet.size > 0 && (
                  <button
                    type="button"
                    onClick={onCreateNewBookingFromSelection}
                    className="mt-2 w-full text-xs px-3 py-2 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors"
                  >
                    + Neue Buchung aus Auswahl anlegen
                  </button>
                )}
              </>
            )}
          </div>

          {/* Totals footer like a real invoice */}
          <div className="pt-4 border-t space-y-1.5 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Nettosumme</span>
              <span className="tabular-nums">{formatCurrency(net)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>MwSt</span>
              <span className="tabular-nums">{formatCurrency(vat)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t font-semibold text-base">
              <span>Bruttobetrag</span>
              <span className="tabular-nums">{formatCurrency(gross)}</span>
            </div>
            {items.length > 0 && itemsLookLikeNet && net != null && Math.abs(itemsTotal - net) > 0.05 && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                Hinweis: Summe der Positionen ({formatCurrency(itemsTotal)}) weicht vom Netto ab.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function safeFormat(d: string): string | null {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return format(dt, "dd.MM.yyyy", { locale: de });
  } catch {
    return null;
  }
}
