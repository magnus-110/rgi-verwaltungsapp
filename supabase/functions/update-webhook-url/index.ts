import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateRequest {
  webhookUrl: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify that the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { webhookUrl }: UpdateRequest = await req.json()

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'Webhook URL ist erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate URL format
    try {
      new URL(webhookUrl)
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Ungültige URL Format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Note: In a real environment, you would update the secret through the Supabase CLI or dashboard
    // This is a placeholder that logs the action
    console.log('Webhook URL update requested:', webhookUrl)
    console.log('User requesting update:', user.email)
    
    // Retry-Konfiguration für URL-Test
    const retryConfig = {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 5000
    }

    async function testWebhookWithRetry(url: string, payload: any): Promise<Response> {
      let lastError: Error;
      
      for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          console.log(`Webhook URL Test - Versuch ${attempt + 1}/${retryConfig.maxRetries + 1}`);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
          });
          
          return response;
          
        } catch (error) {
          lastError = error as Error;
          console.error(`URL Test Versuch ${attempt + 1} fehlgeschlagen:`, error);
          
          if (attempt === retryConfig.maxRetries) {
            throw lastError;
          }
          
          const delay = Math.min(
            retryConfig.baseDelayMs * Math.pow(2, attempt),
            retryConfig.maxDelayMs
          );
          console.log(`Warte ${delay}ms vor nächstem Versuch`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    }

    // Test the new webhook URL mit Retry-Logik
    try {
      const testResponse = await testWebhookWithRetry(webhookUrl, {
        event: 'webhook_url_test',
        message: 'Test-Nachricht zur Überprüfung der Webhook-URL',
        timestamp: new Date().toISOString(),
        requested_by: user.email
      });

      const responseText = await testResponse.text()
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Webhook URL wurde getestet',
          testResult: {
            status: testResponse.status,
            statusText: testResponse.statusText,
            response: responseText
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (testError) {
      console.error('Webhook test failed after all retries:', testError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Webhook URL ist nicht erreichbar nach mehreren Versuchen',
          details: testError.message
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})