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

    // Send test webhook
    console.log('Sending test webhook to:', webhookUrl.substring(0, 50) + '...')
    
    const webhookPayload = {
      ...testPayload,
      test_mode: true,
      tested_by: user.email,
      test_timestamp: new Date().toISOString()
    }
    
    console.log('Webhook payload:', JSON.stringify(webhookPayload, null, 2))
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload)
      })
      
      console.log('Webhook response status:', response.status)
      const responseText = await response.text()
      console.log('Webhook response body:', responseText)
      
      if (!response.ok) {
        console.error(`Webhook test failed: ${response.status} ${response.statusText}`)
        return new Response(
          JSON.stringify({
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            response: responseText
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
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
      }
    } catch (webhookError) {
      console.error('Webhook connection error:', webhookError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Verbindungsfehler: ' + webhookError.message
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