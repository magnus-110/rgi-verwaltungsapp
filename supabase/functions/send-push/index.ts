// Send Web-Push notifications to users (with deduplication)
// Triggers: invoked manually from other edge fns / cron / app code
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendPushBody {
  user_ids: string[];
  dedup_key: string;
  type: "email" | "todo" | "calendar" | "test";
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@rgi-immobilien.de";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function inQuietHours(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  // German timezone approximation - server is UTC, add CET offset.
  // Better: store TZ in profile, but for now compare HH:MM strings in local time.
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes() + 60; // +1h CET fallback
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) return mins >= startMin && mins < endMin;
  return mins >= startMin || mins < endMin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = (await req.json()) as SendPushBody;
    const { user_ids, dedup_key, type, title, body, url, tag, icon } = payload;

    if (!user_ids?.length || !dedup_key || !type || !title) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    const results: Record<string, string> = {};

    for (const userId of user_ids) {
      // dedup
      const { data: existing } = await supabase
        .from("notification_log")
        .select("id")
        .eq("user_id", userId)
        .eq("dedup_key", dedup_key)
        .maybeSingle();
      if (existing) {
        results[userId] = "duplicate";
        continue;
      }

      // preferences
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs) {
        if (type === "email" && !prefs.email_enabled) {
          results[userId] = "disabled";
          continue;
        }
        if (type === "todo" && !prefs.todo_enabled) {
          results[userId] = "disabled";
          continue;
        }
        if (type === "calendar" && !prefs.calendar_enabled) {
          results[userId] = "disabled";
          continue;
        }
        if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
          results[userId] = "quiet_hours";
          continue;
        }
      }

      // subscriptions
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (!subs?.length) {
        results[userId] = "no_subscription";
        continue;
      }

      const defaultIcon = "/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png";
      const notif = JSON.stringify({
        title,
        body: body ?? "",
        icon: icon ?? defaultIcon,
        badge: defaultIcon,
        tag: tag ?? dedup_key,
        data: { url: url ?? "/", type, dedup_key },
      });

      let userSent = 0;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notif,
          );
          userSent++;
          await supabase
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", sub.id);
        } catch (err: any) {
          console.error("push error", err?.statusCode, err?.body);
          // 404/410 -> remove dead subscription
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }

      // log even when zero sent so dedup is enforced
      await supabase.from("notification_log").insert({
        user_id: userId,
        dedup_key,
        type,
        title,
        body,
        url,
        payload: payload as any,
        sent_count: userSent,
      });

      totalSent += userSent;
      results[userId] = `sent:${userSent}`;
    }

    return new Response(JSON.stringify({ ok: true, totalSent, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-push fatal", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
