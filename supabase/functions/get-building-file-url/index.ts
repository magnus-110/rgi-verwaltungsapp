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
    // --- Authentication ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // filePath (Dokumentenbereich) oder fileId (Quellen-Links im Chat)
    const { filePath, fileId } = await req.json();

    if (!filePath && !fileId) {
      return new Response(
        JSON.stringify({ error: 'filePath or fileId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // --- Authorization ---
    // Query building_files with a USER-SCOPED client so that the existing
    // Row Level Security policies decide whether this caller may see the file.
    // If RLS returns the row, the user is authorized; otherwise deny.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let abfrage = userClient
      .from('building_files')
      .select('id, file_path, storage_bucket, display_name')
      .is('deleted_at', null);
    abfrage = fileId ? abfrage.eq('id', fileId) : abfrage.eq('file_path', filePath);
    const { data: fileRow, error: fileErr } = await abfrage.limit(1).maybeSingle();

    if (fileErr) {
      console.error('Authorization lookup failed:', fileErr);
      return new Response(
        JSON.stringify({ error: 'Failed to verify access' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fileRow) {
      // No row visible to this user under RLS -> not authorized (or not found)
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Sign with service role only AFTER authorization succeeded ---
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.storage
      .from(fileRow.storage_bucket || 'building-files')
      .createSignedUrl(fileRow.file_path, 3600);

    if (error) {
      console.error('Error creating signed URL:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate download URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ signedUrl: data.signedUrl, fileName: fileRow.display_name ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-building-file-url:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
