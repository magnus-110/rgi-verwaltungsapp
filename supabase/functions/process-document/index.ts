import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface ProcessDocumentRequest {
  documentId: string;
  filePath: string;
  buildingId: string | null;
  category: 'building' | 'general';
}

interface DocumentTypeResult {
  type: 'native' | 'scan' | 'hybrid';
  directText: string | null;
  confidence: number;
}

// Helper to update progress in database
async function updateProgress(supabase: any, documentId: string, progress: number, step: string) {
  await supabase
    .from('building_documents')
    .update({ 
      processing_progress: progress, 
      processing_step: step 
    })
    .eq('id', documentId);
  console.log(`Progress: ${progress}% - ${step}`);
}

// Analyze PDF structure to detect if it's native text, scan, or hybrid
// This uses a heuristic based on the PDF binary structure
function analyzeRawPdfStructure(pdfBytes: Uint8Array): { hasTextStreams: boolean; hasImages: boolean; textRatio: number } {
  const pdfContent = new TextDecoder('latin1').decode(pdfBytes);
  
  // Count text stream indicators (BT...ET blocks indicate native text)
  const textBlockMatches = pdfContent.match(/BT[\s\S]*?ET/g) || [];
  const textBlockCount = textBlockMatches.length;
  
  // Count image indicators (/Image, /XObject with /Subtype /Image)
  const imageMatches = pdfContent.match(/\/Subtype\s*\/Image/g) || [];
  const imageCount = imageMatches.length;
  
  // Count font definitions (native PDFs typically have font definitions)
  const fontMatches = pdfContent.match(/\/Type\s*\/Font/g) || [];
  const fontCount = fontMatches.length;
  
  // Look for embedded text content
  const textContentMatches = pdfContent.match(/\(([^)]{3,})\)/g) || [];
  const totalTextChars = textContentMatches.reduce((acc, m) => acc + m.length, 0);
  
  const hasTextStreams = textBlockCount > 0 || fontCount > 0 || totalTextChars > 500;
  const hasImages = imageCount > 0;
  
  // Calculate ratio - higher means more likely to be native text
  const textRatio = hasImages ? (textBlockCount + fontCount * 5 + totalTextChars / 100) / (imageCount * 10) : 100;
  
  console.log(`PDF Analysis: textBlocks=${textBlockCount}, fonts=${fontCount}, images=${imageCount}, textChars=${totalTextChars}, ratio=${textRatio.toFixed(2)}`);
  
  return { hasTextStreams, hasImages, textRatio };
}

// Detect document type based on PDF structure analysis
function detectDocumentType(pdfBytes: Uint8Array): DocumentTypeResult {
  const analysis = analyzeRawPdfStructure(pdfBytes);
  
  // Decision logic:
  // - If textRatio > 5 and hasTextStreams and no/few images: Native
  // - If no text streams or textRatio < 0.5: Scan
  // - Otherwise: Hybrid
  
  if (analysis.hasTextStreams && analysis.textRatio > 5) {
    console.log('Document type detected: NATIVE (text-based PDF)');
    return { type: 'native', directText: null, confidence: Math.min(analysis.textRatio / 10, 1) };
  } else if (!analysis.hasTextStreams || analysis.textRatio < 0.5) {
    console.log('Document type detected: SCAN (image-based PDF)');
    return { type: 'scan', directText: null, confidence: analysis.hasImages ? 0.9 : 0.7 };
  } else {
    console.log('Document type detected: HYBRID (mixed content PDF)');
    return { type: 'hybrid', directText: null, confidence: 0.7 };
  }
}

// Try to extract text directly from PDF using Mistral with a lightweight approach
// For native PDFs, Mistral can extract text without full OCR processing
async function extractTextDirect(pdfBase64: string): Promise<string | null> {
  console.log('Attempting direct text extraction...');
  
  try {
    // Use Mistral's chat API to analyze the PDF and extract text
    // This is faster than full OCR for text-based PDFs
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: 'Du bist ein Dokumentenextraktor. Extrahiere den vollständigen Text aus dem Dokument, behalte die Struktur bei. Gib NUR den extrahierten Text zurück, keine Erklärungen.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'document_url',
                document_url: `data:application/pdf;base64,${pdfBase64}`
              },
              {
                type: 'text',
                text: 'Extrahiere den vollständigen Text aus diesem PDF-Dokument. Behalte Überschriften, Absätze und Strukturierung bei.'
              }
            ]
          }
        ],
        max_tokens: 32000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Direct extraction not available:', errorText);
      return null;
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content;
    
    if (extractedText && extractedText.length > 200) {
      console.log(`Direct extraction successful: ${extractedText.length} characters`);
      return extractedText;
    }
    
    return null;
  } catch (error) {
    console.log('Direct extraction failed:', error);
    return null;
  }
}

