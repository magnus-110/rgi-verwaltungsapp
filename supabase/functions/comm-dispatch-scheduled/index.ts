// Cron-driven dispatcher (läuft minütlich):
//  1. startet geplante Rundmails, deren Zeitpunkt erreicht ist
//  2. setzt Rundmails fort, deren Hintergrund-Versand hängengeblieben ist
//     (kein Fortschritt seit einigen Minuten, z. B. nach einem Abbruch)
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Muss zum Wert in comm-send-bulk-email passen. */
const STALE_HEARTBEAT_MS = 3 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const callSender = (body: Record<string, unknown>) =>
    fetch(`${supabaseUrl}/functions/v1/comm-send-bulk-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify(body),
    });

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
    const { data: locked, error: lockErr } = await admin
      .from("comm_campaigns").update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled").select("id");
    if (lockErr || !locked || locked.length === 0) continue;
    try {
      const res = await callSender({ campaign_id: c.id, from_scheduler: true });
      const text = await res.text().catch(() => "");
      if (!res.ok) console.error("scheduled start failed", c.id, res.status, text);
      triggered++;
    } catch (e) {
      console.error("trigger failed", c.id, e);
      await admin.from("comm_campaigns").update({ status: "failed", error_message: String(e) }).eq("id", c.id);
    }
  }

  // Hängengebliebene Hintergrund-Versände fortsetzen. Die Sendefunktion prüft selbst,
  // ob wirklich kein Paket mehr läuft, und schließt Rundmails ohne offene Empfänger ab.
  let resumed = 0;
  const staleIso = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const { data: stalled } = await admin
    .from("comm_campaigns")
    .select("id")
    .eq("type", "email")
    .eq("status", "sending")
    .lt("updated_at", staleIso)
    .limit(10);
  for (const c of stalled || []) {
    try {
      const res = await callSender({ campaign_id: c.id, continue: true });
      await res.text().catch(() => "");
      if (res.ok) resumed++;
    } catch (e) {
      console.error("resume failed", c.id, e);
    }
  }

  return new Response(JSON.stringify({ triggered, resumed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
