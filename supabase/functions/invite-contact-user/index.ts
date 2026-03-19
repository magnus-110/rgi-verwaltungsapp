import { createClient } from 'npm:@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateNumericPassword(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
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

    const { contact_id, building_id, management_mode } = await req.json()
    if (!contact_id || !building_id || !management_mode) {
      return new Response(JSON.stringify({ error: 'Missing contact_id, building_id, or management_mode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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
    const email = emails[0].email

    const role = management_mode === 'weg' ? 'weg_owner' : 'tenant'
    let authUserId = contact.user_id
    let isNewUser = false
    const password = generateNumericPassword()

    if (authUserId) {
      // User already exists - update password and reset terms
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password })
      await supabaseAdmin.from('profiles').update({
        force_password_change: false,
        terms_accepted_at: null,
        building_id: management_mode === 'rent' ? building_id : null,
        role,
      }).eq('user_id', authUserId)
    } else {
      // Check if auth user with this email exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find(u => u.email === email)

      if (existingUser) {
        authUserId = existingUser.id
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { password })
        // Update profile
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
        // Create new auth user
        isNewUser = true
        const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: contact.first_name,
            last_name: contact.last_name,
          }
        })
        if (createError) {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        authUserId = newUserData.user!.id

        // Profile is auto-created by trigger, but update role + building
        await supabaseAdmin.from('profiles').update({
          role,
          building_id: management_mode === 'rent' ? building_id : null,
          first_name: contact.first_name,
          last_name: contact.last_name,
        }).eq('user_id', authUserId)
      }

      // Link user_id to contact
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

    // Send webhook
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
