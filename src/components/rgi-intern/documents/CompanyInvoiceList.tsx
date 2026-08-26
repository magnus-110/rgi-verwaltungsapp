import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ExternalLink, FileSpreadsheet, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  CompanyInvoiceRow,
  InvoiceDirection,
  invoiceStatusLabel,
  useCompanyInvoices,
} from "@/hooks/useCompanyInvoices";

const INVOICE_BUCKET = "invoices";

type Preset =
  | "all"
  | "current_month"
  | "last_month"
  | "current_year"
  | "last_year"
  | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  all: "Alle",
  current_month: "Dieser Monat",
  last_month: "Letzter Monat",
  current_year: "Dieses Jahr",
  last_year: "Letztes Jahr",
  custom: "Eigener Zeitraum",
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

const eur = (v: number | null) =>
  v == null
    ? ""
    : v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** Dateinamen ohne Umlaute und Sonderzeichen, damit ZIPs überall aufgehen. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

interface Props {
  direction: InvoiceDirection;
}

export function CompanyInvoiceList({ direction }: Props) {
  const [preset, setPreset] = useState<Preset>("current_year");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"zip" | "xlsx" | null>(null);

  useEffect(() => {
    const now = new Date();
    switch (preset) {
      case "all":
        setFrom(null);
        setTo(null);
        break;
      case "current_month":
        setFrom(iso(startOfMonth(now)));
        setTo(iso(endOfMonth(now)));
        break;
      case "last_month": {
        const prev = subMonths(now, 1);
        setFrom(iso(startOfMonth(prev)));
        setTo(iso(endOfMonth(prev)));
        break;
      }
      case "current_year":
        setFrom(iso(startOfYear(now)));
        setTo(iso(endOfYear(now)));
        break;
      case "last_year": {
        const prev = subYears(now, 1);
        setFrom(iso(startOfYear(prev)));
        setTo(iso(endOfYear(prev)));
        break;
      }
      case "custom":
        break;
    }
  }, [preset]);

  const { data: rows = [], isLoading } = useCompanyInvoices(direction, from, to);

  const totals = useMemo(
    () => ({
      count: rows.length,
      net: rows.reduce((s, r) => s + (r.net ?? 0), 0),
      gross: rows.reduce((s, r) => s + (r.gross ?? 0), 0),
    }),
    [rows],
  );

  /** Nach Jahr und Monat gruppiert, neueste zuerst. */
  const groups = useMemo(() => {
    const map = new Map<string, CompanyInvoiceRow[]>();
    for (const r of rows) {
      const key = r.date ? r.date.slice(0, 7) : "ohne-datum";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const monthTitle = (key: string) =>
    key === "ohne-datum"
      ? "Ohne Datum"
      : format(new Date(`${key}-01T00:00:00`), "LLLL yyyy", { locale: de });

  const openInvoice = async (r: CompanyInvoiceRow) => {
    if (!r.filePath) {
      toast.error("Zu dieser Rechnung ist kein Beleg hinterlegt.");
      return;
    }
    const { data, error } = await supabase.storage
      .from(INVOICE_BUCKET)
      .createSignedUrl(r.filePath, 600);
    if (error || !data) {
      toast.error("Beleg konnte nicht geöffnet werden.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const periodSuffix = from && to ? `${from}_bis_${to}` : "alle";
  const kindLabel = direction === "outgoing" ? "Ausgangsrechnungen" : "Eingangsrechnungen";

  const exportZip = async () => {
    const withFile = rows.filter((r) => r.filePath);
    if (withFile.length === 0) {
      toast.error("Keine Belege im gewählten Zeitraum.");
      return;
    }
    setBusy("zip");
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      let failed = 0;
      for (const r of withFile) {
        const { data, error } = await supabase.storage
          .from(INVOICE_BUCKET)
          .download(r.filePath!);
        if (error || !data) {
          failed += 1;
          continue;
        }
        const ext = r.filePath!.split(".").pop() || "pdf";
        const folder = r.date ? r.date.slice(0, 7) : "ohne-datum";
        const base = sanitizeFilename(
          [r.date ?? "", r.party, r.number ?? ""].filter(Boolean).join("_"),
        );
        let name = `${folder}/${base}.${ext}`;
        let i = 2;
        while (used.has(name)) {
          name = `${folder}/${base}_${i}.${ext}`;
          i += 1;
        }
        used.add(name);
        zip.file(name, data);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kindLabel}_${periodSuffix}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (failed > 0) toast.warning(`${failed} Beleg(e) konnten nicht geladen werden.`);
      else toast.success(`${used.size} Beleg(e) exportiert`);
    } catch (e: any) {
      toast.error(e.message ?? "Export fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const exportXlsx = () => {
    if (rows.length === 0) {
      toast.error("Keine Rechnungen im gewählten Zeitraum.");
      return;
    }
    setBusy("xlsx");
    try {
      const partyHeader = direction === "outgoing" ? "Kunde" : "Lieferant";
      const sheet = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Datum: r.date ? format(new Date(r.date), "dd.MM.yyyy") : "",
          Nummer: r.number ?? "",
          [partyHeader]: r.party,
          "Netto (EUR)": r.net ?? "",
          "USt (EUR)": r.vat ?? "",
          "Brutto (EUR)": r.gross ?? "",
          Status: invoiceStatusLabel(r),
          Beleg: r.filePath ? "ja" : "nein",
        })),
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, kindLabel.slice(0, 31));
      XLSX.writeFile(book, `${kindLabel}_${periodSuffix}.xlsx`);
      toast.success("Liste exportiert");
    } catch (e: any) {
      toast.error(e.message ?? "Export fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="h-8 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRESET_LABEL) as Preset[]).map((k) => (
              <SelectItem key={k} value={k}>
                {PRESET_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" && (
          <>
            <Input
              type="date"
              className="h-8 w-[150px]"
              value={from ?? ""}
              onChange={(e) => setFrom(e.target.value || null)}
            />
            <Input
              type="date"
              className="h-8 w-[150px]"
              value={to ?? ""}
              onChange={(e) => setTo(e.target.value || null)}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportZip} disabled={busy !== null}>
            {busy === "zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Belege als ZIP
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportXlsx} disabled={busy !== null}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Liste als Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>{totals.count} Rechnung(en)</span>
        <span>Netto {eur(totals.net)}</span>
        <span>Brutto {eur(totals.gross)}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Laden…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Receipt className="mx-auto mb-2 h-10 w-10 opacity-30" />
            Keine Rechnungen im gewählten Zeitraum.
          </div>
        ) : (
          groups.map(([key, list]) => (
            <div key={key}>
              <div className="sticky top-0 z-[1] border-b bg-muted/60 px-3 py-1.5 text-xs font-medium backdrop-blur">
                {monthTitle(key)} · {list.length}
              </div>
              {list.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 border-b px-3 py-2.5 hover:bg-accent/60"
                >
                  <div className="flex-shrink-0 rounded bg-muted p-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.party}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.date ? format(new Date(r.date), "dd.MM.yyyy") : "ohne Datum"}
                      {r.number ? ` · ${r.number}` : ""}
                    </p>
                  </div>
                  {r.status && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {invoiceStatusLabel(r)}
                    </Badge>
                  )}
                  <div className="w-28 text-right text-sm tabular-nums">{eur(r.gross)}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    title={r.filePath ? "Beleg öffnen" : "Kein Beleg hinterlegt"}
                    disabled={!r.filePath}
                    onClick={() => openInvoice(r)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
