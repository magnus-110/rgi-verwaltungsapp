// @ts-ignore - EdgeRuntime is a Supabase Edge Functions global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
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
// Signed URL validity: 24 hours
const SIGNED_URL_EXPIRY = 86400;

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

// Check and refresh signed URL if needed
async function ensureValidSignedUrl(
  supabase: any,
  documentId: string,
  filePath: string,
  existingUrl: string | null,
  expiresAt: string | null
): Promise<string> {
  // Check if existing URL is still valid (with 1 hour buffer)
  if (existingUrl && expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    const bufferTime = 60 * 60 * 1000; // 1 hour buffer
    
    if (Date.now() + bufferTime < expiryTime) {
      console.log('Using existing signed URL');
      return existingUrl;
    }
  }
  
  console.log('Creating new signed URL');
  
  const { data: signedUrlData, error: signedUrlError } = await supabase
    .storage
    .from('building-documents')
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`);
  }

  const newExpiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString();
  
  // Store new signed URL
  await supabase
    .from('building_documents')
    .update({
      signed_url: signedUrlData.signedUrl,
      signed_url_expires_at: newExpiresAt
    })
    .eq('id', documentId);

  return signedUrlData.signedUrl;
}

// OCR a specific page range with Mistral using signed URL
async function extractPagesWithOCR(
  signedUrl: string, 
  startPage: number, 
  endPage: number
): Promise<{ text: string; pageCount: number }> {
  console.log(`OCR for pages ${startPage}-${endPage} using signed URL...`);
  
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  
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
        document_url: signedUrl
      },
      include_image_base64: false,
      pages: pages
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
  
  // Also get actual total page count from first response
  const actualTotalPages = data.pages?.length > 0 ? Math.max(...data.pages.map((p: any) => p.index + 1)) : pageCount;
  
  return { text: fullText, pageCount: actualTotalPages };
}

// Intelligent semantic chunking - structure-aware with table preservation
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
  // Tables can exceed MAX_SIZE if needed
  const TABLE_MAX_SIZE = 4000;
  
  // Helper: Extract tables from text
  const extractTables = (text: string): { tables: string[]; textWithoutTables: string } => {
    const tablePattern = /(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g;
    const tables: string[] = [];
    const textWithoutTables = text.replace(tablePattern, (match) => {
      tables.push(match.trim());
      return '\n[TABELLE_PLATZHALTER]\n';
    });
    return { tables, textWithoutTables };
  };
  
  // Helper: Check if segment starts with a heading
  const isHeading = (line: string): boolean => {
    const trimmed = line.trim();
    if (/^#{1,4}\s+/.test(trimmed)) return true;
    if (/^(?:\d+\.)+\s*[A-ZÄÖÜa-zäöü]/.test(trimmed)) return true;
    if (/^[A-ZÄÖÜ][A-ZÄÖÜ\s]{10,}$/.test(trimmed)) return true;
    return false;
  };
  
  for (let i = 0; i < pageSplits.length; i++) {
    const segment = pageSplits[i];
    
    if (/^\d+$/.test(segment.trim())) {
      currentPage = parseInt(segment.trim());
      continue;
    }
    
    const { tables, textWithoutTables } = extractTables(segment);
    let tableIndex = 0;
    
    const lines = textWithoutTables.split('\n');
    let currentParagraph = '';
    const paragraphs: string[] = [];
    
    for (const line of lines) {
      if (line.trim() === '[TABELLE_PLATZHALTER]' && tableIndex < tables.length) {
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
        }
        paragraphs.push(tables[tableIndex]);
        tableIndex++;
        currentParagraph = '';
      } else if (isHeading(line) && currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = line + '\n';
      } else if (line.trim() === '' && currentParagraph.trim().length > 100) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      } else {
        currentParagraph += line + '\n';
      }
    }
    
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
    
    for (const para of paragraphs) {
      const isTable = para.startsWith('|') && para.includes('\n|');
      const maxSize = isTable ? TABLE_MAX_SIZE : MAX_SIZE;
      
      if (buffer.length + para.length < maxSize) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        if (buffer.length >= MIN_SIZE) {
          chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
          
          if (!isTable && !buffer.startsWith('|')) {
            const words = buffer.split(/\s+/);
            const overlapWords = words.slice(-Math.min(20, Math.floor(words.length * 0.1)));
            buffer = overlapWords.join(' ') + '\n\n' + para;
          } else {
            buffer = para;
          }
          bufferStartPage = currentPage;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }
        
        if (para.length > maxSize && !isTable) {
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
  
  console.log(`Created ${chunks.length} semantic chunks with table preservation`);
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
  let documentType = 'unknown';
  
  // Enhanced category detection
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
  } else if (/versicherung|police|schaden|deckung|prämie/.test(contentLower)) {
    category = 'versicherung';
  }
  
  // Extended document type detection
  if (/eigentümer(?:liste|verzeichnis)|wer.*gehört|mea[\s-]*anteil/i.test(content)) {
    documentType = 'eigentumerliste';
  } else if (/hausgeld(?:abrechnung)?|jahresabrechnung|einzelabrechnung/i.test(content)) {
    documentType = 'hausgeldabrechnung';
  } else if (/wirtschaftsplan|vorauszahlung(?:en)?|plan\s*\d{4}/i.test(content)) {
    documentType = 'wirtschaftsplan';
  } else if (/eigentümerversammlung|versammlung(?:sprotokoll)?|top\s*\d/i.test(content)) {
    documentType = 'versammlungsprotokoll';
  } else if (/teilungserkl|sondereigentum|gemeinschaftseigentum/i.test(content)) {
    documentType = 'teilungserklarung';
  } else if (/wartung(?:svertrag)?|service(?:vertrag)?/i.test(content)) {
    documentType = 'wartungsvertrag';
  } else if (/versicherung(?:spolice)?|police(?:nnummer)?|deckung(?:ssumme)?/i.test(content)) {
    documentType = 'versicherungspolice';
  } else if (/rechnung(?:snummer)?|re[\s-]*nr|mwst|netto|brutto/i.test(content)) {
    documentType = 'rechnung';
  }
  
  const firstLine = content.split('\n')[0].trim().slice(0, 100);
  
  // Year extraction
  const yearMatch = content.match(/(?:jahr|abrechnungszeitraum|wirtschaftsjahr)[:\s]*(\d{4})/i) ||
                    content.match(/(?:für das jahr|für \d{4}|stand[:\s]*\d{1,2}\.\d{1,2}\.)(\d{4})/i);
  const documentYear = yearMatch ? yearMatch[1] : null;
  
  // Technical features
  const features: string[] = [];
  if (/gas(?:heizung|therme|kessel|anschluss)/i.test(content)) features.push('gas_heating');
  if (/öl(?:heizung|tank|kessel)/i.test(content)) features.push('oil_heating');
  if (/wärmepumpe/i.test(content)) features.push('heat_pump');
  if (/fernwärme/i.test(content)) features.push('district_heating');
  if (/photovoltaik|solar|pv-anlage/i.test(content)) features.push('solar');
  if (/aufzug|fahrstuhl|lift/i.test(content)) features.push('elevator');
  if (/tiefgarage|stellplatz/i.test(content)) features.push('parking');
  
  const hasTable = content.includes('|') && /\|[^|]+\|/.test(content);
  
  return {
    content: content.trim(),
    metadata: {
      page_start: startPage,
      page_end: endPage,
      pages: startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`,
      category,
      document_type: documentType,
      document: documentName,
      summary: firstLine.length > 10 ? firstLine : null,
      document_year: documentYear,
      features: features.length > 0 ? features : null,
      has_table: hasTable,
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
      name: documentName,
      signed_url: existingSignedUrl,
      signed_url_expires_at: signedUrlExpiresAt,
      retry_count: retryCount
    } = doc;

    console.log(`Document state: phase=${currentPhase}, batch=${currentBatch}, processedPages=${processedPages}/${totalPages}`);

    // Check retry limit
    if (retryCount >= 3) {
      throw new Error('Maximale Anzahl an Verarbeitungsversuchen erreicht');
    }

    // Ensure we have a valid signed URL (no PDF download needed!)
    const signedUrl = await ensureValidSignedUrl(
      supabase,
      documentId,
      filePath,
      existingSignedUrl,
      signedUrlExpiresAt
    );

    // Phase: OCR
    if (currentPhase === 'ocr' || currentPhase === 'pending') {
      const startPage = processedPages || 0;
      const endPage = Math.min(startPage + OCR_BATCH_SIZE - 1, (totalPages || 1000) - 1);
      
      const progressPercent = Math.round(5 + (processedPages / (totalPages || 100)) * 35);
      await updateProgress(
        supabase, 
        documentId, 
        progressPercent, 
        `OCR: Seite ${startPage + 1}-${endPage + 1} von ${totalPages || '?'}`,
        'ocr'
      );

      // Use signed URL for OCR - no memory usage!
      const result = await extractPagesWithOCR(signedUrl, startPage, endPage);
      const newText = (existingText || '') + result.text;
      const newProcessedPages = endPage + 1;
      
      // Update actual total pages if we now know it
      const actualTotalPages = Math.max(totalPages || 0, result.pageCount);

      // Check if OCR is complete
      if (newProcessedPages >= actualTotalPages) {
        // OCR complete, move to chunking phase
        await supabase
          .from('building_documents')
          .update({
            total_pages: actualTotalPages,
            processed_pages: newProcessedPages,
            extracted_text: newText,
            processing_phase: 'chunking',
            processing_progress: 45,
            processing_step: 'Text vollständig extrahiert'
          })
          .eq('id', documentId);
        
        // Continue to chunking
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
            total_pages: actualTotalPages,
            processed_pages: newProcessedPages,
            extracted_text: newText,
            processing_batch: (currentBatch || 0) + 1
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
        JSON.stringify({ success: true, phase: 'ocr', processedPages: newProcessedPages, totalPages: actualTotalPages }),
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

      // Move to embedding phase
      await supabase
        .from('building_documents')
        .update({
          processing_phase: 'embedding',
          processing_batch: 0,
          processed_pages: 0 // Reuse for tracking embedding progress
        })
        .eq('id', documentId);

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

      // NOTE: Multiple documents per building are now allowed
      // No automatic deletion of existing documents
      console.log(`Adding chunks for document ${documentId} to building ${buildingId || 'general'}`);

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

      // Mark as complete - clear signed URL and extracted text to save space
      await supabase
        .from('building_documents')
        .update({
          status: 'ready',
          page_count: totalPages,
          processed_at: new Date().toISOString(),
          processing_progress: 100,
          processing_step: 'Fertig',
          processing_phase: 'complete',
          extracted_text: null,
          signed_url: null,
          signed_url_expires_at: null
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
        // Increment retry count
        const { data: doc } = await supabase
          .from('building_documents')
          .select('retry_count')
          .eq('id', documentId)
          .single();
        
        const newRetryCount = (doc?.retry_count || 0) + 1;
        
        await supabase
          .from('building_documents')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            processing_step: 'Fehler bei der Verarbeitung',
            retry_count: newRetryCount,
            last_error: error instanceof Error ? error.message : 'Unknown error'
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
