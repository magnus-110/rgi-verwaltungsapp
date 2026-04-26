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

// Threshold: Documents with more pages use batch processing
const BATCH_THRESHOLD_PAGES = 50;
// Signed URL validity: 24 hours for batch processing
const SIGNED_URL_EXPIRY = 86400;

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

// Estimate page count from file size (no download needed for initial estimate)
function estimatePageCount(fileSize: number): number {
  // Rough estimate: ~500KB per page for scanned PDFs, ~50KB for native
  // Use conservative estimate (scanned) to trigger batch processing when needed
  const estimatedPages = Math.max(1, Math.ceil(fileSize / 300000));
  console.log(`Estimated ${estimatedPages} pages based on file size ${fileSize} bytes`);
  return estimatedPages;
}

// OCR with Mistral using signed URL (no memory consumption!)
async function extractTextWithMistralOCR(signedUrl: string): Promise<{ text: string; pageCount: number }> {
  console.log('Starting Mistral OCR extraction with signed URL...');
  
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
  
  // Helper: Check if text contains a complete table
  const extractTables = (text: string): { tables: string[]; textWithoutTables: string } => {
    // Match markdown tables (header + separator + rows)
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
    // Markdown headings
    if (/^#{1,4}\s+/.test(trimmed)) return true;
    // Numbered headings like "1.", "1.1", "1.1.1"
    if (/^(?:\d+\.)+\s*[A-ZÄÖÜa-zäöü]/.test(trimmed)) return true;
    // All caps headings (likely section titles)
    if (/^[A-ZÄÖÜ][A-ZÄÖÜ\s]{10,}$/.test(trimmed)) return true;
    return false;
  };
  
  for (let i = 0; i < pageSplits.length; i++) {
    const segment = pageSplits[i];
    
    // Check if this segment is a page number
    if (/^\d+$/.test(segment.trim())) {
      currentPage = parseInt(segment.trim());
      continue;
    }
    
    // Extract tables first - they should stay together
    const { tables, textWithoutTables } = extractTables(segment);
    let tableIndex = 0;
    
    // Split segment into paragraphs, respecting headings
    const lines = textWithoutTables.split('\n');
    let currentParagraph = '';
    const paragraphs: string[] = [];
    
    for (const line of lines) {
      if (line.trim() === '[TABELLE_PLATZHALTER]' && tableIndex < tables.length) {
        // Flush current paragraph
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
        }
        // Add table as its own paragraph (priority: keep together)
        paragraphs.push(tables[tableIndex]);
        tableIndex++;
        currentParagraph = '';
      } else if (isHeading(line) && currentParagraph.trim()) {
        // Heading starts a new chunk
        paragraphs.push(currentParagraph.trim());
        currentParagraph = line + '\n';
      } else if (line.trim() === '' && currentParagraph.trim().length > 100) {
        // Empty line after substantial content
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      } else {
        currentParagraph += line + '\n';
      }
    }
    
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
    
    // Process paragraphs with table-awareness
    for (const para of paragraphs) {
      const isTable = para.startsWith('|') && para.includes('\n|');
      const maxSize = isTable ? TABLE_MAX_SIZE : MAX_SIZE;
      
      if (buffer.length + para.length < maxSize) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        // Flush buffer if it has enough content
        if (buffer.length >= MIN_SIZE) {
          chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
          
          // Keep overlap for context (but not for tables)
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
        
        // If paragraph itself is too large and NOT a table, split it
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
  
  // Don't forget remaining buffer
  if (buffer.trim().length >= MIN_SIZE) {
    chunks.push(createChunkWithMetadata(buffer, bufferStartPage, currentPage, documentName));
  } else if (buffer.trim().length > 50 && chunks.length > 0) {
    // Append small remainder to last chunk
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
  
  // Extended document type detection for scans
  if (/eigentümer(?:liste|verzeichnis)|wer.*gehört|mea[\s-]*anteil/i.test(content)) {
    documentType = 'eigentumerliste';
  } else if (/hausgeld(?:abrechnung)?|jahresabrechnung|einzelabrechnung|abrechnungs(?:zeitraum|jahr)/i.test(content)) {
    documentType = 'hausgeldabrechnung';
  } else if (/wirtschaftsplan|vorauszahlung(?:en)?|plan\s*\d{4}/i.test(content)) {
    documentType = 'wirtschaftsplan';
  } else if (/eigentümerversammlung|versammlung(?:sprotokoll)?|top\s*\d|beschluss(?:fassung)?/i.test(content)) {
    documentType = 'versammlungsprotokoll';
  } else if (/teilungserkl|sondereigentum|gemeinschaftseigentum|aufteilungsplan/i.test(content)) {
    documentType = 'teilungserklarung';
  } else if (/wartung(?:svertrag)?|service(?:vertrag)?|vollwartung/i.test(content)) {
    documentType = 'wartungsvertrag';
  } else if (/versicherung(?:spolice)?|police(?:nnummer)?|deckung(?:ssumme)?|prämie/i.test(content)) {
    documentType = 'versicherungspolice';
  } else if (/rechnung(?:snummer)?|re[\s-]*nr|mwst|netto|brutto|fällig(?:keit)?/i.test(content)) {
    documentType = 'rechnung';
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
  
  // Extract year from content (for financial documents)
  const yearMatch = content.match(/(?:jahr|abrechnungszeitraum|wirtschaftsjahr)[:\s]*(\d{4})/i) ||
                    content.match(/(?:für das jahr|für \d{4}|stand[:\s]*\d{1,2}\.\d{1,2}\.)(\d{4})/i);
  const documentYear = yearMatch ? yearMatch[1] : null;
  
  // Extract amounts (for financial documents)
  const amountMatches = content.match(/(?:gesamt|summe|betrag|hausgeld)[:\s]*[\d.,]+(?:\s*(?:€|eur|euro))?/gi) || [];
  const amounts = amountMatches.slice(0, 5); // Keep top 5 amounts
  
  // Technical features for cross-building search
  const features: string[] = [];
  if (/gas(?:heizung|therme|kessel|anschluss)/i.test(content)) features.push('gas_heating');
  if (/öl(?:heizung|tank|kessel)/i.test(content)) features.push('oil_heating');
  if (/wärmepumpe/i.test(content)) features.push('heat_pump');
  if (/fernwärme/i.test(content)) features.push('district_heating');
  if (/photovoltaik|solar|pv-anlage/i.test(content)) features.push('solar');
  if (/aufzug|fahrstuhl|lift/i.test(content)) features.push('elevator');
  if (/tiefgarage|stellplatz/i.test(content)) features.push('parking');
  
  // Check if content contains a table
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
      dates: Object.keys(extractedDates).length > 0 ? extractedDates : null,
      document_year: documentYear,
      amounts: amounts.length > 0 ? amounts : null,
      features: features.length > 0 ? features : null,
      has_table: hasTable,
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

// Validate Mistral API key with a minimal test request
async function validateMistralApiKey(): Promise<{ valid: boolean; error?: string }> {
  try {
    console.log('Validating Mistral API key...');
    const response = await fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
    });
    
    if (response.status === 401) {
      return { valid: false, error: 'Ungültiger API-Key. Bitte überprüfen Sie den MISTRAL_API_KEY in den Supabase Secrets.' };
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API validation error:', errorText);
      return { valid: false, error: `API-Fehler: ${response.status}` };
    }
    
    console.log('Mistral API key is valid');
    return { valid: true };
  } catch (error) {
    console.error('API validation network error:', error);
    return { valid: false, error: 'Netzwerkfehler bei API-Validierung. Bitte versuchen Sie es später erneut.' };
  }
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
      throw new Error('MISTRAL_API_KEY ist nicht konfiguriert. Bitte fügen Sie den API-Key in den Supabase Secrets hinzu.');
    }

    supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get document info including file size
    const { data: doc, error: docError } = await supabase
      .from('building_documents')
      .select('file_size, retry_count')
      .eq('id', documentId)
      .single();

    if (docError) {
      console.error('Error fetching document:', docError);
    }

    const fileSize = doc?.file_size || 0;
    const retryCount = doc?.retry_count || 0;

    // Check retry limit
    if (retryCount >= 3) {
      throw new Error('Maximale Anzahl an Verarbeitungsversuchen erreicht. Bitte laden Sie das Dokument erneut hoch.');
    }

    // COST PROTECTION: Validate API key BEFORE any processing
    const apiValidation = await validateMistralApiKey();
    if (!apiValidation.valid) {
      // Set document to error status immediately - NO costs incurred
      await supabase
        .from('building_documents')
        .update({
          status: 'error',
          error_message: apiValidation.error,
          processing_step: 'API-Fehler'
        })
        .eq('id', documentId);
      
      throw new Error(apiValidation.error);
    }

    // Update status to processing
    await supabase
      .from('building_documents')
      .update({ 
        status: 'processing',
        processing_progress: 5,
        processing_step: 'Dokument wird analysiert...',
        processing_phase: 'pending',
        last_error: null
      })
      .eq('id', documentId);

    // Create signed URL for Mistral (no download needed!)
    await updateProgress(supabase, documentId, 8, 'Zugriff wird vorbereitet...');
    
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('building-documents')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`);
    }

    const signedUrl = signedUrlData.signedUrl;
    const signedUrlExpiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString();
    
    console.log('Created signed URL for document access');

    // Store signed URL for batch processing
    await supabase
      .from('building_documents')
      .update({
        signed_url: signedUrl,
        signed_url_expires_at: signedUrlExpiresAt
      })
      .eq('id', documentId);

    // Estimate page count from file size
    const estimatedPages = estimatePageCount(fileSize);
    
    // Store estimated page count
    await supabase
      .from('building_documents')
      .update({ total_pages: estimatedPages })
      .eq('id', documentId);

    // Decision: Use batch processing for large documents (based on estimated size)
    // Use 200MB as threshold for batch processing (very large files)
    const useBatchProcessing = fileSize > 200 * 1024 * 1024 || estimatedPages > BATCH_THRESHOLD_PAGES;
    
    if (useBatchProcessing) {
      console.log(`Large document detected (${fileSize} bytes, ~${estimatedPages} pages), using batch processing`);
      
      await supabase
        .from('building_documents')
        .update({ 
          processing_phase: 'ocr',
          processed_pages: 0,
          processing_batch: 0
        })
        .eq('id', documentId);

      await updateProgress(supabase, documentId, 10, `Großes Dokument (~${estimatedPages} Seiten) - Batch-Verarbeitung`, 'ocr');

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
          estimatedPages,
          batchProcessing: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Small/medium document: Process directly with signed URL
    console.log(`Document (${fileSize} bytes, ~${estimatedPages} pages), processing directly`);

    // OCR with signed URL - no memory usage for PDF download!
    await updateProgress(supabase, documentId, 20, 'Texterkennung läuft...', 'ocr');
    const extraction = await extractTextWithMistralOCR(signedUrl);
    
    console.log(`Extracted ${extraction.text.length} characters from ${extraction.pageCount} pages`);

    // Update actual page count
    await supabase
      .from('building_documents')
      .update({ total_pages: extraction.pageCount })
      .eq('id', documentId);

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

    // NOTE: Multiple documents per building are now allowed
    // No automatic deletion of existing documents
    console.log(`Adding document to building ${buildingId || 'general'}`);


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

    // Mark complete - clear signed URL to save space
    await supabase
      .from('building_documents')
      .update({
        status: 'ready',
        page_count: extraction.pageCount,
        processed_at: new Date().toISOString(),
        processing_progress: 100,
        processing_step: 'Fertig',
        processing_phase: 'complete',
        signed_url: null,
        signed_url_expires_at: null
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
        // Increment retry count and store error
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
            processing_progress: 0,
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
