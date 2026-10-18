import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSystemMail } from '../_shared/system-mail.ts'
import { passwortLink } from '../_shared/mail-templates.ts'

const APP_URL = 'https://rgi-immobilien.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResetRequest {
  email: string
}

// Generic response for ALL outcomes -> prevents user enumeration.
function genericOk(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir einen Link zum Festlegen eines neuen Passworts geschickt.'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
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
      // Do NOT reveal that the account is unknown (prevents user enumeration).
      return genericOk(corsHeaders)
    }

    const existingUser = { id: userId }

    // Get user profile to determine management mode
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, phone, role, building_id')
      .eq('user_id', existingUser.id)
      .single()

    if (profileError || !profile) {
      // Generic response - do not disclose account state.
      return genericOk(corsHeaders)
    }

    // Kein neues Passwort mehr per Mail: Wir schicken einen Link, über den die
    // Person selbst ein neues Passwort festlegt. Bis dahin gilt das alte weiter –
    // so kann niemand ein fremdes Konto durch „Passwort vergessen“ sperren.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
    })
    const tokenHash = (linkData as any)?.properties?.hashed_token
    if (linkError || !tokenHash) {
      console.error('Recovery link failed for user:', existingUser.id, linkError?.message)
      return genericOk(corsHeaders)
    }
    const link = `${APP_URL}/change-password?type=recovery&token_hash=${encodeURIComponent(tokenHash)}`
    const mail = passwortLink({ firstName: profile.first_name, lastName: profile.last_name, link })
    await sendSystemMail(supabaseAdmin, {
      kind: 'passwort_link',
      to: normalizedEmail,
      subject: mail.subject,
      html: mail.html,
      refType: 'user',
      refId: existingUser.id,
    })

    return genericOk(corsHeaders)

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})