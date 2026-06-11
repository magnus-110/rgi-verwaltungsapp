import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: users, error } = await admin
      .from("profiles")
      .select("user_id")
      .in("role", ["admin", "employee"]);

    if (error) throw error;

    let signedOut = 0;
    let failed = 0;
    for (const u of users ?? []) {
      if (!u.user_id) continue;
      const { error: soErr } = await admin.auth.admin.signOut(u.user_id, "global");
      if (soErr) {
        failed++;
        console.error("signOut failed", u.user_id, soErr.message);
      } else {
        signedOut++;
      }
    }

    console.log(`nightly-admin-logout: signedOut=${signedOut} failed=${failed}`);
    return new Response(
      JSON.stringify({ signedOut, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    console.error("nightly-admin-logout error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
