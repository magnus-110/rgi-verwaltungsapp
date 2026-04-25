// Public: validate a magic-link token and return a one-time Supabase session
// (via generated email-OTP link) so the client can sign the user in and set a new password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") return json({ error: "token required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link, error: linkErr } = await admin
      .from("onboarding_magic_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (linkErr || !link) return json({ error: "Token ungültig" }, 404);
    if (link.used_at) return json({ error: "Dieser Link wurde bereits verwendet" }, 410);
    if (new Date(link.expires_at) < new Date()) return json({ error: "Dieser Link ist abgelaufen" }, 410);

    // Get user's email (real or pseudo) to generate a magiclink session
    const { data: prof } = await admin
      .from("profiles")
      .select("email, auth_pseudo_email")
      .eq("user_id", link.user_id)
      .maybeSingle();
    const targetEmail = prof?.email || prof?.auth_pseudo_email;
    if (!targetEmail) return json({ error: "Kein Login-Identifier gefunden" }, 500);

    const origin = req.headers.get("origin") || "https://rgi-immobilien.app";

    // Generate a real Supabase magiclink — its hashed_token can be verified client-side
    const { data: gen, error: genErr } = await (admin.auth.admin as any).generateLink({
      type: "magiclink",
      email: targetEmail,
      options: { redirectTo: `${origin}/change-password?onboarding=1` },
    });
    if (genErr || !gen) {
      console.error("generateLink failed", genErr);
      return json({ error: "Login fehlgeschlagen" }, 500);
    }

    // Mark token as used
    await admin
      .from("onboarding_magic_links")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    // Force password change on next login (user got here via QR — they need a real password)
    await admin.from("profiles").update({ must_change_password: true }).eq("user_id", link.user_id);

    return json({
      email: targetEmail,
      hashed_token: gen.properties?.hashed_token,
      action_link: gen.properties?.action_link,
      verification_type: "magiclink",
      building_id: link.building_id,
    });
  } catch (e: any) {
    console.error("consume-magic-link error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
