// Cron-driven notifier: scans for new emails / due todos / upcoming events
// and dispatches push notifications via send-push. Dedup via notification_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function dispatch(args: {
  user_ids: string[];
  dedup_key: string;
  type: "email" | "todo" | "calendar";
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}) {
  if (!args.user_ids.length) return;
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  });
}

async function getInboxFolderId(): Promise<string | null> {
  const { data } = await supabase
    .from("email_folders")
    .select("id")
    .eq("name", "Eingang")
    .eq("is_system", true)
    .maybeSingle();
  return data?.id ?? null;
}

async function getFallbackInternalUserIds(): Promise<string[]> {
  // All admins + employees with email_enabled (or no preference row -> default true)
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "employee"]);
  const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id).filter(Boolean)));
  if (!ids.length) return [];
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, email_enabled")
    .in("user_id", ids);
  const disabled = new Set(
    (prefs ?? []).filter((p: any) => p.email_enabled === false).map((p: any) => p.user_id),
  );
  return ids.filter((id) => !disabled.has(id));
}

async function notifyEmails() {
  const inboxId = await getInboxFolderId();
  if (!inboxId) {
    console.warn("notify-pending: no Eingang folder found");
    return;
  }
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: emails } = await supabase
    .from("emails")
    .select("id,subject,from_name,from_address,account_id,created_at,is_draft,folder_id")
    .gte("created_at", since)
    .eq("is_draft", false)
    .eq("folder_id", inboxId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!emails?.length) return;

  // Cache fallback users once per run
  let fallbackUsers: string[] | null = null;

  for (const mail of emails) {
    if (!mail.account_id) continue;
    const { data: subs } = await supabase
      .from("email_account_subscriptions")
      .select("user_id")
      .eq("account_id", mail.account_id);
    let user_ids = subs?.map((s) => s.user_id).filter(Boolean) ?? [];
    if (!user_ids.length) {
      if (fallbackUsers === null) fallbackUsers = await getFallbackInternalUserIds();
      user_ids = fallbackUsers;
    }
    if (!user_ids.length) continue;

    const sender = mail.from_name || mail.from_address || "Unbekannt";
    await dispatch({
      user_ids,
      dedup_key: `email:${mail.id}`,
      type: "email",
      title: `📧 ${sender}`,
      body: mail.subject || "(kein Betreff)",
      url: `/postfach?email=${mail.id}`,
      tag: `email-${mail.account_id}`,
    });
  }
}

async function notifyTodos() {
  // todos due in next 24h, not completed, with assignees
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: todos } = await supabase
    .from("todos")
    .select("id,title,due_date,calendar_start_time,status,show_in_calendar")
    .neq("status", "completed")
    .is("deleted_at", null)
    .not("due_date", "is", null)
    .gte("due_date", now.toISOString().slice(0, 10))
    .lte("due_date", horizon.toISOString().slice(0, 10))
    .limit(500);

  if (!todos?.length) return;

  for (const todo of todos) {
    // due moment
    const dueDateStr = todo.due_date as string;
    const timeStr = (todo.calendar_start_time as string | null) ?? "09:00:00";
    const due = new Date(`${dueDateStr}T${timeStr}`);
    const minutesUntil = Math.round((due.getTime() - now.getTime()) / 60000);

    // Get assignees
    const { data: assignees } = await supabase
      .from("todo_assignees")
      .select("user_id")
      .eq("todo_id", todo.id);
    const user_ids = assignees?.map((a) => a.user_id).filter(Boolean) ?? [];
    if (!user_ids.length) continue;

    // Per-user lead time check
    for (const uid of user_ids) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("todo_lead_minutes,todo_enabled,calendar_lead_minutes,calendar_enabled")
        .eq("user_id", uid)
        .maybeSingle();
      const lead = prefs?.todo_lead_minutes ?? 60;
      if (minutesUntil > lead || minutesUntil < -5) continue;

      // Dedup uses todo id + due slot — calendar events linked via todo_id share same key
      const dedup = `todo:${todo.id}:due`;
      await dispatch({
        user_ids: [uid],
        dedup_key: dedup,
        type: "todo",
        title: "✅ Aufgabe fällig",
        body: todo.title,
        url: `/aufgaben?todo=${todo.id}`,
        tag: `todo-${todo.id}`,
      });
    }
  }
}

async function notifyCalendar() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const { data: events } = await supabase
    .from("calendar_events")
    .select("id,title,start_datetime,todo_id,created_by")
    .gte("start_datetime", now.toISOString())
    .lte("start_datetime", horizon.toISOString())
    .limit(500);

  if (!events?.length) return;

  for (const ev of events) {
    const start = new Date(ev.start_datetime as string);
    const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);

    // If linked to todo, the todo notification already covers it -> use SAME dedup key
    const dedup = ev.todo_id
      ? `todo:${ev.todo_id}:due`
      : `calendar:${ev.id}:start`;

    // Recipient: creator (calendar events have no assignee table here)
    const uid = ev.created_by as string | null;
    if (!uid) continue;

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("calendar_lead_minutes,calendar_enabled")
      .eq("user_id", uid)
      .maybeSingle();
    const lead = prefs?.calendar_lead_minutes ?? 30;
    if (minutesUntil > lead || minutesUntil < -5) continue;

    await dispatch({
      user_ids: [uid],
      dedup_key: dedup,
      type: "calendar",
      title: "📅 Termin steht an",
      body: `${ev.title} – ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
      url: `/kalender`,
      tag: `cal-${ev.id}`,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await Promise.all([notifyEmails(), notifyTodos(), notifyCalendar()]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-pending fatal", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
