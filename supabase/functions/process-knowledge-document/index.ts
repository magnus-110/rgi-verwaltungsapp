import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = 'https://eebphowrbarzawwixqcc.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header for user validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only admins can upload knowledge documents' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const category = formData.get('category') as string || 'sonstiges';
    const keywordsStr = formData.get('keywords') as string || '';
    const appliesTo = formData.get('applies_to') as string || 'alle';
    const managementMode = formData.get('management_mode') as string || 'weg';
    const textContent = formData.get('text_content') as string | null;

    let extractedText = '';
    let pageCount = 0;
    let filePath: string | null = null;

    if (textContent) {
      // Direct text input
      extractedText = textContent;
    } else if (file) {
      const fileName = file.name.toLowerCase();
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
        // Plain text file
        extractedText = new TextDecoder('utf-8').decode(fileBytes);
      } else if (fileName.endsWith('.pdf')) {
        // Use Mistral OCR for PDF
        const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
        if (!mistralApiKey) {
          return new Response(
            JSON.stringify({ error: 'Mistral API key not configured for PDF processing' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Convert to base64
        const base64Data = btoa(String.fromCharCode(...fileBytes));
        const dataUrl = `data:application/pdf;base64,${base64Data}`;

        console.log('Processing PDF with Mistral OCR...');

        // Call Mistral OCR API
        const ocrResponse = await fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mistralApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'mistral-ocr-latest',
            document: {
              type: 'document_url',
              document_url: dataUrl
            }
          }),
        });

        if (!ocrResponse.ok) {
          const errorText = await ocrResponse.text();
          console.error('Mistral OCR error:', errorText);
          return new Response(
            JSON.stringify({ error: 'PDF processing failed', details: errorText }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const ocrResult = await ocrResponse.json();
        
        // Extract text from OCR result
        if (ocrResult.pages && Array.isArray(ocrResult.pages)) {
          pageCount = ocrResult.pages.length;
          extractedText = ocrResult.pages.map((page: any) => page.markdown || page.text || '').join('\n\n');
        } else if (ocrResult.text) {
          extractedText = ocrResult.text;
        } else if (ocrResult.markdown) {
          extractedText = ocrResult.markdown;
        }

        console.log(`PDF processed: ${pageCount} pages, ${extractedText.length} characters`);
      } else {
        return new Response(
          JSON.stringify({ error: 'Unsupported file type. Please upload PDF, TXT, or MD files.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'No file or text content provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!extractedText.trim()) {
      return new Response(
        JSON.stringify({ error: 'Could not extract any text from the document' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse keywords
    const keywords = keywordsStr
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    // Save to database
    const { data: document, error: insertError } = await supabase
      .from('chatbot_knowledge_documents')
      .insert({
        management_mode: managementMode,
        title: title,
        content: extractedText,
        category: category,
        keywords: keywords,
        applies_to: appliesTo,
        file_path: filePath,
        page_count: pageCount || null,
        char_count: extractedText.length
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save document', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        document: {
          id: document.id,
          title: document.title,
          category: document.category,
          keywords: document.keywords,
          applies_to: document.applies_to,
          page_count: document.page_count,
          char_count: document.char_count
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-knowledge-document:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
