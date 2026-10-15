import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/bankInfo";
import { TransactionReviewMode } from "@/components/finance/TransactionReviewMode";
import { AssignmentDialog } from "@/components/finance/AssignmentDialog";
import { EditBookingDialog } from "@/components/finance/EditBookingDialog";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { BewegungDetail } from "./BewegungDetail";
import { gegenseite, kennzeichen } from "./kontenTypes";

interface Props {
  txns: any[];
  /** Für die Suche über alle Liegenschaften: Name der Liegenschaft je Zeile zeigen. */
  liegenschaftsNamen?: Record<string, string>;
  /** Name der Liegenschaft in jeder Zeile zeigen (Suche über alle). */
  zeigeLiegenschaft?: boolean;
  leerText?: string;
}

const KENNZEICHEN_STIL: Record<string, string> = {
  rechnung: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  gebucht: "bg-muted text-foreground/80",
  offen: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  ignoriert: "bg-muted text-muted-foreground",
};

/** Alle Abfragen, die nach einer Änderung an Bewegungen neu geladen werden müssen. */
export function kontenNeuLaden(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "konten-bewegungen",
    "konten-uebersicht",
    "konten-suche",
    "konten-bewegung-detail",
    "bank-transactions-building",
    "bank-transactions-all",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("bookings") });
}

/**
 * Liste von Kontobewegungen mit grünem (Eingang) bzw. rotem (Ausgang) Pfeil.
 * Ein Klick klappt Beleg und Buchung auf. Buchen, Zuordnen und Bearbeiten
 * laufen über dieselben Dialoge wie bisher in der Buchhaltung – die Logik
 * dahinter bleibt also genau gleich.
 */