// OCR with Mistral OCR (for scanned documents)
async function extractTextWithMistralOCR(pdfBase64: string): Promise<string> {
  console.log('Starting Mistral OCR extraction (for scanned document)...');
  
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
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral OCR error:', errorText);
    throw new Error(`Mistral OCR failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('Mistral OCR response received');
  
  // Combine all pages' markdown content
  let fullText = '';
  if (data.pages) {
    for (const page of data.pages) {
      fullText += `\n\n--- Seite ${page.index + 1} ---\n\n`;
      fullText += page.markdown || '';
    }
  } else if (data.text) {
    fullText = data.text;
  }
  
  return fullText;
}

// Main text extraction function that chooses the optimal method
async function extractText(
  pdfBytes: Uint8Array, 
  pdfBase64: string, 
  supabase: any, 
  documentId: string
): Promise<{ text: string; documentType: 'native' | 'scan' | 'hybrid'; extractionMethod: string }> {
  
  // Step 1: Detect document type from PDF structure
  const detection = detectDocumentType(pdfBytes);
  
  if (detection.type === 'native') {
    // For native PDFs, try direct extraction first (faster & cheaper)
    await updateProgress(supabase, documentId, 20, 'Direkter Textauszug läuft...');
    
    const directText = await extractTextDirect(pdfBase64);
    
    if (directText && directText.length > 200) {
      console.log('Using direct extraction result for native PDF');
      return { 
        text: directText, 
        documentType: 'native', 
        extractionMethod: 'direct' 
      };
    }
    
    // Fallback to OCR if direct extraction didn't work
    console.log('Direct extraction insufficient, falling back to OCR');
    await updateProgress(supabase, documentId, 25, 'Fallback: OCR-Texterkennung...');
    
    const ocrText = await extractTextWithMistralOCR(pdfBase64);
    return { 
      text: ocrText, 
      documentType: 'native', 
      extractionMethod: 'ocr-fallback' 
    };
  } 
  else if (detection.type === 'scan') {
    // For scans, always use OCR
    await updateProgress(supabase, documentId, 20, 'OCR für Scan-Dokument...');
    
    const ocrText = await extractTextWithMistralOCR(pdfBase64);
    return { 
      text: ocrText, 
      documentType: 'scan', 
      extractionMethod: 'ocr' 
    };
  } 
  else {
    // For hybrid documents, try both methods and combine
    await updateProgress(supabase, documentId, 20, 'Hybrid-Extraktion läuft...');
    
    // Try OCR first for hybrid (most reliable)
    try {
      const ocrText = await extractTextWithMistralOCR(pdfBase64);
      
      if (ocrText && ocrText.length > 200) {
        return { 
          text: ocrText, 
          documentType: 'hybrid', 
          extractionMethod: 'ocr' 
        };
      }
    } catch (error) {
      console.warn('OCR failed for hybrid document, trying direct extraction:', error);
    }
    
    // Fallback to direct extraction
    const directText = await extractTextDirect(pdfBase64);
    
    if (directText && directText.length > 200) {
      return { 
        text: directText, 
        documentType: 'hybrid', 
        extractionMethod: 'direct-fallback' 
      };
    }
    
    throw new Error('Could not extract text from hybrid document');
  }
}

// Intelligent chunking with Mistral Large
async function createIntelligentChunks(text: string, documentName: string): Promise<Array<{content: string, metadata: any}>> {
  console.log('Starting intelligent chunking with Mistral Large...');
  
  const systemPrompt = `Du bist ein Experte für Dokumentenanalyse und Textstrukturierung. Deine Aufgabe ist es, ein Immobilienverwaltungsdokument in semantisch sinnvolle Abschnitte zu unterteilen.

WICHTIGE REGELN:
1. Erstelle Chunks zwischen 500 und 1500 Zeichen
2. Trenne nach semantischen Grenzen (Kapitel, Abschnitte, Themen)
3. Behalte zusammengehörige Informationen zusammen (z.B. Eigentümer mit ihren Miteigentumsanteilen)
4. Extrahiere für jeden Chunk Metadaten

Antworte im folgenden JSON-Format:
{
  "chunks": [
    {
      "content": "Der Textinhalt des Chunks",
      "metadata": {
        "page": "Seitennummer falls erkennbar",
        "section": "Kapitelname oder Abschnittsüberschrift",
        "category": "Eine von: eigentuemer, verwalter, protokoll, finanzen, technik, rechtlich, allgemein",
        "summary": "Kurze Zusammenfassung in einem Satz"
      }
    }
  ]
}`;

  // Split text into manageable parts if too long (Mistral has token limits)
  const maxCharsPerRequest = 100000;
  const textParts = [];
  for (let i = 0; i < text.length; i += maxCharsPerRequest) {
    textParts.push(text.slice(i, i + maxCharsPerRequest));
  }

  const allChunks: Array<{content: string, metadata: any}> = [];
  
  for (let partIndex = 0; partIndex < textParts.length; partIndex++) {
    const textPart = textParts[partIndex];
    
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Dokument: ${documentName}\n\nTeil ${partIndex + 1} von ${textParts.length}:\n\n${textPart}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mistral chunking error:', errorText);
      throw new Error(`Mistral chunking failed: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    try {
      const parsed = JSON.parse(content);
      if (parsed.chunks && Array.isArray(parsed.chunks)) {
        allChunks.push(...parsed.chunks);
      }
    } catch (e) {
      console.error('Failed to parse Mistral response:', e);
      // Fallback: create simple chunks
      const fallbackChunks = createFallbackChunks(textPart);
      allChunks.push(...fallbackChunks);
    }
  }

  console.log(`Created ${allChunks.length} intelligent chunks`);
  return allChunks;
}

