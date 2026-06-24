import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function last8(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "").slice(-8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { event, number, secret } = body ?? {};
  const expected = Deno.env.get("CALL_EVENT_SECRET");
  if (!expected || secret !== expected) return json({ error: "Unauthorized" }, 401);
  if (!event || !["incoming", "connected", "ended"].includes(event)) {
    return json({ error: "Invalid event" }, 400);
  }
  const numberRaw = String(number ?? "").trim();
  if (!numberRaw) return json({ error: "Missing number" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tail = last8(numberRaw);

  if (event === "incoming") {
    let contact_id: string | null = null;
    let building_id: string | null = null;
    try {
      const { data: matches } = await supabase.rpc("find_contact_by_phone", { p_num: numberRaw });
      if (Array.isArray(matches) && matches.length > 0) {
        contact_id = (matches[0] as any).contact_id ?? null;
        if (contact_id) {
          const { data: assign } = await supabase
            .from("contact_building_assignments")
            .select("building_id")
            .eq("contact_id", contact_id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          building_id = assign?.building_id ?? null;
        }
      }
    } catch (_e) { /* ignore */ }

    const { data, error } = await supabase
      .from("call_logs")
      .insert({
        direction: "incoming",
        status: "verpasst",
        number_raw: numberRaw,
        number_e164: numberRaw.startsWith("+") ? numberRaw : null,
        contact_id,
        building_id,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data.id });
  }

  // For connected / ended: find newest open (ended_at IS NULL) entry matching last 8
  const { data: open, error: selErr } = await supabase
    .from("call_logs")
    .select("id, connected_at, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(50);
  if (selErr) return json({ error: selErr.message }, 500);

  // Filter by last-8 client-side (need to refetch with number column)
  const { data: openWithNum } = await supabase
    .from("call_logs")
    .select("id, number_raw, connected_at, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(50);
  const match = (openWithNum ?? []).find((r: any) => last8(r.number_raw) === tail);

  if (!match) return json({ ok: true, matched: false });

  if (event === "connected") {
    const { error } = await supabase
      .from("call_logs")
      .update({ status: "angenommen", connected_at: new Date().toISOString() })
      .eq("id", match.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: match.id });
  }

  // ended
  const now = new Date();
  const connectedAt = match.connected_at ? new Date(match.connected_at) : null;
  const duration = connectedAt ? Math.max(0, Math.round((now.getTime() - connectedAt.getTime()) / 1000)) : 0;
  const { error } = await supabase
    .from("call_logs")
    .update({ ended_at: now.toISOString(), duration_seconds: duration })
    .eq("id", match.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: match.id, duration });
});
