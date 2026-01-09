import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Batch size for OCR processing (pages per batch)
const OCR_BATCH_SIZE = 30;
// Batch size for embedding generation
const EMBEDDING_BATCH_SIZE = 10;

interface ContinueRequest {
  documentId: string;
}

// Helper to update progress in database
async function updateProgress(
  supabase: any, 
  documentId: string, 
  progress: number, 
  step: string,
  phase?: string,
  processedPages?: number,
  extractedText?: string
) {
  const updateData: any = { 
    processing_progress: progress, 
    processing_step: step 
  };
  
  if (phase) updateData.processing_phase = phase;
  if (processedPages !== undefined) updateData.processed_pages = processedPages;
  if (extractedText !== undefined) updateData.extracted_text = extractedText;
  
  await supabase
    .from('building_documents')
    .update(updateData)
    .eq('id', documentId);
  
  console.log(`Progress: ${progress}% - ${step} (phase: ${phase || 'unknown'})`);
}

// OCR a specific page range with Mistral
async function extractPagesWithOCR(
  pdfBase64: string, 
  startPage: number, 
  endPage: number
): Promise<{ text: string; pageCount: number }> {
  console.log(`OCR for pages ${startPage}-${endPage}...`);
  
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
      include_image_base64: false,
      pages: Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral OCR error:', errorText);
    throw new Error(`Mistral OCR failed: ${errorText}`);
  }

  const data = await response.json();
  
  let fullText = '';
  let pageCount = 0;
  
  if (data.pages) {
    for (const page of data.pages) {
      fullText += `\n\n--- Seite ${page.index + 1} ---\n\n`;
      fullText += page.markdown || '';
      pageCount++;
    }
  }
  
  return { text: fullText, pageCount };
}