// Fallback chunking if Mistral fails
function createFallbackChunks(text: string): Array<{content: string, metadata: any}> {
  const chunks: Array<{content: string, metadata: any}> = [];
  const chunkSize = 1000;
  const overlap = 100;
  
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    const content = text.slice(i, i + chunkSize);
    if (content.trim().length > 50) {
      chunks.push({
        content: content.trim(),
        metadata: {
          category: 'allgemein',
          summary: 'Automatisch erstellter Textabschnitt'
        }
      });
    }
  }
  
  return chunks;
}

// Generate embeddings with Mistral Embed
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  console.log(`Generating embeddings for ${texts.length} chunks...`);
  
  const batchSize = 10;
  const allEmbeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
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
    
    console.log(`Processed embeddings batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
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

    // Update status to processing with initial progress
    await supabase
      .from('building_documents')
      .update({ 
        status: 'processing',
        processing_progress: 5,
        processing_step: 'Dokument wird analysiert...'
      })
      .eq('id', documentId);

    // Download PDF from storage
    await updateProgress(supabase, documentId, 10, 'PDF wird heruntergeladen...');
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('building-documents')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Convert to bytes and base64
    await updateProgress(supabase, documentId, 15, 'Dokumenttyp wird erkannt...');
    
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const base64 = btoa(
      pdfBytes.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Step 1: Intelligent text extraction based on document type
    const extraction = await extractText(pdfBytes, base64, supabase, documentId);
    
    console.log(`Extracted ${extraction.text.length} characters using ${extraction.extractionMethod} (document type: ${extraction.documentType})`);

    if (!extraction.text || extraction.text.length < 100) {
      throw new Error('Insufficient text extracted from document');
    }

    await updateProgress(supabase, documentId, 40, `Text extrahiert (${extraction.documentType})`);

    // Step 2: Intelligent chunking with Mistral Large
    await updateProgress(supabase, documentId, 45, 'Dokument wird analysiert...');
    
    const chunks = await createIntelligentChunks(extraction.text, filePath.split('/').pop() || 'document');
    
    if (chunks.length === 0) {
      throw new Error('No chunks created from document');
    }

    await updateProgress(supabase, documentId, 65, `${chunks.length} Abschnitte erstellt`);

    // Step 3: Generate embeddings
    await updateProgress(supabase, documentId, 70, 'Embeddings werden generiert...');
    
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    await updateProgress(supabase, documentId, 85, 'Embeddings erstellt');

    // Step 4: Delete old chunks for this building/category if replacing
    if (buildingId) {
      // Delete old document and chunks for this building
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

    // Step 5: Insert chunks with embeddings
    await updateProgress(supabase, documentId, 90, 'Daten werden gespeichert...');
    
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

    // Step 6: Update document status with document type info
    const pageCount = (extraction.text.match(/--- Seite \d+ ---/g) || []).length || 1;
    
    await supabase
      .from('building_documents')
      .update({
        status: 'ready',
        page_count: pageCount,
        processed_at: new Date().toISOString(),
        processing_progress: 100,
        processing_step: 'Fertig',
        document_type: extraction.documentType,
        extraction_method: extraction.extractionMethod
      })
      .eq('id', documentId);

    console.log(`Document ${documentId} processed successfully: type=${extraction.documentType}, method=${extraction.extractionMethod}, chunks=${chunks.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksCreated: chunks.length,
        pageCount,
        documentType: extraction.documentType,
        extractionMethod: extraction.extractionMethod,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing document:', error);
    
    // Try to update document status to error
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
