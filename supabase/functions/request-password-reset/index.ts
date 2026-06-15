import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResetRequest {
  email: string
}

// Friendly password generator: Word-Word-Word-NN (avoids HIBP/leaked password rejection)
const WORDS = [
  "Apfel","Birne","Brunnen","Berg","Wolke","Wald","Wiese","Sonne","Mond",
  "Feder","Garten","Hafen","Insel","Kanal","Krone","Lampe","Leuchte",
  "Magnet","Anker","Pfeil","Pinsel","Quelle","Regen","Stern","Tiger",
  "Turm","Ufer","Vogel","Wagen","Zeder","Zelt","Bruecke","Fluss",
]
function generateFriendlyPassword(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
  const num = Math.floor(Math.random() * 90) + 10
  return `${pick()}-${pick()}-${pick()}-${num}`
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

    const normalizedEmail = email.trim().toLowerCase()

    // 1) Try profiles table first (fast path)
    const { data: profileMatch, error: profileLookupErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (profileLookupErr) {
      console.error('Profile lookup error:', profileLookupErr)
    }

    let userId: string | null = profileMatch?.user_id ?? null

    // 2) Fallback: search auth.users via paginated listUsers (in case profile email diverges)
    if (!userId) {
      try {
        for (let page = 1; page <= 20; page++) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
          if (listErr) { console.error('listUsers error:', listErr); break }
          const found = list?.users?.find((u: any) => (u.email ?? '').toLowerCase() === normalizedEmail)
          if (found) { userId = found.id; break }
          if (!list?.users || list.users.length < 200) break
        }
      } catch (e) {
        console.error('Auth fallback error:', e)
      }
    }

    if (!userId) {
      console.log('No user found for email:', normalizedEmail)
      return new Response(
        JSON.stringify({ error: 'Es wurde kein Account mit dieser E-Mail-Adresse gefunden. Bitte prüfen Sie die Schreibweise.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const existingUser = { id: userId }

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