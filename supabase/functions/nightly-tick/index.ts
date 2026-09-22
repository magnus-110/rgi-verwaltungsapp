// Der nächtliche Lauf.
//
// Vier Dinge, von denen drei bisher überhaupt nicht passiert sind:
//   1. fällige Erinnerungen melden
//   2. Folgeaufgaben für wiederkehrende Aufgaben anlegen — dieser Code
//      existierte nirgends, obwohl Felder und Oberfläche dafür da waren
//   3. generate-maintenance-tasks aufrufen (wurde nie gerufen)
//   4. freitags: Hinweis auf die Durchsicht der stillen Vorgänge
//
// Alles nur In-App (Entscheidung 12 des Umsetzungsplans).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusMonate(iso: string, n: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function plusTage(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nächster Termin nach Muster und Intervall. */
function naechstesDatum(
  basis: string,
  muster: string | null,
  intervall: number,
): string | null {
  const n = intervall > 0 ? intervall : 1;
  switch (muster) {
    case "daily":
      return plusTage(basis, n);
    case "weekly":
      return plusTage(basis, 7 * n);
    case "monthly":
      return plusMonate(basis, n);
    case "yearly":
      return plusMonate(basis, 12 * n);
    default:
      return null;
  }
}

/** 1. Fällige Erinnerungen melden. */
async function erinnerungen(): Promise<number> {
  const { data: faellig } = await supabase
    .from("task_reminders")
    .select("id, todo_id, case_id, user_id, note, remind_at")
    .is("fired_at", null)
    .lte("remind_at", new Date().toISOString())
    .limit(500);

  if (!faellig?.length) return 0;

  let n = 0;
  for (const r of faellig) {
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("notify_reminder")
      .eq("user_id", r.user_id)
      .maybeSingle();
    const aus = prefs && (prefs as any).notify_reminder === false;

    if (!aus) {
      let titel = r.note || "Erinnerung";
      let url = "/pinnwand";
      let refType = "todo";

      if (r.todo_id) {
        const { data: t } = await supabase
          .from("todos")
          .select("title")
          .eq("id", r.todo_id)
          .maybeSingle();
        if (t?.title) titel = `${r.note || "Erinnerung"}: ${t.title}`;
        url = `/pinnwand/${r.todo_id}`;
      } else if (r.case_id) {
        const { data: c } = await supabase
          .from("cases")
          .select("title")
          .eq("id", r.case_id)
          .maybeSingle();
        if (c?.title) titel = `${r.note || "Erinnerung"}: ${c.title}`;
        url = `/vorgaenge/${r.case_id}`;
        refType = "case";
      }

      await supabase.from("notifications").insert({
        user_id: r.user_id,
        type: "reminder",
        title: titel,
        url,
        ref_type: refType,
        ref_id: r.todo_id ?? r.case_id,
      });
      n++;
    }

    await supabase
      .from("task_reminders")
      .update({ fired_at: new Date().toISOString() })
      .eq("id", r.id);
  }
  return n;
}

/**
 * 2. Wiederholungen.
 *
 * Für jede erledigte wiederkehrende Aufgabe ohne bereits erzeugte
 * Folgeaufgabe wird genau eine neue angelegt.
 */
