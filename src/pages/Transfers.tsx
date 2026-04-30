import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { CreditCard, AlertTriangle, Play, StickyNote, Check, FileCode, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { TransferReviewMode } from "@/components/transfers/TransferReviewMode";
import { InvoiceDropZone } from "@/components/finance/InvoiceDropZone";

export function Transfers() {
  const queryClient = useQueryClient();
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewInvoices, setReviewInvoices] = useState<any[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [retryingOcr, setRetryingOcr] = useState<string | null>(null);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, building_code").order("name");
      return data || [];
    },
  });

  const { data: invoices = [], refetch } = useQuery({
    queryKey: ["transfer-invoices", buildingFilter, showPaid],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, buildings(name, building_code)");

      if (showPaid) {
        // Bezahlte zuerst nach Zahlungsdatum (neueste zuerst), dann nach Fälligkeit
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

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const unpaidInvoices = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);
  const unreviewedInvoices = useMemo(() => invoices.filter(i => i.status !== "paid" && i.review_status !== "verified"), [invoices]);
  const stuckOcrInvoices = useMemo(
    () => invoices.filter((i: any) => i.ocr_status === "pending" || i.ocr_status === "error"),
    [invoices]
  );

  const formatCurrency = (val: number | null) => {
    if (val == null) return "–";
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return isPast(new Date(dueDate)) && !isToday(new Date(dueDate));
  };

  const getPurpose = (inv: any) => {
    if (inv.payment_purpose) return inv.payment_purpose;
    const parts: string[] = [];
    if (inv.invoice_number) parts.push(`Re. Nr. ${inv.invoice_number}`);
    if (inv.description) {
      const short = inv.description.split(/\s+/).slice(0, 3).join(" ");
      parts.push(short);
    }
    return parts.join(", ") || "–";
  };

  const handleSaveNote = async (invoiceId: string) => {
    const { error } = await supabase
      .from("invoices")
      .update({ payment_notes: noteText } as any)
      .eq("id", invoiceId);
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Notiz gespeichert");
      refetch();
    }
    setEditingNote(null);
  };

  const handleMarkAsPaid = async (invoiceId: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "open" : "paid";
    const { error } = await supabase
      .from("invoices")
      .update({
        status: newStatus,
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      } as any)
      .eq("id", invoiceId);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      toast.success(newStatus === "paid" ? "Als bezahlt markiert" : "Auf offen zurückgesetzt");
      refetch();
    }
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
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      toast[failed ? "warning" : "success"](
        failed
          ? `${stuckOcrInvoices.length - failed} OCR-Jobs neu gestartet, ${failed} fehlgeschlagen`
          : `${stuckOcrInvoices.length} OCR-Jobs neu gestartet`
      );
      refetch();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } finally {
      setRetryingOcr(null);
    }
  };

  const openReviewForInvoice = (inv: any) => {
    const isPaid = inv.status === "paid";
    if (isPaid) {
      setReviewInvoices([inv]);
      setReviewIndex(0);
    } else {
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 md:h-6 md:w-6" />
            Überweisungen
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {unpaidInvoices.length} offene Rechnung{unpaidInvoices.length !== 1 ? "en" : ""} zur Zahlung
            {unreviewedInvoices.length > 0 && ` · ${unreviewedInvoices.length} ungeprüft`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2 order-2 sm:order-1">
            <Switch checked={showPaid} onCheckedChange={setShowPaid} id="show-paid" />
            <label htmlFor="show-paid" className="text-sm text-muted-foreground cursor-pointer">
              Bezahlte anzeigen
            </label>
          </div>
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-full sm:w-[220px] h-11 md:h-10 order-1 sm:order-2">
              <SelectValue placeholder="Alle Gebäude" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              <SelectItem value="company">RGI Immobilien GmbH & Co. KG</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.building_code} – {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unreviewedInvoices.length > 0 && (
            <Button onClick={() => { setReviewInvoices(unreviewedInvoices); setReviewIndex(0); setReviewMode(true); }} className="h-11 md:h-10 order-3">
              <Play className="h-4 w-4 mr-2" />
              Prüfmodus ({unreviewedInvoices.length})
            </Button>
          )}
          {stuckOcrInvoices.length > 0 && (
            <Button
              variant="outline"
              onClick={retryAllStuckOcr}
              disabled={retryingOcr === "all"}
              className="h-11 md:h-10 order-4"
            >
              {retryingOcr === "all" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              OCR neu starten ({stuckOcrInvoices.length})
            </Button>
          )}
        </div>
      </div>

      <InvoiceDropZone buildings={buildings} />

      {/* Mobile: Card list */}
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
                    {(inv as any).einvoice_format && (
                      <FileCode className="h-3.5 w-3.5 text-success shrink-0" aria-label="E-Rechnung" />
                    )}
                    {inv.vendor_name || "–"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{getPurpose(inv)}</p>
                </div>
                <p className="text-base font-bold tabular-nums whitespace-nowrap">{formatCurrency(inv.gross_amount)}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {overdue && <AlertTriangle className="h-3 w-3" />}
                  {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yy") : "–"}
                </span>
                {isPaid ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Bezahlt</Badge>
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
                {(inv as any).ocr_status === "processing" && (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" /> OCR läuft
                  </span>
                )}
                {(inv as any).ocr_status === "done" && (
                  <span className="flex items-center gap-1 text-success">
                    <Sparkles className="h-3 w-3" /> OCR fertig
                  </span>
                )}
                {((inv as any).ocr_status === "pending" || (inv as any).ocr_status === "error") && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      retryOcr(inv.id, (inv as any).is_company_invoice);
                    }}
                    className="flex items-center gap-1 text-warning font-medium"
                    title={(inv as any).ocr_error || "OCR noch nicht verarbeitet"}
                  >
                    {retryingOcr === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    OCR starten
                  </span>
                )}
                {hasNote && <StickyNote className="h-3 w-3 text-primary ml-auto" />}
              </div>
              {hasNote && (
                <p className="text-xs text-muted-foreground mt-1.5 pl-0 border-l-2 border-primary/30 pl-2">
                  {(inv as any).payment_notes}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fällig am</TableHead>
              <TableHead>Lieferant</TableHead>
              <TableHead>Verwendungszweck</TableHead>
              <TableHead>IBAN</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Liegenschaft</TableHead>
              <TableHead>OCR</TableHead>
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
                <>
                  <TableRow
                    key={inv.id}
                    className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-destructive/5" : ""} ${isPaid ? "opacity-60" : ""}`}
                    onClick={() => openReviewForInvoice(inv)}
                  >
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                      <div className="flex items-center gap-1.5">
                        {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        {inv.due_date ? format(new Date(inv.due_date), "dd.MM.yyyy") : "–"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {(inv as any).einvoice_format && (
                          <FileCode
                            className="h-3.5 w-3.5 text-success shrink-0"
                            aria-label={`E-Rechnung (${(inv as any).einvoice_format})`}
                          />
                        )}
                        {inv.vendor_name || "–"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getPurpose(inv)}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.vendor_iban || "–"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(inv.gross_amount)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(inv as any).is_company_invoice ? (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">
                          RGI
                        </Badge>
                      ) : (
                        (inv as any).buildings?.name || "–"
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(inv as any).ocr_status === "processing" && (
                        <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
                          <Loader2 className="h-3 w-3 animate-spin" /> Läuft
                        </Badge>
                      )}
                      {(inv as any).ocr_status === "done" && (
                        <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
                          <Sparkles className="h-3 w-3" /> Fertig
                        </Badge>
                      )}
                      {((inv as any).ocr_status === "pending" || (inv as any).ocr_status === "error") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-warning border-warning/30"
                          title={(inv as any).ocr_error || "OCR noch nicht verarbeitet"}
                          disabled={retryingOcr === inv.id || retryingOcr === "all"}
                          onClick={() => retryOcr(inv.id, (inv as any).is_company_invoice)}
                        >
                          {retryingOcr === inv.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1" />
                          )}
                          Starten
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {isPaid ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="secondary" className="text-xs w-fit">Bezahlt</Badge>
                          {(inv as any).paid_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date((inv as any).paid_at), "dd.MM.yy")}
                            </span>
                          )}
                        </div>
                      ) : inv.review_status === "verified" ? (
                        <Badge variant="default" className="text-xs">Geprüft</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Offen</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={isPaid ? "secondary" : "ghost"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={isPaid ? "Als unbezahlt markieren" : "Als bezahlt markieren"}
                          onClick={() => handleMarkAsPaid(inv.id, inv.status)}
                        >
                          <Check className={`h-3.5 w-3.5 ${isPaid ? "text-green-600" : "text-muted-foreground"}`} />
                        </Button>
                        <Popover
                          open={editingNote === inv.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingNote(inv.id);
                              setNoteText((inv as any).payment_notes || "");
                            } else {
                              setEditingNote(null);
                            }
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
                              <Textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Zahlungsnotiz..."
                                rows={3}
                              />
                              <Button size="sm" className="w-full" onClick={() => handleSaveNote(inv.id)}>
                                Speichern
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                  </TableRow>
                  {hasNote && (
                    <TableRow key={`${inv.id}-note`} className={`border-b-0 ${isPaid ? "opacity-60" : ""}`}>
                      <TableCell colSpan={9} className="pt-0 pb-2 pl-8">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="h-3 w-3 text-primary" />
                          {(inv as any).payment_notes}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
