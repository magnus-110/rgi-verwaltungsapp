// Dokumentensuche fuer den Endnutzer-Chat (Eigentuemer- und Mieterportal).
//
// Sicherheitsprinzip: Diese Funktion benutzt bewusst NIEMALS den Service-Role-Key.
// Gesucht wird mit dem Token des fragenden Nutzers, sodass die RLS auf building_files
// entscheidet, welche Dokumentabschnitte er sehen darf. Mit Service-Role-Rechten
// wuerden auch interne Unterlagen und fremde Einzelabrechnungen in den Antwortkontext
// des Sprachmodells geraten.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_QUELLEN = 8;
const MAX_ZEICHEN_JE_QUELLE = 2000;
// Unterhalb dieser Cosinus-Aehnlichkeit ist ein Treffer erfahrungsgemaess Rauschen.
// Lieber keine Quelle als eine unpassende - der Chat soll dann ehrlich sagen,
// dass er nichts gefunden hat, statt aus einem beliebigen Dokument zu antworten.
const MIN_AEHNLICHKEIT = 0.4;

async function embedFrage(text: string, apiKey: string): Promise<number[]> {
  let letzterFehler = "";
  for (let versuch = 1; versuch <= 3; versuch++) {
    const resp = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "mistral-embed", input: [text.slice(0, 8000)] }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const vektor = data?.data?.[0]?.embedding;
      if (Array.isArray(vektor)) return vektor;
      letzterFehler = "Antwort ohne Embedding";
    } else {
      letzterFehler = `${resp.status} ${(await resp.text()).slice(0, 200)}`;
      // Nur bei Rate-Limit und Serverfehlern erneut versuchen
      if (resp.status !== 429 && resp.status < 500) break;
    }
    await new Promise((r) => setTimeout(r, versuch * 600));
  }
  throw new Error(`Embedding fehlgeschlagen: ${letzterFehler}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const { question, buildingId, buildingIds, matchCount } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return json({ error: "question erforderlich" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const mistralKey = Deno.env.get("MISTRAL_API_KEY");
    if (!mistralKey) return json({ error: "MISTRAL_API_KEY fehlt" }, 500);

    // Client im Namen des Nutzers - traegt dessen Rechte in jede Abfrage.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const embedding = await embedFrage(question, mistralKey);

    // Ohne Gebaeudeangabe wird ueber alle Gebaeude gesucht, die der Nutzer sehen darf -
    // die RLS begrenzt das ohnehin auf seine eigenen.
    const gebaeude: (string | null)[] = [];
    if (Array.isArray(buildingIds) && buildingIds.length > 0) gebaeude.push(...buildingIds);
    else if (buildingId) gebaeude.push(buildingId);
    else gebaeude.push(null);

    const proGebaeude = Math.max(
      3,
      Math.ceil((Number(matchCount) || MAX_QUELLEN) / gebaeude.length),
    );

    const treffer: any[] = [];
    for (const bid of gebaeude) {
      const { data, error } = await userClient.rpc("search_document_chunks_for_user", {
        query_embedding: embedding,
        match_count: proGebaeude,
        filter_building_id: bid,
      });
      if (error) {
        console.error("search_document_chunks_for_user:", error.message);
        continue;
      }
      if (Array.isArray(data)) treffer.push(...data);
    }

    const quellen = treffer
      .filter((t) => (t.similarity ?? 0) >= MIN_AEHNLICHKEIT)
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, Number(matchCount) || MAX_QUELLEN)
      .map((t) => ({
        fileName: t.file_name || "Unbekanntes Dokument",
        folderPath: Array.isArray(t.category_path) ? t.category_path : [],
        pageNumber: t.page_start ?? null,
        pageEnd: t.page_end ?? null,
        similarity: Number((t.similarity ?? 0).toFixed(3)),
        content: (t.content || "").slice(0, MAX_ZEICHEN_JE_QUELLE),
      }));

    console.log(
      `[query-documents] Frage="${question.slice(0, 60)}" Gebaeude=${gebaeude.length} Treffer=${treffer.length} verwendet=${quellen.length}`,
    );

    return json({ sources: quellen, total: treffer.length });
  } catch (err: any) {
    console.error("query-documents error:", err);
    return json({ error: err?.message || "Unbekannter Fehler" }, 500);
  }
});
