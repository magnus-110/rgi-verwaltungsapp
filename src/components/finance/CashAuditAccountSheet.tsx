import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingReviewDialog, AuditBookingRow } from "./BookingReviewDialog";

interface CashAuditAccountSheetProps {
  buildingId: string;
  fiscalYear: number;
  progress: Record<string, any>;
  onProgressChange: (progress: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  readOnly?: boolean;
  tokenMode?: boolean;
  token?: string;
}

const PERSON_PATTERN = /^0\d{3}$/;

function intervalFactor(interval?: string | null): number {
  switch ((interval || "").toLowerCase()) {
    case "monatlich":
    case "monthly": return 1;
    case "vierteljährlich":
    case "vierteljaehrlich":
    case "quarterly": return 1 / 3;
    case "halbjährlich":
    case "halbjaehrlich":
    case "semiannual": return 1 / 6;
    case "jährlich":
    case "jaehrlich":
    case "yearly":
    case "annually": return 1 / 12;
    default: return 1;
  }
}

// Months covered by template within fiscal year (pro-rata via valid_from/valid_to)
function monthsInYear(fy: number, validFrom?: string | null, validTo?: string | null): number {
  const yStart = new Date(fy, 0, 1).getTime();
  const yEnd = new Date(fy, 11, 31, 23, 59, 59).getTime();
  const vf = validFrom ? new Date(validFrom).getTime() : yStart;
  const vt = validTo ? new Date(validTo).getTime() : yEnd;
  const start = Math.max(yStart, vf);
  const end = Math.min(yEnd, vt);
  if (end < start) return 0;
  // approximate months: difference in months between months of start..end inclusive
  const sd = new Date(start);
  const ed = new Date(end);
  const months = (ed.getFullYear() - sd.getFullYear()) * 12 + (ed.getMonth() - sd.getMonth()) + 1;
  return Math.max(0, months);
}

export function CashAuditAccountSheet({ buildingId, fiscalYear, progress, onProgressChange, readOnly, tokenMode, token }: CashAuditAccountSheetProps) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewBookings, setReviewBookings] = useState<AuditBookingRow[]>([]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["audit-accounts", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_accounts_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, category")
        .or(`building_id.eq.${buildingId},building_id.is.null`)
        .order("account_number");
      return data || [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-bookings", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_bookings_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, description, amount, account_id, counter_account_id,
          receipt_number, booking_type, amount_35a, is_35a_relevant, invoice_id, matched_template_id,
          split_part, split_parts_total,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, vendor_name, file_path, gross_amount, invoice_number),
          booking_templates!bookings_matched_template_id_fkey(id, name, expected_amount, interval, vendor_name)
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["pending", "confirmed"])
        .order("booking_date");
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["audit-templates", buildingId, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_templates_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("booking_templates")
        .select("id, name, account_id, expected_amount, interval, valid_from, valid_to, vendor_name")
        .eq("building_id", buildingId);
      return data || [];
    },
  });

  // Wirtschaftsplan vorhanden? Nur dann Soll WP / Haben / Δ Badges anzeigen.
  const { data: hasEconomicPlan = false } = useQuery({
    queryKey: ["audit-has-economic-plan", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) return false; // Token-Mode: nicht relevant für externe Prüfer
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("id")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .limit(1)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!buildingId && !!fiscalYear,
  });

  // Compute Soll Hausgeld per Personenkonto from templates
  const sollByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of templates as any[]) {
      if (!t.account_id || !t.expected_amount) continue;
      const months = monthsInYear(fiscalYear, t.valid_from, t.valid_to);
      const factor = intervalFactor(t.interval);
      const soll = Number(t.expected_amount) * months * factor;
      map[t.account_id] = (map[t.account_id] || 0) + soll;
    }
    return map;
  }, [templates, fiscalYear]);

  // Group bookings by account
  const accountBookings = (accounts as any[])
    .map((account) => {
      const entries = (bookings as any[]).filter((b) => b.account_id === account.id || b.counter_account_id === account.id);
      if (entries.length === 0) return null;

      let cumulativeSaldo = 0;
      const rows = entries.map((b) => {
        const isMain = b.account_id === account.id;
        const amt = Number(b.amount) || 0;
        const effectiveType = isMain
          ? (b.booking_type === "income" ? "income" : "expense")
          : (b.booking_type === "income" ? "expense" : "income");
        const signed = effectiveType === "income" ? amt : -amt;
        const zugang = signed > 0 ? signed : 0;
        const abgang = signed < 0 ? -signed : 0;
        cumulativeSaldo += signed;

        const counterAccount = (accounts as any[]).find((a) => a.id === (isMain ? b.counter_account_id : b.account_id));
        const a35a = b.is_35a_relevant ? Number(b.amount_35a) || 0 : 0;

        return {
          id: b.id,
          date: b.booking_date,
          description: b.description || "-",
          counterAccount: counterAccount ? `${counterAccount.account_number} ${counterAccount.account_name}` : "-",
          receiptNumber: b.receipt_number || "-",
          zugang,
          abgang,
          saldo: cumulativeSaldo,
          a35a,
          raw: b,
        };
      });

      const totalZugang = rows.reduce((s, r) => s + r.zugang, 0);
      const totalAbgang = rows.reduce((s, r) => s + r.abgang, 0);
      const total35a = rows.reduce((s, r) => s + r.a35a, 0);

      const isPersonAccount = PERSON_PATTERN.test(account.account_number) && account.account_number !== "0000";
      const soll = isPersonAccount ? (sollByAccount[account.id] || 0) : 0;
      // Haben = tatsächlich gezahltes Hausgeld (Abgänge auf dem Personenkonto = Zahlungen via Bank)
      const haben = totalAbgang;
      const diff = haben - soll;

      return { account, rows, totalZugang, totalAbgang, total35a, totalSaldo: totalZugang - totalAbgang, isPersonAccount, soll, haben, diff };
    })
    .filter(Boolean) as any[];

  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const accountFlags = progress?.accountFlags || {};
  const accountNotes = progress?.accountNotes || {};
  const bookingFlags = progress?.bookingFlags || {};
  const bookingNotes = progress?.bookingNotes || {};

  // Migrate legacy "checkedAccounts" → accountFlags.ok
  const checkedAccountsLegacy = progress?.checkedAccounts || {};
  const getAccountFlag = (id: string): "ok" | "issue" | null => {
    if (accountFlags[id]) return accountFlags[id];
    if (checkedAccountsLegacy[id]) return "ok";
    return null;
  };

  const setAccountFlag = (id: string, f: "ok" | "issue" | null) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, accountFlags: { ...(prev?.accountFlags || {}), [id]: f } }));
  };

  const setAccountNote = (accountId: string, note: string) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, accountNotes: { ...(prev?.accountNotes || {}), [accountId]: note } }));
  };

  const setBookingFlag = (id: string, f: "ok" | "issue" | null) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, bookingFlags: { ...(prev?.bookingFlags || {}), [id]: f } }));
  };
  const setBookingNote = (id: string, note: string) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, bookingNotes: { ...(prev?.bookingNotes || {}), [id]: note } }));
  };

  const checkedCount = accountBookings.filter((ab: any) => getAccountFlag(ab.account.id) === "ok").length;
  const issueCount = accountBookings.filter((ab: any) => getAccountFlag(ab.account.id) === "issue").length;

  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const openReview = (bookingsList: any[], id: string) => {
    setReviewBookings(bookingsList.map((r) => r.raw as AuditBookingRow));
    setReviewBookingId(id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {checkedCount} geprüft · {issueCount} auffällig · {accountBookings.length} Konten
        </p>
      </div>

      {accountBookings.map((ab: any) => {
        const isExpanded = expandedAccounts.has(ab.account.id);
        const flag = getAccountFlag(ab.account.id);
        const note = accountNotes[ab.account.id] || "";

        return (
          <Card key={ab.account.id} className={cn(
            "transition-colors",
            flag === "ok" && "border-green-300 bg-green-50/30",
            flag === "issue" && "border-amber-300 bg-amber-50/30",
          )}>
            <Collapsible open={isExpanded} onOpenChange={() => toggleAccount(ab.account.id)}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors">
                  {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {ab.account.account_number} {ab.account.account_name}
                      </span>
                      <span className="text-xs text-muted-foreground">({ab.rows.length} Buchungen)</span>
                      {ab.isPersonAccount && hasEconomicPlan && ab.soll > 0 && (
                        <>
                          <Badge variant="outline" className="text-[10px] h-5">
                            Soll WP: <span className="font-mono ml-1">{fmt(ab.soll)}</span>
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-5">
                            Gezahlt: <span className="font-mono ml-1">{fmt(ab.haben)}</span>
                          </Badge>
                          <Badge className={cn(
                            "text-[10px] h-5",
                            Math.abs(ab.diff) <= 1 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
                          )}>
                            Δ <span className="font-mono ml-1">{ab.diff >= 0 ? "+" : ""}{fmt(ab.diff)}</span>
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono font-medium">{fmt(ab.totalSaldo)}</span>
                  {flag === "ok" && <Check className="h-4 w-4 text-green-600 flex-shrink-0" />}
                  {flag === "issue" && <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />}
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
                          <th className="text-right py-1.5 pr-2">§35a</th>
                          <th className="text-right py-1.5">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ab.rows.map((row: any) => {
                          const bFlag = bookingFlags[row.id];
                          const adminEdit = (progress?.adminReview || {})[row.id];
                          return (
                            <tr
                              key={row.id}
                              onClick={() => openReview(ab.rows, row.id)}
                              className={cn(
                                "border-b border-border/50 cursor-pointer hover:bg-muted/40",
                                bFlag === "ok" && "bg-green-50/50",
                                bFlag === "issue" && "bg-amber-50/50",
                              )}
                            >
                              <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(row.date).toLocaleDateString("de-DE")}</td>
                              <td className="py-1.5 pr-2 max-w-[220px] truncate">
                                {row.description}
                                {adminEdit && (
                                  <Badge className="ml-1.5 bg-blue-100 text-blue-800 text-[9px] h-4 px-1">
                                    Verwaltung bearb.
                                  </Badge>
                                )}
                              </td>
                              <td className="py-1.5 pr-2 max-w-[150px] truncate text-muted-foreground">{row.counterAccount}</td>
                              <td className="py-1.5 pr-2">{row.receiptNumber}</td>
                              <td className="py-1.5 pr-2 text-right text-green-700 font-mono">{row.zugang > 0 ? fmt(row.zugang) : ""}</td>
                              <td className="py-1.5 pr-2 text-right text-red-700 font-mono">{row.abgang > 0 ? fmt(row.abgang) : ""}</td>
                              <td className="py-1.5 pr-2 text-right text-emerald-700 font-mono">{row.a35a > 0 ? fmt(row.a35a) : ""}</td>
                              <td className="py-1.5 text-right font-mono font-medium">{fmt(row.saldo)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="font-medium border-t-2">
                          <td colSpan={4} className="py-2 text-right pr-2">Summe:</td>
                          <td className="py-2 text-right text-green-700 font-mono">{fmt(ab.totalZugang)}</td>
                          <td className="py-2 text-right text-red-700 font-mono">{fmt(ab.totalAbgang)}</td>
                          <td className="py-2 text-right text-emerald-700 font-mono">{ab.total35a > 0 ? fmt(ab.total35a) : ""}</td>
                          <td className="py-2 text-right font-mono">{fmt(ab.totalSaldo)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    {!readOnly && (
                      <>
                        <Button
                          size="sm"
                          variant={flag === "ok" ? "default" : "outline"}
                          onClick={(e) => { e.stopPropagation(); setAccountFlag(ab.account.id, flag === "ok" ? null : "ok"); }}
                          className={cn("gap-1.5", flag === "ok" && "bg-green-600 hover:bg-green-700 text-white")}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Geprüft
                        </Button>
                        <Button
                          size="sm"
                          variant={flag === "issue" ? "default" : "outline"}
                          onClick={(e) => { e.stopPropagation(); setAccountFlag(ab.account.id, flag === "issue" ? null : "issue"); }}
                          className={cn("gap-1.5", flag === "issue" && "bg-amber-500 hover:bg-amber-600 text-white")}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Auffällig
                        </Button>
                      </>
                    )}
                    {(note || !readOnly) && (
                      <div className="flex-1">
                        <Textarea
                          value={note}
                          onChange={(e) => setAccountNote(ab.account.id, e.target.value)}
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

      <BookingReviewDialog
        open={!!reviewBookingId}
        onOpenChange={(o) => !o && setReviewBookingId(null)}
        bookings={reviewBookings}
        selectedId={reviewBookingId}
        setSelectedId={setReviewBookingId}
        flag={reviewBookingId ? bookingFlags[reviewBookingId] : null}
        setFlag={setBookingFlag}
        note={reviewBookingId ? bookingNotes[reviewBookingId] : ""}
        setNote={setBookingNote}
        readOnly={readOnly}
      />
    </div>
  );
}
