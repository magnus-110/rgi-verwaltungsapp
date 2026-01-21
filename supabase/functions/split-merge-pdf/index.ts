import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PageMapping {
  agentId: string;
  agentName: string;
  pages: number[];
  filenamePattern: string;
}

interface SplitRequest {
  jobId: string;
  documentId: string;
  buildingId?: string;
  pageMappings: PageMapping[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { jobId, documentId, buildingId, pageMappings } = await req.json() as SplitRequest;

    console.log(`Starting PDF split for job ${jobId}, document ${documentId}`);
    console.log(`Processing ${pageMappings.length} categories`);

    // Update job status
    await supabase
      .from("reorganization_jobs")
      .update({ 
        status: "splitting", 
        current_phase: "PDF-Erstellung",
        progress: 80 
      })
      .eq("id", jobId);

    // Get the source document
    const { data: doc, error: docError } = await supabase
      .from("building_documents")
      .select("file_path, file_name, building_id")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Download the original PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("building-documents")
      .download(doc.file_path);

    if (downloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message}`);
    }

    const pdfBytes = await pdfData.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const totalPages = sourcePdf.getPageCount();

    console.log(`Source PDF has ${totalPages} pages`);

    // Get building info for filename
    let buildingCode = "UNKNOWN";
    let buildingName = "";
    if (buildingId || doc.building_id) {
      const { data: building } = await supabase
        .from("buildings")
        .select("building_code, name")
        .eq("id", buildingId || doc.building_id)
        .single();
      
      if (building) {
        buildingCode = building.building_code;
        buildingName = building.name;
      }
    }

    const currentYear = new Date().getFullYear().toString();
    const createdDocuments: string[] = [];

    // Process each category
    for (let i = 0; i < pageMappings.length; i++) {
      const mapping = pageMappings[i];
      
      if (!mapping.pages || mapping.pages.length === 0) {
        console.log(`Skipping ${mapping.agentName}: no pages`);
        continue;
      }

      console.log(`Creating PDF for ${mapping.agentName}: ${mapping.pages.length} pages`);

      // Create new PDF with selected pages
      const newPdf = await PDFDocument.create();
      
      // Sort pages and copy them
      const sortedPages = [...mapping.pages].sort((a, b) => a - b);
      
      for (const pageNum of sortedPages) {
        // PDF pages are 0-indexed, but our page numbers are 1-indexed
        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < totalPages) {
          const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
          newPdf.addPage(copiedPage);
        }
      }

      // Generate filename from pattern
      const filename = mapping.filenamePattern
        .replace("{category}", mapping.agentName.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_"))
        .replace("{building}", buildingCode)
        .replace("{building_name}", buildingName.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_"))
        .replace("{year}", currentYear)
        .replace("{date}", new Date().toISOString().split("T")[0])
        + ".pdf";

      // Save the new PDF
      const newPdfBytes = await newPdf.save();
      const filePath = `${buildingId || doc.building_id || "general"}/${jobId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from("reorganized-documents")
        .upload(filePath, newPdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Failed to upload ${filename}:`, uploadError);
        continue;
      }

      // Create database entry
      const { data: reorgDoc, error: insertError } = await supabase
        .from("reorganized_documents")
        .insert({
          job_id: jobId,
          source_document_id: documentId,
          agent_id: mapping.agentId,
          building_id: buildingId || doc.building_id,
          file_name: filename,
          file_path: filePath,
          page_count: sortedPages.length,
          source_pages: sortedPages,
          source_page_ranges: formatPageRanges(sortedPages),
          category_label: mapping.agentName,
          file_size: newPdfBytes.byteLength,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`Failed to create DB entry for ${filename}:`, insertError);
      } else {
        createdDocuments.push(reorgDoc.id);
      }

      // Update progress
      const progress = 80 + Math.round((i / pageMappings.length) * 20);
      await supabase
        .from("reorganization_jobs")
        .update({ 
          progress,
          current_agent_name: mapping.agentName,
        })
        .eq("id", jobId);
    }

    // Mark job as completed
    await supabase
      .from("reorganization_jobs")
      .update({ 
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        current_phase: null,
        current_agent_name: null,
      })
      .eq("id", jobId);

    console.log(`Job ${jobId} completed. Created ${createdDocuments.length} documents.`);

    return new Response(
      JSON.stringify({
        success: true,
        documentCount: createdDocuments.length,
        documentIds: createdDocuments,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Split/merge error:", error);

    // Try to update job status
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      
      const body = await req.clone().json();
      if (body.jobId) {
        await supabase
          .from("reorganization_jobs")
          .update({ 
            status: "failed",
            error_message: error.message,
          })
          .eq("id", body.jobId);
      }
    } catch (e) {
      console.error("Failed to update job status:", e);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper to format page numbers as ranges
function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";
  
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      if (i < sorted.length) {
        start = sorted[i];
        end = sorted[i];
      }
    }
  }

  return ranges.join(", ");
}
