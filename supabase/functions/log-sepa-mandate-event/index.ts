// Revisionssichere Protokollierung von SEPA-Mandat-Ereignissen.
// IP, User-Agent und Session werden serverseitig erfasst — nicht vom Client gesteuert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_EVENTS = new Set([
  "mandate_granted",
  "mandate_declined",
  "mandate_warning_shown",
  "mandate_warning_dismissed",
  "mandate_changed_after_warning",
  "mandate_revoked",
]);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      event_type,
      building_id,
      contact_id,
      mandate_reference,
      creditor_id,
      creditor_name,
      iban,
      account_holder,
      mandate_text,
      accepted,
      metadata,
    } = body || {};

    if (!event_type || !ALLOWED_EVENTS.has(event_type)) {
      return json({ error: "invalid event_type" }, 400);
    }
    if (typeof mandate_text !== "string" || mandate_text.length < 5) {
      return json({ error: "mandate_text required" }, 400);
    }

    // Session-ID = JWT-Subject + IssuedAt (stabil pro Login)
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let sessionId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      sessionId = payload?.session_id || `${payload?.sub ?? ""}.${payload?.iat ?? ""}`;
    } catch (_) {}

    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");
    const mandateHash = await sha256Hex(mandate_text);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: inserted, error } = await admin
      .from("sepa_mandate_audit_log")
      .insert({
        user_id: userId,
        contact_id: contact_id || null,
        building_id: building_id || null,
        mandate_reference: mandate_reference || null,
        creditor_id: creditor_id || null,
        creditor_name: creditor_name || null,
        iban: typeof iban === "string" ? iban.replace(/\s/g, "").toUpperCase() : null,
        account_holder: account_holder || null,
        mandate_text,
        mandate_text_hash: mandateHash,
        accepted: accepted === true,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: sessionId,
        event_type,
        metadata: metadata && typeof metadata === "object" ? metadata : {},
      })
      .select("id, accepted_at")
      .single();

    if (error) {
      console.error("sepa audit insert error", error);
      return json({ error: error.message }, 500);
    }

    return json({
      success: true,
      audit_id: inserted.id,
      accepted_at: inserted.accepted_at,
      mandate_text_hash: mandateHash,
    });
  } catch (e) {
    console.error("log-sepa-mandate-event error", e);
    return json({ error: (e as Error)?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
