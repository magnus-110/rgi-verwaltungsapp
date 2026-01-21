import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 20; // Pages per batch
const SIGNED_URL_EXPIRY = 3600; // 1 hour

interface ClassifyRequest {
  documentId: string;
  startPage?: number;
  forceReindex?: boolean;
}

interface PageClassification {
  pageNumber: number;
  summary: string;
  detectedType: string;
  keywords: string[];
  confidence: number;
}

// Update job progress in database
async function updateProgress(
  supabase: any,
  jobId: string,
  progress: number,
  phase: string,
  processedPages?: number
) {
  await supabase
    .from("reorganization_jobs")
    .update({
      progress,
      current_phase: phase,
      processed_pages: processedPages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

// Get or create signed URL for document
async function getSignedUrl(
  supabase: any,
  filePath: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("building-documents")
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
  return data.signedUrl;
}

// Extract text from specific pages using Mistral OCR
async function extractPagesWithOCR(
  signedUrl: string,
  startPage: number,
  endPage: number
): Promise<{ pages: Array<{ pageNumber: number; text: string }> }> {
  console.log(`Extracting pages ${startPage}-${endPage} with Mistral OCR...`);

  // Generate array of 0-indexed page numbers for Mistral API
  const pageIndices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i - 1 // Convert to 0-indexed
  );

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: signedUrl,
      },
      include_image_base64: false,
      pages: pageIndices,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mistral OCR error:", errorText);
    throw new Error(`Mistral OCR failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Parse OCR response into pages
  const pages: Array<{ pageNumber: number; text: string }> = [];
  
  if (data.pages && Array.isArray(data.pages)) {
    for (const page of data.pages) {
      pages.push({
        pageNumber: page.index + 1, // OCR uses 0-indexed pages
        text: page.markdown || page.text || "",
      });
    }
  }

  return { pages };
}

// Classify a batch of pages using Mistral Small
async function classifyPages(
  pages: Array<{ pageNumber: number; text: string }>
): Promise<PageClassification[]> {
  console.log(`Classifying ${pages.length} pages with Mistral Small...`);

  const pagesContext = pages.map(p => 
    `--- SEITE ${p.pageNumber} ---\n${p.text.slice(0, 2000)}`
  ).join("\n\n");

  const systemPrompt = `Du bist ein Experte für Dokumentenklassifizierung in der Immobilienverwaltung.
Analysiere jede Seite und erstelle eine strukturierte Klassifizierung.

Für jede Seite gib zurück:
- summary: 1-2 Sätze Zusammenfassung des Inhalts
- detectedType: Eine der folgenden Kategorien:
  teilungserklaerung, protokoll, wirtschaftsplan, jahresabrechnung, 
  wartungsvertrag, versicherung, hausordnung, beschluss, ruecklage,
  korrespondenz, rechtsstreit, eigentuemerliste, plan, energieausweis, sonstiges
- keywords: 3-5 relevante Schlüsselwörter
- confidence: Konfidenz 0.0-1.0

Antworte NUR mit einem JSON-Array, keine anderen Zeichen.`;

  const userPrompt = `Klassifiziere folgende Seiten:

${pagesContext}

Antworte mit einem JSON-Array im Format:
[{"pageNumber": 1, "summary": "...", "detectedType": "...", "keywords": ["..."], "confidence": 0.95}, ...]`;

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mistral classification error:", errorText);
    throw new Error(`Classification failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "[]";

  try {
    // Parse JSON - handle both array and object with array property
    let parsed = JSON.parse(content);
    if (parsed.pages) parsed = parsed.pages;
    if (parsed.classifications) parsed = parsed.classifications;
    if (!Array.isArray(parsed)) parsed = [parsed];
    
    return parsed.map((p: any) => ({
      pageNumber: p.pageNumber || p.page_number || p.page,
      summary: p.summary || "",
      detectedType: p.detectedType || p.detected_type || p.type || "sonstiges",
      keywords: p.keywords || [],
      confidence: p.confidence || 0.5,
    }));
  } catch (e) {
    console.error("Failed to parse classification response:", content);
    // Return basic classifications for pages
    return pages.map(p => ({
      pageNumber: p.pageNumber,
      summary: "Klassifizierung fehlgeschlagen",
      detectedType: "sonstiges",
      keywords: [],
      confidence: 0.1,
    }));
  }
}

// Save classifications to database
async function saveClassifications(
  supabase: any,
  documentId: string,
  classifications: PageClassification[],
  rawTexts: Map<number, string>
) {
  const records = classifications.map(c => ({
    document_id: documentId,
    page_number: c.pageNumber,
    page_summary: c.summary,
    detected_type: c.detectedType,
    keywords: c.keywords,
    confidence_score: c.confidence,
    raw_text: rawTexts.get(c.pageNumber)?.slice(0, 10000) || null,
  }));

  // Upsert to handle re-indexing
  const { error } = await supabase
    .from("document_page_index")
    .upsert(records, { 
      onConflict: "document_id,page_number",
      ignoreDuplicates: false 
    });

  if (error) {
    console.error("Failed to save classifications:", error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, startPage = 1, forceReindex = false }: ClassifyRequest = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "documentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch document details
    const { data: document, error: docError } = await supabase
      .from("building_documents")
      .select("id, file_path, file_name, total_pages, status")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already indexed (unless force reindex)
    if (!forceReindex) {
      const { count } = await supabase
        .from("document_page_index")
        .select("*", { count: "exact", head: true })
        .eq("document_id", documentId);

      if (count && count > 0 && count >= (document.total_pages || 0)) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Document already indexed",
            totalPages: count 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get signed URL
    const signedUrl = await getSignedUrl(supabase, document.file_path);

    // Estimate total pages if not known
    const totalPages = document.total_pages || 100; // Default estimate
    const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);

    console.log(`Processing pages ${startPage}-${endPage} of ~${totalPages}`);

    // Extract text from pages
    const { pages } = await extractPagesWithOCR(signedUrl, startPage, endPage);

    if (pages.length === 0) {
      // No more pages - we're done
      return new Response(
        JSON.stringify({ 
          success: true, 
          complete: true,
          totalPages: startPage - 1 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create raw text map for storage
    const rawTexts = new Map<number, string>();
    pages.forEach(p => rawTexts.set(p.pageNumber, p.text));

    // Classify pages
    const classifications = await classifyPages(pages);

    // Save to database
    await saveClassifications(supabase, documentId, classifications, rawTexts);

    // Check if more pages to process
    const hasMorePages = endPage < totalPages;
    const nextStartPage = endPage + 1;

    // If more pages, trigger next batch
    if (hasMorePages) {
      // Schedule next batch (fire and forget)
      const nextBatchUrl = `${SUPABASE_URL}/functions/v1/classify-document-pages`;
      fetch(nextBatchUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          startPage: nextStartPage,
          forceReindex,
        }),
      }).catch(err => console.error("Failed to trigger next batch:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        complete: !hasMorePages,
        processedPages: pages.length,
        totalProcessed: endPage,
        nextStartPage: hasMorePages ? nextStartPage : null,
        classifications: classifications.map(c => ({
          page: c.pageNumber,
          type: c.detectedType,
          confidence: c.confidence,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Classification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
