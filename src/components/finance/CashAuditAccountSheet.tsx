import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface CashAuditAccountSheetProps {
  buildingId: string;
  fiscalYear: number;
  progress: Record<string, any>;
  onProgressChange: (progress: Record<string, any>) => void;
  readOnly?: boolean;
}

export function CashAuditAccountSheet({ buildingId, fiscalYear, progress, onProgressChange, readOnly }: CashAuditAccountSheetProps) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const { data: accounts = [] } = useQuery({
    queryKey: ["audit-accounts", buildingId, fiscalYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category")
        .or(`building_id.eq.${buildingId},building_id.is.null`)
        .order("account_number");
      return data || [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, booking_date, description, amount, account_id, counter_account_id, receipt_number, booking_type")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["pending", "confirmed"])
        .order("booking_date");
      return data || [];
    },
  });

  // Group bookings by account
  const accountBookings = accounts
    .map((account) => {
      const entries = bookings.filter((b) => b.account_id === account.id || b.counter_account_id === account.id);
      if (entries.length === 0) return null;

      let cumulativeSaldo = 0;
      const rows = entries.map((b) => {
        const isDebit = b.account_id === account.id;
        const zugang = b.amount > 0 && isDebit ? Math.abs(b.amount) : b.amount < 0 && !isDebit ? Math.abs(b.amount) : 0;
        const abgang = b.amount < 0 && isDebit ? Math.abs(b.amount) : b.amount > 0 && !isDebit ? Math.abs(b.amount) : 0;
        cumulativeSaldo += zugang - abgang;

        const counterAccount = accounts.find((a) => a.id === (isDebit ? b.counter_account_id : b.account_id));

        return {
          id: b.id,
          date: b.booking_date,
          description: b.description || "-",
          counterAccount: counterAccount ? `${counterAccount.account_number} ${counterAccount.account_name}` : "-",
          receiptNumber: b.receipt_number || "-",
          zugang,
          abgang,
          saldo: cumulativeSaldo,
        };
      });

      const totalZugang = rows.reduce((s, r) => s + r.zugang, 0);
      const totalAbgang = rows.reduce((s, r) => s + r.abgang, 0);

      return { account, rows, totalZugang, totalAbgang, totalSaldo: totalZugang - totalAbgang };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];

  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const checkedAccounts = progress?.checkedAccounts || {};
  const accountNotes = progress?.accountNotes || {};

  const toggleChecked = (accountId: string) => {
    if (readOnly) return;
    const updated = { ...checkedAccounts, [accountId]: !checkedAccounts[accountId] };
    onProgressChange({ ...progress, checkedAccounts: updated });
  };

  const setNote = (accountId: string, note: string) => {
    if (readOnly) return;
    const updated = { ...accountNotes, [accountId]: note };
    onProgressChange({ ...progress, accountNotes: updated });
  };

  const checkedCount = Object.values(checkedAccounts).filter(Boolean).length;

  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {checkedCount} von {accountBookings.length} Konten geprüft
        </p>
      </div>

      {accountBookings.map((ab: any) => {
        const isExpanded = expandedAccounts.has(ab.account.id);
        const isChecked = checkedAccounts[ab.account.id];
        const note = accountNotes[ab.account.id] || "";

        return (
          <Card key={ab.account.id} className={cn("transition-colors", isChecked && "border-green-300 bg-green-50/30")}>
            <Collapsible open={isExpanded} onOpenChange={() => toggleAccount(ab.account.id)}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors">
                  {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">
                      {ab.account.account_number} {ab.account.account_name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({ab.rows.length} Buchungen)
                    </span>
                  </div>
                  <span className="text-sm font-mono font-medium">{fmt(ab.totalSaldo)}</span>
                  {isChecked && <Check className="h-4 w-4 text-green-600 flex-shrink-0" />}
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="px-3 pb-3 border-t">
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1.5 pr-2">Datum</th>
                          <th className="text-left py-1.5 pr-2">Buchungstext</th>
                          <th className="text-left py-1.5 pr-2">Gegenkonto</th>
                          <th className="text-left py-1.5 pr-2">Beleg-Nr.</th>
                          <th className="text-right py-1.5 pr-2">Zugang</th>
                          <th className="text-right py-1.5 pr-2">Abgang</th>
                          <th className="text-right py-1.5">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ab.rows.map((row: any) => (
                          <tr key={row.id} className="border-b border-border/50">
                            <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(row.date).toLocaleDateString("de-DE")}</td>
                            <td className="py-1.5 pr-2 max-w-[200px] truncate">{row.description}</td>
                            <td className="py-1.5 pr-2 max-w-[150px] truncate text-muted-foreground">{row.counterAccount}</td>
                            <td className="py-1.5 pr-2">{row.receiptNumber}</td>
                            <td className="py-1.5 pr-2 text-right text-green-700 font-mono">{row.zugang > 0 ? fmt(row.zugang) : ""}</td>
                            <td className="py-1.5 pr-2 text-right text-red-700 font-mono">{row.abgang > 0 ? fmt(row.abgang) : ""}</td>
                            <td className="py-1.5 text-right font-mono font-medium">{fmt(row.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-medium border-t-2">
                          <td colSpan={4} className="py-2 text-right pr-2">Summe:</td>
                          <td className="py-2 text-right text-green-700 font-mono">{fmt(ab.totalZugang)}</td>
                          <td className="py-2 text-right text-red-700 font-mono">{fmt(ab.totalAbgang)}</td>
                          <td className="py-2 text-right font-mono">{fmt(ab.totalSaldo)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant={isChecked ? "default" : "outline"}
                        onClick={(e) => { e.stopPropagation(); toggleChecked(ab.account.id); }}
                        className="gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isChecked ? "Geprüft" : "Als geprüft markieren"}
                      </Button>
                    )}
                    {(note || !readOnly) && (
                      <div className="flex-1">
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(ab.account.id, e.target.value)}
                          placeholder="Anmerkung zum Konto..."
                          className="min-h-[36px] text-xs resize-none"
                          rows={1}
                          readOnly={readOnly}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {accountBookings.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Keine Buchungen für dieses Wirtschaftsjahr gefunden.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
