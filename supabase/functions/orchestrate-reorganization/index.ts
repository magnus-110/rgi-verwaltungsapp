import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface OrchestrationRequest {
  jobId: string;
}

// Update job status
async function updateJobStatus(
  supabase: any,
  jobId: string,
  status: string,
  progress: number,
  phase: string,
  agentName?: string
) {
  await supabase
    .from("reorganization_jobs")
    .update({
      status,
      progress,
      current_phase: phase,
      current_agent_name: agentName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId }: OrchestrationRequest = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from("reorganization_jobs")
      .select("*, source_document:building_documents!source_document_id(id, file_path, file_name)")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get agents to use (from preset or selected_agent_ids)
    let agentIds: string[] = job.selected_agent_ids || [];
    
    if (agentIds.length === 0 && job.preset_id) {
      const { data: preset } = await supabase
        .from("agent_presets")
        .select("agent_ids")
        .eq("id", job.preset_id)
        .single();
      
      if (preset) {
        agentIds = preset.agent_ids;
      }
    }

    // If still no agents, get all active agents
    if (agentIds.length === 0) {
      const { data: activeAgents } = await supabase
        .from("reorganization_agents")
        .select("id")
        .eq("is_active", true)
        .order("sort_order");
      
      agentIds = activeAgents?.map(a => a.id) || [];
    }

    if (agentIds.length === 0) {
      await updateJobStatus(supabase, jobId, "error", 0, "Keine Agenten konfiguriert");
      return new Response(
        JSON.stringify({ error: "No agents configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent details
    const { data: agents } = await supabase
      .from("reorganization_agents")
      .select("id, name, sort_order")
      .in("id", agentIds)
      .order("sort_order");

    if (!agents || agents.length === 0) {
      await updateJobStatus(supabase, jobId, "error", 0, "Agenten nicht gefunden");
      return new Response(
        JSON.stringify({ error: "Agents not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting reorganization with ${agents.length} agents...`);

    // Check if page index exists
    const { count: indexCount } = await supabase
      .from("document_page_index")
      .select("*", { count: "exact", head: true })
      .eq("document_id", job.source_document_id);

    if (!indexCount || indexCount === 0) {
      // Need to create index first
      await updateJobStatus(supabase, jobId, "indexing", 5, "Seiten werden indexiert...");
      
      // Trigger indexing
      const indexResponse = await fetch(`${SUPABASE_URL}/functions/v1/classify-document-pages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId: job.source_document_id }),
      });

      if (!indexResponse.ok) {
        const error = await indexResponse.text();
        throw new Error(`Indexing failed: ${error}`);
      }

      // Wait for indexing to complete (poll)
      let attempts = 0;
      let indexed = false;
      while (attempts < 60 && !indexed) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
        
        const { count } = await supabase
          .from("document_page_index")
          .select("*", { count: "exact", head: true })
          .eq("document_id", job.source_document_id);
        
        if (count && count > 0) {
          indexed = true;
          await updateJobStatus(supabase, jobId, "searching", 20, `${count} Seiten indexiert`);
        }
        
        attempts++;
        await updateJobStatus(supabase, jobId, "indexing", 5 + attempts, `Indexierung läuft...`);
      }

      if (!indexed) {
        throw new Error("Indexing timeout");
      }
    }

    // Update status to searching
    await updateJobStatus(supabase, jobId, "searching", 25, "Agenten durchsuchen Dokument...");

    // Create search result placeholders
    const searchRecords = agents.map(agent => ({
      job_id: jobId,
      agent_id: agent.id,
      status: "pending",
    }));

    await supabase
      .from("agent_search_results")
      .upsert(searchRecords, { onConflict: "job_id,agent_id" });

    // Launch all agent searches in parallel (max 5 concurrent)
    const CONCURRENT_LIMIT = 5;
    const results: any[] = [];
    
    for (let i = 0; i < agents.length; i += CONCURRENT_LIMIT) {
      const batch = agents.slice(i, i + CONCURRENT_LIMIT);
      
      await updateJobStatus(
        supabase, 
        jobId, 
        "searching", 
        25 + Math.floor((i / agents.length) * 50),
        `Agent ${i + 1}/${agents.length}`,
        batch[0]?.name
      );

      const batchPromises = batch.map(agent =>
        fetch(`${SUPABASE_URL}/functions/v1/run-agent-search`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobId,
            agentId: agent.id,
            documentId: job.source_document_id,
          }),
        }).then(async r => {
          const data = await r.json();
          return { agentId: agent.id, agentName: agent.name, ...data };
        }).catch(err => {
          console.error(`Agent ${agent.name} failed:`, err);
          return { agentId: agent.id, agentName: agent.name, error: err.message };
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Collect and merge results
    const pageMappings: Record<string, number[]> = {};
    const allAssignedPages = new Set<number>();

    for (const result of results) {
      if (result.pages && result.pages.length > 0) {
        pageMappings[result.agentId] = result.pages;
        result.pages.forEach((p: number) => allAssignedPages.add(p));
      }
    }

    // Find unassigned pages
    const { data: allPages } = await supabase
      .from("document_page_index")
      .select("page_number")
      .eq("document_id", job.source_document_id);

    const unassignedPages = (allPages || [])
      .map(p => p.page_number)
      .filter(p => !allAssignedPages.has(p))
      .sort((a, b) => a - b);

    // Update job with results - pause for user review
    await supabase
      .from("reorganization_jobs")
      .update({
        status: "awaiting_review",
        progress: 85,
        current_phase: "Warte auf Überprüfung",
        page_mappings: pageMappings,
        unassigned_pages: unassignedPages,
        total_pages: allPages?.length || 0,
        awaiting_review: true,
        validation_report: {
          totalPages: allPages?.length || 0,
          assignedPages: allAssignedPages.size,
          unassignedPages: unassignedPages.length,
          agentsUsed: agents.length,
          categoriesFound: Object.keys(pageMappings).length,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`Reorganization complete: ${allAssignedPages.size} pages assigned, ${unassignedPages.length} unassigned`);

    return new Response(
      JSON.stringify({
        success: true,
        totalPages: allPages?.length || 0,
        assignedPages: allAssignedPages.size,
        unassignedPages: unassignedPages.length,
        pageMappings,
        agentResults: results.map(r => ({
          agentName: r.agentName,
          pagesFound: r.pages?.length || 0,
          error: r.error,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Orchestration error:", error);

    // Update job as failed
    try {
      const { jobId } = await req.clone().json();
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("reorganization_jobs")
        .update({
          status: "error",
          error_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    } catch (e) {
      // Ignore
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
