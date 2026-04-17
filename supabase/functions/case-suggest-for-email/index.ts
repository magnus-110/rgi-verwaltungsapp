import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email_id, building_id } = await req.json();
    if (!email_id) throw new Error("email_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: email } = await supabase
      .from("emails")
      .select("id, subject, body_text, from_address, in_reply_to, building_id")
      .eq("id", email_id)
      .single();
    if (!email) throw new Error("Email not found");

    const effectiveBuildingId = building_id || email.building_id;

    // Step 1: deterministic match via In-Reply-To
    if (email.in_reply_to) {
      const { data: parentEmail } = await supabase
        .from("emails")
        .select("case_id")
        .eq("message_id", email.in_reply_to)
        .not("case_id", "is", null)
        .maybeSingle();
      if (parentEmail?.case_id) {
        await supabase
          .from("emails")
          .update({ case_id: parentEmail.case_id, ai_case_suggestion_id: parentEmail.case_id, ai_case_confidence: 1.0 })
          .eq("id", email_id);
        return new Response(JSON.stringify({ matched: true, case_id: parentEmail.case_id, confidence: 1.0, method: "thread" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!effectiveBuildingId) {
      return new Response(JSON.stringify({ matched: false, reason: "no_building" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: AI match against open cases
    const { data: cases } = await supabase
      .from("cases")
      .select("id, title, description, category, ai_keywords")
      .eq("building_id", effectiveBuildingId)
      .in("status", ["open", "in_progress", "waiting_external", "waiting_owner"])
      .limit(30);

    if (!cases || cases.length === 0) {
      return new Response(JSON.stringify({ matched: false, reason: "no_open_cases" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY missing");

    const caseList = cases
      .map((c) => `- [ID: ${c.id}] "${c.title}" (${c.category}) — Keywords: ${(c.ai_keywords || []).join(", ")}`)
      .join("\n");

    const emailContent = `Betreff: ${email.subject || ""}\nVon: ${email.from_address || ""}\nText: ${(email.body_text || "").substring(0, 1500)}`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: `Ordne diese E-Mail einem offenen Vorgang zu. Verfügbare Vorgänge:\n${caseList}\n\nAntworte NUR mit dem JSON-Tool.` },
          { role: "user", content: emailContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "match_case",
            parameters: {
              type: "object",
              properties: {
                case_id: { type: "string", description: "UUID des passenden Vorgangs oder leer wenn keiner passt" },
                confidence: { type: "number", description: "0.0 - 1.0" },
                reason: { type: "string" },
              },
              required: ["confidence", "reason"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "match_case" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`AI error ${response.status}: ${t}`);
    }
    const result = await response.json();
    const tc = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) {
      return new Response(JSON.stringify({ matched: false, reason: "no_tool_call" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(tc.function.arguments);
    const caseId = args.case_id && cases.find((c) => c.id === args.case_id) ? args.case_id : null;
    const confidence = Math.max(0, Math.min(1, args.confidence || 0));

    if (!caseId) {
      return new Response(JSON.stringify({ matched: false, reason: args.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: any = { ai_case_suggestion_id: caseId, ai_case_confidence: confidence };
    if (confidence >= 0.9) update.case_id = caseId;
    await supabase.from("emails").update(update).eq("id", email_id);

    return new Response(JSON.stringify({ matched: true, case_id: caseId, confidence, auto_assigned: confidence >= 0.9, reason: args.reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("case-suggest-for-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
