import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Signed URL validity: 1 hour (sufficient for viewing, reduces egress)
const SIGNED_URL_EXPIRY = 3600;

interface GetDocumentUrlRequest {
  documentId: string;
  pageNumber?: number; // Optional: for direct page navigation
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as GetDocumentUrlRequest;
    const { documentId, pageNumber } = body;

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating signed URL for document: ${documentId}`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // --- Authorization ---
    // Look up the document with a USER-SCOPED client so RLS decides whether
    // this caller may access it. Only if RLS returns the row do we proceed.
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authDoc, error: authErr } = await userClient
      .from('building_documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle();

    if (authErr || !authDoc) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get document file path (service role, authorization already confirmed)
    const { data: doc, error: docError } = await supabase
      .from('building_documents')
      .select('file_path, file_name, status')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      console.error('Document not found:', docError);
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (doc.status !== 'ready') {
      return new Response(
        JSON.stringify({ error: 'Document is not ready for viewing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URL (1 hour validity)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('building-documents')
      .createSignedUrl(doc.file_path, SIGNED_URL_EXPIRY);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Error creating signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to create signed URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString();

    console.log(`Signed URL created for ${doc.file_name}, expires at ${expiresAt}`);

    return new Response(
      JSON.stringify({
        signedUrl: signedUrlData.signedUrl,
        fileName: doc.file_name,
        expiresAt,
        pageNumber: pageNumber || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-document-url:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
