import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, FileText, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { euro, ibanFormatiert } from "@/lib/bankInfo";

interface Props {
  txn: any;
  onBuchungBearbeiten: (bookingId: string) => void;
  onRechnungOeffnen: (invoice: { file_path: string; name: string }) => void;
  /** Nur Beleg zeigen, ohne Buchungshinweis (z. B. RGI-Konto, gebucht wird in DATEV). */
  ohneBuchung?: boolean;
}

/**
 * Aufgeklappte Kontobewegung: der Beleg (Rechnung, Vorlage,
 * Verwendungszweck) und darunter ein kleiner Hinweis, ob eine Buchung
 * verknüpft ist. Ein Klick darauf zeigt, wie die Buchung aussieht.
 * Gebucht wird in der Buchhaltung, nicht hier.
 */
export function BewegungDetail({ txn, onBuchungBearbeiten, onRechnungOeffnen, ohneBuchung }: Props) {
  const [buchungOffen, setBuchungOffen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["konten-bewegung-detail", txn.id, txn.booking_id, txn.matched_invoice_id, txn.booked_at],
    queryFn: async () => {
      const bookingIds = new Set<string>();
      const { data: perTxn } = await supabase.from("bookings").select("id").eq("bank_transaction_id", txn.id);
      (perTxn ?? []).forEach((b: any) => bookingIds.add(b.id));
      if (txn.booking_id) bookingIds.add(txn.booking_id);

      let buchungen: any[] = [];
      if (bookingIds.size > 0) {
        const { data: b, error } = await supabase
          .from("bookings")
          .select(
            "id, amount, description, booking_date, is_35a_relevant, amount_35a, status, " +
              "konto:chart_of_accounts!bookings_account_id_fkey(account_number, account_name), " +
              "gegenkonto:chart_of_accounts!bookings_counter_account_id_fkey(account_number, account_name)",
          )
          .in("id", [...bookingIds])
          .order("split_part", { ascending: true, nullsFirst: true });
        if (error) throw error;
        buchungen = b ?? [];
      }

      let rechnung: any = null;
      if (txn.matched_invoice_id) {
        const { data: r } = await supabase
          .from("invoices")
          .select("id, invoice_number, vendor_name, gross_amount, invoice_date, status, file_path, file_name")
          .eq("id", txn.matched_invoice_id)
          .maybeSingle();
        rechnung = r;
      }
      // Posten eines Zahlungsauftrags (Sammelüberweisung/-lastschrift)
      const { data: posten } = await (supabase as any)
        .from("payment_run_items")
        .select("id, empfaenger, iban, betrag, verwendungszweck, invoice_id")
        .eq("bank_transaction_id", txn.id)
        .order("betrag", { ascending: false });
      return { buchungen, rechnung, posten: (posten ?? []) as any[] };
    },
  });

  const iban = Number(txn.amount) < 0 ? txn.creditor_iban : txn.debtor_iban;
  const buchungen: any[] = data?.buchungen ?? [];
  const verknuepft = buchungen.length > 0;
  const ignoriert = txn.match_status === "ignored";

  return (
    <div className="border-t bg-muted/30 px-4 py-4 sm:pl-16">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
        </div>
      ) : (
        <div className="rounded-lg border bg-background p-4">
          {(data?.posten?.length ?? 0) > 1 ? (
            <div>
              <div className="font-medium">
                {Number(txn.amount) < 0 ? "Sammelüberweisung" : "Sammellastschrift"} · {data!.posten.length} Posten
              </div>
              <ul className="mt-2 divide-y rounded-md border text-sm">
                {data!.posten.map((p: any) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{p.empfaenger}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {p.verwendungszweck}
                        {p.iban ? ` · ${ibanFormatiert(p.iban)}` : ""}
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-medium tabular-nums">{euro(p.betrag)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : data?.rechnung ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  Rechnung {data.rechnung.invoice_number || "ohne Nummer"} · {data.rechnung.vendor_name || "–"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {data.rechnung.invoice_date ? format(new Date(data.rechnung.invoice_date), "dd.MM.yyyy") : "ohne Datum"} · {euro(data.rechnung.gross_amount)}
                </div>
              </div>
              {data.rechnung.file_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onRechnungOeffnen({
                      file_path: data.rechnung.file_path,
                      name: data.rechnung.file_name || `Rechnung ${data.rechnung.invoice_number ?? ""}`,
                    })
                  }
                >
                  <FileText className="h-4 w-4 mr-1.5" /> Rechnung öffnen
                </Button>
              )}
            </div>
          ) : txn.booking_templates?.name ? (
            <div>
              <div className="font-medium">{txn.booking_templates.name}</div>
              <div className="text-sm text-muted-foreground">Wiederkehrende Zahlung (Vorlage)</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Keine Rechnung verknüpft.</div>
          )}

          <dl className="mt-3 space-y-1 text-sm">
            {txn.purpose && (
              <div>
                <dt className="inline text-muted-foreground">Verwendungszweck: </dt>
                <dd className="inline break-words">{txn.purpose}</dd>
              </div>
            )}
            {iban && (
              <div>
                <dt className="inline text-muted-foreground">IBAN: </dt>
                <dd className="inline font-mono text-xs">{ibanFormatiert(iban)}</dd>
              </div>
            )}
            {txn.value_date && txn.value_date !== txn.booking_date && (
              <div>
                <dt className="inline text-muted-foreground">Wertstellung: </dt>
                <dd className="inline">{format(new Date(txn.value_date), "dd.MM.yyyy")}</dd>
              </div>
            )}
          </dl>

          {/* Kleiner Hinweis zur Buchung – Klick zeigt die Buchung */}
          {!ohneBuchung && (
            <div className="mt-3 border-t pt-2.5">
              {verknuepft ? (
                <button
                  type="button"
                  onClick={() => setBuchungOffen((o) => !o)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={buchungOffen}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                  Buchung verknüpft{buchungen.length > 1 ? ` (${buchungen.length} Teile)` : ""}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", buchungOffen && "rotate-180")} />
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  {ignoriert ? "Wird nicht gebucht" : "Keine Buchung verknüpft"}
                </span>
              )}

              {verknuepft && buchungOffen && (
                <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3">
                  {buchungen.map((b: any) => (
                    <div key={b.id} className="space-y-0.5 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>
                          <span className="text-muted-foreground">Konto </span>
                          {b.konto ? `${b.konto.account_number} ${b.konto.account_name}` : "–"}
                        </span>
                        <span className="whitespace-nowrap font-medium tabular-nums">{euro(b.amount)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Gegenkonto </span>
                        {b.gegenkonto ? `${b.gegenkonto.account_number} ${b.gegenkonto.account_name}` : "–"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.booking_date ? `${format(new Date(b.booking_date), "dd.MM.yyyy")}` : ""}
                        {b.description ? ` · ${b.description}` : ""}
                        {b.is_35a_relevant ? ` · § 35a EStG${b.amount_35a ? ` ${euro(b.amount_35a)}` : ""}` : ""}
                      </div>
                      <button type="button" onClick={() => onBuchungBearbeiten(b.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        <Pencil className="h-3 w-3" /> bearbeiten
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
