import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Create regular client to verify the requesting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the requesting user is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      console.error('Profile error or not admin:', profileError);
      return new Response(
        JSON.stringify({ error: 'Only admins can delete users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the user ID to delete from request body
    const { userId } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: 'Sie können sich nicht selbst löschen' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting user:', userId);

    // First, reassign or nullify records that reference this user
    // Update todo_categories to remove created_by reference
    const { error: categoryError } = await supabaseAdmin
      .from('todo_categories')
      .update({ created_by: null })
      .eq('created_by', userId);

    if (categoryError) {
      console.log('Note: Could not update todo_categories:', categoryError.message);
    }

    // Update todos created_by to null or reassign
    const { error: todosCreatedError } = await supabaseAdmin
      .from('todos')
      .update({ created_by: user.id }) // Reassign to requesting admin
      .eq('created_by', userId);

    if (todosCreatedError) {
      console.log('Note: Could not reassign todos:', todosCreatedError.message);
    }

    // Update todos assigned_to to null
    const { error: todosAssignedError } = await supabaseAdmin
      .from('todos')
      .update({ assigned_to: null })
      .eq('assigned_to', userId);

    if (todosAssignedError) {
      console.log('Note: Could not update todos assigned_to:', todosAssignedError.message);
    }

    // Delete from todo_assignees
    const { error: todoAssigneesError } = await supabaseAdmin
      .from('todo_assignees')
      .delete()
      .eq('user_id', userId);

    if (todoAssigneesError) {
      console.log('Note: Could not delete todo_assignees:', todoAssigneesError.message);
    }

    // Delete from calendar_event_assignees
    const { error: calendarAssigneesError } = await supabaseAdmin
      .from('calendar_event_assignees')
      .delete()
      .eq('user_id', userId);

    if (calendarAssigneesError) {
      console.log('Note: Could not delete calendar_event_assignees:', calendarAssigneesError.message);
    }

    // Delete from building_managers
    const { error: buildingManagersError } = await supabaseAdmin
      .from('building_managers')
      .delete()
      .eq('user_id', userId);

    if (buildingManagersError) {
      console.log('Note: Could not delete building_managers:', buildingManagersError.message);
    }

    // Delete from profiles
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      // Continue anyway, the auth user deletion is more important
    }

    // Delete the auth user using admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return new Response(
        JSON.stringify({ error: `Fehler beim Löschen: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User deleted successfully:', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Benutzer erfolgreich gelöscht' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: `Unerwarteter Fehler: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
