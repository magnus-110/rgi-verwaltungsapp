import { createClient } from 'npm:@supabase/supabase-js@2.52.1'
import { firstValidEmail } from '../_shared/sanitize-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

async function setPasswordWithRetry(
  admin: any,
  userId: string,
): Promise<{ password: string; error: any | null }> {
  for (let i = 0; i < 3; i++) {
    const pw = generateFriendlyPassword()
    const { error } = await admin.auth.admin.updateUserById(userId, { password: pw })
    if (!error) return { password: pw, error: null }
    console.error(`updateUserById attempt ${i + 1} failed:`, error)
  }
  return { password: '', error: new Error('Konnte Passwort nach 3 Versuchen nicht setzen') }
}

async function sendToMakeWebhook(data: any) {
  const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL')
  if (!webhookUrl) {
    console.error('MAKE_WEBHOOK_URL not configured')
    return { success: false, error: 'Webhook URL not configured' }
  }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const responseText = await response.text()
    if (!response.ok) {
      console.error(`Webhook failed: ${response.status}`, responseText)
      return { success: false, error: `HTTP ${response.status}` }
    }
    console.log('Webhook sent successfully')
    return { success: true }
  } catch (error) {
    console.error('Webhook error:', error)
    return { success: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('user_id', user.id).single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { contact_id, building_id, management_mode, send_email = true, force_reset_password } = await req.json()
    if (!contact_id || !building_id || !management_mode) {
      return new Response(JSON.stringify({ error: 'Missing contact_id, building_id, or management_mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    // Safety: only rotate the password of an EXISTING auth user when the new
    // credentials will actually be sent out. Otherwise Supabase invalidates
    // refresh tokens and the user gets silently logged out (e.g. mid-vote in
    // an ETV) and locked out of their account.
    const shouldResetExistingPassword =
      typeof force_reset_password === 'boolean' ? force_reset_password : !!send_email

    // Get contact
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, user_id')
      .eq('id', contact_id)
      .single()
    if (contactError || !contact) {
      return new Response(JSON.stringify({ error: 'Contact not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get primary email
    const { data: emails } = await supabaseAdmin
      .from('contact_emails')
      .select('email, is_primary')
      .eq('contact_id', contact_id)
      .order('is_primary', { ascending: false })
    
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ error: 'Kontakt hat keine E-Mail-Adresse' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    // Sanitize: strip "(Name)", "<...>", split on comma/semicolon, validate format.
    // Try each stored row in order; pick the first valid address.
    let email: string | null = null
    const rawTried: string[] = []
    for (const row of emails) {
      rawTried.push(row.email)
      const v = firstValidEmail(row.email)
      if (v) { email = v; break }
    }
    if (!email) {
      return new Response(JSON.stringify({
        error: `Keine gültige E-Mail-Adresse für diesen Kontakt. Gespeicherte Werte: ${rawTried.join(' | ')}. Bitte im Kontakt bereinigen (eine Adresse pro Eintrag, ohne Klammern oder Kommata).`
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Rolle aus den TATSÄCHLICHEN Building-Assignments des Kontakts ableiten,
    // nicht stur aus dem management_mode der aktuellen Liegenschaft.
    // Wer irgendwo Eigentümer/Beirat ist, bekommt das WEG-Owner-Layout.
    const { data: allAssignments } = await supabaseAdmin
      .from('contact_building_assignments')
      .select('role_in_building')
      .eq('contact_id', contact_id)
    const isOwnerSomewhere = (allAssignments ?? []).some(
      (a: any) => a.role_in_building === 'eigentuemer' || a.role_in_building === 'beirat'
    )
    const role = isOwnerSomewhere ? 'weg_owner' : 'tenant'
    let authUserId = contact.user_id
    let isNewUser = false
    let password = ''

    if (authUserId) {
      // Existing user — only rotate password if credentials will be sent out.
      if (shouldResetExistingPassword) {
        const { password: pw, error: pwErr } = await setPasswordWithRetry(supabaseAdmin, authUserId)
        if (pwErr) {
          return new Response(JSON.stringify({ error: `Passwort konnte nicht gesetzt werden: ${pwErr.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        password = pw
      }
      await supabaseAdmin.from('profiles').update({
        force_password_change: false,
        terms_accepted_at: null,
        building_id: management_mode === 'rent' ? building_id : null,
        role,
      }).eq('user_id', authUserId)
    } else {
      // Check if auth user with this email exists.
      let existingUser: { id: string } | null = null
      const { data: profileMatch } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .ilike('email', email)
        .maybeSingle()
      if (profileMatch?.user_id) {
        existingUser = { id: profileMatch.user_id }
      } else {
        let page = 1
        while (!existingUser) {
          const { data: pageData, error: pageErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
          if (pageErr || !pageData?.users?.length) break
          const found = (pageData.users as any[]).find((u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase())
          if (found) { existingUser = { id: found.id }; break }
          if (pageData.users.length < 200) break
          page += 1
          if (page > 20) break
        }
      }
      if (existingUser) {
        authUserId = existingUser.id
        if (shouldResetExistingPassword) {
          const { password: pw, error: pwErr } = await setPasswordWithRetry(supabaseAdmin, authUserId)
          if (pwErr) {
            return new Response(JSON.stringify({ error: `Passwort konnte nicht gesetzt werden: ${pwErr.message}` }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
          password = pw
        }
        await supabaseAdmin.from('profiles').upsert({
          user_id: authUserId,
          email,
          first_name: contact.first_name,
          last_name: contact.last_name,
          role,
          building_id: management_mode === 'rent' ? building_id : null,
          force_password_change: false,
          terms_accepted_at: null,
        }, { onConflict: 'user_id' })
      } else {
        // Create new auth user — retry with fresh password if Supabase rejects (HIBP etc.)
        isNewUser = true
        let createdUserId: string | null = null
        let lastCreateError: any = null
        for (let i = 0; i < 3; i++) {
          const candidate = generateFriendlyPassword()
          const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: candidate,
            email_confirm: true,
            user_metadata: {
              first_name: contact.first_name,
              last_name: contact.last_name,
            }
          })
          if (!createError && newUserData?.user) {
            createdUserId = newUserData.user.id
            password = candidate
            break
          }
          lastCreateError = createError
          console.error(`createUser attempt ${i + 1} failed:`, createError)
        }
        if (!createdUserId) {
          return new Response(JSON.stringify({ error: lastCreateError?.message || 'Konnte Nutzer nicht anlegen' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        authUserId = createdUserId

        await supabaseAdmin.from('profiles').update({
          role,
          building_id: management_mode === 'rent' ? building_id : null,
          first_name: contact.first_name,
          last_name: contact.last_name,
        }).eq('user_id', authUserId)
      }

      await supabaseAdmin.from('contacts').update({ user_id: authUserId }).eq('id', contact_id)
    }

    // For rent mode: upsert tenant record
    if (management_mode === 'rent') {
      await supabaseAdmin.from('tenants').upsert({
        user_id: authUserId,
        building_id,
        email,
        first_name: contact.first_name,
        last_name: contact.last_name,
      }, { onConflict: 'user_id,building_id' })
    }

    // For WEG mode: upsert weg_owner_buildings record
    if (management_mode === 'weg') {
      await supabaseAdmin.from('weg_owner_buildings').upsert({
        user_id: authUserId,
        building_id,
      }, { onConflict: 'user_id,building_id' })
    }

    // Send webhook only if send_email is true
    if (send_email) {
      await sendToMakeWebhook({
        event: 'user_created',
        email,
        password,
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        management_mode,
        building_id,
        role,
        created_at: new Date().toISOString()
      })
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: authUserId,
      is_new_user: isNewUser,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
