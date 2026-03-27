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
    const { title, description } = await req.json();

    if (!title || title.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Titel ist zu kurz" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const systemPrompt = `Du bist ein juristischer Assistent für WEG-Hausverwaltungen. Du formulierst rechtssichere Beschlusstexte für Eigentümerversammlungen nach deutschem WEG-Recht.

Jeder Beschlusstext MUSS folgende Struktur haben:
1. WER: Beginne mit "Die Eigentümer beschließen..."
2. WAS: Konkreter Beschlussgegenstand
3. WIE: Umsetzungsweise, Beauftragung der Verwaltung mit der Durchführung
4. WANN: Zeitrahmen (konkretes Datum, "unverzüglich" oder "bis spätestens...")

Zusätzliche Regeln:
- Rechtlich korrekt nach aktuellem WEG-Recht formuliert
- Klar, eindeutig und vollstreckbar
- Der Verwaltung einen angemessenen Handlungsspielraum bei der Umsetzung einräumen (z.B. "Die Verwaltung wird ermächtigt, die erforderlichen Maßnahmen zu veranlassen und geeignete Angebote einzuholen"), ohne dies explizit als "finanziellen Spielraum" zu benennen
- Antworte NUR mit dem Beschlusstext, ohne Erklärungen oder Kommentare`;

    const userPrompt = description
      ? `Tagesordnungspunkt: ${title}\n\nErläuterung: ${description}`
      : `Tagesordnungspunkt: ${title}`;

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
        temperature: 0.6,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Mistral API error:", response.status, errText);
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const result = await response.json();
    const generatedText = result.choices?.[0]?.message?.content?.trim() || "";

    if (!generatedText) {
      throw new Error("Keine Antwort erhalten");
    }

    return new Response(
      JSON.stringify({ resolutionText: generatedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-resolution-text error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Beschlusstext konnte nicht generiert werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
