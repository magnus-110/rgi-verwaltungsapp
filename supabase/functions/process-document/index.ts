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

// OCR with Mistral OCR 3
async function extractTextWithMistralOCR(pdfBase64: string): Promise<string> {
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

  try {
    const { documentId, filePath, buildingId, category } = await req.json() as ProcessDocumentRequest;
    
    console.log(`Processing document: ${documentId}, path: ${filePath}, category: ${category}`);

    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Update status to processing
    await supabase
      .from('building_documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('building-documents')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Step 1: OCR with Mistral OCR 3
    const extractedText = await extractTextWithMistralOCR(base64);
    console.log(`Extracted ${extractedText.length} characters from PDF`);

    if (!extractedText || extractedText.length < 100) {
      throw new Error('Insufficient text extracted from document');
    }

    // Step 2: Intelligent chunking with Mistral Large
    const chunks = await createIntelligentChunks(extractedText, filePath.split('/').pop() || 'document');
    
    if (chunks.length === 0) {
      throw new Error('No chunks created from document');
    }

    // Step 3: Generate embeddings
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    // Step 4: Delete old chunks for this building/category if replacing
    if (buildingId) {
      // Delete old document and chunks for this building
      const { data: existingDocs } = await supabase
        .from('building_documents')
        .select('id')
        .eq('building_id', buildingId)
        .neq('id', documentId);

      if (existingDocs && existingDocs.length > 0) {
        const oldDocIds = existingDocs.map(d => d.id);
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
    } else if (category === 'general') {
      // For general documents, keep all (don't delete old general docs)
      // If you want to replace, uncomment below
      /*
      const { data: existingDocs } = await supabase
        .from('building_documents')
        .select('id')
        .is('building_id', null)
        .eq('category', 'general')
        .neq('id', documentId);

      if (existingDocs && existingDocs.length > 0) {
        const oldDocIds = existingDocs.map(d => d.id);
        await supabase
          .from('document_chunks')
          .delete()
          .in('document_id', oldDocIds);
        await supabase
          .from('building_documents')
          .delete()
          .in('id', oldDocIds);
      }
      */
    }

    // Step 5: Insert chunks with embeddings
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

    // Step 6: Update document status
    const pageCount = (extractedText.match(/--- Seite \d+ ---/g) || []).length || 1;
    
    await supabase
      .from('building_documents')
      .update({
        status: 'ready',
        page_count: pageCount,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    console.log(`Document ${documentId} processed successfully with ${chunks.length} chunks`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksCreated: chunks.length,
        pageCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing document:', error);
    
    // Try to update document status to error
    try {
      const { documentId } = await req.json();
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      await supabase
        .from('building_documents')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', documentId);
    } catch (e) {
      console.error('Failed to update error status:', e);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
