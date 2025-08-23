import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('Test webhook function called, method:', req.method)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting webhook test function...')
    
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

    console.log('Supabase client created')

    // Verify that the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)
    
    if (!authHeader) {
      console.log('No authorization header found')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing authorization header' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('Extracting user from token...')
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    console.log('User extraction result:', { user: !!user, error: !!authError })

    if (authError) {
      console.log('Auth error:', authError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authentication failed: ' + authError.message 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!user) {
      console.log('No user found')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No user found' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User found:', user.email)

    // Check if user is admin
    console.log('Checking user profile...')
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log('Profile check result:', { profile, profileError })

    if (profileError) {
      console.log('Profile error:', profileError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Profile fetch failed: ' + profileError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile?.role !== 'admin') {
      console.log('User is not admin, role:', profile?.role)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Access denied. Admin privileges required.' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Admin access confirmed')

    const testPayload = await req.json()
    console.log('Test payload received:', testPayload)

    // Get webhook URL from environment
    const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')
    console.log('Webhook URL configured:', !!webhookUrl)
    
    if (!webhookUrl) {
      console.log('MAKE_WEBHOOK_URL not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'MAKE_WEBHOOK_URL ist nicht konfiguriert' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Retry-Konfiguration
    const retryConfig = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504]
    }

    // Retry-Utility-Funktion
    async function retryWebhook<T>(fn: () => Promise<T>, context: string): Promise<T> {
      let lastError: Error;
      
      for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          console.log(`${context} - Versuch ${attempt + 1}/${retryConfig.maxRetries + 1}`);
          return await fn();
        } catch (error) {
          lastError = error as Error;
          console.error(`${context} - Versuch ${attempt + 1} fehlgeschlagen:`, error);
          
          if (attempt === retryConfig.maxRetries) {
            throw lastError;
          }
          
          const delay = Math.min(
            retryConfig.baseDelayMs * Math.pow(2, attempt),
            retryConfig.maxDelayMs
          );
          console.log(`${context} - Warte ${delay}ms vor nächstem Versuch`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    }

    // Send test webhook mit Retry-Logik
    console.log('Sending test webhook to:', webhookUrl.substring(0, 50) + '...')
    
    const webhookPayload = {
      ...testPayload,
      test_mode: true,
      tested_by: user.email,
      test_timestamp: new Date().toISOString()
    }
    
    console.log('Webhook payload:', JSON.stringify(webhookPayload, null, 2))
    
    try {
      const response = await retryWebhook(async () => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload)
        })
        
        if (!response.ok) {
          const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
          const error = new Error(errorMsg);
          (error as any).status = response.status;
          throw error;
        }
        
        return response;
      }, 'Webhook-Test');
      
      console.log('Webhook response status:', response.status)
      const responseText = await response.text()
      console.log('Webhook response body:', responseText)
      
      console.log('Webhook test successful!')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Webhook test erfolgreich',
          status: response.status,
          statusText: response.statusText,
          response: responseText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } catch (webhookError) {
      console.error('Webhook test failed after all retries:', webhookError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Webhook-Test fehlgeschlagen: ' + webhookError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Interner Serverfehler: ' + error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})