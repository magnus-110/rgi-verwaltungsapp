import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LearnFromCorrectionDialog } from "@/components/finance/LearnFromCorrectionDialog";
import {
  ermittleLernbareAenderungen,
  type BookingSnapshot,
  type LearnableChange,
} from "@/hooks/useBookingLearning";

/**
 * Fragt nach jeder Handkorrektur an einer Buchung, ob die KI daraus lernen soll.
 *
 * Warum global statt im Buchungsdialog: Buchungen werden an mehreren Stellen
 * geaendert (EditBookingDialog, Review-Modus, Inline-Bearbeitung). Der Trigger
 * `trg_log_booking_change` schreibt jede dieser Aenderungen nach
 * `booking_change_log`. Wir hoeren einmal zentral darauf und decken damit alle
 * Stellen ab, ohne jede einzeln zu verdrahten.
 *
 * Es wird nur auf eigene Aenderungen reagiert (`changed_by = eigene User-ID`).
 * Massenlaeufe ueber die Service-Rolle haben `changed_by = NULL` und loesen
 * daher nichts aus — genau richtig, die sind kein Lernsignal.
 */

const LERNBARE_FELDER = [
  "account_id",
  "counter_account_id",
  "booking_type",
  "description",
  "booking_reference",
  "is_35a_relevant",
] as const;

interface Aufgabe {
  bookingId: string;
  buildingId: string | null;
  buildingName: string | null;
  bankTransactionId: string | null;
  vendorName: string | null;
  aenderungen: LearnableChange[];
  vorher: BookingSnapshot;
  nachher: BookingSnapshot;
}

export function BookingLearningWatcher() {
  const { user } = useAuth();
  const [warteschlange, setWarteschlange] = useState<Aufgabe[]>([]);
  const [offen, setOffen] = useState(false);
  // Pro Sitzung nur einmal je Buchung fragen — sonst poppt der Dialog bei
  // mehreren Korrekturen an derselben Buchung wiederholt auf.
  const schonGefragt = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    const kanal = supabase
      .channel("booking-learning-watcher")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_change_log",
          filter: `changed_by=eq.${user.id}`,
        },
        async (payload) => {
          const zeile: any = payload.new;
          if (!zeile || zeile.change_type !== "update") return;

          const geaendert: string[] = zeile.changed_fields ?? [];
          if (!geaendert.some((f) => (LERNBARE_FELDER as readonly string[]).includes(f))) return;
          if (schonGefragt.current.has(zeile.booking_id)) return;
          schonGefragt.current.add(zeile.booking_id);

          const alt = (zeile.old_values ?? {}) as Record<string, unknown>;
          const neu = (zeile.new_values ?? {}) as Record<string, unknown>;

          // Nur die tatsaechlich geaenderten Felder stehen in old_values/new_values.
          const vorher: BookingSnapshot = {};
          const nachher: BookingSnapshot = {};
          for (const feld of LERNBARE_FELDER) {
            if (feld in alt || feld in neu) {
              (vorher as any)[feld] = alt[feld] ?? null;
              (nachher as any)[feld] = neu[feld] ?? null;
            }
          }

          const kontoNamen = await ladeKontoNamen([
            alt.account_id, neu.account_id, alt.counter_account_id, neu.counter_account_id,
          ]);
          const kontoLabel = (id: string | null | undefined) =>
            (id && kontoNamen.get(id)) || (id ? "unbekanntes Konto" : "—");

          const aenderungen = ermittleLernbareAenderungen(vorher, nachher, { kontoLabel });
          if (aenderungen.length === 0) return;

          const kontext = await ladeKontext(zeile.booking_id);

          setWarteschlange((q) => [...q, {
            bookingId: zeile.booking_id,
            buildingId: zeile.building_id ?? null,
            buildingName: kontext.buildingName,
            bankTransactionId: kontext.bankTransactionId,
            vendorName: kontext.vendorName,
            aenderungen, vorher, nachher,
          }]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [user?.id]);

  useEffect(() => {
    if (warteschlange.length > 0 && !offen) setOffen(true);
  }, [warteschlange.length, offen]);

  const aktuell = warteschlange[0];
  if (!aktuell) return null;

  return (
    <LearnFromCorrectionDialog
      open={offen}
      onOpenChange={setOffen}
      onDone={() => { setOffen(false); setWarteschlange((q) => q.slice(1)); }}
      aenderungen={aktuell.aenderungen}
      vorher={aktuell.vorher}
      nachher={aktuell.nachher}
      buildingId={aktuell.buildingId}
      buildingName={aktuell.buildingName}
      bookingId={aktuell.bookingId}
      bankTransactionId={aktuell.bankTransactionId}
      vendorName={aktuell.vendorName}
    />
  );
}

async function ladeKontoNamen(ids: unknown[]): Promise<Map<string, string>> {
  const eindeutig = [...new Set(ids.filter((i): i is string => typeof i === "string" && i.length > 0))];
  const map = new Map<string, string>();
  if (eindeutig.length === 0) return map;
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number, account_name")
    .in("id", eindeutig);
  for (const k of data ?? []) {
    map.set((k as any).id, `${(k as any).account_number} ${(k as any).account_name}`);
  }
  return map;
}

async function ladeKontext(bookingId: string): Promise<{
  buildingName: string | null;
  bankTransactionId: string | null;
  vendorName: string | null;
}> {
  const leer = { buildingName: null, bankTransactionId: null, vendorName: null };
  if (!bookingId) return leer;

  const { data: buchung } = await supabase
    .from("bookings")
    .select("bank_transaction_id, booking_type, buildings(name), invoices(vendor_name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!buchung) return leer;

  const b: any = buchung;
  let vendorName: string | null = b.invoices?.vendor_name ?? null;
  const bankTransactionId: string | null = b.bank_transaction_id ?? null;

  // Ohne Rechnung: Gegenpartei aus dem Kontoauszug — bei einer Ausgabe der
  // Empfaenger, bei einer Einnahme der Auftraggeber.
  if (!vendorName && bankTransactionId) {
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("creditor_name, debtor_name, amount")
      .eq("id", bankTransactionId)
      .maybeSingle();
    const t: any = txn;
    if (t) vendorName = (Number(t.amount) < 0 ? t.creditor_name : t.debtor_name) ?? null;
  }

  return { buildingName: b.buildings?.name ?? null, bankTransactionId, vendorName };
}