// Semantic chunking - rule-based but quality-focused
function createSemanticChunks(text: string, documentName: string): Array<{ content: string; metadata: any }> {
  const chunks: Array<{ content: string; metadata: any }> = [];
  
  // Split by pages first
  const pagePattern = /\n\n--- Seite (\d+) ---\n\n/g;
  const pageSplits = text.split(pagePattern);
  
  let currentPage = 1;
  let buffer = '';
  let bufferStartPage = 1;
  
  const TARGET_SIZE = 1000;
  const MIN_SIZE = 400;
  const MAX_SIZE = 1800;
  const OVERLAP = 100;
  
  for (let i = 0; i < pageSplits.length; i++) {
    const segment = pageSplits[i];
    
    // Check if this segment is a page number
    if (/^\d+$/.test(segment.trim())) {
      currentPage = parseInt(segment.trim());
      continue;
    }
    
    // Split segment into paragraphs
    const paragraphs = segment.split(/\n\n+/).filter(p => p.trim().length > 20);
    
    for (const para of paragraphs) {
      if (buffer.length + para.length < MAX_SIZE) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        // Flush buffer if it has enough content
        if (buffer.length >= MIN_SIZE) {
          chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
          
          // Keep overlap for context
          const words = buffer.split(/\s+/);
          const overlapWords = words.slice(-Math.min(20, Math.floor(words.length * 0.1)));
          buffer = overlapWords.join(' ') + '\n\n' + para;
          bufferStartPage = currentPage;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }
        
        // If paragraph itself is too large, split it
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
  
  // Don't forget remaining buffer
  if (buffer.trim().length >= MIN_SIZE) {
    chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
  } else if (buffer.trim().length > 50 && chunks.length > 0) {
    // Append small remainder to last chunk
    chunks[chunks.length - 1].content += '\n\n' + buffer.trim();
  } else if (buffer.trim().length > 50) {
    chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
  }
  
  console.log(`Created ${chunks.length} semantic chunks from text`);
  return chunks;
}

function createChunkWithMetadata(
  content: string, 
  startPage: number, 
  endPage: number,
  documentName: string
): { content: string; metadata: any } {
  // Detect category based on keywords
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
  
  // Extract first line as potential title/summary
  const firstLine = content.split('\n')[0].trim().slice(0, 100);
  
  return {
    content: content.trim(),
    metadata: {
      page_start: startPage,
      page_end: endPage,
      pages: startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`,
      category,
      document: documentName,
      summary: firstLine.length > 10 ? firstLine : null
    }
  };
}

// Generate embeddings in batches
async function generateEmbeddingsBatch(
  texts: string[], 
  startIndex: number
): Promise<number[][]> {
  console.log(`Generating embeddings for batch starting at ${startIndex}, size ${texts.length}...`);
  
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral embedding error:', errorText);
    throw new Error(`Mistral embedding failed: ${errorText}`);
  }

  const data = await response.json();
  return data.data.map((item: any) => item.embedding);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | undefined;
  let supabase: any;

  try {
    const body = await req.json() as ContinueRequest;
    documentId = body.documentId;
    
    console.log(`Continue processing document: ${documentId}`);

    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }

    supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get current document state
    const { data: doc, error: docError } = await supabase
      .from('building_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    const { 
      file_path: filePath, 
      building_id: buildingId, 
      category,
      total_pages: totalPages,
      processed_pages: processedPages,
      extracted_text: existingText,
      processing_phase: currentPhase,
      processing_batch: currentBatch,
      name: documentName
    } = doc;

    console.log(`Document state: phase=${currentPhase}, batch=${currentBatch}, processedPages=${processedPages}/${totalPages}`);

    // Download PDF if we need it for OCR
    let pdfBase64: string | null = null;
    
    if (currentPhase === 'ocr' || currentPhase === 'pending') {
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('building-documents')
        .download(filePath);

      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      pdfBase64 = btoa(
        pdfBytes.reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
    }

    // Phase: OCR
    if (currentPhase === 'ocr' || currentPhase === 'pending') {
      const startPage = processedPages || 0;
      const endPage = Math.min(startPage + OCR_BATCH_SIZE - 1, totalPages - 1);
      
      const progressPercent = Math.round(5 + (processedPages / totalPages) * 35);
      await updateProgress(
        supabase, 
        documentId, 
        progressPercent, 
        `OCR: Seite ${startPage + 1}-${endPage + 1} von ${totalPages}`,
        'ocr'
      );

      const result = await extractPagesWithOCR(pdfBase64!, startPage, endPage);
      const newText = (existingText || '') + result.text;
      const newProcessedPages = endPage + 1;

      // Check if OCR is complete
      if (newProcessedPages >= totalPages) {
        // OCR complete, move to chunking phase
        await updateProgress(
          supabase, 
          documentId, 
          45, 
          'Text vollständig extrahiert',
          'chunking',
          newProcessedPages,
          newText
        );
        
        // Continue to chunking in same request if time allows
        // For simplicity, we'll call continue-processing again
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
      } else {
        // More OCR batches needed
        await supabase
          .from('building_documents')
          .update({
            processed_pages: newProcessedPages,
            extracted_text: newText,
            processing_batch: currentBatch + 1
          })
          .eq('id', documentId);

        // Trigger next batch
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
      }

      return new Response(
        JSON.stringify({ success: true, phase: 'ocr', processedPages: endPage + 1, totalPages }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Phase: Chunking
    if (currentPhase === 'chunking') {
      await updateProgress(supabase, documentId, 50, 'Dokument wird strukturiert...', 'chunking');
      
      const chunks = createSemanticChunks(existingText || '', documentName || 'document');
      
      if (chunks.length === 0) {
        throw new Error('No chunks created from document');
      }

      // Store chunks in temporary storage (using metadata field)
      await supabase
        .from('building_documents')
        .update({
          processing_phase: 'embedding',
          processing_batch: 0,
          // Store chunk count for progress tracking
          processed_pages: 0 // Reuse for tracking embedding progress
        })
        .eq('id', documentId);

      // Store chunks temporarily - we'll process embeddings in batches
      // For now, generate all embeddings
      await updateProgress(supabase, documentId, 55, `${chunks.length} Abschnitte erstellt`, 'embedding');

      // Generate embeddings in batches
      const allEmbeddings: number[][] = [];
      const totalChunks = chunks.length;
      
      for (let i = 0; i < totalChunks; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchTexts = batch.map(c => c.content);
        
        const progressPercent = Math.round(55 + (i / totalChunks) * 30);
        await updateProgress(
          supabase, 
          documentId, 
          progressPercent, 
          `Embeddings: ${Math.min(i + EMBEDDING_BATCH_SIZE, totalChunks)} von ${totalChunks}`
        );
        
        const embeddings = await generateEmbeddingsBatch(batchTexts, i);
        allEmbeddings.push(...embeddings);
      }

      await updateProgress(supabase, documentId, 88, 'Daten werden gespeichert...', 'saving');

      // Delete old chunks for this building if exists
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

      // Insert all chunks
      const chunkRecords = chunks.map((chunk, index) => ({
        document_id: documentId,
        building_id: buildingId,
        category: category,
        chunk_index: index,
        content: chunk.content,
        metadata: chunk.metadata,
        embedding: `[${allEmbeddings[index].join(',')}]`,
      }));

      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(chunkRecords);

      if (insertError) {
        throw new Error(`Failed to insert chunks: ${insertError.message}`);
      }

      // Mark as complete
      await supabase
        .from('building_documents')
        .update({
          status: 'ready',
          page_count: totalPages,
          processed_at: new Date().toISOString(),
          processing_progress: 100,
          processing_step: 'Fertig',
          processing_phase: 'complete',
          extracted_text: null // Clear to save space
        })
        .eq('id', documentId);

      console.log(`Document ${documentId} processed successfully: ${chunks.length} chunks`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          phase: 'complete',
          chunksCreated: chunks.length,
          totalPages 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'No action needed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in continue-processing:', error);
    
    if (documentId && supabase) {
      try {
        await supabase
          .from('building_documents')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
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
