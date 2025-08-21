import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserData {
  email: string
  password: string
  first_name: string
  last_name: string
  phone: string
  building_id: string
  management_mode: 'weg' | 'rent'
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with service role key for admin operations
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

    // Create regular Supabase client to verify admin privileges
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Set the auth token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
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

    const userData: UserData = await req.json()

    // Create user with admin client (bypasses RLS)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        first_name: userData.first_name,
        last_name: userData.last_name,
      }
    })

    if (createError) {
      console.error('User creation error:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update profile with correct role and building assignment
    const role = userData.management_mode === 'weg' ? 'weg_owner' : 'tenant'
    const profileUpdate: any = {
      first_name: userData.first_name,
      last_name: userData.last_name,
      phone: userData.phone,
      role: role,
      force_password_change: true
    }

    // For tenants, also set building_id in profile
    if (userData.management_mode === 'rent') {
      profileUpdate.building_id = userData.building_id
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('user_id', newUser.user.id)

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError)
    }

    // Create specific user type record
    if (userData.management_mode === 'weg') {
      // Create WEG owner entry
      const { error: wegOwnerError } = await supabaseAdmin
        .from('weg_owners')
        .insert({
          user_id: newUser.user.id,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
        })

      if (wegOwnerError) {
        console.error('WEG owner creation error:', wegOwnerError)
      }

      // Create building assignment
      const { error: assignmentError } = await supabaseAdmin
        .from('weg_owner_buildings')
        .insert({
          user_id: newUser.user.id,
          building_id: userData.building_id
        })

      if (assignmentError) {
        console.error('Building assignment error:', assignmentError)
      }
    } else {
      // Create tenant entry
      const { error: tenantError } = await supabaseAdmin
        .from('tenants')
        .insert({
          user_id: newUser.user.id,
          building_id: userData.building_id,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
        })

      if (tenantError) {
        console.error('Tenant creation error:', tenantError)
        return new Response(
          JSON.stringify({ error: 'Failed to create tenant record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          role: role
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})