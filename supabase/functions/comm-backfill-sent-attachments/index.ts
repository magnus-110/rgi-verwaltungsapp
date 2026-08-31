// One-off/maintenance: attach campaign files to already-sent bulk emails ("Gesendet"),
// for campaigns whose sent copies were stored without attachment records.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};
const guessMime = (name?: string) =>
  MIME_BY_EXT[(name || "").split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const since: string = body.since || "2026-01-01";
    const dryRun: boolean = body.dry_run === true;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Sent bulk-mail copies without attachment rows
    const { data: mails, error: mailErr } = await admin
      .from("emails")
      .select("id, message_id, to_addresses, has_attachments, date")
      .like("message_id", "bulk-%")
      .eq("has_attachments", true)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(1000);
    if (mailErr) throw mailErr;

    const result = { checked: 0, repaired: 0, attachments: 0, cleared: 0, missing_files: [] as string[] };
    const campaignCache = new Map<string, { paths: string[]; byEmail: Map<string, string[]> } | null>();
    const fileCache = new Map<string, Uint8Array | null>();

    for (const m of mails || []) {
      const { count } = await admin
        .from("email_attachments")
        .select("id", { count: "exact", head: true })
        .eq("email_id", m.id);
      if ((count || 0) > 0) continue;
      result.checked++;

      const campaignId = String(m.message_id || "").replace(/^bulk-/, "").split("-").slice(0, 5).join("-");
      if (!campaignCache.has(campaignId)) {
        const { data: camp } = await admin
          .from("comm_campaigns")
          .select("id, attachment_paths")
          .eq("id", campaignId)
          .maybeSingle();
        if (!camp) {
          campaignCache.set(campaignId, null);
        } else {
          const { data: ovs } = await admin
            .from("comm_recipient_overrides")
            .select("email, attachment_paths")
            .eq("campaign_id", campaignId);
          const byEmail = new Map<string, string[]>();
          for (const o of ovs || []) {
            if (o.email) byEmail.set(String(o.email).toLowerCase(), (o.attachment_paths || []) as string[]);
          }
          campaignCache.set(campaignId, { paths: (camp.attachment_paths || []) as string[], byEmail });
        }
      }
      const camp = campaignCache.get(campaignId);
      if (!camp) continue;

      const to = (m.to_addresses?.[0] || "").toLowerCase();
      const paths = [...camp.paths, ...(camp.byEmail.get(to) || [])];

      let added = 0;
      for (const [idx, p] of paths.entries()) {
        if (!fileCache.has(p)) {
          const { data: f } = await admin.storage.from("comm-assets").download(p);
          fileCache.set(p, f ? new Uint8Array(await f.arrayBuffer()) : null);
        }
        const bytes = fileCache.get(p);
        if (!bytes) {
          if (!result.missing_files.includes(p)) result.missing_files.push(p);
          continue;
        }
        const fileName = (p.split("/").pop() || "anhang").replace(/^\d+_/, "");
        if (dryRun) { added++; continue; }
        const safeName = fileName.replace(/[^\w.\-]+/g, "_");
        const filePath = `${m.id}/${idx}_${safeName}`;
        const { error: upErr } = await admin.storage
          .from("email-attachments")
          .upload(filePath, bytes, { contentType: guessMime(fileName), upsert: true });
        if (upErr) { console.error("upload failed", filePath, upErr.message); continue; }
        const { error: attErr } = await admin.from("email_attachments").insert({
          email_id: m.id,
          file_name: fileName,
          file_path: filePath,
          file_size: bytes.byteLength,
          mime_type: guessMime(fileName),
          is_inline: false,
        });
        if (attErr) { console.error("insert failed", filePath, attErr.message); continue; }
        added++;
      }

      if (added > 0) { result.repaired++; result.attachments += added; }
      else if (!dryRun) {
        await admin.from("emails").update({ has_attachments: false }).eq("id", m.id);
        result.cleared++;
      }
    }

    return json({ success: true, dry_run: dryRun, ...result });
  } catch (e: any) {
    console.error("backfill error", e?.message || e);
    return json({ error: e?.message || "failed" }, 500);
  }
});
