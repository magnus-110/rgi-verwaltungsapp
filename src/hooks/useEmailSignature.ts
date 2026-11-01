import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeSignatureCompany,
  renderSignatureHtml,
  renderSignatureText,
  type SignatureCompany,
  type SignatureFields,
} from "@/lib/emailSignature";

export interface SignatureAccount {
  id: string;
  display_name: string;
  email_address: string;
  signature_fields?: unknown;
}

export const EMAIL_SIGNATURE_SETTINGS_KEY = ["email-signature-settings"] as const;

/** Lädt die zentralen Pflichtangaben/Logo für alle Signaturen. */
export function useSignatureCompany() {
  return useQuery({
    queryKey: EMAIL_SIGNATURE_SETTINGS_KEY,
    queryFn: async (): Promise<SignatureCompany> => {
      // Tabelle ist neu; die generierten Typen werden beim nächsten `npm run db:types` ergänzt.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_signature_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return normalizeSignatureCompany(data);
    },
  });
}

/** Erzeugt HTML + Text für ein Postfach und speichert alles. */
export async function saveAccountSignature(accountId: string, fields: SignatureFields, company: SignatureCompany) {
  const text = renderSignatureText(fields, company);
  const html = renderSignatureHtml(fields, company);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("email_accounts")
    .update({
      signature_fields: fields,
      signature_text: text,
      signature_rich_html: html,
      // Textspalte, die Vorlagen ({absender_signatur}) und Rundmails nutzen
      signature_html: text,
    })
    .eq("id", accountId);
  if (error) throw error;
}
