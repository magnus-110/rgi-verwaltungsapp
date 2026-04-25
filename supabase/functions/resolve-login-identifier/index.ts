// Resolves a login identifier (username OR email) to the email Supabase Auth expects.
// Public function — does NOT perform sign-in itself, only resolves the identifier.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { pseudoEmail } from "../_shared/username.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { identifier } = await req.json().catch(() => ({}));
    if (!identifier || typeof identifier !== "string") {
      return json({ error: "identifier required" }, 400);
    }

    const id = identifier.trim();

    // E-Mail? -> direkt durchreichen
    if (id.includes("@")) {
      return json({ email: id.toLowerCase(), method: "email" });
    }

    // Username-Lookup
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const username = id.toLowerCase();
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, email, auth_pseudo_email")
      .eq("username", username)
      .maybeSingle();

    if (!profile) {
      // Generischer Fehler – kein Username-Enumeration
      return json({ error: "Login nicht möglich" }, 404);
    }

    // Bevorzuge echte Email (falls hinterlegt), sonst Pseudo-Email
    const email = profile.email || profile.auth_pseudo_email || pseudoEmail(username);
    return json({ email, method: profile.email ? "email" : "username" });
  } catch (e: any) {
    console.error("resolve-login-identifier error", e);
    return json({ error: "Login nicht möglich" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
