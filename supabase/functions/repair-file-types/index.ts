// Einmalige Reparatur: PDFs, die mit falschem Dateityp gespeichert wurden.
//
// Hintergrund: Manche Absender (z. B. Rechnungen aus älteren Programmen) schicken
// PDFs als „application/octet-stream“. So landeten sie im Speicher — und von dort
// kopiert auch in Rechnungen und Stammakte. Der Browser lädt solche Dateien in der
// Vorschau herunter, statt sie anzuzeigen.
//
// Diese Funktion prüft die gespeicherten Dateien paketweise und speichert echte
// PDFs (Dateiinhalt beginnt mit „%PDF“) mit dem richtigen Typ neu ab. Der Inhalt
// bleibt unverändert. Aufgerufen wird sie von der App (einmal pro Browser),
// jeweils mit dem Fortschritts-Zeiger (cursor) aus der letzten Antwort.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 50;
const CONCURRENCY = 5;
const PDF = "application/pdf";
/** Dateitypen, hinter denen sich ein PDF verbergen kann (für PostgREST-Filter) */
const GENERIC_TYPES = [
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-pdf",
  "application/x-download",
  "application/force-download",
].join(",");

type Target = "email_attachments" | "building_files" | "invoices";
const TARGETS: Target[] = ["email_attachments", "building_files", "invoices"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const target = (TARGETS.includes(body.target) ? body.target : "email_attachments") as Target;
    const cursor = typeof body.cursor === "string" ? body.cursor : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- Kandidaten laden ---
    let rows: Array<{ id: string; path: string; name: string }> = [];
    let bucket = "";
    if (target === "email_attachments") {
      bucket = "email-attachments";
      let q = admin
        .from("email_attachments")
        .select("id, file_path, file_name, mime_type")
        .not("file_path", "is", null)
        .or("mime_type.is.null,mime_type.neq.application/pdf")
        // nur mögliche PDFs: Endung .pdf oder unbestimmter Dateityp
        .or(`file_name.ilike.*.pdf,mime_type.is.null,mime_type.in.(${GENERIC_TYPES})`)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor) q = q.gt("id", cursor);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data || []).map((r: any) => ({ id: r.id, path: r.file_path, name: r.file_name || "" }));
    } else if (target === "building_files") {
      bucket = "building-files";
      let q = admin
        .from("building_files")
        .select("id, file_path, display_name, mime_type")
        .not("file_path", "is", null)
        .or("mime_type.is.null,mime_type.neq.application/pdf")
        .or(`display_name.ilike.*.pdf,file_path.ilike.*.pdf,mime_type.is.null,mime_type.in.(${GENERIC_TYPES})`)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor) q = q.gt("id", cursor);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data || []).map((r: any) => ({ id: r.id, path: r.file_path, name: r.display_name || "" }));
    } else {
      bucket = "invoices";
      let q = admin
        .from("invoices")
        .select("id, file_path, file_name")
        .not("file_path", "is", null)
        .ilike("file_path", "%.pdf")
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor) q = q.gt("id", cursor);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data || []).map((r: any) => ({
        id: r.id,
        path: String(r.file_path).replace(/^invoices\//, "").replace(/^\/+/, ""),
        name: r.file_name || "",
      }));
    }

    if (rows.length === 0) return json({ target, done: true, cursor: null, checked: 0, fixed: 0 });

    // Signierte Links in einem Rutsch holen
    const { data: signed, error: signErr } = await admin.storage
      .from(bucket)
      .createSignedUrls(rows.map((r) => r.path), 600);
    if (signErr) throw signErr;
    const urlByPath = new Map<string, string>();
    for (const s of signed || []) {
      if (s?.path && s?.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }

    let fixed = 0;
    const failures: string[] = [];

    const checkOne = async (row: { id: string; path: string; name: string }) => {
      const url = urlByPath.get(row.path);
      if (!url) return;
      try {
        // Nur die ersten Bytes und den gespeicherten Typ ansehen
        const head = await fetch(url, { headers: { Range: "bytes=0-7" } });
        if (!head.ok && head.status !== 206) {
          await head.body?.cancel();
          return;
        }
        const storedType = (head.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const reader = head.body?.getReader();
        const first = reader ? (await reader.read()).value : undefined;
        await reader?.cancel().catch(() => {});
        const isPdf = !!first && first.length >= 4 &&
          first[0] === 0x25 && first[1] === 0x50 && first[2] === 0x44 && first[3] === 0x46;
        if (!isPdf) return;

        if (storedType !== PDF) {
          // Datei komplett laden und mit richtigem Typ an gleicher Stelle neu speichern
          const full = await fetch(url);
          if (!full.ok) throw new Error(`Download HTTP ${full.status}`);
          const bytes = new Uint8Array(await full.arrayBuffer());
          if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50) throw new Error("Inhalt unerwartet");
          const { error: upErr } = await admin.storage
            .from(bucket)
            .upload(row.path, bytes, { contentType: PDF, upsert: true });
          if (upErr) throw upErr;
          fixed++;
        }

        // Dateityp in der Tabelle mitziehen
        if (target === "email_attachments") {
          await admin.from("email_attachments").update({ mime_type: PDF }).eq("id", row.id);
        } else if (target === "building_files") {
          await admin.from("building_files").update({ mime_type: PDF }).eq("id", row.id);
        }
      } catch (e: any) {
        failures.push(`${row.path}: ${e?.message || e}`);
      }
    };

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(checkOne));
    }

    if (failures.length) console.warn(`[repair-file-types] ${target}: ${failures.length} Fehler`, failures.slice(0, 5));
    console.log(`[repair-file-types] ${target}: geprüft ${rows.length}, repariert ${fixed}`);

    const nextCursor = rows[rows.length - 1].id;
    return json({
      target,
      done: rows.length < PAGE_SIZE,
      cursor: nextCursor,
      checked: rows.length,
      fixed,
      failed: failures.length,
    });
  } catch (e: any) {
    console.error("[repair-file-types] error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
