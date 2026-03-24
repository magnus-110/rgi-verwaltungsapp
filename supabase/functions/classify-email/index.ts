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

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const emailIds: string[] = body.email_ids || [];

    // If no specific IDs, classify all unclassified emails
    let query = supabaseAdmin
      .from("emails")
      .select("id, subject, from_address, from_name, body_text, to_addresses")
      .is("ai_category", null)
      .order("date", { ascending: false })
      .limit(20);

    if (emailIds.length > 0) {
      query = supabaseAdmin
        .from("emails")
        .select("id, subject, from_address, from_name, body_text, to_addresses")
        .in("id", emailIds);
    }

    const { data: emails, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ message: "Keine E-Mails zu klassifizieren" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get buildings and contacts for matching
    const { data: buildings } = await supabaseAdmin
      .from("buildings")
      .select("id, name, address");

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, company_name");

    const { data: contactEmails } = await supabaseAdmin
      .from("contact_emails")
      .select("contact_id, email");

    // Build contact email lookup
    const emailToContactId: Record<string, string> = {};
    for (const ce of contactEmails || []) {
      emailToContactId[ce.email.toLowerCase()] = ce.contact_id;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const buildingList = (buildings || [])
      .map((b) => `- "${b.name}" (${b.address}) [ID: ${b.id}]`)
      .join("\n");

    const contactList = (contacts || [])
      .map((c) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
        return `- ${name || c.company_name || "Unbekannt"} [ID: ${c.id}]`;
      })
      .join("\n");

    let classified = 0;

    for (const email of emails) {
      try {
        // Direct contact match by email address
        const directContactId =
          email.from_address
            ? emailToContactId[email.from_address.toLowerCase()] || null
            : null;

        const emailContent = `Betreff: ${email.subject || "(kein Betreff)"}
Von: ${email.from_name || ""} <${email.from_address || ""}>
Inhalt (Auszug): ${(email.body_text || "").substring(0, 1500)}`;

        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content: `Du bist ein KI-Assistent für eine Hausverwaltung. Analysiere eingehende E-Mails und klassifiziere sie.

Verfügbare Gebäude:
${buildingList || "Keine Gebäude vorhanden"}

Verfügbare Kontakte:
${contactList || "Keine Kontakte vorhanden"}`,
                },
                {
                  role: "user",
                  content: emailContent,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "classify_email",
                    description:
                      "Klassifiziere eine E-Mail für die Hausverwaltung",
                    parameters: {
                      type: "object",
                      properties: {
                        category: {
                          type: "string",
                          enum: [
                            "Schadensmeldung",
                            "Rechnung",
                            "Anfrage",
                            "Behörde",
                            "Versicherung",
                            "Handwerker",
                            "Eigentümer",
                            "Mieter",
                            "Hausgeld",
                            "Versammlung",
                            "Vertrag",
                            "Kündigung",
                            "Newsletter",
                            "Werbung",
                            "Sonstiges",
                          ],
                          description: "Kategorie der E-Mail",
                        },
                        priority: {
                          type: "string",
                          enum: ["hoch", "mittel", "niedrig"],
                          description:
                            "Priorität: hoch = dringend/Schaden/Frist, mittel = normal, niedrig = Info/Werbung",
                        },
                        summary: {
                          type: "string",
                          description:
                            "Kurze Zusammenfassung in 1-2 Sätzen auf Deutsch",
                        },
                        building_id: {
                          type: "string",
                          description:
                            "UUID des zugehörigen Gebäudes, falls erkennbar. Null wenn unklar.",
                        },
                        contact_id: {
                          type: "string",
                          description:
                            "UUID des zugehörigen Kontakts, falls erkennbar. Null wenn unklar.",
                        },
                      },
                      required: ["category", "priority", "summary"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: {
                type: "function",
                function: { name: "classify_email" },
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error(`AI classify error ${response.status}:`, errText);
          continue;
        }

        const result = await response.json();
        const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) continue;

        const classification = JSON.parse(toolCall.function.arguments);

        // Update email with classification
        const updateData: Record<string, any> = {
          ai_category: classification.category,
          ai_priority: classification.priority,
          ai_summary: classification.summary,
        };

        // Use direct contact match first, then AI suggestion
        if (directContactId) {
          updateData.contact_id = directContactId;
        } else if (classification.contact_id) {
          updateData.contact_id = classification.contact_id;
        }

        if (classification.building_id) {
          updateData.building_id = classification.building_id;
        }

        const { error: updateErr } = await supabaseAdmin
          .from("emails")
          .update(updateData)
          .eq("id", email.id);

        if (updateErr) {
          console.error("Update error:", updateErr.message);
        } else {
          classified++;
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (emailErr: any) {
        console.error(
          `Error classifying email ${email.id}:`,
          emailErr.message
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, classified, total: emails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("classify-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
