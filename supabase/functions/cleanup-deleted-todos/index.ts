import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Delete todos where deleted_at is more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // First delete related records
    const { data: todosToDelete } = await supabase
      .from("todos")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", thirtyDaysAgo.toISOString());

    if (!todosToDelete || todosToDelete.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const todoIds = todosToDelete.map((t) => t.id);

    // Delete related data first
    await Promise.all([
      supabase.from("todo_comments").delete().in("todo_id", todoIds),
      supabase.from("todo_subtasks").delete().in("todo_id", todoIds),
      supabase.from("todo_assignees").delete().in("todo_id", todoIds),
      supabase.from("todo_buildings").delete().in("todo_id", todoIds),
    ]);

    // Delete the todos themselves
    const { error } = await supabase
      .from("todos")
      .delete()
      .in("id", todoIds);

    if (error) throw error;

    console.log(`Permanently deleted ${todoIds.length} todos`);

    return new Response(
      JSON.stringify({ deleted: todoIds.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
