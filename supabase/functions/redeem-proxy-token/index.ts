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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token: rawToken } = await req.json();
    if (!rawToken || typeof rawToken !== "string") {
      return new Response(JSON.stringify({ error: "Token fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept either pure UUID token or a full /etv-proxy/<uuid> URL
    const match = rawToken.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const token = match ? match[0] : rawToken.trim();

    // Verify JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      jwt,
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    // Service role for trusted writes
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find caller's contact id
    const { data: myContact } = await admin
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!myContact?.id) {
      return new Response(
        JSON.stringify({
          error: "Kein verknüpfter Kontakt zu Ihrem Konto gefunden.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Load attendee by token
    const { data: attendee, error: attErr } = await admin
      .from("etv_attendees")
      .select(
        "id, meeting_id, assignment_id, proxy_token_used, proxy_contact_id, etv_meetings!inner(id, status, building_id)",
      )
      .eq("proxy_token", token)
      .maybeSingle();

    if (attErr || !attendee) {
      return new Response(
        JSON.stringify({ error: "Vollmacht-Link ungültig." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const meeting = (attendee as any).etv_meetings;
    if (!meeting || meeting.status === "completed") {
      return new Response(
        JSON.stringify({
          error: "Die Versammlung ist bereits abgeschlossen.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (attendee.proxy_token_used) {
      return new Response(
        JSON.stringify({
          error:
            "Diese Vollmacht wurde bereits eingelöst. Bitte beim Vollmachtgeber einen neuen Link anfordern.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify caller is owner in the same building
    const { data: myAssignments } = await admin
      .from("contact_building_assignments")
      .select("id")
      .eq("contact_id", myContact.id)
      .eq("building_id", meeting.building_id)
      .eq("role_in_building", "eigentuemer")
      .eq("is_active", true);

    if (!myAssignments || myAssignments.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Sie sind kein Eigentümer dieser Liegenschaft und können diese Vollmacht nicht übernehmen.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Redeem: link proxy to caller, consume token
    const { error: updErr } = await admin
      .from("etv_attendees")
      .update({
        proxy_type: "owner",
        proxy_contact_id: myContact.id,
        proxy_token_used: true,
        proxy_external_name: null,
        attendance_type: "proxy",
      })
      .eq("id", attendee.id);

    if (updErr) {
      console.error("redeem update error", updErr);
      return new Response(
        JSON.stringify({ error: "Speichern fehlgeschlagen." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, meeting_id: meeting.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("redeem-proxy-token error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
