import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const testPayload = await req.json()

    // Get webhook URL from environment
    const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'MAKE_WEBHOOK_URL ist nicht konfiguriert' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send test webhook
    try {
      console.log('Sending test webhook to:', webhookUrl.substring(0, 50) + '...')
      console.log('Test payload:', JSON.stringify(testPayload, null, 2))
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...testPayload,
          test_mode: true,
          tested_by: user.email,
          test_timestamp: new Date().toISOString()
        })
      })
      
      const responseText = await response.text()
      
      if (!response.ok) {
        console.error(`Webhook test failed: ${response.status} ${response.statusText}`)
        console.error('Response:', responseText)
        return new Response(
          JSON.stringify({
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            response: responseText
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        console.log('Webhook test successful:', response.status)
        console.log('Response:', responseText)
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
      }
    } catch (error) {
      console.error('Webhook test error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Verbindungsfehler: ' + error.message
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