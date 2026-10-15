import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import {
  StickyNote, Check, X, FileCode, Loader2,
  RefreshCw, Sparkles, ArrowDownToLine, ArrowUpFromLine, Link2, Clock, ArrowUpDown, Download,
  Plus, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TransferReviewMode } from "@/components/transfers/TransferReviewMode";
import { DatevToggle } from "@/components/transfers/DatevToggle";
import { InvoiceDropZone } from "@/components/finance/InvoiceDropZone";
import JSZip from "jszip";
import { FreigabeAnsicht, useRechnungenInZahlung } from "@/components/zahlungen/FreigabeAnsicht";
import { NeuerAuftrag } from "@/components/zahlungen/NeuerAuftrag";
import { AuftraegeListe } from "@/components/zahlungen/AuftraegeListe";
import { cn } from "@/lib/utils";


type Direction = "outgoing" | "incoming";

export function Transfers() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Reiter wie im Entwurf: offene Rechnungen, Aufträge, Bezahlt, Gutschriften
  type Reiter = "offen" | "auftraege" | "bezahlt" | "gutschriften";
  const startReiter: Reiter =
    searchParams.get("direction") === "incoming" ? "gutschriften" : ((searchParams.get("tab") as Reiter) || "offen");
  const [reiter, setReiter] = useState<Reiter>(startReiter);
  const [ansicht, setAnsicht] = useState<"liste" | "freigabe" | "neu">(
    searchParams.get("ansicht") === "freigabe" ? "freigabe" : "liste",
  );
  const direction: Direction = reiter === "gutschriften" ? "incoming" : "outgoing";
  const showPaid = reiter === "bezahlt";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [sortByBuilding, setSortByBuilding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const { data: inZahlung = new Map<string, string>() } = useRechnungenInZahlung();

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sanitizeFilename = (s: string) =>
    (s || "")
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 80);

  const exportZip = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const { data: rows, error } = await supabase
        .from("invoices")
        .select("id, file_path, file_name, invoice_number, invoice_date, vendor_name")
        .in("id", Array.from(selectedIds));
      if (error) throw error;
      if (!rows || rows.length === 0) {
        toast.error("Keine Rechnungen gefunden");
        return;
      }

      const zip = new JSZip();
      const usedNames = new Set<string>();
      let ok = 0;
      let fail = 0;

      for (const r of rows as any[]) {
        if (!r.file_path) { fail++; continue; }
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from("invoices")
            .download(r.file_path);
          if (dlErr || !blob) { fail++; continue; }

          const datePart = r.invoice_date
            ? format(new Date(r.invoice_date), "yyyyMMdd")
            : "ohne-datum";
          const vendorPart = sanitizeFilename(r.vendor_name || "Lieferant");
          const nrPart = sanitizeFilename(r.invoice_number || r.id.slice(0, 8));
          const ext = (r.file_name?.split(".").pop() || "pdf").toLowerCase();
          const base = `${datePart}_${vendorPart}_${nrPart}`;
          let name = `${base}.${ext}`;
          let i = 2;
          while (usedNames.has(name)) {
            name = `${base}_${i}.${ext}`;
            i++;
          }
          usedNames.add(name);
          zip.file(name, blob);
          ok++;
        } catch {
          fail++;
        }
      }

      if (ok === 0) {
        toast.error("Keine Belege konnten geladen werden");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Zahlungen_${format(new Date(), "yyyyMMdd_HHmm")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`ZIP mit ${ok} Beleg${ok === 1 ? "" : "en"} heruntergeladen${fail ? ` (${fail} fehlgeschlagen)` : ""}`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error(`Export fehlgeschlagen: ${e?.message || "Unbekannt"}`);
    } finally {
      setExporting(false);
    }
  };

  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [retryingOcr, setRetryingOcr] = useState<string | null>(null);

  // Manual-match dialog state (only for incoming)
  const [matchInvoice, setMatchInvoice] = useState<any | null>(null);

  // Reiter → URL (ohne neue Einträge im Verlauf)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("direction");
    next.set("tab", reiter);
    if (ansicht === "liste") next.delete("ansicht");
    else next.set("ansicht", ansicht);
    setSearchParams(next, { replace: true });
  }, [reiter, ansicht]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anzahl offener Aufträge für den Reiter
  const { data: auftragsAnzahl = 0 } = useQuery({
    queryKey: ["auftraege", "anzahl"],
    queryFn: async () => {
      const { count } = await (supabase as any).from("payment_orders").select("id", { count: "exact", head: true }).in("status", ["aktiv", "pausiert"]);
      return count ?? 0;
    },
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name").order("name");
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
        .select("*, buildings(name)")
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
        .select("*, buildings(name)")
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
  const paidInvoices = useMemo(
    () => outgoingInvoices.filter(i => i.status === "paid"),
    [outgoingInvoices]
  );
  // Freigabe: bestätigte, offene Rechnungen einer Liegenschaft, die noch in keinem Zahllauf stecken
  const freigabeAnzahl = useMemo(
    () => outgoingInvoices.filter((i: any) =>
      i.status === "open" && i.review_status === "verified" && i.building_id &&
      i.invoice_type !== "credit_note" && Number(i.gross_amount) > 0 && !inZahlung.has(i.id) && !i.lastschrift
    ).length,
    [outgoingInvoices, inZahlung]
  );
  const stuckOcrInvoices = useMemo(
    () => invoices.filter((i: any) => !i.ocr_status || i.ocr_status === "pending" || i.ocr_status === "error"),
    [invoices]
  );

  // Suche: Name (Vendor / Verwendungszweck / Re-Nr.) oder Betrag
  const filteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const num = parseFloat(q.replace(/\./g, "").replace(",", "."));
    const isNum = q && !isNaN(num);
    const base = !q ? invoices : invoices.filter((inv: any) => {
      const bld = inv.building_id ? buildings.find((x: any) => x.id === inv.building_id) : null;
      const fields = [
        inv.vendor_name,
        inv.payment_purpose,
        inv.description,
        inv.invoice_number,
        inv.buildings?.name,
        bld?.name,
        inv.vendor_iban,
      ]
        .filter(Boolean)
        .map((s: any) => String(s).toLowerCase());
      if (fields.some((f) => f.includes(q))) return true;
      if (isNum) {
        const amt = Number(inv.gross_amount) || 0;
        if (Math.abs(amt - num) < 0.005) return true;
        const amtStr = amt.toFixed(2).replace(".", ",");
        if (amtStr.includes(q)) return true;
      }
      return false;
    });
    if (!sortByBuilding) return base;
    const labelOf = (inv: any) => {
      if ((inv as any).is_company_invoice) return "\u0000RGI"; // group first
      return (inv as any).buildings?.name || "zzz_kein";
    };
    return [...base].sort((a, b) => {
      const la = labelOf(a);
      const lb = labelOf(b);
      const cmp = la.localeCompare(lb, "de");
      if (cmp !== 0) return cmp;
      // innerhalb einer Liegenschaft: nach Fälligkeit
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    });
  }, [invoices, searchTerm, buildings, sortByBuilding]);

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

  // Ein Knopf je Rechnung: „Freigeben" legt sie in die Freigabe (dort per TAN bezahlen)
  const freigeben = async (inv: any) => {
    if (!inv.building_id && !inv.is_company_invoice) {
      toast.error("Bitte zuerst eine Liegenschaft zuordnen (Rechnung öffnen › Zuordnung).");
      return;
    }
    const { error } = await supabase.from("invoices").update({ review_status: "verified" } as any).eq("id", inv.id);
    if (error) toast.error("Fehler beim Freigeben");
    else {
      toast.success(inv.is_company_invoice ? "Freigegeben – RGI-Rechnungen werden nicht über die Freigabe bezahlt" : "Freigegeben – liegt jetzt in der Freigabe");
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
    // Immer aus der (optional nach Liegenschaft sortierten) gefilterten Liste arbeiten
    const pool = filteredInvoices.filter((i: any) =>
      isPaid ? i.status === "paid" : i.status !== "paid"
    );
    setReviewInvoices(pool);
    const idx = pool.findIndex((p: any) => p.id === inv.id);
    setReviewIndex(idx >= 0 ? idx : 0);
    setReviewMode(true);
  };

  // Halte reviewInvoices nach Refetch frisch, damit Änderungen (z. B. Liegenschaft,
  // Verwendungszweck, Empfänger) sofort in der Detailansicht sichtbar sind.
  useEffect(() => {
    if (!reviewMode || reviewInvoices.length === 0) return;
    const pool = [...outgoingInvoices, ...incomingInvoices];
    if (pool.length === 0) return;
    let changed = false;
    const next = reviewInvoices.map((cur) => {
      const fresh = pool.find((p) => p.id === cur.id);
      if (fresh && fresh !== cur) { changed = true; return fresh; }
      return cur;
    });
    if (changed) setReviewInvoices(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outgoingInvoices, incomingInvoices, reviewMode]);

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

  if (ansicht === "freigabe") {
    return (
      <div className="p-3 md:p-0">
        <FreigabeAnsicht onZurueck={() => { setAnsicht("liste"); refetch(); }} />
      </div>
    );
  }
  if (ansicht === "neu") {
    return (
      <div className="p-3 md:p-0">
        <NeuerAuftrag
          onAbbrechen={() => setAnsicht("liste")}
          onFertig={() => { setAnsicht("liste"); setReiter("auftraege"); queryClient.invalidateQueries({ queryKey: ["auftraege"] }); }}
        />
      </div>
    );
  }

  const gebaeudeNamen: Record<string, string> = Object.fromEntries(buildings.map((b: any) => [b.id, b.name]));
  const reiterKnopf = (r: Reiter, text: string) => (
    <button
      type="button"
      onClick={() => setReiter(r)}
      className={cn(
        "min-h-[44px] border-b-2 px-1 text-sm font-medium transition-colors md:text-[15px]",
        reiter === r ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 md:p-0">
      {/* Kopf */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Zahlungen</h1>
          <p className="mt-1.5 text-sm text-muted-foreground md:text-base">
            Rechnungen freigeben, eigene Aufträge anlegen – alles Freigegebene sammelt sich in der Freigabe und wird dort per TAN bezahlt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAnsicht("neu")} className="h-11">
            <Plus className="h-4 w-4 mr-2" /> Neuer Auftrag
          </Button>
          <Button onClick={() => setAnsicht("freigabe")} className="h-11">
            Freigabe
            {freigabeAnzahl > 0 && <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-primary">{freigabeAnzahl}</span>}
          </Button>
        </div>
      </header>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 basis-56 flex-col gap-1.5 text-xs text-muted-foreground sm:max-w-[260px]">
          Liegenschaft
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="h-11 text-sm text-foreground">
              <SelectValue placeholder="Alle Liegenschaften" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Liegenschaften</SelectItem>
              {direction === "outgoing" && <SelectItem value="company">RGI Immobilien GmbH & Co. KG</SelectItem>}
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-[2] basis-64 flex-col gap-1.5 text-xs text-muted-foreground">
          Suche
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Empfänger, Rechnungsnummer, Betrag …"
            className="h-11 text-sm text-foreground"
          />
        </label>
        {reiter !== "auftraege" && (
          <label className="flex basis-44 flex-col gap-1.5 text-xs text-muted-foreground">
            Zeitraum
            <Select value={periodPreset} onValueChange={setPeriodPreset}>
              <SelectTrigger className="h-11 text-sm text-foreground">
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
          </label>
        )}
        {periodPreset === "custom" && reiter !== "auftraege" && (
          <div className="flex items-end gap-1">
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="h-11 rounded-md border bg-background px-2 text-sm" />
            <span className="pb-3 text-xs text-muted-foreground">–</span>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="h-11 rounded-md border bg-background px-2 text-sm" />
          </div>
        )}
      </div>

      {/* Reiter */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b">
        <div className="flex flex-wrap gap-x-6" role="group" aria-label="Ansicht">
          {reiterKnopf("offen", `Rechnungen offen · ${direction === "outgoing" && !showPaid ? unpaidInvoices.length : "…"}`)}
          {reiterKnopf("auftraege", `Aufträge · ${auftragsAnzahl}`)}
          {reiterKnopf("bezahlt", "Bezahlt")}
          {reiterKnopf("gutschriften", "Gutschriften")}
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          {reiter !== "auftraege" && stuckOcrInvoices.length > 0 && (
            <Button size="sm" variant="outline" onClick={retryAllStuckOcr} disabled={retryingOcr === "all"}>
              {retryingOcr === "all" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              OCR neu starten ({stuckOcrInvoices.length})
            </Button>
          )}
          {selectedIds.size > 0 && reiter !== "auftraege" && (
            <Button size="sm" variant="outline" onClick={exportZip} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              ZIP export ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {reiter === "offen" && <InvoiceDropZone buildings={buildings} selectedBuildingId={buildingFilter === "all" || buildingFilter === "company" ? "" : buildingFilter} />}

      {/* Aufträge */}
      {reiter === "auftraege" && <AuftraegeListe buildingId={buildingFilter} suche={searchTerm} namen={gebaeudeNamen} />}

      {/* Rechnungen (offen / bezahlt) */}
      {direction === "outgoing" && reiter !== "auftraege" && (
        <section className="overflow-hidden rounded-xl border bg-card" aria-label={showPaid ? "Bezahlte Rechnungen" : "Offene Rechnungen"}>
          {filteredInvoices.length > 0 && (
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              <Checkbox
                checked={filteredInvoices.every((i: any) => selectedIds.has(i.id))}
                onCheckedChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked) filteredInvoices.forEach((i: any) => next.add(i.id));
                    else filteredInvoices.forEach((i: any) => next.delete(i.id));
                    return next;
                  });
                }}
                aria-label="Alle auswählen"
              />
              <span className="flex-1">{filteredInvoices.length} {showPaid ? "bezahlt" : "offen"}</span>
              <button
                type="button"
                onClick={() => setSortByBuilding((v) => !v)}
                className={cn("inline-flex items-center gap-1", sortByBuilding ? "text-foreground" : "hover:text-foreground")}
              >
                Nach Liegenschaft <ArrowUpDown className={cn("h-3 w-3", sortByBuilding ? "opacity-100" : "opacity-40")} />
              </button>
            </div>
          )}
          {filteredInvoices.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {searchTerm ? "Keine Treffer für die Suche" : showPaid ? "Keine bezahlten Rechnungen im Zeitraum" : "Keine offenen Rechnungen"}
            </div>
          )}
          {filteredInvoices.map((inv: any) => {
            const overdue = inv.status !== "paid" && isOverdue(inv.due_date);
            const isPaid = inv.status === "paid";
            const hasNote = !!inv.payment_notes;
            const objekt = inv.is_company_invoice ? "RGI" : inv.buildings?.name || "ohne Liegenschaft";
            return (
              <div
                key={inv.id}
                role="button"
                tabIndex={0}
                onClick={() => openReviewForInvoice(inv)}
                onKeyDown={(e) => e.key === "Enter" && openReviewForInvoice(inv)}
                className={cn("flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/40", overdue && "bg-destructive/5")}
              >
                <span onClick={(e) => e.stopPropagation()} className="flex">
                  <Checkbox checked={selectedIds.has(inv.id)} onCheckedChange={() => toggleSelected(inv.id)} aria-label="Beleg auswählen" />
                </span>
                <span className={cn("hidden h-8 w-8 shrink-0 items-center justify-center rounded-full sm:flex", isPaid ? "bg-muted text-muted-foreground" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")}>
                  <ArrowUpFromLine className="h-4 w-4" aria-label="Ausgang" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    {inv.einvoice_format && <FileCode className="h-3.5 w-3.5 shrink-0 text-success" />}
                    <span className="truncate">{inv.vendor_name || "–"}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    <span className={cn(overdue && "font-medium text-destructive")}>
                      {inv.invoice_number ? `RE ${inv.invoice_number} · ` : ""}
                      {objekt}
                      {!isPaid && ` · fällig ${inv.due_date ? format(new Date(inv.due_date), "dd.MM.yy") : "–"}`}
                    </span>
                    {isPaid ? (
                      <Badge variant="secondary" className="border-success/30 bg-success/15 px-1.5 py-0 text-[11px] text-success">
                        ✓ Bezahlt{inv.paid_at ? ` ${format(new Date(inv.paid_at), "dd.MM.yy")}` : ""}
                      </Badge>
                    ) : inZahlung.has(inv.id) ? (
                      <Badge variant="outline" className="border-primary/40 px-1.5 py-0 text-[11px] text-primary">Überweisung läuft</Badge>
                    ) : inv.lastschrift ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[11px]" title="Wird per Lastschrift eingezogen">Lastschrift</Badge>
                    ) : inv.review_status === "verified" ? (
                      <Badge variant="default" className="px-1.5 py-0 text-[11px]">In Freigabe</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">Prüfen</Badge>
                    )}
                    {inv.is_company_invoice && inv.invoice_type !== "credit_note" && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <DatevToggle invoiceId={inv.id} enabled={inv.datev_upload} sentAt={inv.datev_sent_at} status={inv.datev_status} error={inv.datev_error} onChanged={refetch} />
                      </span>
                    )}
                    {hasNote && <StickyNote className="h-3 w-3 text-primary" />}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(inv.gross_amount)}</span>
                <span className="hidden items-center gap-0.5 md:flex" onClick={(e) => e.stopPropagation()}>
                  {isPaid ? (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Doch nicht bezahlt – zurück zu offen" onClick={() => handleMarkAsPaid(inv.id, inv.status)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : inv.review_status !== "verified" && !inZahlung.has(inv.id) && !inv.lastschrift ? (
                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => freigeben(inv)}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Freigeben
                    </Button>
                  ) : null}
                  <Popover
                    open={editingNote === inv.id}
                    onOpenChange={(open) => {
                      if (open) { setEditingNote(inv.id); setNoteText(inv.payment_notes || ""); }
                      else setEditingNote(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Notiz">
                        <StickyNote className={cn("h-3.5 w-3.5", hasNote ? "text-primary" : "text-muted-foreground")} />
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
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            );
          })}
        </section>
      )}

      {/* Gutschriften (Belege für Zahlungseingänge) */}
      {direction === "incoming" && (
        <IncomingList
          invoices={filteredInvoices}
          buildings={buildings}
          formatCurrency={formatCurrency}
          retryOcr={retryOcr}
          retryingOcr={retryingOcr}
          onMatch={(inv) => setMatchInvoice(inv)}
          onRefetch={refetch}
          onOpen={(inv) => openReviewForInvoice(inv)}
          sortByBuilding={sortByBuilding}
          onToggleSortByBuilding={() => setSortByBuilding((v) => !v)}
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
  sortByBuilding, onToggleSortByBuilding,
}: {
  invoices: any[];
  buildings: any[];
  formatCurrency: (v: number | null) => string;
  retryOcr: (id: string, isCompany?: boolean) => void;
  retryingOcr: string | null;
  onMatch: (inv: any) => void;
  onRefetch: () => void;
  onOpen: (inv: any) => void;
  sortByBuilding: boolean;
  onToggleSortByBuilding: () => void;
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
            <TableHead>
              <button
                type="button"
                onClick={onToggleSortByBuilding}
                className={`inline-flex items-center gap-1 transition-colors ${sortByBuilding ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title={sortByBuilding ? "Sortierung nach Liegenschaft aktiv – klicken zum Zurücksetzen" : "Nach Liegenschaft gruppieren"}
              >
                Liegenschaft
                <ArrowUpDown className={`h-3 w-3 ${sortByBuilding ? "opacity-100" : "opacity-40"}`} />
              </button>
            </TableHead>
            
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
