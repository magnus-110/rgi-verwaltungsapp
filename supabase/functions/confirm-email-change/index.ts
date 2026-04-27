import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const body = await req.json().catch(() => ({}))
    const token = (body?.token ?? '').toString().trim()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('email_change_requests')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (fetchErr || !request) {
      return new Response(JSON.stringify({ error: 'Ungültiger Link' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (request.used_at) {
      return new Response(JSON.stringify({ error: 'Dieser Link wurde bereits verwendet' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(request.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Dieser Link ist abgelaufen' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update auth user email
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      request.user_id,
      { email: request.new_email, email_confirm: true }
    )

    if (updateErr) {
      console.error('Auth update error:', updateErr)
      return new Response(
        JSON.stringify({ error: 'E-Mail konnte nicht geändert werden: ' + updateErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sync profiles.email
    await supabaseAdmin
      .from('profiles')
      .update({ email: request.new_email })
      .eq('user_id', request.user_id)

    // Mark token used
    await supabaseAdmin
      .from('email_change_requests')
      .update({ used_at: new Date().toISOString() })
      .eq('id', request.id)

    return new Response(
      JSON.stringify({ success: true, new_email: request.new_email }),
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
