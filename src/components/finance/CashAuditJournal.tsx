import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, AlertTriangle, Search, FileText, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingReviewDialog, AuditBookingRow } from "./BookingReviewDialog";

interface CashAuditJournalProps {
  buildingId: string;
  fiscalYear: number;
  progress: Record<string, any>;
  onProgressChange: (progress: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  readOnly?: boolean;
  tokenMode?: boolean;
  token?: string;
}

export function CashAuditJournal({ buildingId, fiscalYear, progress, onProgressChange, readOnly, tokenMode, token }: CashAuditJournalProps) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const { data: bookings = [] } = useQuery({
    queryKey: ["audit-journal-v2", buildingId, fiscalYear, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_bookings_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, booking_date, description, amount, booking_type,
          receipt_number, account_id, counter_account_id,
          invoice_id, matched_template_id, needs_review, review_note,
          amount_35a, is_35a_relevant, split_part, split_parts_total,
          chart_of_accounts!bookings_account_id_fkey(account_number, account_name),
          counter_account:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name),
          invoices(id, vendor_name, file_path, gross_amount, invoice_number),
          booking_templates!bookings_matched_template_id_fkey(id, name, expected_amount, interval, vendor_name, linked_invoice_id, linked_invoice:invoices!booking_templates_linked_invoice_id_fkey(id, vendor_name, file_path, gross_amount, invoice_number))
        `)
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["pending", "confirmed"])
        .order("booking_date");
      return data || [];
    },
  });

  const bookingFlags = progress?.bookingFlags || {};
  const bookingNotes = progress?.bookingNotes || {};

  const setFlag = (bookingId: string, flag: "ok" | "issue" | null) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, bookingFlags: { ...(prev?.bookingFlags || {}), [bookingId]: flag } }));
  };
  const setNote = (bookingId: string, note: string) => {
    if (readOnly) return;
    onProgressChange((prev: any) => ({ ...prev, bookingNotes: { ...(prev?.bookingNotes || {}), [bookingId]: note } }));
  };

  const filtered = (bookings as any[]).filter((b: any) => {
    if (monthFilter !== "all") {
      const month = new Date(b.booking_date).getMonth().toString();
      if (month !== monthFilter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return (b.description || "").toLowerCase().includes(s) ||
        (b.receipt_number || "").toLowerCase().includes(s) ||
        (b.invoices?.vendor_name || "").toLowerCase().includes(s);
    }
    return true;
  });

  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const flaggedOk = Object.values(bookingFlags).filter((v) => v === "ok").length;
  const flaggedIssue = Object.values(bookingFlags).filter((v) => v === "issue").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen..." className="pl-9" />
        </div>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Monate</SelectItem>
            {months.map((m, i) => (
              <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{filtered.length} Buchungen</span>
        {flaggedOk > 0 && <span className="text-green-600">✓ {flaggedOk} geprüft</span>}
        {flaggedIssue > 0 && <span className="text-amber-600">⚠ {flaggedIssue} auffällig</span>}
      </div>

      <div className="space-y-1.5">
        {filtered.map((booking: any) => {
          const flag = bookingFlags[booking.id];
          const acc = booking.chart_of_accounts;
          const counter = booking.counter_account;
          const isIncome = booking.booking_type === "income";

          return (
            <button
              key={booking.id}
              onClick={() => setSelectedBookingId(booking.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg border bg-card transition-colors hover:bg-muted/40",
                flag === "ok" && "border-green-300 bg-green-50/30",
                flag === "issue" && "border-amber-300 bg-amber-50/30"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap mt-0.5 px-1.5 py-0.5 rounded bg-muted/50">
                  {new Date(booking.booking_date).toLocaleDateString("de-DE")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{booking.description || "–"}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {acc && (
                      <span className="text-[11px] text-muted-foreground">
                        {acc.account_number} {acc.account_name}
                      </span>
                    )}
                    {counter && (
                      <span className="text-[11px] text-muted-foreground">
                        ↔ {counter.account_number} {counter.account_name}
                      </span>
                    )}
                    {booking.invoices && (
                      <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                        <FileText className="h-2.5 w-2.5" /> Rechnung
                      </Badge>
                    )}
                    {booking.booking_templates && !booking.invoices && (
                      <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                        <LayoutTemplate className="h-2.5 w-2.5" /> Vorlage
                      </Badge>
                    )}
                    {booking.is_35a_relevant && booking.amount_35a > 0 && (
                      <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-800">
                        §35a {fmt(Number(booking.amount_35a))}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-mono font-semibold whitespace-nowrap",
                    isIncome ? "text-green-700" : "text-red-700"
                  )}>
                    {isIncome ? "+" : "−"}{fmt(Math.abs(Number(booking.amount)))}
                  </span>
                  {flag === "ok" && <Check className="h-4 w-4 text-green-600" />}
                  {flag === "issue" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Keine Buchungen gefunden.
          </CardContent>
        </Card>
      )}

      <BookingReviewDialog
        open={!!selectedBookingId}
        onOpenChange={(o) => !o && setSelectedBookingId(null)}
        bookings={filtered as AuditBookingRow[]}
        selectedId={selectedBookingId}
        setSelectedId={setSelectedBookingId}
        flag={selectedBookingId ? bookingFlags[selectedBookingId] : null}
        setFlag={setFlag}
        note={selectedBookingId ? bookingNotes[selectedBookingId] : ""}
        setNote={setNote}
        readOnly={readOnly}
        buildingId={buildingId}
        tokenMode={tokenMode}
        token={token}
      />
    </div>
  );
}
