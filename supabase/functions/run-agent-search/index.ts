import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHUNK_SIZE = 150; // Pages per chunk for context window management

interface SearchRequest {
  jobId: string;
  agentId: string;
  documentId: string;
}

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  search_keywords: string[];
  example_content: string | null;
}

interface PageIndex {
  page_number: number;
  page_summary: string;
  detected_type: string;
  keywords: string[];
}

// Search pages with a specialized agent using Mistral Large
async function searchWithAgent(
  agent: Agent,
  pageIndex: PageIndex[],
  chunkNumber: number,
  totalChunks: number
): Promise<{ pages: number[]; confidences: Record<number, number> }> {
  console.log(`Agent "${agent.name}" searching chunk ${chunkNumber}/${totalChunks}...`);

  // Format page index for prompt
  const indexContext = pageIndex.map(p => 
    `Seite ${p.page_number}: [${p.detected_type}] ${p.page_summary} | Keywords: ${p.keywords.join(", ")}`
  ).join("\n");

  const systemPrompt = `${agent.system_prompt}

Du durchsuchst einen Seiten-Index und findest ALLE relevanten Seiten für deine Kategorie.
Dies ist Chunk ${chunkNumber} von ${totalChunks} - analysiere gründlich!

WICHTIG: 
- Gib NUR Seitenzahlen zurück, die WIRKLICH zu deiner Kategorie gehören
- Bewerte jede Seite mit einer Konfidenz von 0.0 bis 1.0
- Lieber weniger Seiten mit hoher Konfidenz als viele mit niedriger`;

  const userPrompt = `Suchbegriffe: ${agent.search_keywords.join(", ")}
${agent.example_content ? `\nBeispielinhalt: ${agent.example_content}` : ""}

SEITEN-INDEX (Chunk ${chunkNumber}/${totalChunks}):
${indexContext}

Finde ALLE Seiten die zu "${agent.name}" gehören.

Antworte NUR mit JSON im Format:
{"pages": [1, 5, 12], "confidences": {"1": 0.95, "5": 0.87, "12": 0.92}}`;

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mistral search error:", errorText);
    throw new Error(`Agent search failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      pages: parsed.pages || [],
      confidences: parsed.confidences || {},
    };
  } catch (e) {
    console.error("Failed to parse agent response:", content);
    return { pages: [], confidences: {} };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { jobId, agentId, documentId }: SearchRequest = await req.json();

    if (!jobId || !agentId || !documentId) {
      return new Response(
        JSON.stringify({ error: "jobId, agentId, and documentId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mark search as processing
    await supabase
      .from("agent_search_results")
      .upsert({
        job_id: jobId,
        agent_id: agentId,
        status: "processing",
      }, { onConflict: "job_id,agent_id" });

    // Fetch agent configuration
    const { data: agent, error: agentError } = await supabase
      .from("reorganization_agents")
      .select("id, name, system_prompt, search_keywords, example_content")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      throw new Error("Agent not found");
    }

    // Fetch page index for document
    const { data: pageIndex, error: indexError } = await supabase
      .from("document_page_index")
      .select("page_number, page_summary, detected_type, keywords")
      .eq("document_id", documentId)
      .order("page_number");

    if (indexError || !pageIndex || pageIndex.length === 0) {
      throw new Error("No page index found for document");
    }

    console.log(`Agent "${agent.name}" searching ${pageIndex.length} pages...`);

    // Split into chunks for context window management
    const chunks: PageIndex[][] = [];
    for (let i = 0; i < pageIndex.length; i += CHUNK_SIZE) {
      chunks.push(pageIndex.slice(i, i + CHUNK_SIZE));
    }

    // Process all chunks and collect results
    const allPages: number[] = [];
    const allConfidences: Record<number, number> = {};
    const chunkResults: Record<string, any> = {};

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await searchWithAgent(agent, chunk, i + 1, chunks.length);
      
      // Merge results
      allPages.push(...result.pages);
      Object.assign(allConfidences, result.confidences);
      chunkResults[`chunk_${i + 1}`] = {
        pagesSearched: chunk.length,
        pagesFound: result.pages.length,
        pages: result.pages,
      };
    }

    // Deduplicate pages
    const uniquePages = [...new Set(allPages)].sort((a, b) => a - b);

    const processingTime = Date.now() - startTime;

    // Save results
    const { error: saveError } = await supabase
      .from("agent_search_results")
      .update({
        found_pages: uniquePages,
        confidence_scores: allConfidences,
        chunk_results: chunkResults,
        status: "complete",
        processing_time_ms: processingTime,
      })
      .eq("job_id", jobId)
      .eq("agent_id", agentId);

    if (saveError) {
      console.error("Failed to save search results:", saveError);
    }

    console.log(`Agent "${agent.name}" found ${uniquePages.length} pages in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        agentName: agent.name,
        pagesFound: uniquePages.length,
        pages: uniquePages,
        confidences: allConfidences,
        processingTimeMs: processingTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Agent search error:", error);

    // Try to mark as error in database
    try {
      const { jobId, agentId } = await req.clone().json();
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("agent_search_results")
        .update({
          status: "error",
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("job_id", jobId)
        .eq("agent_id", agentId);
    } catch (e) {
      // Ignore
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
