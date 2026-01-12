import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Threshold: Documents with more pages use batch processing
const BATCH_THRESHOLD_PAGES = 50;

interface ProcessDocumentRequest {
  documentId: string;
  filePath: string;
  buildingId: string | null;
  category: 'building' | 'general';
}

// Helper to update progress in database
async function updateProgress(supabase: any, documentId: string, progress: number, step: string, phase?: string) {
  const updateData: any = { 
    processing_progress: progress, 
    processing_step: step 
  };
  if (phase) updateData.processing_phase = phase;
  
  await supabase
    .from('building_documents')
    .update(updateData)
    .eq('id', documentId);
  console.log(`Progress: ${progress}% - ${step}`);
}

// Count pages in PDF by checking for page markers in structure
function countPdfPages(pdfBytes: Uint8Array): number {
  const pdfContent = new TextDecoder('latin1').decode(pdfBytes);
  
  // Method 1: Count /Page objects (most reliable)
  const pageMatches = pdfContent.match(/\/Type\s*\/Page[^s]/g) || [];
  if (pageMatches.length > 0) {
    console.log(`Detected ${pageMatches.length} pages via /Page objects`);
    return pageMatches.length;
  }
  
  // Method 2: Look for /Count in page tree
  const countMatch = pdfContent.match(/\/Count\s+(\d+)/);
  if (countMatch) {
    const count = parseInt(countMatch[1]);
    console.log(`Detected ${count} pages via /Count`);
    return count;
  }
  
  // Fallback: estimate based on size (roughly 50KB per page for scans)
  const estimatedPages = Math.max(1, Math.ceil(pdfBytes.length / 50000));
  console.log(`Estimated ${estimatedPages} pages based on file size`);
  return estimatedPages;
}

// OCR with Mistral (full document for small files)
async function extractTextWithMistralOCR(pdfBase64: string): Promise<{ text: string; pageCount: number }> {
  console.log('Starting Mistral OCR extraction...');
  
  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${pdfBase64}`
      },
      include_image_base64: false
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral OCR error:', errorText);
    throw new Error(`Mistral OCR failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('Mistral OCR response received');
  
  let fullText = '';
  let pageCount = 0;
  
  if (data.pages) {
    for (const page of data.pages) {
      fullText += `\n\n--- Seite ${page.index + 1} ---\n\n`;
      fullText += page.markdown || '';
      pageCount++;
    }
  } else if (data.text) {
    fullText = data.text;
    pageCount = 1;
  }
  
  return { text: fullText, pageCount };
}

// Semantic chunking - fast, rule-based, but preserves context
function createSemanticChunks(text: string, documentName: string): Array<{ content: string; metadata: any }> {
  const chunks: Array<{ content: string; metadata: any }> = [];
  
  const pagePattern = /\n\n--- Seite (\d+) ---\n\n/g;
  const pageSplits = text.split(pagePattern);
  
  let currentPage = 1;
  let buffer = '';
  let bufferStartPage = 1;
  
  const TARGET_SIZE = 1000;
  const MIN_SIZE = 400;
  const MAX_SIZE = 1800;
  
  for (let i = 0; i < pageSplits.length; i++) {
    const segment = pageSplits[i];
    
    if (/^\d+$/.test(segment.trim())) {
      currentPage = parseInt(segment.trim());
      continue;
    }
    
    const paragraphs = segment.split(/\n\n+/).filter(p => p.trim().length > 20);
    
    for (const para of paragraphs) {
      if (buffer.length + para.length < MAX_SIZE) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        if (buffer.length >= MIN_SIZE) {
          chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
          
          const words = buffer.split(/\s+/);
          const overlapWords = words.slice(-Math.min(20, Math.floor(words.length * 0.1)));
          buffer = overlapWords.join(' ') + '\n\n' + para;
          bufferStartPage = currentPage;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }
        
        if (para.length > MAX_SIZE) {
          const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
          let sentenceBuffer = '';
          
          for (const sentence of sentences) {
            if (sentenceBuffer.length + sentence.length > TARGET_SIZE && sentenceBuffer.length >= MIN_SIZE) {
              chunks.push(createChunkWithMetadata(sentenceBuffer, currentPage, currentPage, documentName));
              sentenceBuffer = sentence;
            } else {
              sentenceBuffer += sentence;
            }
          }
          
          if (sentenceBuffer.length >= MIN_SIZE) {
            chunks.push(createChunkWithMetadata(sentenceBuffer, currentPage, currentPage, documentName));
          }
          buffer = '';
          bufferStartPage = currentPage;
        }
      }
    }
  }
  
  if (buffer.trim().length >= MIN_SIZE) {
    chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
  } else if (buffer.trim().length > 50 && chunks.length > 0) {
    chunks[chunks.length - 1].content += '\n\n' + buffer.trim();
  } else if (buffer.trim().length > 50) {
    chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
  }
  
  console.log(`Created ${chunks.length} semantic chunks`);
  return chunks;
}

