import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResetRequest {
  email: string
}

// Generate 6-digit numeric password
function generateNumericPassword(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send data to Make.com webhook
async function sendToMakeWebhook(data: any) {
  const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')
  if (!webhookUrl) {
    console.error('MAKE_WEBHOOK_URL not configured')
    return { success: false, error: 'Webhook URL not configured' }
  }

  try {
    console.log('Sending webhook to:', webhookUrl.substring(0, 50) + '...')
    console.log('Webhook payload:', JSON.stringify(data, null, 2))
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    
    const responseText = await response.text()
    
    if (!response.ok) {
      console.error(`Make.com webhook failed: ${response.status} ${response.statusText}`)
      console.error('Response:', responseText)
      return { success: false, error: `HTTP ${response.status}: ${responseText}` }
    } else {
      console.log('Make.com webhook sent successfully:', response.status)
      console.log('Response:', responseText)
      return { success: true, response: responseText }
    }
  } catch (error) {
    console.error('Error sending to Make.com webhook:', error)
    return { success: false, error: error.message }
  }
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

    const { email }: ResetRequest = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email ist erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find user via profiles table (listUsers() is paginated to 50 — unreliable for >50 users)
    const { data: profileMatch, error: profileLookupErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email')
      .ilike('email', email.trim())
      .maybeSingle()

    if (profileLookupErr) {
      console.error('Profile lookup error:', profileLookupErr)
      return new Response(
        JSON.stringify({ error: 'Fehler beim Abrufen der Benutzerdaten' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profileMatch?.user_id) {
      return new Response(
        JSON.stringify({ error: 'Benutzer mit dieser E-Mail-Adresse nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const existingUser = { id: profileMatch.user_id }

    // Get user profile to determine management mode
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, phone, role, building_id')
      .eq('user_id', existingUser.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Benutzerprofil nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate new password
    const newPassword = generateNumericPassword()

    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      existingUser.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Fehler beim Zurücksetzen des Passworts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine management mode based on role
    const managementMode = profile.role === 'weg_owner' ? 'weg' : 'rent'

    // Send data to Make.com webhook
    await sendToMakeWebhook({
      event: 'password_reset',
      email: email,
      password: newPassword,
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      management_mode: managementMode,
      building_id: profile.building_id,
      reset_at: new Date().toISOString()
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Neues Passwort wurde generiert und per E-Mail versendet'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})