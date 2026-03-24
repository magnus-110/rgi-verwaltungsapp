import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { SMTPClient } from "npm:emailjs@4.0.4";

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
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      account_id,
      to,
      cc,
      bcc,
      subject,
      body_text,
      body_html,
      in_reply_to,
      reply_to_email_id,
    } = await req.json();

    if (!account_id || !to || to.length === 0) {
      return new Response(
        JSON.stringify({ error: "account_id und to sind erforderlich" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get account credentials
    const { data: account, error: accErr } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("id", account_id)
      .single();

    if (accErr || !account) {
      return new Response(
        JSON.stringify({ error: "E-Mail-Konto nicht gefunden" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get sent folder
    const { data: sentFolder } = await supabaseAdmin
      .from("email_folders")
      .select("id")
      .eq("name", "Gesendet")
      .single();

    // Send via SMTP
    const client = new SMTPClient({
      user: account.smtp_user,
      password: account.smtp_password,
      host: account.smtp_host,
      port: account.smtp_port,
      ssl: account.use_ssl,
    });

    const messageConfig: any = {
      from: `${account.display_name} <${account.email_address}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "(Kein Betreff)",
    };

    if (cc && cc.length > 0) {
      messageConfig.cc = Array.isArray(cc) ? cc.join(", ") : cc;
    }
    if (bcc && bcc.length > 0) {
      messageConfig.bcc = Array.isArray(bcc) ? bcc.join(", ") : bcc;
    }

    if (body_html) {
      messageConfig.attachment = [
        { data: body_html, alternative: true },
      ];
      messageConfig.text = body_text || "";
    } else {
      messageConfig.text = body_text || "";
    }

    if (in_reply_to) {
      messageConfig["message-id"] = in_reply_to;
    }

    await client.sendAsync(messageConfig);

    // Save sent email in DB
    const toAddresses = Array.isArray(to) ? to : [to];
    const { error: insertErr } = await supabaseAdmin.from("emails").insert({
      account_id: account.id,
      folder_id: sentFolder?.id,
      subject: subject || null,
      from_address: account.email_address,
      from_name: account.display_name,
      to_addresses: toAddresses,
      cc_addresses: cc || null,
      body_text: body_text || null,
      body_html: body_html || null,
      date: new Date().toISOString(),
      is_read: true,
      message_id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    if (insertErr) {
      console.error("Failed to save sent email:", insertErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, message: "E-Mail gesendet" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("send-email error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Fehler beim Senden" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
