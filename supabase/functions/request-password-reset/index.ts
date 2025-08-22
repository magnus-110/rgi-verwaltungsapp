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
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      console.error('Make.com webhook failed:', response.status, await response.text())
    } else {
      console.log('Make.com webhook sent successfully')
    }
  } catch (error) {
    console.error('Error sending to Make.com webhook:', error)
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

    // Check if user exists
    const { data: existingUser, error: userError } = await supabaseAdmin.auth.admin.getUserByEmail(email)
    
    if (userError || !existingUser.user) {
      return new Response(
        JSON.stringify({ error: 'Benutzer mit dieser E-Mail-Adresse nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile to determine management mode
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, phone, role, building_id')
      .eq('user_id', existingUser.user.id)
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
      existingUser.user.id,
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