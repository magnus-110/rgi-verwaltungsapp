import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// ================== OCR ==================
async function extractTextWithMistralOCR(signedUrl: string): Promise<string> {
  console.log('Starting Mistral OCR extraction...');
  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: signedUrl },
      include_image_base64: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral OCR error:', errorText);
    throw new Error(`Mistral OCR failed: ${errorText}`);
  }

  const data = await response.json();
  let fullText = '';
  if (data.pages) {
    for (const page of data.pages) {
      fullText += `\n\n--- Seite ${page.index + 1} ---\n\n`;
      fullText += page.markdown || '';
    }
  } else if (data.text) {
    fullText = data.text;
  }
  return fullText.trim();
}

// ================== Plain text from text-based files ==================
async function downloadAsText(supabase: any, filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('building-files').download(filePath);
  if (error) throw error;
  return await data.text();
}

// ================== Semantic chunking (mirrors process-document) ==================
interface Chunk {
  content: string;
  metadata: Record<string, any>;
}

function createSemanticChunks(text: string, documentName: string): Chunk[] {
  const chunks: Chunk[] = [];
  const pagePattern = /\n\n--- Seite (\d+) ---\n\n/g;
  const pageSplits = text.split(pagePattern);

  let currentPage = 1;
  let buffer = '';
  let bufferStartPage = 1;

  const TARGET_SIZE = 1000;
  const MIN_SIZE = 400;
  const MAX_SIZE = 1800;
  const TABLE_MAX_SIZE = 4000;

  const extractTables = (t: string) => {
    const tablePattern = /(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g;
    const tables: string[] = [];
    const textWithoutTables = t.replace(tablePattern, (m) => {
      tables.push(m.trim());
      return '\n[TABELLE_PLATZHALTER]\n';
    });
    return { tables, textWithoutTables };
  };

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
        if (currentParagraph.trim()) paragraphs.push(currentParagraph.trim());
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
    if (currentParagraph.trim()) paragraphs.push(currentParagraph.trim());

    for (const para of paragraphs) {
      const isTable = para.startsWith('|') && para.includes('\n|');
      const maxSize = isTable ? TABLE_MAX_SIZE : MAX_SIZE;

      if (buffer.length + para.length < maxSize) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        if (buffer.length >= MIN_SIZE) {
          chunks.push(makeChunk(buffer, bufferStartPage, currentPage, documentName));
          if (!isTable && !buffer.startsWith('|')) {
            const words = buffer.split(/\s+/);
            const overlap = words.slice(-Math.min(20, Math.floor(words.length * 0.1)));
            buffer = overlap.join(' ') + '\n\n' + para;
          } else {
            buffer = para;
          }
          bufferStartPage = currentPage;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }

        if (para.length > maxSize && !isTable) {
          const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
          let sb = '';
          for (const s of sentences) {
            if (sb.length + s.length > TARGET_SIZE && sb.length >= MIN_SIZE) {
              chunks.push(makeChunk(sb, currentPage, currentPage, documentName));
              sb = s;
            } else {
              sb += s;
            }
          }
          if (sb.length >= MIN_SIZE) {
            chunks.push(makeChunk(sb, currentPage, currentPage, documentName));
          }
          buffer = '';
          bufferStartPage = currentPage;
        }
      }
    }
  }

  if (buffer.trim().length >= MIN_SIZE) {
    chunks.push(makeChunk(buffer, bufferStartPage, currentPage, documentName));
  } else if (buffer.trim().length > 50 && chunks.length > 0) {
    chunks[chunks.length - 1].content += '\n\n' + buffer.trim();
  } else if (buffer.trim().length > 50) {
    chunks.push(makeChunk(buffer, bufferStartPage, currentPage, documentName));
  }

  return chunks;
}

