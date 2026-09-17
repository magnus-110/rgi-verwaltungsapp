import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Lernen aus Handkorrekturen an Buchungen.
 *
 * Hintergrund: `booking_change_log` protokolliert jede Aenderung ohnehin feldweise.
 * Was dort fehlt, ist die Absicht: War das ein Einzelfall oder eine Regel?
 * Genau diese Entscheidung landet in `ai_booking_feedback.learn_scope`.
 *
 * WICHTIG: Nur bewusste Korrekturen eines angemeldeten Benutzers sind ein
 * Lernsignal. Massenlaeufe ueber die Service-Rolle werden bewusst NICHT
 * erfasst — sie wuerden die Aehnlichkeitssuche verwaessern.
 */

export type LearnScope = "einmalig" | "gebaeude" | "global";

/** Felder einer Buchung, deren Aenderung die KI kuenftig beruecksichtigen soll. */
export interface BookingSnapshot {
  account_id?: string | null;
  counter_account_id?: string | null;
  booking_type?: string | null;
  description?: string | null;
  booking_reference?: string | null;
  is_35a_relevant?: boolean | null;
}

export interface LearnableChange {
  field: keyof BookingSnapshot;
  label: string;
  before: string;
  after: string;
}

const FELD_LABEL: Record<keyof BookingSnapshot, string> = {
  account_id: "Konto",
  counter_account_id: "Gegenkonto",
  booking_type: "Buchungsart",
  description: "Buchungstext",
  booking_reference: "Beleg",
  is_35a_relevant: "§35a",
};

const darstellen = (wert: unknown): string => {
  if (wert === null || wert === undefined || wert === "") return "—";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  return String(wert);
};

/**
 * Vergleicht Vorher/Nachher und liefert die lernbaren Abweichungen.
 * Betrag, Datum und Wirtschaftsjahr sind bewusst NICHT dabei — die sind
 * buchungsindividuell und taugen nicht als Regel.
 */
export function ermittleLernbareAenderungen(
  vorher: BookingSnapshot | null | undefined,
  nachher: BookingSnapshot | null | undefined,
  optionen?: { kontoLabel?: (id: string | null | undefined) => string },
): LearnableChange[] {
  if (!vorher || !nachher) return [];
  const felder: (keyof BookingSnapshot)[] = [
    "account_id",
    "counter_account_id",
    "booking_type",
    "description",
    "booking_reference",
    "is_35a_relevant",
  ];
  const kontoLabel = optionen?.kontoLabel;

  return felder.flatMap((feld) => {
    const alt = vorher[feld] ?? null;
    const neu = nachher[feld] ?? null;
    if (alt === neu) return [];

    const istKonto = feld === "account_id" || feld === "counter_account_id";
    const formatieren = (w: unknown) =>
      istKonto && kontoLabel ? kontoLabel(w as string | null) : darstellen(w);

    return [{
      field: feld,
      label: FELD_LABEL[feld],
      before: formatieren(alt),
      after: formatieren(neu),
    }];
  });
}

export interface FeedbackEingabe {
  buildingId?: string | null;
  bookingId?: string | null;
  bankTransactionId?: string | null;
  managementMode?: string | null;
  vendorName?: string | null;
  vorher: BookingSnapshot;
  nachher: BookingSnapshot;
  scope: LearnScope;
  reason?: string | null;
}

export function useBookingLearning() {
  const qc = useQueryClient();

  /** Schreibt eine Korrektur als Lernsignal. */
  const korrekturMerken = useCallback(async (eingabe: FeedbackEingabe) => {
    const { data: userData } = await supabase.auth.getUser();

    const zeile = {
      building_id: eingabe.buildingId ?? null,
      booking_id: eingabe.bookingId ?? null,
      bank_transaction_id: eingabe.bankTransactionId ?? null,
      management_mode: eingabe.managementMode ?? null,
      vendor_name: eingabe.vendorName ?? null,

      ai_suggested_account_id: eingabe.vorher.account_id ?? null,
      ai_suggested_counter_account_id: eingabe.vorher.counter_account_id ?? null,
      ai_suggested_booking_type: eingabe.vorher.booking_type ?? null,
      ai_suggested_description: eingabe.vorher.description ?? null,
      ai_suggested_reference: eingabe.vorher.booking_reference ?? null,
      ai_suggested_35a: eingabe.vorher.is_35a_relevant ?? null,

      user_accepted: false,
      user_corrected_account_id: eingabe.nachher.account_id ?? null,
      user_corrected_counter_account_id: eingabe.nachher.counter_account_id ?? null,
      user_corrected_booking_type: eingabe.nachher.booking_type ?? null,
      user_corrected_description: eingabe.nachher.description ?? null,
      user_corrected_reference: eingabe.nachher.booking_reference ?? null,
      user_corrected_35a: eingabe.nachher.is_35a_relevant ?? null,

      learn_scope: eingabe.scope,
      learn_reason: eingabe.reason?.trim() || null,
      changed_via: "authenticated",
      created_by: userData.user?.id ?? null,
    };

    const { error } = await supabase.from("ai_booking_feedback").insert(zeile as never);
    if (error) throw error;

    qc.invalidateQueries({ queryKey: ["ai-booking-feedback"] });
  }, [qc]);

  /**
   * "Passt so" — Bestaetigung einer Buchung mit Pruefkennzeichen.
   * Bestaetigungen sind genauso wertvoll wie Korrekturen; ohne sie sieht die
   * KI nur die Faelle, in denen sie danebenlag.
   */
  const alsGeprueftBestaetigen = useCallback(async (args: {
    bookingId: string;
    buildingId?: string | null;
    bankTransactionId?: string | null;
    managementMode?: string | null;
    vendorName?: string | null;
    stand: BookingSnapshot;
  }) => {
    const { data: userData } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        needs_review: false,
        ai_confidence_mittel: false,
        ai_confidence_unsicher: false,
      } as never)
      .eq("id", args.bookingId);
    if (updateError) throw updateError;

    const { error: feedbackError } = await supabase.from("ai_booking_feedback").insert({
      building_id: args.buildingId ?? null,
      booking_id: args.bookingId,
      bank_transaction_id: args.bankTransactionId ?? null,
      management_mode: args.managementMode ?? null,
      vendor_name: args.vendorName ?? null,
      ai_suggested_account_id: args.stand.account_id ?? null,
      ai_suggested_counter_account_id: args.stand.counter_account_id ?? null,
      ai_suggested_booking_type: args.stand.booking_type ?? null,
      ai_suggested_description: args.stand.description ?? null,
      ai_suggested_reference: args.stand.booking_reference ?? null,
      ai_suggested_35a: args.stand.is_35a_relevant ?? null,
      user_accepted: true,
      learn_scope: "einmalig",
      changed_via: "authenticated",
      created_by: userData.user?.id ?? null,
    } as never);
    // Die Bestaetigung der Buchung ist wichtiger als das Protokoll.
    if (feedbackError) console.warn("Feedback nicht gespeichert:", feedbackError.message);

    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["ai-booking-feedback"] });
    toast.success("Als geprüft markiert");
  }, [qc]);

  return { korrekturMerken, alsGeprueftBestaetigen };
}
