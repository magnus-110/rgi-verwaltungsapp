import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const body = await req.json();
    const {
      case_id,
      event_type,
      title,
      body: eventBody,
      occurred_at,
      source_table,
      source_id,
      attachments,
      extracted_data,
      parent_event_id,
      trigger_summary,
    } = body;
    if (!case_id || !event_type) throw new Error("case_id and event_type required");

    const { data: caseRow, error: cErr } = await supabase
      .from("cases")
      .select("building_id")
      .eq("id", case_id)
      .single();
    if (cErr || !caseRow) throw new Error("Case not found");

    // Enforce single nesting level (parent must itself be top-level)
    let safeParentEventId: string | null = parent_event_id || null;
    if (safeParentEventId) {
      const { data: parentEv, error: pErr } = await supabase
        .from("case_events")
        .select("id, parent_event_id, case_id")
        .eq("id", safeParentEventId)
        .single();
      if (pErr || !parentEv) throw new Error("Parent event not found");
      if (parentEv.case_id !== case_id) throw new Error("Parent event belongs to a different case");
      if (parentEv.parent_event_id) {
        // Flatten: if user passed a child as parent, attach to its grandparent instead.
        safeParentEventId = parentEv.parent_event_id;
      }
    }

    const { data: event, error: eErr } = await supabase
      .from("case_events")
      .insert({
        case_id,
        building_id: caseRow.building_id,
        event_type,
        title: title || null,
        body: eventBody || null,
        occurred_at: occurred_at || new Date().toISOString(),
        source_table: source_table || null,
        source_id: source_id || null,
        attachments: attachments || [],
        extracted_data: extracted_data || {},
        parent_event_id: safeParentEventId,
        created_by: user.id,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    await supabase.from("cases").update({ updated_at: new Date().toISOString() }).eq("id", case_id);

    if (trigger_summary !== false) {
      supabase.functions.invoke("case-summarize", { body: { case_id } }).catch((e) => console.error("summary trigger failed", e));
    }

    return new Response(JSON.stringify({ success: true, event }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("case-add-event error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
