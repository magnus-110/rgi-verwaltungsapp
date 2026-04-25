// Admin-only: create a one-time magic link token (24h) for a user.
// Used in welcome letters as a QR code (scan -> auto sign-in -> set password).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomToken(len = 48): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: hasAccess } = await admin.rpc("user_has_admin_access", { user_id: userRes.user.id });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const { target_user_id, building_id, ttl_hours = 24 } = await req.json();
    if (!target_user_id) return json({ error: "target_user_id required" }, 400);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + Number(ttl_hours) * 3600 * 1000).toISOString();

    const { error: insErr } = await admin.from("onboarding_magic_links").insert({
      token,
      user_id: target_user_id,
      building_id: building_id || null,
      expires_at: expiresAt,
      created_by: userRes.user.id,
    });
    if (insErr) {
      console.error("insert magic link failed", insErr);
      return json({ error: insErr.message }, 500);
    }

    const origin = req.headers.get("origin") || "https://rgi-immobilien.app";
    const url = `${origin}/login/magic/${token}`;

    return json({ token, url, expires_at: expiresAt });
  } catch (e: any) {
    console.error("generate-onboarding-magic-link error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
