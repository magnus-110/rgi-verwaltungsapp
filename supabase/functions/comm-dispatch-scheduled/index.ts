// Cron-driven dispatcher: finds scheduled email campaigns whose time has come and triggers them.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due, error } = await admin
    .from("comm_campaigns")
    .select("id, type")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  if (error) {
    console.error("dispatch query failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let triggered = 0;
  for (const c of due || []) {
    if (c.type !== "email") continue; // letters are generated on demand
    // Lock by flipping status first to avoid double-dispatch
    const { error: lockErr } = await admin
      .from("comm_campaigns").update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled");
    if (lockErr) continue;
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/comm-send-bulk-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ campaign_id: c.id }),
      });
      triggered++;
    } catch (e) {
      console.error("trigger failed", c.id, e);
      await admin.from("comm_campaigns").update({ status: "failed", error_message: String(e) }).eq("id", c.id);
    }
  }

  return new Response(JSON.stringify({ triggered }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
