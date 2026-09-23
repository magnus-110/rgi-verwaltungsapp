// Cron-driven notifier: sucht neue E-Mails, faellige Aufgaben und anstehende
// Termine und schreibt daraus Eintraege in public.notifications - die Glocke
// in der App.
//
// Entscheidung 12 des Umsetzungsplans: nur In-App. Kein Push, keine E-Mail
// nach aussen. send-push wird von hier nicht mehr gerufen.
//
// Fehler, die hier lange drinsteckten und jetzt behoben sind:
//   - der Statusfilter prueft "completed"; die App kennt nur open,
//     in_progress und done, der Filter griff also nie
//   - die Links zeigten auf /aufgaben und /kalender; diese Routen gibt es
//     nicht, jeder Klick landete auf NotFound
//   - Empfaenger waren nur todo_assignees, das Feld todos.assigned_to wurde
//     ignoriert
//   - bei E-Mails gab es einen Rollen-Fallback: hatte ein Postfach keine
//     Abonnenten, meldete es an alle Admins und Mitarbeiter. Damit klingelte
//     die Glocke bei Postfaechern, die niemand abonniert hatte. E-Mails gehen
//     jetzt ausschliesslich an die Abonnenten des jeweiligen Postfachs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Spalte in notification_preferences, die diesen Typ abschaltet. */
const PREF_SPALTE: Record<string, string> = {
  case_email: "notify_case_email",
  deadline: "notify_reminder",
};

/**
 * Schreibt je Empfaenger eine Zeile in public.notifications.
 * (user_id, type, ref_id) verhindert, dass derselbe Anlass mehrfach meldet.
 */
async function melden(args: {
  user_ids: string[];
  type: "case_email" | "deadline";
  title: string;
  body?: string;
  url?: string;
  ref_type?: string;
  ref_id?: string;
}) {
  if (!args.user_ids.length) return;

  const spalte = PREF_SPALTE[args.type];

  for (const uid of args.user_ids) {
    if (spalte) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select(spalte)
        .eq("user_id", uid)
        .maybeSingle();
      // Keine Zeile = Standardwert der Tabelle gilt, also melden.
      if (prefs && (prefs as any)[spalte] === false) continue;
    }

    // Schon einmal gemeldet? Dann nichts tun. Ohne ref_id greift der
    // Vergleich auf den Titel zurueck, sonst meldete jeder Lauf erneut.
    let frage = supabase
      .from("notifications")
      .select("id")
      .eq("user_id", uid)
      .eq("type", args.type);
    frage = args.ref_id
      ? frage.eq("ref_id", args.ref_id)
      : frage.is("ref_id", null).eq("title", args.title);
    const { data: schon } = await frage.limit(1);
    if (schon && schon.length > 0) continue;

    await supabase.from("notifications").insert({
      user_id: uid,
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      url: args.url ?? null,
      ref_type: args.ref_type ?? null,
      ref_id: args.ref_id ?? null,
    });
  }
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

  // Wer welches Postfach abonniert hat - einmal je Lauf, nicht je Mail.
  const abonnenten = new Map<string, string[]>();
  const konten = Array.from(
    new Set(emails.map((m: any) => m.account_id).filter(Boolean)),
  ) as string[];
  if (konten.length) {
    const { data: subs } = await supabase
      .from("email_account_subscriptions")
      .select("account_id, user_id")
      .in("account_id", konten);
    (subs ?? []).forEach((s: any) => {
      if (!s.account_id || !s.user_id) return;
      const liste = abonnenten.get(s.account_id) ?? [];
      liste.push(s.user_id);
      abonnenten.set(s.account_id, liste);
    });
  }

  for (const mail of emails) {
    if (!mail.account_id) continue;
    // Nur Abonnenten. Frueher bekamen bei einem Postfach ohne Abonnenten
    // ALLE Admins und Mitarbeiter die Meldung - damit klingelte die Glocke
    // bei Postfaechern, die man nie abonniert hatte. Ein Abonnement, das
    // auch ohne Abonnement meldet, ist keines.
    const user_ids = abonnenten.get(mail.account_id) ?? [];
    if (!user_ids.length) continue;

    const sender = mail.from_name || mail.from_address || "Unbekannt";
    await melden({
      user_ids,
      type: "case_email",
      title: `Neue E-Mail von ${sender}`,
      body: mail.subject || "(kein Betreff)",
      url: `/postfach?email=${mail.id}`,
      ref_type: "email",
      ref_id: mail.id,
    });
  }
}

async function notifyTodos() {
  // todos due in next 24h, not completed, with assignees
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: todos } = await supabase
    .from("todos")
    .select("id,title,due_date,calendar_start_time,status,show_in_calendar,assigned_to")
    .neq("status", "done")
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

    // Empfaenger: die Mehrfachzuweisung UND das alte Einzelfeld.
    const { data: assignees } = await supabase
      .from("todo_assignees")
      .select("user_id")
      .eq("todo_id", todo.id);
    const user_ids = Array.from(
      new Set([
        ...(assignees?.map((a) => a.user_id) ?? []),
        (todo as any).assigned_to,
      ].filter(Boolean) as string[]),
    );
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

      await melden({
        user_ids: [uid],
        type: "deadline",
        title: "Aufgabe fällig",
        body: todo.title,
        url: `/pinnwand/${todo.id}`,
        ref_type: "todo",
        ref_id: todo.id,
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

    // Haengt der Termin an einer Aufgabe, meldet die Aufgabe bereits. Dann
    // dieselbe Kennung verwenden, damit die Dublettenpruefung greift.
    const refType = ev.todo_id ? "todo" : "calendar_event";
    const refId = (ev.todo_id as string | null) ?? (ev.id as string);

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

    await melden({
      user_ids: [uid],
      type: "deadline",
      title: "Termin steht an",
      body: `${ev.title} – ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
      url: `/calendar`,
      ref_type: refType,
      ref_id: refId,
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
