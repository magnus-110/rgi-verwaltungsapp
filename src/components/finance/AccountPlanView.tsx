import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Flag, AlertTriangle, BookOpen, RotateCcw, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAccountAggregation, CATEGORY_LABELS } from "./lib/useAccountAggregation";

interface Props {
  bookings: any[];
  fiscalYear: number;
  buildingId?: string | null;
  onRowClick: (booking: any) => void;
  showAllAccounts: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

export function AccountPlanView({ bookings, fiscalYear, buildingId, onRowClick, showAllAccounts }: Props) {
  const queryClient = useQueryClient();
  const [openAccounts, setOpenAccounts] = useState<Record<string, boolean>>({});
  const [undoBooking, setUndoBooking] = useState<any>(null);
  const [undoing, setUndoing] = useState(false);
  const [deleteBooking, setDeleteBooking] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteBooking = async () => {
    if (!deleteBooking) return;
    setDeleting(true);
    try {
      // Free any linked bank transactions (best effort)
      await supabase
        .from("bank_transactions")
        .update({ booked_at: null, booking_id: null })
        .eq("booking_id", deleteBooking.id);
      const { error: delError } = await supabase
        .from("bookings")
        .delete()
        .eq("id", deleteBooking.id);
      if (delError) throw delError;
      toast.success("Buchung gelöscht");
      setDeleteBooking(null);
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0] as string;
        return typeof k === "string" && (k.startsWith("bookings") || k.startsWith("bank-transactions"));
      }});
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setDeleting(false);
    }
  };

  const handleUndoBooking = async () => {
    if (!undoBooking) return;
    setUndoing(true);
    try {
      const { error: txError } = await supabase
        .from("bank_transactions")
        .update({ booked_at: null, booking_id: null })
        .eq("booking_id", undoBooking.id);
      if (txError) throw txError;
      const { error: delError } = await supabase
        .from("bookings")
        .delete()
        .eq("id", undoBooking.id);
      if (delError) throw delError;
      toast.success("Buchung rückgängig – Transaktion zurück im Kontoauszug");
      setUndoBooking(null);
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0] as string;
        return typeof k === "string" && (k.startsWith("bookings") || k.startsWith("bank-transactions"));
      }});
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setUndoing(false);
    }
  };

  // Single source of truth — gemeinsame Aggregation mit BookingReviewSection
  const { grouped, bookingsByAccount, balanceByAccount } = useAccountAggregation({
    bookings,
    fiscalYear,
    buildingId,
    showAllAccounts,
  });

  if (grouped.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Keine Konten/Buchungen vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ category, accounts: catAccounts }) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <Card className="overflow-hidden divide-y">
            {catAccounts.map((acc) => {
              const accBookings = bookingsByAccount[acc.id] || [];
              const movement = accBookings.reduce((s, b) => {
                const sign = b.booking_type === "income" ? 1 : -1;
                return s + sign * Number(b.amount || 0);
              }, 0);
              const opening = balanceByAccount[acc.id] || 0;
              const closing = opening + movement;
              const isOpen = openAccounts[acc.id] || false;
              const hasBookings = accBookings.length > 0;

              return (
                <Collapsible
                  key={acc.id}
                  open={isOpen}
                  onOpenChange={(o) => setOpenAccounts((s) => ({ ...s, [acc.id]: o }))}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left",
                        !hasBookings && "opacity-70"
                      )}
                    >
                      {hasBookings ? (
                        isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="font-mono tabular-nums text-sm font-semibold w-16">{acc.account_number}</span>
                      <span className="text-sm flex-1 truncate">{acc.account_name}</span>
                      <Badge variant="secondary" className="text-[10px] h-5">{accBookings.length} Buch.</Badge>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="flex items-center gap-1.5 px-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Switch
                                checked={!!(acc as any).is_billing_relevant}
                                onCheckedChange={async (v) => {
                                  const { error } = await supabase
                                    .from("chart_of_accounts")
                                    .update({ is_billing_relevant: v })
                                    .eq("id", acc.id);
                                  if (error) { toast.error("Fehler: " + error.message); return; }
                                  toast.success(v ? "Konto ist abrechnungsrelevant" : "Konto nicht mehr abrechnungsrelevant");
                                  queryClient.invalidateQueries({ queryKey: ["coa-aggregation"] });
                                  queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
                                }}
                                className="scale-75"
                              />
                              <span className="text-[10px] text-muted-foreground select-none">Abr.</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Abrechnungsrelevant – beeinflusst Abrechnung & Vermögensbericht</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className="text-xs text-muted-foreground tabular-nums w-28 text-right">
                        EB: {formatCurrency(opening)}
                      </span>
                      <span className={cn(
                        "text-sm font-mono tabular-nums font-semibold w-32 text-right",
                        movement > 0 ? "text-green-600" : movement < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {movement > 0 ? "+" : ""}{formatCurrency(movement)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums w-28 text-right border-l pl-3">
                        Saldo: {formatCurrency(closing)}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  {hasBookings && (
                    <CollapsibleContent>
                      <div className="bg-muted/20 border-t">
                        <Table>
                          <TableHeader>
                            <TableRow className="text-xs hover:bg-transparent">
                              <TableHead className="py-1.5 px-3 h-8">Datum</TableHead>
                              <TableHead className="py-1.5 px-3 h-8">Beleg</TableHead>
                              <TableHead className="py-1.5 px-3 h-8">Buchungstext</TableHead>
                              <TableHead className="py-1.5 px-3 h-8">Gegenkonto</TableHead>
                              <TableHead className="py-1.5 px-3 h-8 text-right">Betrag</TableHead>
                              <TableHead className="py-1.5 px-3 h-8 w-[40px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {accBookings.map((b) => {
                              const isIncome = b.booking_type === "income";
                              return (
                                <TableRow
                                  key={b.id}
                                  className={cn(
                                    "group cursor-pointer text-[13px] hover:bg-muted/60",
                                    b.needs_review && "bg-orange-50 dark:bg-orange-950/20"
                                  )}
                                  onClick={() => onRowClick(b)}
                                >
                                  <TableCell className="py-1.5 px-3 whitespace-nowrap tabular-nums">
                                    {format(new Date(b.booking_date), "dd.MM.yyyy")}
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 font-mono text-xs">{b.receipt_number || b.booking_reference || "–"}</TableCell>
                                  <TableCell className="py-1.5 px-3 max-w-[400px] truncate">{b.description || "–"}</TableCell>
                                  <TableCell className="py-1.5 px-3 font-mono text-xs">
                                    {b.counter_account?.account_number || "–"}
                                    {b.counter_account?.account_name && (
                                      <span className="text-muted-foreground ml-1.5">{b.counter_account.account_name}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className={cn(
                                    "py-1.5 px-3 font-mono tabular-nums font-semibold whitespace-nowrap",
                                    isIncome ? "text-green-600" : "text-destructive"
                                  )}>
                                    <div className="flex items-center justify-end gap-2">
                                      <span>{isIncome ? "+" : ""}{formatCurrency(Number(b.amount))}</span>
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {b.source === "bank_import" && b.bank_transaction_id && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-5 w-5 p-0"
                                                  onClick={(e) => { e.stopPropagation(); setUndoBooking(b); }}
                                                >
                                                  <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent><p className="text-xs">Buchung rückgängig – zurück zum Kontoauszug</p></TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 w-5 p-0"
                                                onClick={(e) => { e.stopPropagation(); setDeleteBooking(b); }}
                                              >
                                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p className="text-xs">Buchung löschen</p></TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                      {b.needs_review && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 w-5 p-0"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const { error } = await supabase
                                                    .from("bookings")
                                                    .update({ needs_review: false })
                                                    .eq("id", b.id);
                                                  if (error) { toast.error("Fehler: " + error.message); return; }
                                                  toast.success("Prüfung erledigt");
                                                  queryClient.invalidateQueries({ queryKey: ["bookings-all"] });
                                                  queryClient.invalidateQueries({ queryKey: ["bookings-manual"] });
                                                }}
                                              >
                                                <Flag className="h-3 w-3 text-orange-500 fill-orange-500" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p className="text-xs">Prüfung erledigt (Klick)</p></TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {b.ai_warning && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              );
            })}
          </Card>
        </div>
      ))}

      <AlertDialog open={!!undoBooking} onOpenChange={(o) => !o && setUndoBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung rückgängig machen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Buchung wird gelöscht und die zugehörige Bank-Transaktion erscheint wieder im Kontoauszug zur Verarbeitung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={undoing}
              onClick={(e) => { e.preventDefault(); handleUndoBooking(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {undoing ? "Wird rückgängig gemacht…" : "Rückgängig machen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteBooking} onOpenChange={(o) => !o && setDeleteBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Buchung wird unwiderruflich gelöscht. Eventuell verknüpfte Bank-Transaktionen werden wieder freigegeben.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDeleteBooking(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Wird gelöscht…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
