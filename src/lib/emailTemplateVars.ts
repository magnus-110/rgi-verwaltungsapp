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

function buildAnrede(person?: { gender?: string | null; first_name?: string | null; last_name?: string | null }) {
  if (!person?.last_name) return "Sehr geehrte Damen und Herren";
  const g = (person.gender || "").toLowerCase();
  if (g.startsWith("m") || g === "herr") return `Sehr geehrter Herr ${person.last_name}`;
  if (g.startsWith("f") || g.startsWith("w") || g === "frau") return `Sehr geehrte Frau ${person.last_name}`;
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
        .select("first_name, last_name, gender")
        .ilike("email", email)
        .maybeSingle();
      if (data) {
        vars.empfaenger_name = [data.first_name, data.last_name].filter(Boolean).join(" ");
        vars.empfaenger_anrede = buildAnrede(data as any);
      }
    }
  }

  // Sender (current user profile)
  const { data: u } = await supabase.auth.getUser();
  if (u?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, full_name")
      .eq("id", u.user.id)
      .maybeSingle();
    if (profile) {
      vars.absender_name =
        (profile as any).full_name ||
        [(profile as any).first_name, (profile as any).last_name].filter(Boolean).join(" ");
    }
  }

  // Email account signature
  if (ctx.accountId) {
    const { data: acc } = await supabase
      .from("email_accounts")
      .select("signature, display_name")
      .eq("id", ctx.accountId)
      .maybeSingle();
    if (acc) {
      vars.absender_signatur = (acc as any).signature || "";
      if (!vars.absender_name) vars.absender_name = (acc as any).display_name || "";
    }
  }

  // Building
  if (ctx.buildingId) {
    const { data: b } = await supabase
      .from("buildings")
      .select("name")
      .eq("id", ctx.buildingId)
      .maybeSingle();
    if (b) vars.liegenschaft = (b as any).name || "";
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
