import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// OCR with Mistral using signed URL
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'fileId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!MISTRAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'MISTRAL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get file record
    const { data: file, error: fileError } = await supabase
      .from('building_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only process supported file types
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (file.mime_type && !supportedTypes.includes(file.mime_type)) {
      // For non-OCR-able files, just mark as done without extracted_text
      console.log(`Skipping OCR for unsupported type: ${file.mime_type}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Unsupported file type for OCR' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URL for Mistral OCR
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('building-files')
      .createSignedUrl(file.file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error('Could not create signed URL for OCR');
    }

    console.log(`Starting OCR for file: ${file.display_name}`);

    // Extract text via Mistral OCR
    const extractedText = await extractTextWithMistralOCR(signedUrlData.signedUrl);

    if (!extractedText || extractedText.length < 10) {
      console.log('OCR returned no meaningful text');
      await supabase
        .from('building_files')
        .update({ rag_enabled: false })
        .eq('id', fileId);
      
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'No text extracted' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save extracted text to building_files record
    const { error: updateError } = await supabase
      .from('building_files')
      .update({ 
        extracted_text: extractedText,
        rag_enabled: true 
      })
      .eq('id', fileId);

    if (updateError) {
      throw new Error(`Failed to save extracted text: ${updateError.message}`);
    }

    console.log(`OCR complete for ${file.display_name}: ${extractedText.length} chars extracted`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        chars: extractedText.length,
        fileName: file.display_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-building-file:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
