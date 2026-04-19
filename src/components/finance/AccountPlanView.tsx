import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Flag, AlertTriangle, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  asset: "Aktiva",
  liability: "Passiva",
  equity: "Eigenkapital",
  income: "Erträge",
  expense: "Aufwendungen",
  revenue: "Erträge",
  expenses: "Aufwendungen",
};

const CATEGORY_ORDER = ["asset", "liability", "equity", "income", "revenue", "expense", "expenses"];

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

  // Load all accounts (filtered by building when possible)
  const { data: accounts = [] } = useQuery({
    queryKey: ["coa-for-plan", buildingId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("chart_of_accounts").select("id, account_number, account_name, category, sort_order, building_id");
      if (buildingId) q = q.or(`building_id.eq.${buildingId},building_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Opening balances per account
  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances-plan", fiscalYear, buildingId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("account_balances").select("account_id, opening_balance, closing_balance, building_id").eq("fiscal_year", fiscalYear);
      if (buildingId) q = q.eq("building_id", buildingId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const balanceByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    balances.forEach((b: any) => {
      m[b.account_id] = (m[b.account_id] || 0) + Number(b.opening_balance || 0);
    });
    return m;
  }, [balances]);

  // Group bookings by account_id AND counter_account_id (double-entry display)
  // Each booking appears on BOTH accounts: once as primary side, once as counter side (sign flipped)
  const bookingsByAccount = useMemo(() => {
    const m: Record<string, any[]> = {};
    bookings.forEach((b) => {
      // Primary side
      if (b.account_id) {
        if (!m[b.account_id]) m[b.account_id] = [];
        m[b.account_id].push({ ...b, _side: "primary" });
      }
      // Counter side — flip booking_type so income on one side shows as expense on the other
      if (b.counter_account_id) {
        if (!m[b.counter_account_id]) m[b.counter_account_id] = [];
        const flippedType = b.booking_type === "income" ? "expense" : "income";
        // Swap account display: on counter row, the "counter_account" should be the original primary account
        const counterDisplay = b.chart_of_accounts
          ? { account_number: b.chart_of_accounts.account_number, account_name: b.chart_of_accounts.account_name }
          : null;
        m[b.counter_account_id].push({
          ...b,
          _side: "counter",
          booking_type: flippedType,
          counter_account: counterDisplay,
        });
      }
    });
    // Sort each account's bookings by date desc to keep ordering stable
    Object.values(m).forEach(arr => arr.sort((a, b) => String(b.booking_date).localeCompare(String(a.booking_date))));
    return m;
  }, [bookings]);

  // Build grouped structure: category -> accounts[]
  const grouped = useMemo(() => {
    const accMap = new Map<string, any>();
    accounts.forEach((a: any) => accMap.set(a.id, a));

    // Include accounts that have bookings even if not in COA list (defensive)
    Object.keys(bookingsByAccount).forEach((accId) => {
      if (!accMap.has(accId)) {
        const sample = bookingsByAccount[accId][0];
        accMap.set(accId, {
          id: accId,
          account_number: sample.chart_of_accounts?.account_number || "?",
          account_name: sample.chart_of_accounts?.account_name || "Unbekannt",
          category: "expense",
          sort_order: 9999,
        });
      }
    });

    const list = Array.from(accMap.values()).filter((a) => {
      const hasBookings = (bookingsByAccount[a.id]?.length || 0) > 0;
      return showAllAccounts || hasBookings;
    });

    const byCat: Record<string, any[]> = {};
    list.forEach((a) => {
      const cat = a.category || "expense";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(a);
    });

    Object.values(byCat).forEach((arr) =>
      arr.sort((a, b) => String(a.account_number).localeCompare(String(b.account_number), "de", { numeric: true }))
    );

    const orderedCats = Object.keys(byCat).sort((a, b) =>
      a.localeCompare(b, "de", { numeric: true, sensitivity: "base" })
    );

    return orderedCats.map((cat) => ({ category: cat, accounts: byCat[cat] }));
  }, [accounts, bookingsByAccount, showAllAccounts]);

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
                        !hasBookings && "opacity-60"
                      )}
                      disabled={!hasBookings}
                    >
                      {hasBookings ? (
                        isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="font-mono tabular-nums text-sm font-semibold w-16">{acc.account_number}</span>
                      <span className="text-sm flex-1 truncate">{acc.account_name}</span>
                      <Badge variant="secondary" className="text-[10px] h-5">{accBookings.length} Buch.</Badge>
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
                                    "cursor-pointer text-[13px] hover:bg-muted/60",
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
                                    "py-1.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap",
                                    isIncome ? "text-green-600" : "text-destructive"
                                  )}>
                                    {isIncome ? "+" : ""}{formatCurrency(Number(b.amount))}
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
    </div>
  );
}
