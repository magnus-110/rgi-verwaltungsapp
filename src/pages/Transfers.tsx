import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import {
  CreditCard, AlertTriangle, Play, StickyNote, Check, X, FileCode, Loader2,
  RefreshCw, Sparkles, ArrowDownToLine, ArrowUpFromLine, Link2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TransferReviewMode } from "@/components/transfers/TransferReviewMode";
import { InvoiceDropZone } from "@/components/finance/InvoiceDropZone";

type Direction = "outgoing" | "incoming";

export function Transfers() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialDirection: Direction =
    searchParams.get("direction") === "incoming" ? "incoming" : "outgoing";
  const [direction, setDirection] = useState<Direction>(initialDirection);

  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [periodPreset, setPeriodPreset] = useState<string>("all");
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");

  // Apply preset → from/to
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    if (periodPreset === "all") { setPeriodFrom(""); setPeriodTo(""); return; }
    if (periodPreset === "current_month") {
      setPeriodFrom(fmt(new Date(yyyy, today.getMonth(), 1)));
      setPeriodTo(fmt(new Date(yyyy, today.getMonth() + 1, 0)));
    } else if (periodPreset === "last_month") {
      setPeriodFrom(fmt(new Date(yyyy, today.getMonth() - 1, 1)));
      setPeriodTo(fmt(new Date(yyyy, today.getMonth(), 0)));
    } else if (periodPreset === "current_year") {
      setPeriodFrom(`${yyyy}-01-01`);
      setPeriodTo(`${yyyy}-12-31`);
    } else if (periodPreset === "last_year") {
      setPeriodFrom(`${yyyy - 1}-01-01`);
      setPeriodTo(`${yyyy - 1}-12-31`);
    } else if (periodPreset === "last_30") {
      const from = new Date(); from.setDate(today.getDate() - 30);
      setPeriodFrom(fmt(from)); setPeriodTo(fmt(today));
    } else if (periodPreset === "last_90") {
      const from = new Date(); from.setDate(today.getDate() - 90);
      setPeriodFrom(fmt(from)); setPeriodTo(fmt(today));
    }
  }, [periodPreset]);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewInvoices, setReviewInvoices] = useState<any[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [retryingOcr, setRetryingOcr] = useState<string | null>(null);

  // Manual-match dialog state (only for incoming)
  const [matchInvoice, setMatchInvoice] = useState<any | null>(null);

  // Sync direction → URL param (without polluting history)
  useEffect(() => {
    const current = searchParams.get("direction");
    if (current !== direction) {
      const next = new URLSearchParams(searchParams);
      next.set("direction", direction);
      setSearchParams(next, { replace: true });
    }
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, building_code").order("name");
      return data || [];
    },
  });

  // ───────── OUTGOING (Eingangsrechnungen — bleibt wie bisher) ─────────
  const { data: outgoingInvoices = [], refetch: refetchOutgoing } = useQuery({
    queryKey: ["transfer-invoices-outgoing", buildingFilter, showPaid, periodFrom, periodTo],
    enabled: direction === "outgoing",
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)")
        .neq("invoice_type", "credit_note");

      if (showPaid) {
        query = query
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("due_date", { ascending: true, nullsFirst: false });
      } else {
        query = query
          .neq("status", "paid")
          .order("due_date", { ascending: true, nullsFirst: false });
      }

      if (buildingFilter === "company") {
        query = (query as any).eq("is_company_invoice", true);
      } else if (buildingFilter !== "all") {
        query = query.eq("building_id", buildingFilter);
      }

      if (periodFrom) query = query.gte("invoice_date", periodFrom);
      if (periodTo) query = query.lte("invoice_date", periodTo);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // ───────── INCOMING (Belege für Zahlungseingänge) ─────────
  const { data: incomingInvoices = [], refetch: refetchIncoming } = useQuery({
    queryKey: ["transfer-invoices-incoming", buildingFilter, periodFrom, periodTo],
    enabled: direction === "incoming",
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)")
        .eq("invoice_type", "credit_note")
        .order("created_at", { ascending: false });

      if (buildingFilter !== "all" && buildingFilter !== "company") {
        query = query.eq("building_id", buildingFilter);
      }
      if (periodFrom) query = query.gte("invoice_date", periodFrom);
      if (periodTo) query = query.lte("invoice_date", periodTo);
      const { data, error } = await query;
      if (error) throw error;
      const invs = data || [];
      // Verknüpfte Bank-Transaktionen nachladen, um Status (Vorschlag / Zugeordnet) abzuleiten
      const ids = invs.map((i: any) => i.id);
      if (ids.length === 0) return invs;
      const { data: txs } = await supabase
        .from("bank_transactions")
        .select("id, matched_invoice_id, match_status, booking_date, amount")
        .in("matched_invoice_id", ids);
      const txByInv = new Map<string, any>();
      (txs || []).forEach((t: any) => txByInv.set(t.matched_invoice_id, t));
      return invs.map((i: any) => ({ ...i, _linked_tx: txByInv.get(i.id) || null }));
    },
  });

  const invoices = direction === "outgoing" ? outgoingInvoices : incomingInvoices;
  const refetch = direction === "outgoing" ? refetchOutgoing : refetchIncoming;

  // ───────── Mini-Dashboard Summen (immer beide, klein, oben) ─────────
  const { data: summary } = useQuery({
    queryKey: ["payments-summary", buildingFilter],
    queryFn: async () => {
      let qOut = supabase
        .from("invoices")
        .select("gross_amount")
        .eq("status", "open")
        .neq("invoice_type", "credit_note");
      let qIn = supabase
        .from("invoices")
        .select("gross_amount")
        .eq("status", "credit_open")
        .eq("invoice_type", "credit_note");
      if (buildingFilter === "company") {
        qOut = (qOut as any).eq("is_company_invoice", true);
      } else if (buildingFilter !== "all") {
        qOut = qOut.eq("building_id", buildingFilter);
        qIn = qIn.eq("building_id", buildingFilter);
      }
      const [{ data: o }, { data: i }] = await Promise.all([qOut, qIn]);
      const sum = (rows: any[] | null) =>
        (rows || []).reduce((a, r) => a + (Number(r.gross_amount) || 0), 0);
      return { openOutgoing: sum(o), openIncoming: sum(i) };
    },
    refetchInterval: 15000,
  });

  const unpaidInvoices = useMemo(
    () => outgoingInvoices.filter(i => i.status !== "paid"),
    [outgoingInvoices]
  );
  const unreviewedInvoices = useMemo(
    () => outgoingInvoices.filter(i => i.status !== "paid" && i.review_status !== "verified"),
    [outgoingInvoices]
  );
  const stuckOcrInvoices = useMemo(
    () => invoices.filter((i: any) => !i.ocr_status || i.ocr_status === "pending" || i.ocr_status === "error"),
    [invoices]
  );

  // Suche: Name (Vendor / Verwendungszweck / Re-Nr.) oder Betrag
  const filteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return invoices;
    // Betrag: erlaube "," als Dezimalzeichen
    const num = parseFloat(q.replace(/\./g, "").replace(",", "."));
    const isNum = !isNaN(num);
    return invoices.filter((inv: any) => {
      const fields = [
        inv.vendor_name,
        inv.payment_purpose,
        inv.description,
        inv.invoice_number,
        inv.buildings?.name,
        inv.buildings?.building_code,
        inv.vendor_iban,
      ]
        .filter(Boolean)
        .map((s: any) => String(s).toLowerCase());
      if (fields.some((f) => f.includes(q))) return true;
      if (isNum) {
        const amt = Number(inv.gross_amount) || 0;
        if (Math.abs(amt - num) < 0.005) return true;
        // auch Substring-Treffer auf der formatierten Zahl ("123,45")
        const amtStr = amt.toFixed(2).replace(".", ",");
        if (amtStr.includes(q)) return true;
      }
      return false;
    });
  }, [invoices, searchTerm]);

  const formatCurrency = (val: number | null) =>
    val == null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);

  const isOverdue = (dueDate: string | null) =>
    dueDate ? isPast(new Date(dueDate)) && !isToday(new Date(dueDate)) : false;

  const getPurpose = (inv: any) => {
    if (inv.payment_purpose) return inv.payment_purpose;
    const parts: string[] = [];
    if (inv.invoice_number) parts.push(`Re. Nr. ${inv.invoice_number}`);
    if (inv.description) parts.push(inv.description.split(/\s+/).slice(0, 3).join(" "));
    return parts.join(", ") || "–";
  };

  const handleSaveNote = async (invoiceId: string) => {
    const { error } = await supabase.from("invoices").update({ payment_notes: noteText } as any).eq("id", invoiceId);
    if (error) toast.error("Fehler beim Speichern");
    else { toast.success("Notiz gespeichert"); refetch(); }
    setEditingNote(null);
  };

  const handleMarkAsPaid = async (invoiceId: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "open" : "paid";
    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus, paid_at: newStatus === "paid" ? new Date().toISOString() : null } as any)
      .eq("id", invoiceId);
    if (error) toast.error("Fehler beim Aktualisieren");
    else { toast.success(newStatus === "paid" ? "Als bezahlt markiert" : "Auf offen zurückgesetzt"); refetch(); }
  };

  const retryOcr = async (invoiceId: string, isCompanyInvoice?: boolean) => {
    setRetryingOcr(invoiceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("extract-invoice", {
        body: { invoiceId, isCompanyInvoice: !!isCompanyInvoice },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast.success("OCR wurde neu gestartet");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err: any) {
      toast.error(`OCR konnte nicht gestartet werden: ${err.message || "Unbekannter Fehler"}`);
    } finally {
      setRetryingOcr(null);
    }
  };

  const retryAllStuckOcr = async () => {
    if (stuckOcrInvoices.length === 0) return;
    setRetryingOcr("all");
    let failed = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      for (const inv of stuckOcrInvoices) {
        const { error } = await supabase.functions.invoke("extract-invoice", {
          body: { invoiceId: inv.id, isCompanyInvoice: !!(inv as any).is_company_invoice },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) failed += 1;
        await new Promise((r) => setTimeout(r, 600));
      }
      if (failed) toast.warning(`${stuckOcrInvoices.length - failed} OCR-Jobs neu gestartet, ${failed} fehlgeschlagen`);
      else toast.success(`${stuckOcrInvoices.length} OCR-Jobs neu gestartet`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } finally {
      setRetryingOcr(null);
    }
  };

  const openReviewForInvoice = (inv: any) => {
    if (direction === "incoming") {
      // Belege: Detailansicht (Einzelbeleg) zum Bearbeiten / Löschen
      setReviewInvoices([inv]);
      setReviewIndex(0);
      setReviewMode(true);
      return;
    }
    const isPaid = inv.status === "paid";
    if (isPaid) { setReviewInvoices([inv]); setReviewIndex(0); }
    else {
      setReviewInvoices(unpaidInvoices);
      const idx = unpaidInvoices.findIndex(u => u.id === inv.id);
      setReviewIndex(idx >= 0 ? idx : 0);
    }
    setReviewMode(true);
  };

  if (reviewMode && reviewInvoices.length > 0) {
    return (
      <TransferReviewMode
        invoices={reviewInvoices}
        initialIndex={reviewIndex}
        onClose={() => { setReviewMode(false); refetch(); }}
        onRefetch={refetch}
      />
    );
  }

  return (
    <div className="p-3 md:p-0 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 md:h-6 md:w-6" />
            Zahlungen
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {direction === "outgoing"
              ? `${unpaidInvoices.length} offene Rechnung${unpaidInvoices.length !== 1 ? "en" : ""} zur Zahlung${
                  unreviewedInvoices.length > 0 ? ` · ${unreviewedInvoices.length} ungeprüft` : ""
                }`
              : `${incomingInvoices.length} Beleg${incomingInvoices.length !== 1 ? "e" : ""} für Zahlungseingänge`}
          </p>
        </div>

        {/* Mini-Dashboard */}
        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-md border border-destructive/30 bg-destructive/5">
            <div className="text-muted-foreground">Offen ausgehend</div>
            <div className="font-semibold text-destructive tabular-nums">
              {formatCurrency(summary?.openOutgoing ?? 0)}
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-md border border-success/30 bg-success/5">
            <div className="text-muted-foreground">Offen eingehend</div>
            <div className="font-semibold text-success tabular-nums">
              {formatCurrency(summary?.openIncoming ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Ausgehend / Eingehend */}
      <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
        <TabsList>
          <TabsTrigger value="outgoing" className="gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Ausgehend
          </TabsTrigger>
          <TabsTrigger value="incoming" className="gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
            Eingehend
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter / Aktionen */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3">
        {direction === "outgoing" && (
          <div className="flex items-center gap-2">
            <Switch checked={showPaid} onCheckedChange={setShowPaid} id="show-paid" />
            <label htmlFor="show-paid" className="text-sm text-muted-foreground cursor-pointer">
              Bezahlte anzeigen
            </label>
          </div>
        )}
        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
          <SelectTrigger className="w-full sm:w-[220px] h-11 md:h-10">
            <SelectValue placeholder="Alle Gebäude" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Gebäude</SelectItem>
            {direction === "outgoing" && (
              <SelectItem value="company">RGI Immobilien GmbH & Co. KG</SelectItem>
            )}
            {buildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.building_code} – {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodPreset} onValueChange={setPeriodPreset}>
          <SelectTrigger className="w-full sm:w-[180px] h-11 md:h-10">
            <SelectValue placeholder="Zeitraum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Zeiträume</SelectItem>
            <SelectItem value="current_month">Aktueller Monat</SelectItem>
            <SelectItem value="last_month">Letzter Monat</SelectItem>
            <SelectItem value="last_30">Letzte 30 Tage</SelectItem>
            <SelectItem value="last_90">Letzte 90 Tage</SelectItem>
            <SelectItem value="current_year">Aktuelles Jahr</SelectItem>
            <SelectItem value="last_year">Letztes Jahr</SelectItem>
            <SelectItem value="custom">Benutzerdefiniert…</SelectItem>
          </SelectContent>
        </Select>
        {periodPreset === "custom" && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="h-11 md:h-10 px-2 rounded-md border bg-background text-sm"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="h-11 md:h-10 px-2 rounded-md border bg-background text-sm"
            />
          </div>
        )}
        {direction === "outgoing" && unreviewedInvoices.length > 0 && (
          <Button onClick={() => { setReviewInvoices(unreviewedInvoices); setReviewIndex(0); setReviewMode(true); }} className="h-11 md:h-10">
            <Play className="h-4 w-4 mr-2" />
            Prüfmodus ({unreviewedInvoices.length})
          </Button>
        )}
        {stuckOcrInvoices.length > 0 && (
          <Button variant="outline" onClick={retryAllStuckOcr} disabled={retryingOcr === "all"} className="h-11 md:h-10">
            {retryingOcr === "all" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            OCR neu starten ({stuckOcrInvoices.length})
          </Button>
        )}
      </div>

      {direction === "outgoing" && <InvoiceDropZone buildings={buildings} />}

      {/* ───────── OUTGOING TABLE ───────── */}
      {direction === "outgoing" && (
        <>
          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {invoices.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground border rounded-lg">
                {showPaid ? "Keine Rechnungen vorhanden" : "Keine offenen Rechnungen vorhanden"}
              </div>
            )}
            {invoices.map((inv) => {
              const overdue = inv.status !== "paid" && isOverdue(inv.due_date);
              const isPaid = inv.status === "paid";
              const hasNote = !!(inv as any).payment_notes;
              return (
                <button
                  key={inv.id}
                  onClick={() => openReviewForInvoice(inv)}
                  className={`w-full text-left border rounded-lg p-3 active:bg-muted transition-colors ${overdue ? "border-destructive/40 bg-destructive/5" : ""} ${isPaid ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {(inv as any).einvoice_format && <FileCode className="h-3.5 w-3.5 text-success shrink-0" />}
                        {inv.vendor_name || "–"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{getPurpose(inv)}</p>
                    </div>
                    <p className="text-base font-bold tabular-nums whitespace-nowrap">{formatCurrency(inv.gross_amount)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {!isPaid && (
                      <span className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yy") : "–"}
                      </span>
                    )}
                    {isPaid ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-success/15 text-success border-success/30">
                        ✓ Bezahlt{(inv as any).paid_at ? ` ${format(new Date((inv as any).paid_at), "dd.MM.yy")}` : ""}
                      </Badge>
                    ) : inv.review_status === "verified" ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">Geprüft</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Offen</Badge>
                    )}
                    {(inv as any).is_company_invoice ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary bg-primary/10">RGI</Badge>
                    ) : (inv as any).buildings?.name ? (
                      <span className="text-muted-foreground truncate">· {(inv as any).buildings?.name}</span>
                    ) : null}
                    {hasNote && <StickyNote className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop */}
          <div className="hidden md:block border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  {!showPaid && <TableHead>Fällig am</TableHead>}
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Verwendungszweck</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Liegenschaft</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {showPaid ? "Keine Rechnungen vorhanden" : "Keine offenen Rechnungen vorhanden"}
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => {
                  const overdue = inv.status !== "paid" && isOverdue(inv.due_date);
                  const isPaid = inv.status === "paid";
                  const hasNote = !!(inv as any).payment_notes;
                  return (
                    <TableRow
                      key={inv.id}
                      className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-destructive/5" : ""} ${isPaid ? "opacity-60" : ""}`}
                      onClick={() => openReviewForInvoice(inv)}
                    >
                      {!showPaid && (
                        <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                          <div className="flex items-center gap-1.5">
                            {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yyyy") : "–"}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {(inv as any).einvoice_format && <FileCode className="h-3.5 w-3.5 text-success shrink-0" />}
                          {inv.vendor_name || "–"}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{getPurpose(inv)}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.vendor_iban || "–"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(inv.gross_amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(inv as any).is_company_invoice ? (
                          <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">RGI</Badge>
                        ) : ((inv as any).buildings?.name || "–")}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="text-sm w-fit bg-success/15 text-success border-success/30 hover:bg-success/20 whitespace-nowrap" variant="outline">
                            ✓ Bezahlt{(inv as any).paid_at ? ` am ${format(new Date((inv as any).paid_at), "dd.MM.yyyy")}` : ""}
                          </Badge>
                        ) : inv.review_status === "verified" ? (
                          <Badge variant="default" className="text-xs">Geprüft</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Offen</Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            title={isPaid ? "Als unbezahlt markieren" : "Als bezahlt markieren"}
                            onClick={() => handleMarkAsPaid(inv.id, inv.status)}
                          >
                            {isPaid ? (
                              <X className="h-3.5 w-3.5 text-destructive" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          <Popover
                            open={editingNote === inv.id}
                            onOpenChange={(open) => {
                              if (open) { setEditingNote(inv.id); setNoteText((inv as any).payment_notes || ""); }
                              else setEditingNote(null);
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <StickyNote className={`h-3.5 w-3.5 ${hasNote ? "text-primary" : "text-muted-foreground"}`} />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64" align="end">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Notiz</p>
                                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Zahlungsnotiz..." rows={3} />
                                <Button size="sm" className="w-full" onClick={() => handleSaveNote(inv.id)}>Speichern</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ───────── INCOMING TABLE ───────── */}
      {direction === "incoming" && (
        <IncomingList
          invoices={invoices}
          buildings={buildings}
          formatCurrency={formatCurrency}
          retryOcr={retryOcr}
          retryingOcr={retryingOcr}
          onMatch={(inv) => setMatchInvoice(inv)}
          onRefetch={refetch}
          onOpen={(inv) => openReviewForInvoice(inv)}
        />
      )}

      <ManualMatchDialog
        invoice={matchInvoice}
        onClose={() => setMatchInvoice(null)}
        onMatched={() => { setMatchInvoice(null); refetch(); }}
      />
    </div>
  );
}

// ============================================================
// Incoming list (Belege für Zahlungseingänge)
// ============================================================
function IncomingList({
  invoices, buildings, formatCurrency, retryOcr, retryingOcr, onMatch, onRefetch, onOpen,
}: {
  invoices: any[];
  buildings: any[];
  formatCurrency: (v: number | null) => string;
  retryOcr: (id: string, isCompany?: boolean) => void;
  retryingOcr: string | null;
  onMatch: (inv: any) => void;
  onRefetch: () => void;
  onOpen: (inv: any) => void;
}) {
  const renderStatus = (inv: any) => {
    const tx = inv._linked_tx;
    if (tx && tx.match_status === "matched") {
      return <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
        <Check className="h-3 w-3" /> Zugeordnet
      </Badge>;
    }
    if (tx && tx.match_status === "suggested") {
      return <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
        <Sparkles className="h-3 w-3" /> Vorschlag prüfen
      </Badge>;
    }
    return <Badge variant="outline" className="text-xs gap-1 text-warning border-warning/30">
      <Clock className="h-3 w-3" /> Wartet auf Bank-Eingang
    </Badge>;
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border rounded-lg">
        Noch keine Belege für Zahlungseingänge importiert.
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Absender</TableHead>
            <TableHead>Verwendungszweck</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead>Liegenschaft</TableHead>
            
            <TableHead>Status</TableHead>
            <TableHead className="w-32 text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow
              key={inv.id}
              className="hover:bg-muted/50 cursor-pointer"
              onClick={() => onOpen(inv)}
            >
              <TableCell className="text-sm">
                {inv.invoice_date
                  ? format(new Date(inv.invoice_date), "dd.MM.yyyy")
                  : format(new Date(inv.created_at), "dd.MM.yyyy")}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-1.5">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-success shrink-0" />
                  {inv.vendor_name || "–"}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {inv.payment_purpose || inv.description || "–"}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-success">
                {formatCurrency(inv.gross_amount)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {inv.buildings?.name || "–"}
              </TableCell>
              <TableCell>{renderStatus(inv)}</TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                {!(inv._linked_tx && inv._linked_tx.match_status === "matched") && (
                  <Button
                    variant="outline" size="sm" className="h-8 gap-1.5"
                    onClick={() => onMatch(inv)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Bank zuordnen
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================
// Manual Bank-Match Dialog
// ============================================================
function ManualMatchDialog({
  invoice, onClose, onMatched,
}: {
  invoice: any | null;
  onClose: () => void;
  onMatched: () => void;
}) {
  const [linking, setLinking] = useState<string | null>(null);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["manual-credit-match-candidates", invoice?.id, invoice?.building_id],
    enabled: !!invoice,
    queryFn: async () => {
      // Positive Bank-Transaktionen der letzten 90 Tage, noch nicht zugeordnet
      const since = new Date();
      since.setDate(since.getDate() - 90);
      let q = supabase
        .from("bank_transactions")
        .select("id, booking_date, amount, purpose, debtor_name, debtor_iban, building_id, matched_invoice_id")
        .gt("amount", 0)
        .is("matched_invoice_id", null)
        .gte("booking_date", since.toISOString().slice(0, 10))
        .order("booking_date", { ascending: false })
        .limit(200);
      if (invoice?.building_id) {
        q = q.eq("building_id", invoice.building_id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const handleLink = async (tx: any) => {
    if (!invoice) return;
    setLinking(tx.id);
    try {
      // 1. Bank-Transaktion mit Beleg verknüpfen
      const { error: txErr } = await supabase
        .from("bank_transactions")
        .update({
          matched_invoice_id: invoice.id,
          match_status: "matched",
        } as any)
        .eq("id", tx.id);
      if (txErr) throw txErr;

      // 2. Beleg auf 'paid' setzen mit Zahlungsdatum
      const { error: invErr } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: tx.booking_date ? new Date(tx.booking_date).toISOString() : new Date().toISOString(),
        } as any)
        .eq("id", invoice.id);
      if (invErr) throw invErr;

      toast.success("Beleg manuell zugeordnet");
      onMatched();
    } catch (e: any) {
      toast.error(`Zuordnung fehlgeschlagen: ${e.message || "Unbekannt"}`);
    } finally {
      setLinking(null);
    }
  };

  const fmt = (val: number | null) =>
    val == null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bank-Eingang manuell zuordnen</DialogTitle>
          <DialogDescription>
            {invoice && (
              <>
                Beleg: <strong>{invoice.vendor_name || "Ohne Absender"}</strong> · Betrag:{" "}
                <strong className="text-success">{fmt(invoice.gross_amount)}</strong>
                {invoice.building_id ? "" : " · ⚠️ Ohne Liegenschaft – alle positiven Transaktionen der letzten 90 Tage werden angezeigt"}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Keine passenden Bank-Eingänge in den letzten 90 Tagen gefunden.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Absender</TableHead>
                  <TableHead>Verwendungszweck</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((tx: any) => {
                  const amountMatches =
                    invoice && Math.abs(Math.abs(Number(invoice.gross_amount) || 0) - Number(tx.amount || 0)) < 0.01;
                  return (
                    <TableRow key={tx.id} className={amountMatches ? "bg-success/5" : ""}>
                      <TableCell className="text-sm">
                        {tx.booking_date ? format(new Date(tx.booking_date), "dd.MM.yyyy") : "–"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{tx.debtor_name || "–"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                        {tx.purpose || "–"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-success">
                        {fmt(Number(tx.amount))}
                        {amountMatches && <Sparkles className="inline h-3 w-3 ml-1 text-success" />}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => handleLink(tx)}
                          disabled={linking === tx.id}
                        >
                          {linking === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Zuordnen"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
