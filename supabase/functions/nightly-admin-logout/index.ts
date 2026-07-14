import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Authorization: this is an internal cron job. Require a shared secret. ---
    // Accept either the service-role key or a dedicated CRON_SECRET, supplied by
    // the scheduler as the `x-cron-secret` header. Configure CRON_SECRET in the
    // function secrets and set the same value in the schedule/cron caller.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const provided = req.headers.get("x-cron-secret") ??
      (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const allowed = new Set([cronSecret, serviceKey].filter(Boolean) as string[]);
    if (!provided || !allowed.has(provided)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
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
