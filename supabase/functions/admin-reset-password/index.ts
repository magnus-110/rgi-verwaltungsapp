// Admin-only: set a (possibly newly generated) initial password for a user.
// Sets profiles.must_change_password = true so the user is forced to change on next login.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Friendly password generator: 4 dictionary-ish words + number — easy to type from a letter.
const WORDS = [
  "Apfel", "Birne", "Brunnen", "Berg", "Wolke", "Wald", "Wiese", "Sonne", "Mond",
  "Feder", "Garten", "Hafen", "Insel", "Kanal", "Krone", "Lampe", "Leuchte",
  "Magnet", "Anker", "Pfeil", "Pinsel", "Quelle", "Regen", "Stern", "Tiger",
  "Turm", "Ufer", "Vogel", "Wagen", "Zeder", "Zelt", "Brücke", "Fluss",
];

function generateFriendlyPassword(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${pick()}-${pick()}-${pick()}-${num}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin/employee
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: hasAccess } = await admin.rpc("user_has_admin_access", { user_id: userRes.user.id });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const { target_user_id, new_password, force_change = true } = await req.json();
    if (!target_user_id) return json({ error: "target_user_id required" }, 400);

    const password = (new_password && String(new_password).length >= 8)
      ? String(new_password)
      : generateFriendlyPassword();

    // Update password via Auth Admin API
    const { error: updErr } = await admin.auth.admin.updateUserById(target_user_id, { password });
    if (updErr) {
      console.error("updateUserById failed", updErr);
      return json({ error: updErr.message }, 500);
    }

    // Update profile flags
    await admin.from("profiles").update({
      must_change_password: !!force_change,
      initial_password_set_at: new Date().toISOString(),
    }).eq("user_id", target_user_id);

    return json({
      success: true,
      password,                 // ⚠ returned ONCE — caller must hand it to user / letter generator
      generated: !new_password,
    });
  } catch (e: any) {
    console.error("admin-reset-password error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
