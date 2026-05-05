import { supabase } from "@/integrations/supabase/client";

export interface TemplateContext {
  to?: string;
  buildingId?: string | null;
  accountId?: string | null;
}

export interface ResolvedTemplate {
  subject: string;
  body: string;
  unresolved: string[];
}

const PLACEHOLDERS = [
  "empfaenger_name",
  "empfaenger_anrede",
  "absender_name",
  "absender_signatur",
  "liegenschaft",
  "datum_heute",
] as const;

export const AVAILABLE_PLACEHOLDERS = PLACEHOLDERS.map((k) => `{{${k}}}`);

function fmtDate(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function buildAnrede(person?: { salutation?: string | null; first_name?: string | null; last_name?: string | null }) {
  if (!person?.last_name) return "Sehr geehrte Damen und Herren";
  const s = (person.salutation || "").toLowerCase();
  if (s.startsWith("herr")) return `Sehr geehrter Herr ${person.last_name}`;
  if (s.startsWith("frau")) return `Sehr geehrte Frau ${person.last_name}`;
  return `Sehr geehrte/r ${[person.first_name, person.last_name].filter(Boolean).join(" ")}`;
}

export async function resolveTemplate(
  subject: string | null | undefined,
  body: string,
  ctx: TemplateContext
): Promise<ResolvedTemplate> {
  const vars: Record<string, string> = {
    datum_heute: fmtDate(new Date()),
    empfaenger_name: "",
    empfaenger_anrede: "Sehr geehrte Damen und Herren",
    absender_name: "",
    absender_signatur: "",
    liegenschaft: "",
  };

  // Recipient lookup via contact_persons
  if (ctx.to) {
    const email = ctx.to.trim().toLowerCase().split(/[,;]/)[0]?.trim();
    if (email) {
      const { data } = await supabase
        .from("contact_persons")
        .select("first_name, last_name, salutation")
        .ilike("email", email)
        .maybeSingle();
      if (data) {
        const p = data as { first_name: string | null; last_name: string | null; salutation: string | null };
        vars.empfaenger_name = [p.first_name, p.last_name].filter(Boolean).join(" ");
        vars.empfaenger_anrede = buildAnrede(p);
      }
    }
  }

  // Sender (current user profile)
  const { data: u } = await supabase.auth.getUser();
  if (u?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (profile) {
      const p = profile as { first_name: string | null; last_name: string | null };
      vars.absender_name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    }
  }

  // Email account signature
  if (ctx.accountId) {
    const { data: acc } = await supabase
      .from("email_accounts")
      .select("signature_html, display_name")
      .eq("id", ctx.accountId)
      .maybeSingle();
    if (acc) {
      const a = acc as { signature_html: string | null; display_name: string | null };
      vars.absender_signatur = htmlToText(a.signature_html || "");
      if (!vars.absender_name) vars.absender_name = a.display_name || "";
    }
  }

  // Building
  if (ctx.buildingId) {
    const { data: b } = await supabase
      .from("buildings")
      .select("name")
      .eq("id", ctx.buildingId)
      .maybeSingle();
    if (b) vars.liegenschaft = (b as { name: string | null }).name || "";
  }

  const replace = (s: string) =>
    s.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) => {
      const v = vars[key.toLowerCase()];
      return v ?? m;
    });

  const resolvedSubject = replace(subject || "");
  const resolvedBody = replace(body || "");
  const unresolved = Array.from(
    new Set(
      [...resolvedSubject.matchAll(/\{\{\s*[a-z_]+\s*\}\}/gi)].map((m) => m[0]).concat(
        [...resolvedBody.matchAll(/\{\{\s*[a-z_]+\s*\}\}/gi)].map((m) => m[0])
      )
    )
  );

  return { subject: resolvedSubject, body: resolvedBody, unresolved };
}