async function wiederholungen(): Promise<number> {
  const { data: erledigt } = await supabase
    .from("todos")
    .select(
      "id, title, description, category_id, assigned_to, building_id, priority, due_date, " +
        "is_recurring, recurrence_pattern, recurrence_interval, recurrence_end_date, " +
        "completed_at, created_by, is_internal, source_type",
    )
    .eq("is_recurring", true)
    .eq("status", "done")
    .is("deleted_at", null)
    .limit(500);

  if (!erledigt?.length) return 0;

  let n = 0;
  for (const t of erledigt as any[]) {
    // Gibt es schon eine Folgeaufgabe?
    const { data: folge } = await supabase
      .from("todos")
      .select("id")
      .eq("parent_todo_id", t.id)
      .limit(1);
    if (folge && folge.length > 0) continue;

    const basis = t.due_date || (t.completed_at ? t.completed_at.slice(0, 10) : heute());
    const naechste = naechstesDatum(basis, t.recurrence_pattern, t.recurrence_interval ?? 1);
    if (!naechste) continue;
    if (t.recurrence_end_date && naechste > t.recurrence_end_date) continue;

    const { data: neu, error } = await supabase
      .from("todos")
      .insert({
        title: t.title,
        description: t.description,
        category_id: t.category_id,
        assigned_to: t.assigned_to,
        building_id: t.building_id,
        priority: t.priority ?? "medium",
        status: "open",
        due_date: naechste,
        is_recurring: true,
        recurrence_pattern: t.recurrence_pattern,
        recurrence_interval: t.recurrence_interval,
        recurrence_end_date: t.recurrence_end_date,
        parent_todo_id: t.id,
        is_internal: t.is_internal ?? false,
        source_type: t.source_type ?? "manual",
        created_by: t.created_by,
      })
      .select("id")
      .single();

    if (error) {
      console.error("nightly-tick: Folgeaufgabe fehlgeschlagen", t.id, error.message);
      continue;
    }

    // Zuweisungen mitnehmen.
    const { data: zuweisungen } = await supabase
      .from("todo_assignees")
      .select("user_id")
      .eq("todo_id", t.id);
    if (zuweisungen?.length && neu) {
      await supabase.from("todo_assignees").insert(
        zuweisungen.map((z: any) => ({ todo_id: (neu as any).id, user_id: z.user_id })),
      );
    }
    n++;
  }
  return n;
}

/** 3. Wartungsaufgaben erzeugen lassen. */
async function wartung(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-maintenance-tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch (e) {
    console.error("nightly-tick: Wartungslauf fehlgeschlagen", e);
    return false;
  }
}

/**
 * 4. Freitags: Hinweis auf die Durchsicht, wenn Vorgänge still sind und
 *    an keiner Wand hängen.
 */
async function durchsicht(): Promise<number> {
  if (new Date().getDay() !== 5) return 0; // 5 = Freitag

  const { data: stille } = await supabase
    .from("case_overview")
    .select("id")
    .in("status", ["open", "in_progress", "waiting_external", "waiting_owner"])
    .gt("silent_days", 30)
    .eq("on_a_wall", false);

  const anzahl = stille?.length ?? 0;
  if (anzahl === 0) return 0;

  const { data: leute } = await supabase
    .from("profiles")
    .select("user_id")
    .in("role", ["admin", "employee"]);

  let n = 0;
  for (const p of (leute ?? []) as any[]) {
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("notify_review_due")
      .eq("user_id", p.user_id)
      .maybeSingle();
    if (prefs && (prefs as any).notify_review_due === false) continue;

    // Nur einmal pro Woche.
    const vorEinerWoche = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
    const { data: schon } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", p.user_id)
      .eq("type", "review_due")
      .gte("created_at", vorEinerWoche)
      .limit(1);
    if (schon && schon.length > 0) continue;

    await supabase.from("notifications").insert({
      user_id: p.user_id,
      type: "review_due",
      title: `Wöchentliche Durchsicht: ${anzahl} ${anzahl === 1 ? "Vorgang liegt" : "Vorgänge liegen"} länger als einen Monat still`,
      body: "Keiner davon hängt an einer Wand.",
      url: "/vorgaenge",
    });
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bericht: Record<string, unknown> = {};
  try {
    bericht.erinnerungen = await erinnerungen();
    bericht.wiederholungen = await wiederholungen();
    bericht.wartung = await wartung();
    bericht.durchsicht = await durchsicht();

    console.log("nightly-tick", JSON.stringify(bericht));
    return new Response(JSON.stringify({ ok: true, ...bericht }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("nightly-tick fatal", err);
    return new Response(JSON.stringify({ error: err.message, ...bericht }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
