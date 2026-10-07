// DATEV Upload Mail: schickt RGI-Eingangsrechnungen per E-Mail an die
// Upload-Adresse in DATEV Unternehmen online. Dort landen sie automatisch
// in "Belege online" (Mandant 11062, RGI Immobilien GmbH & Co. KG).
//
// Zwei Aufrufarten:
//  - ohne Body (pg_cron alle 10 Minuten): verschickt alle vorgemerkten
//    Rechnungen. Vorgemerkt wird per Trigger, sobald eine RGI-Rechnung mit
//    eingeschaltetem DATEV-Schalter auf "bezahlt" gesetzt wird.
//  - { invoiceId } (Knopf in RGI intern, nur Admin/Mitarbeiter):
//    verschickt genau diese Rechnung, auch erneut.
//
// Nie: Rechnungen der Eigentümergemeinschaften, Ausgangsrechnungen.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "invoices";
const MAX_BYTES = 20 * 1024 * 1024; // DATEV Upload Mail nimmt höchstens rund 20 MB je Mail an
const MAX_ATTEMPTS = 3;
const BATCH = 15;

const SELECT =
  "id, file_path, vendor_display_name, vendor_name, invoice_number, invoice_date, is_company_invoice, datev_attempts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function safeName(s: string): string {
  return s
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

function mimeFor(ext: string): string {
  switch (ext) {
    case "pdf": return "application/pdf";
    case "xml": return "application/xml";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "tif":
    case "tiff": return "image/tiff";
    default: return "application/octet-stream";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { invoiceId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const single = !!body.invoiceId;

  // Einzelversand nur für angemeldete Admins/Mitarbeiter.
  if (single) {
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: settings, error: setErr } = await admin
    .from("rgi_company_settings")
    .select("datev_upload_account_id, datev_upload_address_incoming")
    .limit(1)
    .maybeSingle();
  if (setErr) return json({ error: setErr.message }, 500);

  const s = settings as any;
  const target: string | null = s?.datev_upload_address_incoming || null;
  if (!s?.datev_upload_account_id || !target) {
    const msg = "DATEV-Versand ist nicht eingerichtet (Absender-Postfach oder DATEV-Adresse fehlt).";
    return single ? json({ error: msg }, 400) : json({ skipped: msg });
  }

  // ── Rechnungen sammeln ────────────────────────────────────────────────────
  let rows: any[] = [];
  if (single) {
    const { data } = await admin.from("invoices").select(SELECT).eq("id", body.invoiceId!).maybeSingle();
    if (!data?.file_path || !data.is_company_invoice) {
      return json({ error: "Rechnung nicht gefunden, nicht RGI zugeordnet oder ohne Beleg." }, 404);
    }
    rows = [data];
  } else {
    const { data, error } = await admin
      .from("invoices")
      .select(SELECT)
      .not("datev_queued_at", "is", null)
      .is("datev_sent_at", null)
      .eq("datev_upload", true)
      .eq("is_company_invoice", true)
      .is("duplicate_of", null)
      .or("invoice_type.is.null,invoice_type.neq.credit_note")
      .not("file_path", "is", null)
      .lt("datev_attempts", MAX_ATTEMPTS)
      .order("datev_queued_at", { ascending: true })
      .limit(BATCH);
    if (error) return json({ error: error.message }, 500);
    rows = data ?? [];
  }

  if (rows.length === 0) return json({ sent: 0, failed: 0 });

  // ── SMTP vorbereiten ──────────────────────────────────────────────────────
  const { data: account, error: accErr } = await admin
    .from("email_accounts")
    .select("*")
    .eq("id", s.datev_upload_account_id)
    .single();
  if (accErr || !account) return json({ error: "Absender-Postfach nicht gefunden." }, 500);

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth: { user: account.smtp_user, pass: account.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of rows) {
    // Sperren, damit zwei Läufe nicht gleichzeitig dieselbe Rechnung senden.
    // Beim Knopfdruck wird ein hängengebliebenes "sending" bewusst überschrieben.
    let lock = admin
      .from("invoices")
      .update({ datev_status: "sending" })
      .eq("id", r.id);
    if (!single) {
      lock = lock.is("datev_sent_at", null).or("datev_status.is.null,datev_status.neq.sending");
    }
    const { data: locked } = await lock.select("id").maybeSingle();
    if (!locked) continue;

    const attempts = (r.datev_attempts ?? 0) + 1;
    try {
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(r.file_path);
      if (dlErr || !blob) throw new Error("Beleg-Datei konnte nicht geladen werden");
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        throw new Error("Datei größer als 20 MB – bitte von Hand in DATEV hochladen");
      }

      const party = r.vendor_display_name || r.vendor_name || "Lieferant";
      const ext = (r.file_path.split(".").pop() || "pdf").toLowerCase();
      const base = safeName([r.invoice_date ?? "", party, r.invoice_number ?? ""].filter(Boolean).join("_")) || "Beleg";

      await transporter.sendMail({
        from: `${account.display_name} <${account.email_address}>`,
        to: target,
        subject: `Eingangsrechnung ${party}${r.invoice_number ? ` ${r.invoice_number}` : ""}`,
        text: "Eingangsrechnung aus der RGI-App.",
        attachments: [{ filename: `${base}.${ext}`, content: buf, contentType: mimeFor(ext) }],
      });

      await admin.from("invoices").update({
        datev_status: "sent",
        datev_sent_at: new Date().toISOString(),
        datev_error: null,
        datev_attempts: attempts,
      }).eq("id", r.id);
      sent += 1;
    } catch (e) {
      const msg = (e as Error)?.message || "Unbekannter Fehler";
      console.error(`DATEV-Versand ${r.id} fehlgeschlagen:`, msg);
      await admin.from("invoices").update({
        datev_status: "error",
        datev_error: msg,
        datev_attempts: attempts,
      }).eq("id", r.id);
      failed += 1;
      errors.push(msg);
    }
  }

  if (single && errors.length > 0) return json({ error: errors[0] }, 500);
  return json({ sent, failed });
});
