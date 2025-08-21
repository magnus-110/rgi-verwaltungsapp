import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadData {
  'E-Mail': string;
  'Vorname'?: string;
  'Nachname'?: string;
  'Telefon'?: string;
}

interface RequestBody {
  data: UploadData[];
  buildingId: string;
  managementMode: 'weg' | 'rent';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: requestData, buildingId, managementMode }: RequestBody = await req.json()
    
    console.log(`Processing bulk upload for building ${buildingId}, mode: ${managementMode}`)
    console.log(`Processing ${requestData.length} records`)

    let created = 0;
    let updated = 0;
    let processed = 0;
    const errors: string[] = [];

    // Get current user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header missing')
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      throw new Error('Authentication failed')
    }

    // Check if user is admin
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required')
    }

    // Verify building exists
    const { data: building, error: buildingError } = await supabaseClient
      .from('buildings')
      .select('id, name')
      .eq('id', buildingId)
      .single()

    if (buildingError || !building) {
      throw new Error('Building not found')
    }

    for (const row of requestData) {
      processed++;
      
      try {
        const email = row['E-Mail']?.toLowerCase().trim();
        if (!email) {
          errors.push(`Row ${processed}: Email is required`);
          continue;
        }

        // Check if user already exists in auth
        const { data: existingAuthUser } = await supabaseClient.auth.admin.listUsers()
        const authUser = existingAuthUser.users.find(u => u.email === email)

        let userId: string;
        let isNewUser = false;

        if (authUser) {
          userId = authUser.id;
          console.log(`Found existing auth user for ${email}`);
        } else {
          // Create new auth user with standard password
          const standardPassword = "RGI-2025";
          
          const { data: newAuthUser, error: createError } = await supabaseClient.auth.admin.createUser({
            email: email,
            password: standardPassword,
            email_confirm: true
          })

          if (createError) {
            errors.push(`Row ${processed}: Failed to create auth user - ${createError.message}`);
            continue;
          }

          userId = newAuthUser.user.id;
          isNewUser = true;
          created++;
          console.log(`Created new auth user for ${email} with standard password`);
        }

        // Update or create profile
        const profileData = {
          user_id: userId,
          email: email,
          first_name: row['Vorname']?.trim() || null,
          last_name: row['Nachname']?.trim() || null,
          phone: row['Telefon']?.trim() || null,
          role: managementMode === 'weg' ? 'weg_owner' : 'tenant',
          force_password_change: isNewUser,
          building_id: managementMode === 'rent' ? buildingId : null
        }

        const { error: profileError } = await supabaseClient
          .from('profiles')
          .upsert(profileData, { onConflict: 'user_id' })

        if (profileError) {
          errors.push(`Row ${processed}: Failed to update profile - ${profileError.message}`);
          continue;
        }

        // Handle role-specific data
        if (managementMode === 'weg') {
          // Create or update WEG owner
          const wegOwnerData = {
            user_id: userId,
            email: email,
            first_name: row['Vorname']?.trim() || null,
            last_name: row['Nachname']?.trim() || null,
            phone: row['Telefon']?.trim() || null
          }

          const { error: wegOwnerError } = await supabaseClient
            .from('weg_owners')
            .upsert(wegOwnerData, { onConflict: 'user_id' })

          if (wegOwnerError) {
            console.log(`Warning: Failed to update weg_owner for ${email} - ${wegOwnerError.message}`);
          }

          // Create building assignment
          const { error: assignmentError } = await supabaseClient
            .from('weg_owner_buildings')
            .upsert({
              user_id: userId,
              building_id: buildingId
            }, { onConflict: 'user_id,building_id' })

          if (assignmentError) {
            errors.push(`Row ${processed}: Failed to assign building - ${assignmentError.message}`);
            continue;
          }

        } else {
          // Create or update tenant
          const tenantData = {
            user_id: userId,
            building_id: buildingId,
            email: email,
            first_name: row['Vorname']?.trim() || null,
            last_name: row['Nachname']?.trim() || null,
            phone: row['Telefon']?.trim() || null
          }

          const { error: tenantError } = await supabaseClient
            .from('tenants')
            .upsert(tenantData, { onConflict: 'user_id,building_id' })

          if (tenantError) {
            errors.push(`Row ${processed}: Failed to update tenant - ${tenantError.message}`);
            continue;
          }
        }

        if (!isNewUser) {
          updated++;
        }

        console.log(`Successfully processed ${email} (${isNewUser ? 'created' : 'updated'})`);

      } catch (error) {
        console.error(`Error processing row ${processed}:`, error);
        errors.push(`Row ${processed}: ${error.message}`);
      }
    }

    const result = {
      success: errors.length === 0,
      processed,
      created,
      updated,
      errors
    };

    console.log('Bulk upload completed:', result);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Bulk upload error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        processed: 0,
        created: 0,
        updated: 0,
        errors: [error.message]
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})

function generateSecurePassword(): string {
  // This function is no longer used, keeping for compatibility
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}