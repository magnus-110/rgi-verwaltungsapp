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

    // Clean up ALL references to this user before deleting

    // 1. todo_comments - reassign to requesting admin
    const { error: commentsError } = await supabaseAdmin
      .from('todo_comments')
      .update({ created_by: user.id })
      .eq('created_by', userId);
    if (commentsError) console.log('Note: todo_comments:', commentsError.message);

    // 2. todo_subtasks - created_by and completed_by
    const { error: subtasksCreatedError } = await supabaseAdmin
      .from('todo_subtasks')
      .update({ created_by: user.id })
      .eq('created_by', userId);
    if (subtasksCreatedError) console.log('Note: todo_subtasks created_by:', subtasksCreatedError.message);

    const { error: subtasksCompletedError } = await supabaseAdmin
      .from('todo_subtasks')
      .update({ completed_by: null })
      .eq('completed_by', userId);
    if (subtasksCompletedError) console.log('Note: todo_subtasks completed_by:', subtasksCompletedError.message);

    // 3. calendar_events - reassign to requesting admin
    const { error: calendarEventsError } = await supabaseAdmin
      .from('calendar_events')
      .update({ created_by: user.id })
      .eq('created_by', userId);
    if (calendarEventsError) console.log('Note: calendar_events:', calendarEventsError.message);

    // 4. todo_categories - set created_by to null
    const { error: categoryError } = await supabaseAdmin
      .from('todo_categories')
      .update({ created_by: null })
      .eq('created_by', userId);
    if (categoryError) console.log('Note: todo_categories:', categoryError.message);

    // 5. todos - reassign created_by to requesting admin
    const { error: todosCreatedError } = await supabaseAdmin
      .from('todos')
      .update({ created_by: user.id })
      .eq('created_by', userId);
    if (todosCreatedError) console.log('Note: todos created_by:', todosCreatedError.message);

    // 6. todos - set assigned_to to null
    const { error: todosAssignedError } = await supabaseAdmin
      .from('todos')
      .update({ assigned_to: null })
      .eq('assigned_to', userId);
    if (todosAssignedError) console.log('Note: todos assigned_to:', todosAssignedError.message);

    // 7. Delete from junction tables
    const { error: todoAssigneesError } = await supabaseAdmin
      .from('todo_assignees')
      .delete()
      .eq('user_id', userId);
    if (todoAssigneesError) console.log('Note: todo_assignees:', todoAssigneesError.message);

    const { error: calendarAssigneesError } = await supabaseAdmin
      .from('calendar_event_assignees')
      .delete()
      .eq('user_id', userId);
    if (calendarAssigneesError) console.log('Note: calendar_event_assignees:', calendarAssigneesError.message);

    const { error: buildingManagersError } = await supabaseAdmin
      .from('building_managers')
      .delete()
      .eq('user_id', userId);
    if (buildingManagersError) console.log('Note: building_managers:', buildingManagersError.message);

    // 8. Delete from weg_owner_buildings
    const { error: wegOwnerBuildingsError } = await supabaseAdmin
      .from('weg_owner_buildings')
      .delete()
      .eq('user_id', userId);
    if (wegOwnerBuildingsError) console.log('Note: weg_owner_buildings:', wegOwnerBuildingsError.message);

    // 9. Delete from weg_owners
    const { error: wegOwnersError } = await supabaseAdmin
      .from('weg_owners')
      .delete()
      .eq('user_id', userId);
    if (wegOwnersError) console.log('Note: weg_owners:', wegOwnersError.message);

    // 10. Delete from tenants
    const { error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('user_id', userId);
    if (tenantsError) console.log('Note: tenants:', tenantsError.message);

    // 11. Delete chatbot sessions and messages
    const { error: chatMessagesError } = await supabaseAdmin
      .from('chatbot_messages')
      .delete()
      .eq('user_id', userId);
    if (chatMessagesError) console.log('Note: chatbot_messages:', chatMessagesError.message);

    const { error: chatSessionsError } = await supabaseAdmin
      .from('chatbot_sessions')
      .delete()
      .eq('user_id', userId);
    if (chatSessionsError) console.log('Note: chatbot_sessions:', chatSessionsError.message);

    // 12. Delete document chat sessions
    const { error: docChatSessionsError } = await supabaseAdmin
      .from('document_chat_sessions')
      .delete()
      .eq('user_id', userId);
    if (docChatSessionsError) console.log('Note: document_chat_sessions:', docChatSessionsError.message);

    // 13. Delete prompt favorites
    const { error: promptFavoritesError } = await supabaseAdmin
      .from('prompt_favorites')
      .delete()
      .eq('user_id', userId);
    if (promptFavoritesError) console.log('Note: prompt_favorites:', promptFavoritesError.message);

    // Finally delete profile
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      return new Response(
        JSON.stringify({ error: `Profil konnte nicht gelöscht werden: ${profileDeleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Profile deleted, now deleting auth user');

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
