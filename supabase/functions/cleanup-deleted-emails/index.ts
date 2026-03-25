import { createClient } from "npm:@supabase/supabase-js@2.52.1";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // First delete attachments for emails that will be permanently deleted
    const { data: expiredEmails } = await supabase
      .from("emails")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", thirtyDaysAgo.toISOString());

    if (expiredEmails && expiredEmails.length > 0) {
      const expiredIds = expiredEmails.map((e: any) => e.id);

      // Delete attachments
      await supabase
        .from("email_attachments")
        .delete()
        .in("email_id", expiredIds);

      // Permanently delete emails
      const { error, count } = await supabase
        .from("emails")
        .delete()
        .in("id", expiredIds);

      if (error) throw error;

      console.log(`Permanently deleted ${count || expiredIds.length} emails older than 30 days from trash`);
    } else {
      console.log("No expired emails to clean up");
    }

    return new Response(
      JSON.stringify({ success: true, deleted: expiredEmails?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cleanup error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
