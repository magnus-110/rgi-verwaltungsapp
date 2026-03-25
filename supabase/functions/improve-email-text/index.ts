import "npm:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bodyText, subject } = await req.json();

    if (!bodyText || bodyText.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Text ist zu kurz" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const systemPrompt = `Du bist ein professioneller Assistent für eine Hausverwaltungsfirma. 
Deine Aufgabe ist es, E-Mail-Texte eloquenter und professioneller zu formulieren, dabei aber den Inhalt, die Bedeutung und die Absicht vollständig beizubehalten.
Behalte die Anrede und Grußformel bei, falls vorhanden.
Antworte NUR mit dem verbesserten Text, ohne Erklärungen, Kommentare oder Anführungszeichen.`;

    const userPrompt = subject
      ? `Betreff: ${subject}\n\nText:\n${bodyText}`
      : bodyText;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Mistral API error:", response.status, errText);
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const data = await response.json();
    const improvedText = data.choices?.[0]?.message?.content?.trim();

    if (!improvedText) {
      throw new Error("No response from Mistral");
    }

    return new Response(
      JSON.stringify({ improvedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
