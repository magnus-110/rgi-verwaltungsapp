import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type InvoiceDirection = "outgoing" | "incoming";

/** Eine Rechnungszeile, unabhängig von der Richtung gleich aufgebaut. */
export interface CompanyInvoiceRow {
  id: string;
  direction: InvoiceDirection;
  number: string | null;
  /** Rechnungsdatum als ISO-Datum (YYYY-MM-DD). */
  date: string | null;
  /** Kunde bei Ausgangs-, Lieferant bei Eingangsrechnungen. */
  party: string;
  net: number | null;
  vat: number | null;
  gross: number | null;
  status: string | null;
  /** Pfad im Bucket `invoices`, falls ein Beleg hinterlegt ist. */
  filePath: string | null;
}

export const OUTGOING_STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  partial: "Teilzahlung",
  paid: "Bezahlt",
  overdue: "Überfällig",
  cancelled: "Storniert",
};

export const INCOMING_STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  paid: "Bezahlt",
  scheduled: "Eingeplant",
  rejected: "Abgelehnt",
};

export function invoiceStatusLabel(row: CompanyInvoiceRow): string {
  if (!row.status) return "";
  const map = row.direction === "outgoing" ? OUTGOING_STATUS_LABEL : INCOMING_STATUS_LABEL;
  return map[row.status] ?? row.status;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Rechnungen der Firma. Es wird nichts kopiert — die Zeilen kommen direkt aus
 * `rgi_invoices` (an Kunden) bzw. `invoices` mit `is_company_invoice`
 * (von Lieferanten). Markierst du eine Rechnung nachträglich als RGI, taucht
 * sie hier sofort auf.
 */
export function useCompanyInvoices(
  direction: InvoiceDirection,
  from: string | null,
  to: string | null,
) {
  return useQuery({
    queryKey: ["rgi", "company-invoices", direction, from, to],
    queryFn: async (): Promise<CompanyInvoiceRow[]> => {
      if (direction === "outgoing") {
        let q = db
          .from("rgi_invoices")
          .select(
            "id, invoice_number, issue_date, client_name_snapshot, client_id, subtotal_net, vat_total, total_gross, status, pdf_storage_path",
          );
        if (from) q = q.gte("issue_date", from);
        if (to) q = q.lte("issue_date", to);
        const { data, error } = await q.order("issue_date", { ascending: false });
        if (error) throw error;

        const rows = (data ?? []) as any[];
        // Kundennamen nachladen, wo kein Schnappschuss hinterlegt ist.
        const missing = Array.from(
          new Set(rows.filter((r) => !r.client_name_snapshot && r.client_id).map((r) => r.client_id)),
        );
        const names = new Map<string, string>();
        if (missing.length) {
          const { data: clients } = await db
            .from("rgi_clients")
            .select("id, name")
            .in("id", missing);
          (clients ?? []).forEach((c: any) => names.set(c.id, c.name));
        }

        return rows.map((r) => ({
          id: r.id,
          direction: "outgoing" as const,
          number: r.invoice_number,
          date: r.issue_date,
          party: r.client_name_snapshot || names.get(r.client_id) || "Unbekannter Kunde",
          net: num(r.subtotal_net),
          vat: num(r.vat_total),
          gross: num(r.total_gross),
          status: r.status,
          filePath: r.pdf_storage_path,
        }));
      }

      let q = db
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, vendor_display_name, vendor_name, net_amount, vat_amount, gross_amount, status, file_path",
        )
        .eq("is_company_invoice", true);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      const { data, error } = await q.order("invoice_date", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        direction: "incoming" as const,
        number: r.invoice_number,
        date: r.invoice_date,
        party: r.vendor_display_name || r.vendor_name || "Unbekannter Lieferant",
        net: num(r.net_amount),
        vat: num(r.vat_amount),
        gross: num(r.gross_amount),
        status: r.status,
        filePath: r.file_path,
      }));
    },
  });
}
