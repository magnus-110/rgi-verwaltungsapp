import { supabase } from "@/integrations/supabase/client";
import { CURRENT_LEGAL_VERSION } from "@/lib/legal";

/**
 * Revisionssichere Zustimmungsspeicherung (Append-only):
 * Pro Annahme werden zwei Zeilen in `legal_acceptances` geschrieben
 * (document_type = 'agb' und 'datenschutz'). Alte Einträge bleiben unverändert.
 */
export async function recordLegalAcceptance(
  userId: string,
  version: string = CURRENT_LEGAL_VERSION,
) {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;

  const rows = (["agb", "datenschutz"] as const).map((document_type) => ({
    user_id: userId,
    document_type,
    document_version: version,
    user_agent: userAgent,
  }));

  const { error } = await supabase.from("legal_acceptances").insert(rows);
  if (error) throw error;
}

/**
 * Prüft, ob der Nutzer für beide Dokumente (AGB + Datenschutz)
 * die AKTUELLE Version bereits akzeptiert/zur Kenntnis genommen hat.
 */
export async function hasAcceptedCurrentLegal(
  userId: string,
  version: string = CURRENT_LEGAL_VERSION,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("legal_acceptances")
    .select("document_type")
    .eq("user_id", userId)
    .eq("document_version", version)
    .in("document_type", ["agb", "datenschutz"]);
  if (error) return false;
  const types = new Set((data ?? []).map((r) => r.document_type));
  return types.has("agb") && types.has("datenschutz");
}
