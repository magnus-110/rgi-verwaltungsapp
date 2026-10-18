// Schlüssel-Mails (Ausgabe, Erinnerung, Rückgabe) – verschickt die App selbst
// über das Postfach für automatische Mails (früher über Make.com).
import { requireAdmin } from "../_shared/require-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSystemMail, type SystemMailAttachment } from "../_shared/system-mail.ts";
import {
  schluesselAusgabe,
  schluesselErinnerung,
  schluesselRueckgabe,
  type SchluesselDaten,
} from "../_shared/mail-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fmtDe = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")} Uhr`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const { loan_id, event = "issued" } = (await req.json()) ?? {};
    if (!loan_id) return json({ error: "loan_id required" }, 400);
    // Für „verloren“ gab es nie eine Mail an den Entleiher.
    if (!["issued", "overdue_reminder", "returned"].includes(event)) return json({ ok: true, skipped: true });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: loan, error } = await supabase
      .from("key_loans")
      .select(`
        *,
        key_tags!key_loans_tag_id_fkey(tag_number, photo_path, key_types(name)),
        buildings(id, name),
        contacts(id, company_name, contact_persons(first_name, last_name, is_primary))
      `)
      .eq("id", loan_id)
      .maybeSingle();
    if (error || !loan) return json({ error: error?.message || "loan not found" }, 404);

    const to = (loan.borrower_email ?? "").trim();
    if (!to) return json({ ok: false, error: "Keine E-Mail-Adresse beim Entleiher hinterlegt" });

    const persons = (loan.contacts?.contact_persons ?? []) as any[];
    const primary = persons.find((p) => p.is_primary) ?? persons[0];
    const personName = primary ? [primary.first_name, primary.last_name].filter(Boolean).join(" ") : null;

    const attachments: SystemMailAttachment[] = [];
    let photoCid: string | null = null;
    const photoPath = loan.key_tags?.photo_path as string | null | undefined;
    if (photoPath) {
      try {
        const { data: blob } = await supabase.storage.from("key-files").download(photoPath);
        if (blob && blob.size <= MAX_INLINE_BYTES) {
          photoCid = "schluessel-foto";
          attachments.push({
            filename: photoPath.split("/").pop() ?? "schluessel.jpg",
            content: new Uint8Array(await blob.arrayBuffer()),
            contentType: (blob as Blob).type || "image/jpeg",
            cid: photoCid,
          });
        }
      } catch (e) {
        console.warn("photo download failed", e);
      }
    }

    const daten: SchluesselDaten = {
      borrowerName: loan.borrower_name || personName || loan.contacts?.company_name || "",
      buildingName: loan.buildings?.name ?? "",
      tagLabel: loan.key_tags?.key_types?.name ?? null,
      tagNumber: loan.key_tags?.tag_number ?? null,
      issuedAt: fmtDe(loan.issued_at),
      dueAt: fmtDe(loan.due_at),
      returnedAt: fmtDe(loan.returned_at),
      photoCid,
    };
    const mail =
      event === "issued" ? schluesselAusgabe(daten) : event === "returned" ? schluesselRueckgabe(daten) : schluesselErinnerung(daten);

    const res = await sendSystemMail(supabase, {
      kind: `schluessel_${event}`,
      to,
      subject: mail.subject,
      html: mail.html,
      attachments,
      refType: "key_loan",
      refId: loan.id,
    });
    if (res.ok) await supabase.from("key_loans").update({ webhook_sent_at: new Date().toISOString() }).eq("id", loan_id);
    return res.ok ? json({ ok: true }) : json({ ok: false, error: res.error }, 502);
  } catch (e) {
    console.error("send-key-email error", e);
    return json({ error: String(e) }, 500);
  }
});
