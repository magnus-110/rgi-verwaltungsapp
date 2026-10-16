import { supabase } from "@/integrations/supabase/client";

// Zentrale Quelle der Wahrheit für den Wortlaut des SEPA-Mandats.
// Wird sowohl im UI angezeigt als auch wortgleich ins Audit-Log geschrieben.
//
// Zahlungsempfänger (Gläubiger) ist die Eigentümergemeinschaft, nicht RGI:
// Die Gläubiger-ID gehört der WEG, RGI handelt nur als Verwalterin.
export const RGI_NAME = "RGI Immobilien GmbH & Co. KG";

export interface MandatGebaeude {
  name?: string | null;
  postal_code?: string | null;
  city?: string | null;
  creditor_id?: string | null;
  management_mode?: string | null;
}

/** z. B. „WEG Achweg 3-5, 87459 Pfronten" */
export function sepaGlaeubiger(g?: MandatGebaeude | null): string {
  if (!g?.name) return `die Eigentümergemeinschaft, vertreten durch die ${RGI_NAME}`;
  const ort = [g.postal_code, g.city].filter(Boolean).join(" ");
  const objekt = `${g.name.replace(/^WEG\s+/i, "")}${ort ? `, ${ort}` : ""}`;
  return g.management_mode === "rent" ? `Eigentümer des Objekts ${objekt}` : `WEG ${objekt}`;
}

export function sepaMandatText(g?: MandatGebaeude | null): string {
  const empfaenger = !g?.name
    ? `die Eigentümergemeinschaft, vertreten durch die ${RGI_NAME} als Verwalterin`
    : g.management_mode === "rent"
      ? `den ${sepaGlaeubiger(g)}, vertreten durch die ${RGI_NAME} als Verwalterin`
      : `die Wohnungseigentümergemeinschaft ${sepaGlaeubiger(g).replace(/^WEG /, "")}, vertreten durch die ${RGI_NAME} als Verwalterin`;
  const id = g?.creditor_id ? ` (Gläubiger-Identifikationsnummer ${g.creditor_id})` : "";
  return (
    `Ich ermächtige ${empfaenger}${id}, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen. ` +
    `Zugleich weise ich mein Kreditinstitut an, die auf mein Konto gezogenen Lastschriften einzulösen. ` +
    `Die Mandatsreferenz wird mir gesondert mitgeteilt. ` +
    `Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. ` +
    `Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.`
  );
}

/** Nur noch als Rückfall, wenn das Gebäude nicht geladen werden kann. */
export const SEPA_MANDATE_TEXT = sepaMandatText(null);

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
    // Wortlaut so protokollieren, wie er für dieses Gebäude angezeigt wird
    let gebaeude: MandatGebaeude | null = null;
    if (payload.building_id) {
      const { data } = await supabase
        .from("buildings")
        .select("name, postal_code, city, creditor_id, management_mode")
        .eq("id", payload.building_id)
        .maybeSingle();
      gebaeude = (data as MandatGebaeude) ?? null;
    }
    await supabase.functions.invoke("log-sepa-mandate-event", {
      body: {
        ...payload,
        creditor_id: payload.creditor_id ?? gebaeude?.creditor_id ?? null,
        creditor_name: gebaeude?.name ? `${sepaGlaeubiger(gebaeude)}, vertreten durch ${RGI_NAME}` : RGI_NAME,
        mandate_text: sepaMandatText(gebaeude),
      },
    });
  } catch (err) {
    console.warn("[sepa-audit] log failed (non-blocking)", err);
  }
}
