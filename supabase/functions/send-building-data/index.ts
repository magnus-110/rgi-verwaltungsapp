import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

interface SendBuildingDataRequest {
  buildingData: {
    id: string;
    name: string;
    address: string;
    type: string;
    building_code: string;
    manager_name?: string;
    management_mode: string;
  };
  usersData?: Array<{
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: string;
    building_id?: string;
  }>;
  action: 'created' | 'updated' | 'deleted';
}

// Retry-Utility-Funktion mit exponential backoff
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context: string
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      console.log(`${context} - Versuch ${attempt + 1}/${config.maxRetries + 1}`);
      const result = await fn();
      
      if (attempt > 0) {
        console.log(`${context} - Erfolgreich nach ${attempt + 1} Versuchen`);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(`${context} - Versuch ${attempt + 1} fehlgeschlagen:`, error);
      
      // Prüfen ob es ein HTTP-Fehler ist und ob er retry-bar ist
      if (error instanceof Response) {
        if (!config.retryableStatusCodes.includes(error.status)) {
          console.log(`${context} - Status ${error.status} ist nicht retry-bar, gebe auf`);
          throw error;
        }
      }
      
      // Wenn das der letzte Versuch war, werfe den Fehler
      if (attempt === config.maxRetries) {
        console.error(`${context} - Alle ${config.maxRetries + 1} Versuche fehlgeschlagen`);
        throw lastError;
      }
      
      // Berechne Delay mit exponential backoff und Jitter
      const baseDelay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
      );
      const jitter = Math.random() * 0.1 * baseDelay; // 10% Jitter
      const delay = baseDelay + jitter;
      
      console.log(`${context} - Warte ${Math.round(delay)}ms vor nächstem Versuch`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Webhook senden mit Retry-Logik
async function sendWebhookWithRetry(
  webhookUrl: string,
  payload: any,
  config: RetryConfig
): Promise<Response> {
  return await retryWithExponentialBackoff(
    async () => {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      // Bei HTTP-Fehlern eine Response-basierte Exception werfen
      if (!response.ok) {
        const errorResponse = Object.assign(new Error(`HTTP ${response.status}: ${response.statusText}`), {
          status: response.status,
          statusText: response.statusText
        });
        throw errorResponse;
      }
      
      return response;
    },
    config,
    'Webhook-Versand'
  );
}

Deno.serve(async (req) => {
  console.log('Send building data function called, method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('Starting send building data function...');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Admin-Berechtigung prüfen
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Request-Daten parsen
    const requestData: SendBuildingDataRequest = await req.json();
    console.log('Building data request:', JSON.stringify(requestData, null, 2));

    // Webhook URL aus Environment laden
    const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL');
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'MAKE_WEBHOOK_URL ist nicht konfiguriert' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Retry-Konfiguration für große Datenmengen optimiert
    const retryConfig: RetryConfig = {
      maxRetries: 5, // Mehr Retries für große Datenmengen
      baseDelayMs: 1000, // Start mit 1 Sekunde
      maxDelayMs: 30000, // Maximum 30 Sekunden zwischen Versuchen
      retryableStatusCodes: [408, 429, 500, 502, 503, 504, 520, 521, 522, 524] // Häufige temporäre Fehler
    };

    // Webhook-Payload vorbereiten
    const webhookPayload = {
      event: 'building_data_sync',
      action: requestData.action,
      building: requestData.buildingData,
      users: requestData.usersData || [],
      user_count: requestData.usersData?.length || 0,
      sent_by: user.email,
      timestamp: new Date().toISOString(),
      batch_info: {
        total_users: requestData.usersData?.length || 0,
        requires_chunking: (requestData.usersData?.length || 0) > 30
      }
    };

    console.log(`Sende Gebäudedaten mit ${requestData.usersData?.length || 0} Nutzern an Webhook`);

    // Bei mehr als 30 Nutzern: Daten in Chunks aufteilen
    if (requestData.usersData && requestData.usersData.length > 30) {
      console.log(`Große Datenmenge erkannt (${requestData.usersData.length} Nutzer), teile in Chunks auf`);
      
      const chunkSize = 30;
      const chunks = [];
      for (let i = 0; i < requestData.usersData.length; i += chunkSize) {
        chunks.push(requestData.usersData.slice(i, i + chunkSize));
      }

      const results = [];
      
      // Sende jeden Chunk einzeln mit Retry-Logik
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPayload = {
          ...webhookPayload,
          users: chunk,
          batch_info: {
            ...webhookPayload.batch_info,
            chunk_number: i + 1,
            total_chunks: chunks.length,
            chunk_size: chunk.length
          }
        };

        console.log(`Sende Chunk ${i + 1}/${chunks.length} mit ${chunk.length} Nutzern`);

        try {
          const response = await sendWebhookWithRetry(webhookUrl, chunkPayload, retryConfig);
          const responseText = await response.text();
          
          results.push({
            chunk: i + 1,
            success: true,
            status: response.status,
            response: responseText
          });
          
          console.log(`Chunk ${i + 1}/${chunks.length} erfolgreich gesendet`);
          
          // Kurze Pause zwischen Chunks um Server nicht zu überlasten
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
        } catch (error) {
          console.error(`Chunk ${i + 1}/${chunks.length} fehlgeschlagen:`, error);
          results.push({
            chunk: i + 1,
            success: false,
            error: error.message
          });
        }
      }

      const successfulChunks = results.filter(r => r.success).length;
      const failedChunks = results.filter(r => !r.success).length;

      return new Response(
        JSON.stringify({
          success: failedChunks === 0,
          message: `${successfulChunks}/${chunks.length} Chunks erfolgreich übertragen`,
          chunk_results: results,
          total_users_processed: requestData.usersData.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      // Normale Übertragung für kleinere Datenmengen
      console.log('Sende Gebäudedaten ohne Chunking');
      
      try {
        const response = await sendWebhookWithRetry(webhookUrl, webhookPayload, retryConfig);
        const responseText = await response.text();

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Gebäudedaten erfolgreich übertragen',
            status: response.status,
            statusText: response.statusText,
            response: responseText,
            users_count: requestData.usersData?.length || 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error('Webhook-Übertragung fehlgeschlagen:', error);
        
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Webhook-Übertragung fehlgeschlagen: ' + error.message,
            users_count: requestData.usersData?.length || 0
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Interner Serverfehler: ' + error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});