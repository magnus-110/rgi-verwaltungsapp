// Kurzer Vorgangstitel (1-3 Woerter) per KI fuer Vorgaenge, die aus einem
// ETV-Beschluss entstehen ("zur Umsetzung" markiert).
//
// Ablauf: Der Datenbank-Trigger handle_resolution_actionable legt den Vorgang mit einem
// vorlaeufigen Titel an (cases.title_auto = true) und ruft diese Funktion auf. Sie
// erzeugt mit Mistral einen kurzen Titel und setzt title_auto = false.
//
// Sicherheit: Umbenannt werden ausschliesslich Vorgaenge mit title_auto = true, die an
// einem Beschluss haengen. Von Hand vergebene Titel werden nie ueberschrieben. Die
// Funktion nimmt keine Titel von aussen an - ein Aufruf kann nur diesen Schritt ausloesen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");

const ANWEISUNG = `Du formulierst Titel für Vorgänge einer Hausverwaltung.
Aus einem Beschluss der Eigentümerversammlung machst du einen kurzen Vorgangstitel.

Regeln:
- 1 bis 3 Wörter, Deutsch mit Umlauten, Substantive (z. B. "Sanierung Hausmeisterwohnung")
- Worum geht es inhaltlich? Nicht: wer beschließt, welche Firma, welcher Betrag
- Keine Beschlussnummer, keine Zahlen, keine Firmennamen, keine Anführungszeichen, kein Punkt
- Antworte NUR mit dem Titel

Beispiele:
Beschluss: Die Wohnungseigentümer beschließen die Beauftragung der Baumgartner Brandschutztechnik GmbH mit der Wartung der Feuerlöscher ...
Titel: Wartung Feuerlöscher

Beschluss: Die Wohnungseigentümer beschließen die Instandsetzung des teilweise morschen Westbalkons der Dachgeschosswohnung ...
Titel: Instandsetzung Westbalkon

Beschluss: Die Eigentümer beschließen, den aktuellen Versicherungsschutz zu belassen ...
Titel: Versicherungsschutz

Beschluss: Die Wohnungseigentümer beschließen die wasserseitige Neuabdichtung der Boileranschlüsse ...
Titel: Abdichtung Boileranschlüsse`;

/** Antwort der KI saeubern; null, wenn sie nicht als kurzer Titel taugt. */
function saeubern(roh: string): string | null {
  let t = (roh || "").split("\n")[0].trim();
  t = t.replace(/^titel\s*:\s*/i, "");
  t = t.replace(/^[\s"'„“”«»*`]+|[\s"'„“”«»*`.!:;]+$/g, "");
  t = t.replace(/^\d{2,4}[-/]\d+\s*[:\-–]\s*/, ""); // "2026-1: ..." am Anfang entfernen
  t = t.replace(/\s+/g, " ").trim();
  const woerter = t.split(" ").filter(Boolean);
  if (woerter.length === 0 || woerter.length > 4 || t.length > 50) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function kurztitel(beschlusstext: string): Promise<string | null> {
  if (!MISTRAL_API_KEY) return null;
  for (let versuch = 1; versuch <= 2; versuch++) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0.1,
        max_tokens: 20,
        messages: [
          { role: "system", content: ANWEISUNG },
          { role: "user", content: `Beschluss: ${beschlusstext.slice(0, 2500)}\nTitel:` },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return saeubern(String(data?.choices?.[0]?.message?.content ?? ""));
    }
    console.error("Mistral:", res.status, (await res.text()).slice(0, 200));
    if (res.status !== 429 && res.status < 500) return null;
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

async function umbenennen(caseId: string): Promise<{ caseId: string; titel: string | null }> {
  const { data: vorgang } = await supabase
    .from("cases").select("id, title, title_auto").eq("id", caseId).maybeSingle();
  if (!vorgang || !vorgang.title_auto) return { caseId, titel: null };

  const { data: beschluss } = await supabase
    .from("etv_resolutions").select("resolution_text").eq("case_id", caseId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!beschluss?.resolution_text) return { caseId, titel: null };

  const titel = await kurztitel(beschluss.resolution_text);
  if (!titel) return { caseId, titel: null };

  // Nur, wenn in der Zwischenzeit niemand den Titel von Hand geaendert hat.
  const { data: geaendert } = await supabase
    .from("cases").update({ title: titel, title_auto: false })
    .eq("id", caseId).eq("title_auto", true).eq("title", vorgang.title)
    .select("id");
  return { caseId, titel: geaendert?.length ? titel : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { caseId, alle } = await req.json().catch(() => ({}));

    if (caseId) return json(await umbenennen(String(caseId)));

    // Nachholen fuer alle noch offenen automatischen Titel (z. B. wenn die KI nicht erreichbar war)
    if (alle) {
      const { data: offene } = await supabase
        .from("cases").select("id").eq("title_auto", true).limit(50);
      const ergebnisse = [];
      for (const v of offene ?? []) ergebnisse.push(await umbenennen(v.id));
      return json({ ergebnisse });
    }

    return json({ error: "caseId oder alle erforderlich" }, 400);
  } catch (err: any) {
    console.error("case-short-title:", err);
    return json({ error: err?.message || "Fehler" }, 500);
  }
});
