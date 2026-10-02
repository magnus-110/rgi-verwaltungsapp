// Schlägt aus einer Meldung eine Aufgabe vor (Titel + kurze Beschreibung).
// Aufgerufen aus dem Postfach, wenn jemand „Aufgabe“ an einer Meldung wählt.
// Es wird nichts gespeichert — das Büro sieht den Vorschlag und kann ihn ändern.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAdmin(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const { report_id } = await req.json();
    if (!report_id) return json({ error: "report_id fehlt" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: report, error } = await supabase
      .from("reports")
      .select("report_number, title, description, contact_name, contact_phone, contact_email, building:buildings(name)")
      .eq("id", report_id)
      .single();
    if (error || !report) return json({ error: "Meldung nicht gefunden" }, 404);

    const { data: events } = await supabase
      .from("report_events")
      .select("kind, body, step_label, created_at")
      .eq("report_id", report_id)
      .in("kind", ["step", "message", "reply", "note"])
      .order("created_at", { ascending: true })
      .limit(30);

    const verlauf = (events || [])
      .map((e) => {
        const datum = new Date(e.created_at).toLocaleDateString("de-DE");
        const art = { step: "Stand", message: "Nachricht an Melder", reply: "Antwort Melder", note: "Interne Notiz" }[
          e.kind as string
        ];
        return `[${datum}] ${art}: ${e.step_label ? e.step_label + " — " : ""}${(e.body || "").slice(0, 300)}`;
      })
      .join("\n");

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) return json({ error: "MISTRAL_API_KEY fehlt" }, 500);

    const gebaeude = (report as any).building?.name || "unbekannt";
    const kontakt = [report.contact_name, report.contact_phone || report.contact_email].filter(Boolean).join(", ");

    const prompt = `Meldung ${report.report_number} aus dem Objekt "${gebaeude}"
Betreff: ${report.title}
Text: ${report.description || "(kein Text)"}
Melder: ${kontakt || "(unbekannt)"}

Bisheriger Verlauf:
${verlauf || "(noch nichts passiert)"}

Formuliere daraus eine Aufgabe für das Büro einer Hausverwaltung.
Antworte AUSSCHLIESSLICH als JSON-Objekt:
{
  "title": "Was ist zu tun? Kurz, mit Verb, max. 70 Zeichen, z. B. 'Wasserschaden Keller Südbau prüfen lassen'.",
  "description": "2-3 Sätze: Was ist passiert, was ist konkret zu tun, wen erreicht man (Name und Telefon des Melders, falls bekannt). Max. 400 Zeichen."
}
Deutsch, kein Markdown, keine Aufzählungszeichen. Nichts erfinden, was nicht in der Meldung steht.`;

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
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      return json({ error: `KI nicht erreichbar (${response.status})`, detail: t.slice(0, 300) }, 502);
    }

    const result = await response.json();
    const raw: string = result.choices?.[0]?.message?.content || "{}";
    let title = "";
    let description = "";
    try {
      const parsed = JSON.parse(raw);
      title = String(parsed.title || "").trim().slice(0, 120);
      description = String(parsed.description || "").trim().slice(0, 800);
    } catch (_) {
      description = raw.slice(0, 800);
    }

    return json({ title: title || report.title, description });
  } catch (e) {
    return json({ error: (e as Error).message || "Unbekannter Fehler" }, 500);
  }
});
