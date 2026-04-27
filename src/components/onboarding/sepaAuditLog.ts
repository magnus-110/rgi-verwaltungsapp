import { supabase } from "@/integrations/supabase/client";

// Zentrale Quelle der Wahrheit für den Wortlaut des SEPA-Mandats.
// Wird sowohl im UI angezeigt als auch wortgleich ins Audit-Log geschrieben.
export const SEPA_MANDATE_TEXT =
  "Ich ermächtige die RGI Immobilien GmbH & Co. KG, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen.";

export const SEPA_CREDITOR_NAME = "RGI Immobilien GmbH & Co. KG";

export type SepaAuditEvent =
  | "mandate_granted"
  | "mandate_declined"
  | "mandate_warning_shown"
  | "mandate_warning_dismissed"
  | "mandate_changed_after_warning"
  | "mandate_revoked";

export interface SepaAuditPayload {
  event_type: SepaAuditEvent;
  building_id?: string | null;
  contact_id?: string | null;
  mandate_reference?: string | null;
  creditor_id?: string | null;
  iban?: string | null;
  account_holder?: string | null;
  accepted: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget Audit-Log Aufruf.
 * Fehler werden bewusst geschluckt — der Onboarding-Flow darf nie blockieren,
 * Fehler landen in den Edge-Function-Logs.
 */
export async function logSepaMandateEvent(payload: SepaAuditPayload): Promise<void> {
  try {
    await supabase.functions.invoke("log-sepa-mandate-event", {
      body: {
        ...payload,
        creditor_name: SEPA_CREDITOR_NAME,
        mandate_text: SEPA_MANDATE_TEXT,
      },
    });
  } catch (err) {
    console.warn("[sepa-audit] log failed (non-blocking)", err);
  }
}
