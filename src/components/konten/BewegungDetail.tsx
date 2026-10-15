import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Link2, Loader2, Pencil, Sparkles, EyeOff, Eye, BookOpenCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { euro, ibanFormatiert } from "@/lib/bankInfo";
import { kiVorschlag } from "./kontenTypes";

interface Props {
  txn: any;
  onPruefen: (txn: any) => void;
  onZuordnen: (txn: any) => void;
  onBuchungBearbeiten: (bookingId: string) => void;
  onRechnungOeffnen: (invoice: { file_path: string; name: string }) => void;
  onIgnorieren: (txn: any, ignorieren: boolean) => void;
  /** Nur Beleg zeigen, ohne Buchung (z. B. RGI-Konto, gebucht wird in DATEV). */
  ohneBuchung?: boolean;
}

/**
 * Aufgeklappte Kontobewegung: links der Beleg (Rechnung, Vorlage,
 * Verwendungszweck), rechts die Buchung. Bei einer noch nicht gebuchten
 * Bewegung stehen der Vorschlag der App mit Begründung und die Knöpfe
 * „Prüfen & buchen" und „Anders zuordnen" da.
 */
export function BewegungDetail({ txn, onPruefen, onZuordnen, onBuchungBearbeiten, onRechnungOeffnen, onIgnorieren, ohneBuchung }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["konten-bewegung-detail", txn.id, txn.booking_id, txn.matched_invoice_id, txn.booked_at],
    queryFn: async () => {
      const bookingIds = new Set<string>();
      const { data: perTxn } = await supabase
        .from("bookings")
        .select("id")
        .eq("bank_transaction_id", txn.id);
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
      return { buchungen, rechnung };
    },
  });

  const vorschlag = !txn.booked_at ? kiVorschlag(txn) : null;
  const iban = Number(txn.amount) < 0 ? txn.creditor_iban : txn.debtor_iban;
  const gebucht = !!txn.booked_at;
  const ignoriert = txn.match_status === "ignored";

  return (
    <div className="border-t bg-muted/30 px-4 py-4 sm:pl-16">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
        </div>
      ) : (
        <div className={ohneBuchung ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
          {/* Beleg */}
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Beleg</div>
            {data?.rechnung ? (
              <div className="space-y-1">
                <div className="font-medium">
                  Rechnung {data.rechnung.invoice_number || "ohne Nummer"} · {data.rechnung.vendor_name || "–"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {data.rechnung.invoice_date ? format(new Date(data.rechnung.invoice_date), "dd.MM.yyyy") : "ohne Datum"} ·{" "}
                  {euro(data.rechnung.gross_amount)}
                </div>
                {data.rechnung.file_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
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
              <div className="space-y-1">
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
          </div>

          {/* Buchung */}
          {!ohneBuchung && (
          <div className="rounded-lg border bg-background p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Buchung</div>
            {gebucht && (data?.buchungen?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {data!.buchungen.map((b: any) => (
                  <div key={b.id} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Konto </span>
                        {b.konto ? `${b.konto.account_number} ${b.konto.account_name}` : "–"}
                      </div>
                      <div className="text-sm font-medium tabular-nums whitespace-nowrap">{euro(b.amount)}</div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Gegenkonto </span>
                      {b.gegenkonto ? `${b.gegenkonto.account_number} ${b.gegenkonto.account_name}` : "–"}
                    </div>
                    {b.description && <div className="text-sm text-muted-foreground">{b.description}</div>}
                    {b.is_35a_relevant && (
                      <div className="text-xs text-muted-foreground">
                        § 35a EStG{b.amount_35a ? ` · ${euro(b.amount_35a)}` : ""}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => onBuchungBearbeiten(b.id)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Buchung bearbeiten
                    </Button>
                  </div>
                ))}
              </div>
            ) : ignoriert ? (
              <div className="text-sm text-muted-foreground">Diese Bewegung wird nicht gebucht.</div>
            ) : (
              <div className="space-y-3">
                {vorschlag ? (
                  <div className="flex gap-2 text-sm">
                    <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <div>
                      <div className="font-medium">Vorschlag der App</div>
                      <div className="text-muted-foreground">{vorschlag.grund}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Noch nicht gebucht.</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onPruefen(txn)}>
                    <BookOpenCheck className="h-4 w-4 mr-1.5" /> Prüfen &amp; buchen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onZuordnen(txn)}>
                    <Link2 className="h-4 w-4 mr-1.5" /> Anders zuordnen
                  </Button>
                </div>
              </div>
            )}
            {!gebucht && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2 h-8 text-muted-foreground"
                onClick={() => onIgnorieren(txn, !ignoriert)}
              >
                {ignoriert ? <Eye className="h-3.5 w-3.5 mr-1.5" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
                {ignoriert ? "Doch buchen" : "Nicht buchen (ignorieren)"}
              </Button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