function createChunkWithMetadata(
  content: string, 
  startPage: number, 
  endPage: number,
  documentName: string
): { content: string; metadata: any } {
  const contentLower = content.toLowerCase();
  let category = 'allgemein';
  
  if (/eigentümer|miteigentum|wohneinheit|sondereigentum/.test(contentLower)) {
    category = 'eigentuemer';
  } else if (/verwalter|hausverwaltung|verwaltung/.test(contentLower)) {
    category = 'verwalter';
  } else if (/protokoll|beschluss|versammlung|abstimmung/.test(contentLower)) {
    category = 'protokoll';
  } else if (/kosten|zahlung|wirtschaftsplan|hausgeld|rücklage/.test(contentLower)) {
    category = 'finanzen';
  } else if (/heizung|wartung|reparatur|instandhaltung|sanierung/.test(contentLower)) {
    category = 'technik';
  } else if (/gesetz|paragraph|§|recht|urteil|bgh|vertrag/.test(contentLower)) {
    category = 'rechtlich';
  }
  
  const firstLine = content.split('\n')[0].trim().slice(0, 100);
  
  // Temporal metadata extraction
  const datePatterns = {
    documentDate: /(?:vom|stand|datum)[:\s]*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    validUntil: /(?:gültig bis|ablauf(?:datum)?|läuft ab)[:\s]*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    validFrom: /(?:gültig ab|wirksam ab|ab dem)[:\s]*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    decisionDate: /beschluss(?:fassung)?\s*(?:vom|:)\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    effectiveDate: /ab\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})\s*(?:beträgt|erhöht|ändert)/i,
  };
  
  const extractedDates: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(datePatterns)) {
    const match = content.match(pattern);
    if (match) extractedDates[key] = match[1];
  }
  
  // Technical features for cross-building search
  const features: string[] = [];
  if (/gas(?:heizung|therme|kessel|anschluss)/i.test(content)) features.push('gas_heating');
  if (/öl(?:heizung|tank|kessel)/i.test(content)) features.push('oil_heating');
  if (/wärmepumpe/i.test(content)) features.push('heat_pump');
  if (/fernwärme/i.test(content)) features.push('district_heating');
  if (/photovoltaik|solar|pv-anlage/i.test(content)) features.push('solar');
  if (/aufzug|fahrstuhl|lift/i.test(content)) features.push('elevator');
  if (/tiefgarage|stellplatz/i.test(content)) features.push('parking');
  
  return {
    content: content.trim(),
    metadata: {
      page_start: startPage,
      page_end: endPage,
      pages: startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`,
      category,
      document: documentName,
      summary: firstLine.length > 10 ? firstLine : null,
      dates: Object.keys(extractedDates).length > 0 ? extractedDates : null,
      features: features.length > 0 ? features : null,
    }
  };
}

// Generate embeddings with Mistral Embed
async function generateEmbeddings(texts: string[], supabase: any, documentId: string): Promise<number[][]> {
  console.log(`Generating embeddings for ${texts.length} chunks...`);
  
  const batchSize = 10;
  const allEmbeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const progressPercent = Math.round(60 + (i / texts.length) * 25);
    await updateProgress(
      supabase, 
      documentId, 
      progressPercent, 
      `Embeddings: ${Math.min(i + batchSize, texts.length)} von ${texts.length}`
    );
    
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: batch,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mistral embedding error:', errorText);
      throw new Error(`Mistral embedding failed: ${errorText}`);
    }

    const data = await response.json();
    const embeddings = data.data.map((item: any) => item.embedding);
    allEmbeddings.push(...embeddings);
  }
  
  return allEmbeddings;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | undefined;
  let supabase: any;

  try {
    const body = await req.json() as ProcessDocumentRequest;
    documentId = body.documentId;
    const { filePath, buildingId, category } = body;
    
    console.log(`Processing document: ${documentId}, path: ${filePath}, category: ${category}`);

    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }

    supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Update status to processing
    await supabase
      .from('building_documents')
      .update({ 
        status: 'processing',
        processing_progress: 5,
        processing_step: 'Dokument wird analysiert...',
        processing_phase: 'pending'
      })
      .eq('id', documentId);

    // Download PDF
    await updateProgress(supabase, documentId, 10, 'PDF wird heruntergeladen...');
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('building-documents')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    
    // Count pages to decide processing strategy
    const pageCount = countPdfPages(pdfBytes);
    console.log(`Document has ${pageCount} pages`);

    // Store page count for progress tracking
    await supabase
      .from('building_documents')
      .update({ total_pages: pageCount })
      .eq('id', documentId);

    // Decision: Use batch processing for large documents
    if (pageCount > BATCH_THRESHOLD_PAGES) {
      console.log(`Large document detected (${pageCount} pages), using batch processing`);
      
      await supabase
        .from('building_documents')
        .update({ 
          processing_phase: 'ocr',
          processed_pages: 0,
          processing_batch: 0
        })
        .eq('id', documentId);

      await updateProgress(supabase, documentId, 8, `Großes Dokument (${pageCount} Seiten) - Batch-Verarbeitung`, 'ocr');

      // Trigger continue-processing for batch processing
      const continueUrl = `${SUPABASE_URL}/functions/v1/continue-processing`;
      EdgeRuntime.waitUntil(
        fetch(continueUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ documentId }),
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          documentId,
          message: 'Batch processing started',
          pageCount,
          batchProcessing: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Small document: Process directly
    console.log(`Small document (${pageCount} pages), processing directly`);
    
    const base64 = btoa(
      pdfBytes.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // OCR
    await updateProgress(supabase, documentId, 20, 'Texterkennung läuft...', 'ocr');
    const extraction = await extractTextWithMistralOCR(base64);
    
    console.log(`Extracted ${extraction.text.length} characters`);

    if (!extraction.text || extraction.text.length < 100) {
      throw new Error('Insufficient text extracted from document');
    }

    await updateProgress(supabase, documentId, 45, 'Text extrahiert', 'chunking');

    // Chunking
    await updateProgress(supabase, documentId, 50, 'Dokument wird strukturiert...', 'chunking');
    const documentName = filePath.split('/').pop() || 'document';
    const chunks = createSemanticChunks(extraction.text, documentName);
    
    if (chunks.length === 0) {
      throw new Error('No chunks created from document');
    }

    await updateProgress(supabase, documentId, 55, `${chunks.length} Abschnitte erstellt`, 'embedding');

    // Embeddings
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkTexts, supabase, documentId);

    await updateProgress(supabase, documentId, 88, 'Daten werden gespeichert...', 'saving');

    // Delete old documents for this building
    if (buildingId) {
      const { data: existingDocs } = await supabase
        .from('building_documents')
        .select('id')
        .eq('building_id', buildingId)
        .neq('id', documentId);

      if (existingDocs && existingDocs.length > 0) {
        const oldDocIds = existingDocs.map((d: any) => d.id);
        await supabase
          .from('document_chunks')
          .delete()
          .in('document_id', oldDocIds);
        await supabase
          .from('building_documents')
          .delete()
          .in('id', oldDocIds);
        console.log(`Deleted ${oldDocIds.length} old documents for building ${buildingId}`);
      }
    }

    // Insert chunks
    const chunkRecords = chunks.map((chunk, index) => ({
      document_id: documentId,
      building_id: buildingId,
      category: category,
      chunk_index: index,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: `[${embeddings[index].join(',')}]`,
    }));

    const { error: insertError } = await supabase
      .from('document_chunks')
      .insert(chunkRecords);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    // Mark complete
    await supabase
      .from('building_documents')
      .update({
        status: 'ready',
        page_count: extraction.pageCount,
        processed_at: new Date().toISOString(),
        processing_progress: 100,
        processing_step: 'Fertig',
        processing_phase: 'complete'
      })
      .eq('id', documentId);

    console.log(`Document ${documentId} processed: ${chunks.length} chunks`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksCreated: chunks.length,
        pageCount: extraction.pageCount,
        batchProcessing: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing document:', error);
    
    if (documentId && supabase) {
      try {
        await supabase
          .from('building_documents')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            processing_progress: 0,
            processing_step: 'Fehler bei der Verarbeitung'
          })
          .eq('id', documentId);
      } catch (e) {
        console.error('Failed to update error status:', e);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
