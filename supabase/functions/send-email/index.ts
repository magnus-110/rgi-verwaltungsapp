import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";

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
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
    if (userErr || !userData?.user) {
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
      attachments,
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

    const { data: sentFolder } = await supabaseAdmin
      .from("email_folders")
      .select("id")
      .eq("name", "Gesendet")
      .single();

    // Port 465 = direct SSL (secure:true), Port 587 = STARTTLS (secure:false)
    const isSecure = account.smtp_port === 465;
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: isSecure,
      auth: {
        user: account.smtp_user,
        pass: account.smtp_password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions: any = {
      from: `${account.display_name} <${account.email_address}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "(Kein Betreff)",
    };

    // For forwarded emails with HTML, send as HTML; otherwise plain text
    if (body_html) {
      mailOptions.html = body_html;
      mailOptions.text = body_text || "";
    } else {
      mailOptions.text = body_text || "";
    }

    if (cc && cc.length > 0) {
      mailOptions.cc = Array.isArray(cc) ? cc.join(", ") : cc;
    }
    if (bcc && bcc.length > 0) {
      mailOptions.bcc = Array.isArray(bcc) ? bcc.join(", ") : bcc;
    }
    if (in_reply_to) {
      mailOptions.inReplyTo = in_reply_to;
    }

    // Resolve attachments. Each entry has either inline base64 `content` (small files)
    // or a `storage_path` pointing to the email-attachments bucket (large files uploaded
    // directly by the client to avoid edge function payload/memory limits).
    const resolvedAttachments: Array<{
      filename: string;
      buffer: Uint8Array;
      contentType: string;
      storage_path?: string;
    }> = [];
    const MAX_TOTAL_BYTES = 35 * 1024 * 1024; // 35 MB Summe — darüber sprengt nodemailer + base64 das 150 MB Memory-Limit
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachment(s)`);
      // Vorab Gesamtgröße aus Metadaten prüfen (storage_path: HEAD via list, inline: base64-Länge)
      let declaredTotal = 0;
      for (const att of attachments) {
        if (typeof att.size === "number") declaredTotal += att.size;
        else if (att.content) declaredTotal += Math.floor((att.content.length * 3) / 4);
      }
      if (declaredTotal > MAX_TOTAL_BYTES) {
        const mb = (declaredTotal / 1024 / 1024).toFixed(1);
        return new Response(
          JSON.stringify({
            error: `Anhänge zu groß: ${mb} MB (max. 35 MB pro E-Mail). Bitte E-Mail aufteilen oder Dateien als Download-Link versenden.`,
          }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let runningTotal = 0;
      for (const att of attachments) {
        let buf: Uint8Array;
        if (att.storage_path) {
          const { data: blob, error: dlErr } = await supabaseAdmin.storage
            .from("email-attachments")
            .download(att.storage_path);
          if (dlErr || !blob) {
            console.error(`Storage download failed (${att.storage_path}):`, dlErr?.message);
            throw new Error(`Anhang konnte nicht geladen werden: ${att.filename}`);
          }
          buf = new Uint8Array(await blob.arrayBuffer());
          console.log(`  - ${att.filename} (${att.contentType}, ${buf.byteLength} bytes, from storage)`);
        } else if (att.content) {
          buf = Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0));
          console.log(`  - ${att.filename} (${att.contentType}, ${buf.byteLength} bytes, inline)`);
        } else {
          console.warn(`  - skipping ${att.filename}: no content or storage_path`);
          continue;
        }
        runningTotal += buf.byteLength;
        if (runningTotal > MAX_TOTAL_BYTES) {
          const mb = (runningTotal / 1024 / 1024).toFixed(1);
          return new Response(
            JSON.stringify({
              error: `Anhänge zu groß: ${mb} MB (max. 35 MB pro E-Mail). Bitte E-Mail aufteilen oder Dateien als Download-Link versenden.`,
            }),
            { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        resolvedAttachments.push({
          filename: att.filename,
          buffer: buf,
          contentType: att.contentType || "application/octet-stream",
          storage_path: att.storage_path,
        });
      }
      mailOptions.attachments = resolvedAttachments.map((a) => ({
        filename: a.filename,
        content: a.buffer,
        contentType: a.contentType,
      }));
    }


    try {
      await transporter.sendMail(mailOptions);
    } catch (sendErr: any) {
      console.error("nodemailer sendMail failed:", sendErr?.message, sendErr);
      throw sendErr;
    }

    // Save sent email in DB
    const toAddresses = Array.isArray(to) ? to : [to];
    const hasAttachments = attachments && attachments.length > 0;
    
    const { data: insertedEmail, error: insertErr } = await supabaseAdmin.from("emails").insert({
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
      has_attachments: hasAttachments || false,
      message_id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      in_reply_to: in_reply_to || null,
    }).select("id").single();

    if (insertErr) {
      console.error("Failed to save sent email:", insertErr.message);
    }

    // Persist attachments to storage + email_attachments so they show up in the Sent view
    if (insertedEmail?.id && resolvedAttachments.length > 0) {
      for (const [idx, att] of resolvedAttachments.entries()) {
        try {
          const safeName = String(att.filename || "attachment").replace(/[^\w.\-]+/g, "_");
          // Index-Prefix verhindert Überschreiben bei gleichnamigen Anhängen
          const filePath = `${insertedEmail.id}/${idx}_${safeName}`;
          // If already in storage at outgoing path, copy/move into the email folder.
          if (att.storage_path) {
            const { error: mvErr } = await supabaseAdmin.storage
              .from("email-attachments")
              .move(att.storage_path, filePath);
            if (mvErr) {
              // Fallback: re-upload buffer
              const { error: upErr } = await supabaseAdmin.storage
                .from("email-attachments")
                .upload(filePath, att.buffer, {
                  contentType: att.contentType,
                  upsert: true,
                });
              if (upErr) {
                console.error(`Attachment move/upload failed (${safeName}):`, upErr.message);
                continue;
              }
            }
          } else {
            const { error: upErr } = await supabaseAdmin.storage
              .from("email-attachments")
              .upload(filePath, att.buffer, {
                contentType: att.contentType,
                upsert: true,
              });
            if (upErr) {
              console.error(`Attachment upload failed (${safeName}):`, upErr.message);
              continue;
            }
          }
          const { error: attErr } = await supabaseAdmin.from("email_attachments").insert({
            email_id: insertedEmail.id,
            file_name: att.filename,
            file_path: filePath,
            file_size: att.buffer.byteLength,
            mime_type: att.contentType,
            is_inline: false,
          });
          if (attErr) {
            console.error(`email_attachments insert failed (${safeName}):`, attErr.message);
          }
        } catch (e: any) {
          console.error("Attachment persist error:", e?.message || e);
        }
      }
    }


    return new Response(
      JSON.stringify({ success: true, message: "E-Mail gesendet" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("send-email error:", error);
    let userMessage = error?.message || "Fehler beim Senden";
    // Friendly message for invalid recipient domains
    if (error?.code === "EENVELOPE" || /Domain does not exist|recipients were rejected/i.test(userMessage)) {
      const rejected = Array.isArray(error?.rejected) ? error.rejected.join(", ") : "";
      userMessage = `Ungültige Empfänger-Adresse${rejected ? `: ${rejected}` : ""}. Die Domain existiert nicht — bitte E-Mail-Adresse prüfen.`;
    }
    return new Response(
      JSON.stringify({ error: userMessage, code: error?.code, rejected: error?.rejected }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});