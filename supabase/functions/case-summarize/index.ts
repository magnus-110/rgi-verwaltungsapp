import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { case_id } = await req.json();
    if (!case_id) throw new Error("case_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caseRow, error: cErr } = await supabase
      .from("cases")
      .select("id, title, description, category, status, priority")
      .eq("id", case_id)
      .single();
    if (cErr || !caseRow) throw cErr || new Error("Case not found");

    const { data: events } = await supabase
      .from("case_events")
      .select("event_type, occurred_at, title, body, extracted_data")
      .eq("case_id", case_id)
      .order("occurred_at", { ascending: true })
      .limit(100);

    const eventsText = (events || [])
      .map((e) => {
        const date = new Date(e.occurred_at).toLocaleDateString("de-DE");
        return `[${date}] ${e.event_type}: ${e.title || ""}${e.body ? " — " + e.body.substring(0, 300) : ""}`;
      })
      .join("\n");

    // Die letzten fuenf Ereignisse noch einmal gesondert. Ohne das schreibt das
    // Modell brav den ganzen Verlauf nach und der letzte Schritt geht darin
    // unter — und genau der ist es, weswegen man die Akte aufmacht.
    const letzte = (events || []).slice(-5);
    const letzteText = letzte
      .map((e) => {
        const date = new Date(e.occurred_at).toLocaleDateString("de-DE");
        return `[${date}] ${e.event_type}: ${e.title || ""}${e.body ? " — " + e.body.substring(0, 400) : ""}`;
      })
      .join("\n");

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY missing");

    const prompt = `Vorgang: "${caseRow.title}" (Kategorie: ${caseRow.category}, Status: ${caseRow.status})
Beschreibung: ${caseRow.description || "(keine)"}

Ereignisse chronologisch:
${eventsText || "(noch keine Ereignisse)"}

Die juengsten Ereignisse noch einmal:
${letzteText || "(noch keine Ereignisse)"}

Antworte AUSSCHLIESSLICH als JSON-Objekt im Format:
{
  "summary": "Worum geht es? 1-2 Saetze zur Sache selbst — wer will was, worum dreht sich der Vorgang. Max. 280 Zeichen.",
  "last_step": "Was ist zuletzt passiert und woran haengt es jetzt? 1-2 Saetze, mit Datum, wenn eines bekannt ist. Max. 280 Zeichen."
}
Kein Markdown, keine Ueberschriften, keine Sternchen. Deutsch, Fliesstext.
Wenn es noch keine Ereignisse gibt, schreibe bei last_step: "Seit dem Anlegen ist nichts passiert."
Nur JSON, keine Erklaerung.`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: "Du bist Assistent eines Hausverwalters. Antworte NUR mit gültigem JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`AI error ${response.status}: ${t}`);
    }
    const result = await response.json();
    const raw: string = result.choices?.[0]?.message?.content || "{}";
    let summary = "";
    let lastStep = "";
    try {
      const parsed = JSON.parse(raw);
      summary = (parsed.summary || "").toString().slice(0, 500);
      lastStep = (parsed.last_step || "").toString().slice(0, 500);
    } catch (_) {
      summary = raw.slice(0, 500);
    }

    // Extract keywords for email matching
    const keywordsRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: "Extrahiere 5-10 prägnante Schlagworte (Substantive, Eigennamen, Aktenzeichen) als JSON-Array. Antworte NUR mit dem JSON-Array." },
          { role: "user", content: `${caseRow.title}\n${caseRow.description || ""}\n${eventsText.substring(0, 2000)}` },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });
    let keywords: string[] = [];
    if (keywordsRes.ok) {
      try {
        const k = await keywordsRes.json();
        const text = k.choices?.[0]?.message?.content || "[]";
        const match = text.match(/\[[\s\S]*\]/);
        if (match) keywords = JSON.parse(match[0]).filter((x: any) => typeof x === "string").slice(0, 10);
      } catch (_) { /* ignore */ }
    }

    // ai_next_steps wird bewusst nicht mehr geschrieben: Der Prompt fordert nur
    // summary und last_step an, sodass hier stets eine leere Liste landete und
    // einen vorhandenen Wert ueberschrieb. Angezeigt wird das Feld nirgends.
    const update: Record<string, unknown> = {
      ai_summary: summary,
      ai_summary_updated_at: new Date().toISOString(),
      ai_keywords: keywords,
    };
    // Nur schreiben, wenn wirklich etwas kam — sonst wuerde ein
    // missglueckter Lauf den letzten brauchbaren Stand ausradieren.
    if (lastStep) update.ai_last_step = lastStep;

    await supabase.from("cases").update(update).eq("id", case_id);

    return new Response(JSON.stringify({ success: true, summary, last_step: lastStep, keywords }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("case-summarize error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