function makeChunk(content: string, startPage: number, endPage: number, documentName: string): Chunk {
  const firstLine = content.split('\n')[0].trim().slice(0, 100);
  const hasTable = content.includes('|') && /\|[^|]+\|/.test(content);
  return {
    content: content.trim(),
    metadata: {
      page_start: startPage,
      page_end: endPage,
      pages: startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`,
      document: documentName,
      summary: firstLine.length > 10 ? firstLine : null,
      has_table: hasTable,
    },
  };
}

// For very small docs (no page markers), make a single chunk
function fallbackChunk(text: string, documentName: string): Chunk[] {
  if (!text || text.trim().length < 50) return [];
  // Split into ~1500 char windows if longer
  const MAX = 1500;
  if (text.length <= MAX) {
    return [makeChunk(text, 1, 1, documentName)];
  }
  const out: Chunk[] = [];
  for (let i = 0; i < text.length; i += MAX) {
    out.push(makeChunk(text.slice(i, i + MAX), 1, 1, documentName));
  }
  return out;
}

// ================== Embeddings ==================
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 10;
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'mistral-embed', input: batch }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mistral embedding error:', errorText);
      throw new Error(`Mistral embedding failed: ${errorText}`);
    }

    const data = await response.json();
    all.push(...data.data.map((it: any) => it.embedding));
  }
  return all;
}

// ================== Main ==================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { fileId, force } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: 'fileId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!MISTRAL_API_KEY) {
      return new Response(JSON.stringify({ error: 'MISTRAL_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Load file
    const { data: file, error: fileError } = await supabase
      .from('building_files').select('*').eq('id', fileId).single();
    if (fileError || !file) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip already-indexed (unless force=true)
    if (!force) {
      const { count } = await supabase
        .from('document_chunks').select('id', { count: 'exact', head: true }).eq('file_id', fileId);
      if ((count ?? 0) > 0) {
        console.log(`File ${fileId} already has ${count} chunks, skipping`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already indexed', chunks: count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Force re-index: delete existing chunks
      await supabase.from('document_chunks').delete().eq('file_id', fileId);
    }

    // Determine extraction method by mime
    const ocrTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

    let extractedText = file.extracted_text || '';

    if (!extractedText) {
      if (file.mime_type && ocrTypes.includes(file.mime_type)) {
        const { data: signed, error: signedErr } = await supabase.storage
          .from('building-files')
          .createSignedUrl(file.file_path, 3600);
        if (signedErr || !signed?.signedUrl) throw new Error('Could not create signed URL for OCR');

        console.log(`OCR for ${file.display_name}`);
        extractedText = await extractTextWithMistralOCR(signed.signedUrl);
      } else if (file.mime_type && textTypes.includes(file.mime_type)) {
        extractedText = await downloadAsText(supabase, file.file_path);
      } else {
        console.log(`Skipping unsupported type: ${file.mime_type}`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'unsupported mime type' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!extractedText || extractedText.length < 30) {
      await supabase.from('building_files').update({ rag_enabled: false }).eq('id', fileId);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no meaningful text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save extracted_text on file
    await supabase.from('building_files').update({
      extracted_text: extractedText,
      rag_enabled: true,
    }).eq('id', fileId);

    // Chunk
    let chunks = createSemanticChunks(extractedText, file.display_name);
    if (chunks.length === 0) chunks = fallbackChunk(extractedText, file.display_name);
    if (chunks.length === 0) {
      console.log('No chunks created');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no chunks' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Created ${chunks.length} chunks for ${file.display_name}`);

    // Embeddings
    const embeddings = await generateEmbeddings(chunks.map(c => c.content));

    // Insert chunks (trigger fills category_slug + path)
    // document_chunks.document_id is NOT NULL — use file.id as the logical document id
    const records = chunks.map((c, idx) => ({
      document_id: file.id,
      file_id: file.id,
      building_id: file.building_id,
      category: 'building_file',
      chunk_index: idx,
      content: c.content,
      metadata: { ...c.metadata, source: 'building_files', file_id: file.id, file_path: file.file_path, display_name: file.display_name },
      embedding: `[${embeddings[idx].join(',')}]`,
    }));

    // Insert in batches of 50
    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50);
      const { error: insErr } = await supabase.from('document_chunks').insert(batch);
      if (insErr) throw new Error(`Chunk insert failed: ${insErr.message}`);
    }

    console.log(`Indexed ${file.display_name}: ${chunks.length} chunks, ${extractedText.length} chars`);

    return new Response(JSON.stringify({
      success: true,
      fileName: file.display_name,
      chunks: chunks.length,
      chars: extractedText.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in process-building-file:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'Processing failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