export function BewegungsListe({ txns, liegenschaftsNamen, zeigeLiegenschaft, leerText }: Props) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState<string | null>(null);
  const [review, setReview] = useState<{ buildingId: string; liste: any[]; index: number } | null>(null);
  const [zuordnen, setZuordnen] = useState<any | null>(null);
  const [zeigeZugeordnete, setZeigeZugeordnete] = useState(false);
  const [buchung, setBuchung] = useState<{ booking: any; buildingName: string } | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);

  // Prüfen & buchen: alle noch nicht gebuchten Bewegungen derselben
  // Liegenschaft aus dieser Liste, älteste zuerst – wie in der Buchhaltung.
  const pruefen = (txn: any) => {
    const liste = txns
      .filter((t) => t.building_id === txn.building_id && !t.booked_at && t.match_status !== "ignored")
      .sort((a, b) => (a.booking_date === b.booking_date ? String(a.id).localeCompare(String(b.id)) : a.booking_date < b.booking_date ? -1 : 1));
    const index = Math.max(0, liste.findIndex((t) => t.id === txn.id));
    setReview({ buildingId: txn.building_id, liste, index });
  };

  const ignorieren = async (txn: any, ja: boolean) => {
    const status = ja ? "ignored" : txn.matched_invoice_id || txn.matched_template_id ? "manually_matched" : "unmatched";
    const { error } = await supabase.from("bank_transactions").update({ match_status: status }).eq("id", txn.id);
    if (error) { toast.error("Konnte nicht gespeichert werden"); return; }
    toast.success(ja ? "Wird nicht gebucht" : "Wieder zum Buchen vorgemerkt");
    kontenNeuLaden(queryClient);
  };

  const buchungBearbeiten = async (bookingId: string) => {
    const { data: full, error } = await supabase
      .from("bookings")
      .select("*, invoices!bookings_invoice_id_fkey(id, file_path, file_name, vendor_name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !full) { toast.error("Buchung nicht gefunden"); return; }
    setBuchung({ booking: full, buildingName: liegenschaftsNamen?.[full.building_id] ?? "" });
  };

  const rechnungOeffnen = async ({ file_path, name }: { file_path: string; name: string }) => {
    const clean = file_path.replace(/^\/+/, "").replace(/^invoices\//, "");
    const { data, error } = await supabase.storage.from("invoices").createSignedUrl(clean, 600);
    if (error || !data?.signedUrl) { toast.error("Rechnung konnte nicht geöffnet werden"); return; }
    setPdf({ url: data.signedUrl, name });
  };

  // Für „Anders zuordnen": Rechnungen und Vorlagen der Liegenschaft.
  const zuordnenBuilding = zuordnen?.building_id ?? null;
  const { data: rechnungen = [] } = useQuery({
    queryKey: ["konten-zuordnen-rechnungen", zuordnenBuilding],
    enabled: !!zuordnenBuilding,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, gross_amount, vendor_iban, invoice_date, status, file_path")
        .eq("building_id", zuordnenBuilding!)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: bereitsVerknuepft = [] } = useQuery({
    queryKey: ["konten-zuordnen-verknuepft", zuordnenBuilding],
    enabled: !!zuordnenBuilding,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_transactions")
        .select("matched_invoice_id")
        .eq("building_id", zuordnenBuilding!)
        .not("matched_invoice_id", "is", null);
      return (data ?? []).map((t: any) => t.matched_invoice_id as string);
    },
  });
  const { data: vorlagen = [] } = useQuery({
    queryKey: ["konten-zuordnen-vorlagen", zuordnenBuilding],
    enabled: !!zuordnenBuilding,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_templates")
        .select("id, name, vendor_name, vendor_iban, expected_amount, account_id, chart_of_accounts(account_number, account_name)")
        .eq("building_id", zuordnenBuilding!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        account_number: t.chart_of_accounts?.account_number,
        account_name: t.chart_of_accounts?.account_name,
      }));
    },
  });
  const rechnungsListe = useMemo(() => {
    if (zeigeZugeordnete) return rechnungen;
    const belegt = new Set(bereitsVerknuepft);
    return rechnungen.filter((r: any) => !belegt.has(r.id));
  }, [rechnungen, bereitsVerknuepft, zeigeZugeordnete]);

  const zuordnungSpeichern = async (type: "invoice" | "template", id: string) => {
    if (!zuordnen) return;
    const txnId = zuordnen.id;
    const update: any = {
      match_status: "manually_matched",
      ai_suggestion: null,
      ai_analysis_status: null,
      ai_analysis_attempts: 0,
      matched_invoice_id: type === "invoice" ? id : null,
      matched_template_id: type === "template" ? id : null,
    };
    const { error } = await supabase.from("bank_transactions").update(update).eq("id", txnId);
    if (error) { toast.error("Fehler beim Zuordnen"); return; }
    // Eine schon vorhandene Buchung zur Bewegung zieht die Zuordnung mit.
    await supabase
      .from("bookings")
      .update({ invoice_id: type === "invoice" ? id : null, matched_template_id: type === "template" ? id : null })
      .eq("bank_transaction_id", txnId);
    toast.success("Zugeordnet");
    const txn = { ...zuordnen, ...update };
    setZuordnen(null);
    kontenNeuLaden(queryClient);
    if (!txn.booked_at) pruefen(txn);
  };

  const vorlageAnlegen = async (template: any, txn: any) => {
    let accountId: string | null = null;
    if (template.account_number) {
      const { data: acc } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_number", template.account_number)
        .limit(1)
        .maybeSingle();
      accountId = acc?.id ?? null;
    }
    const { data: neu, error } = await supabase
      .from("booking_templates")
      .insert({
        name: template.name,
        vendor_name: template.vendor_name,
        vendor_iban: template.vendor_iban || null,
        expected_amount: template.expected_amount,
        interval: template.interval || null,
        account_id: accountId,
        building_id: txn.building_id,
      } as any)
      .select("id")
      .single();
    if (error || !neu) { toast.error("Vorlage konnte nicht angelegt werden"); return; }
    await supabase
      .from("bank_transactions")
      .update({ matched_template_id: neu.id, match_status: "manually_matched" })
      .eq("id", txn.id);
    toast.success("Künftig automatisch so verknüpft");
    setZuordnen(null);
    queryClient.invalidateQueries({ queryKey: ["konten-zuordnen-vorlagen"] });
    kontenNeuLaden(queryClient);
  };

  if (txns.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{leerText ?? "Keine Kontobewegungen."}</div>;
  }

  return (
    <>
      <ul className="divide-y">
        {txns.map((t) => {
          const eingang = Number(t.amount) >= 0;
          const k = kennzeichen(t);
          const istOffen = offen === t.id;
          const markiert = t.bookings?.needs_review || t.bookings?.ai_confidence_unsicher;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOffen(istOffen ? null : t.id)}
                aria-expanded={istOffen}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 min-h-[60px]",
                  istOffen && "bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    eingang ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                  )}
                  aria-label={eingang ? "Eingang" : "Ausgang"}
                >
                  {eingang ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{gegenseite(t)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {format(new Date(t.booking_date), "dd.MM.yyyy")}
                    {zeigeLiegenschaft && liegenschaftsNamen?.[t.building_id] ? ` · ${liegenschaftsNamen[t.building_id]}` : ""}
                    {t.purpose ? ` · ${t.purpose}` : ""}
                  </span>
                </span>
                <span className={cn("hidden sm:inline-flex max-w-[220px] items-center gap-1 truncate rounded-md px-2 py-0.5 text-xs font-medium", KENNZEICHEN_STIL[k.art])}>
                  {markiert && <Flag className="h-3 w-3 shrink-0 text-orange-500" />}
                  <span className="truncate">{k.text}</span>
                </span>
                <span className={cn("w-28 shrink-0 text-right text-sm font-medium tabular-nums", eingang ? "text-green-700 dark:text-green-400" : "text-foreground")}>
                  {euro(t.amount, { vorzeichen: true })}
                </span>
                {istOffen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {istOffen && (
                <>
                  <div className={cn("px-4 pb-2 sm:hidden")}>
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", KENNZEICHEN_STIL[k.art])}>{k.text}</span>
                  </div>
                  <BewegungDetail
                    txn={t}
                    onPruefen={pruefen}
                    onZuordnen={setZuordnen}
                    onBuchungBearbeiten={buchungBearbeiten}
                    onRechnungOeffnen={rechnungOeffnen}
                    onIgnorieren={ignorieren}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>

      {review && (
        <TransactionReviewMode
          open={!!review}
          onOpenChange={(o) => {
            if (!o) {
              setReview(null);
              kontenNeuLaden(queryClient);
            }
          }}
          transactions={review.liste}
          buildingId={review.buildingId}
          initialIndex={review.index}
        />
      )}

      <AssignmentDialog
        transaction={zuordnen}
        onClose={() => setZuordnen(null)}
        invoicesList={rechnungsListe}
        templatesList={vorlagen}
        allTransactions={txns}
        showMatchedInvoices={zeigeZugeordnete}
        setShowMatchedInvoices={setZeigeZugeordnete}
        onAssign={zuordnungSpeichern}
        onCreateTemplate={vorlageAnlegen}
      />

      <EditBookingDialog
        open={!!buchung}
        onOpenChange={(o) => {
          if (!o) {
            setBuchung(null);
            kontenNeuLaden(queryClient);
          }
        }}
        booking={buchung?.booking ?? null}
        buildingName={buchung?.buildingName ?? ""}
      />

      <PdfViewerModal
        isOpen={!!pdf}
        onClose={() => setPdf(null)}
        documentUrl={pdf?.url ?? null}
        documentName={pdf?.name ?? "Rechnung"}
      />
    </>
  );
}
