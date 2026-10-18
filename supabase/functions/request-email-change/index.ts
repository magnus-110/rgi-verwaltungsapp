import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSystemMail } from '../_shared/system-mail.ts'
import { emailBestaetigen } from '../_shared/mail-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_BASE_URL = 'https://rgi-immobilien.app'

// Bestätigungs-Mail an die neue Adresse – verschickt die App selbst (früher Make.com).
async function sendToMakeWebhook(data: any) {
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const mail = emailBestaetigen({ firstName: data.first_name, lastName: data.last_name, newEmail: data.new_email, link: data.confirmation_url })
  const res = await sendSystemMail(admin, { kind: 'email_bestaetigen', to: data.new_email, subject: mail.subject, html: mail.html, refType: 'user' })
  return res.ok ? { success: true } : { success: false, error: res.error }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify user from JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Ungültige Sitzung' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const newEmailRaw = (body?.new_email ?? '').toString().trim().toLowerCase()

    if (!newEmailRaw) {
      return new Response(JSON.stringify({ error: 'Neue E-Mail fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw)) {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (newEmailRaw === (user.email ?? '').toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Das ist bereits Ihre aktuelle Login-E-Mail' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if email already in use
    const { data: list } = await supabaseAdmin.auth.admin.listUsers()
    const taken = (list?.users as any[] | undefined)?.some(
      (u) => (u.email ?? '').toLowerCase() === newEmailRaw && u.id !== user.id
    )
    if (taken) {
      return new Response(JSON.stringify({ error: 'Diese E-Mail-Adresse wird bereits verwendet' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate token + 24h expiry
    const changeToken = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const { error: insertErr } = await supabaseAdmin
      .from('email_change_requests')
      .insert({
        user_id: user.id,
        old_email: user.email ?? '',
        new_email: newEmailRaw,
        token: changeToken,
        expires_at: expiresAt.toISOString(),
      })

    if (insertErr) {
      console.error('Insert error:', insertErr)
      return new Response(JSON.stringify({ error: 'Anfrage konnte nicht gespeichert werden' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get profile for personalization
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .single()

    const confirmationUrl = `${APP_BASE_URL}/confirm-email-change/${changeToken}`

    await sendToMakeWebhook({
      event: 'email_change_request',
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      old_email: user.email ?? '',
      new_email: newEmailRaw,
      confirmation_url: confirmationUrl,
      expires_at: expiresAt.toISOString(),
      requested_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Bestätigungs-E-Mail wurde versendet' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: 'Interner Serverfehler' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
