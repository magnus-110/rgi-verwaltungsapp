import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserData {
  email: string
  first_name: string
  last_name: string
  phone?: string
  building_id?: string
  management_mode?: 'weg' | 'rent'
  role?: 'admin' | 'tenant' | 'weg_owner' | 'employee'
  password?: string
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

    // Use admin client to verify user privileges
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
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
    console.log('Received userData:', JSON.stringify(userData, null, 2))

    // Use provided password or generate 6-digit numeric password
    const password = userData.password || generateNumericPassword()

    // Try to create user with admin client (bypasses RLS)
    let newUser;
    let userAlreadyExists = false;
    
    const { data: createUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        first_name: userData.first_name,
        last_name: userData.last_name,
      }
    })

    if (createError) {
      console.log('User creation error:', createError)
      
      // Check if user already exists
      if (createError.message?.includes('already been registered') || createError.code === 'email_exists') {
        console.log('User already exists, checking if we can update their role to admin')
        userAlreadyExists = true;
        
        // Try to get the existing user by email
        const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        if (listError) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Benutzer existiert bereits, aber konnte nicht gefunden werden',
              details: listError.message 
            }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        
        const existingUser = existingUsers.users.find(user => user.email === userData.email)
        if (!existingUser) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Benutzer existiert bereits, aber konnte nicht gefunden werden' 
            }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        
        // Update the password of the existing auth user
        const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password: password }
        )
        if (updatePasswordError) {
          console.error('Error updating password for existing user:', updatePasswordError)
        } else {
          console.log('Password updated for existing user:', existingUser.id)
        }

        newUser = { user: existingUser }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: createError.message || 'Fehler beim Erstellen des Benutzers' 
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    } else {
      newUser = createUserData;
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine role based on input
    let role: string
    if (userData.role === 'admin') {
      role = 'admin'
    } else if (userData.role === 'employee') {
      role = 'employee'
    } else if (userData.management_mode === 'weg') {
      role = 'weg_owner'
    } else {
      role = 'tenant'
    }
    
    const profileUpdate: any = {
      user_id: newUser.user.id,  // Essential for upsert
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
      phone: userData.phone,
      role: role,
      force_password_change: false,
      terms_accepted_at: null  // Reset so AGB dialog appears again for re-created users
    }

    // For tenants, also set building_id in profile
    if (userData.management_mode === 'rent' && userData.building_id) {
      profileUpdate.building_id = userData.building_id
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileUpdate, { onConflict: 'user_id' })

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError)
    }

    // Create specific user type record (not needed for admins or employees)
    if (userData.role !== 'admin' && userData.role !== 'employee') {
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

        // Create building assignment if building_id is provided
        if (userData.building_id) {
          const { error: assignmentError } = await supabaseAdmin
            .from('weg_owner_buildings')
            .insert({
              user_id: newUser.user.id,
              building_id: userData.building_id
            })

          if (assignmentError) {
            console.error('Building assignment error:', assignmentError)
          }
        }
      } else if (userData.management_mode === 'rent' && userData.building_id) {
        // Create tenant entry only if building_id is provided
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
    }

    // Send data to Make.com webhook
    await sendToMakeWebhook({
      event: 'user_created',
      email: userData.email,
      password: password,
      first_name: userData.first_name,
      last_name: userData.last_name,
      phone: userData.phone || '',
      management_mode: userData.management_mode || (userData.role === 'admin' ? 'admin' : 'rent'),
      building_id: userData.building_id || '',
      role: role,
      created_at: new Date().toISOString()
    })

    const successMessage = userAlreadyExists 
      ? `Admin-Rolle wurde erfolgreich zugewiesen (Benutzer existierte bereits)`
      : `Admin wurde erfolgreich erstellt`;

    return new Response(
      JSON.stringify({
        success: true,
        message: successMessage,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          role: role
        },
        userAlreadyExists
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