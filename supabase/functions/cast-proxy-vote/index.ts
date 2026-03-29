import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, agenda_item_id, vote } = await req.json();

    if (!token || !agenda_item_id || !vote) {
      return new Response(
        JSON.stringify({ error: "Missing token, agenda_item_id, or vote" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["yes", "no", "abstain"].includes(vote)) {
      return new Response(
        JSON.stringify({ error: "Vote must be yes, no, or abstain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token
    const { data: attendee, error: attErr } = await supabase
      .from("etv_attendees")
      .select("id, assignment_id, meeting_id, proxy_token, attendance_type")
      .eq("proxy_token", token)
      .maybeSingle();

    if (attErr || !attendee) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired proxy token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify agenda item belongs to this meeting
    const { data: agendaItem } = await supabase
      .from("etv_agenda_items")
      .select("id, meeting_id, status")
      .eq("id", agenda_item_id)
      .eq("meeting_id", attendee.meeting_id)
      .single();

    if (!agendaItem) {
      return new Response(
        JSON.stringify({ error: "Agenda item not found for this meeting" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agendaItem.status !== "voting") {
      return new Response(
        JSON.stringify({ error: "Voting is not open for this item" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get MEA weight
    const { data: share } = await supabase
      .from("contact_building_shares")
      .select("share_value")
      .eq("assignment_id", attendee.assignment_id)
      .eq("share_type", "mea")
      .maybeSingle();

    // Upsert vote
    const { error: voteErr } = await supabase.from("etv_votes").upsert(
      {
        agenda_item_id,
        assignment_id: attendee.assignment_id,
        vote,
        mea_weight: share?.share_value || 0,
        voted_at: new Date().toISOString(),
      },
      { onConflict: "agenda_item_id,assignment_id" }
    );

    if (voteErr) {
      console.error("Vote insert error:", voteErr);
      return new Response(
        JSON.stringify({ error: "Failed to save vote" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cast-proxy-vote error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
