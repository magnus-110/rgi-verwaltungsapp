// Send Web-Push notifications to users (with deduplication + per-device diagnostics)
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
  requireInteraction?: boolean;
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@rgi-immobilien.de";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fingerprint(hex: string): string {
  return hex.slice(0, 12);
}

function inQuietHours(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes() + 60; // CET fallback
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) return mins >= startMin && mins < endMin;
  return mins >= startMin || mins < endMin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = (await req.json()) as SendPushBody;
    const { user_ids, dedup_key, type, title, body, url, tag, icon, requireInteraction } = payload;

    if (!user_ids?.length || !dedup_key || !type || !title) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serverVapidFp = fingerprint(await sha256Hex(VAPID_PUBLIC));

    let totalSent = 0;
    const results: Record<string, any> = {};

    for (const userId of user_ids) {
      // Dedup (skipped for "test" so wiederholte Tests immer durchgehen)
      if (type !== "test") {
        const { data: existing } = await supabase
          .from("notification_log")
          .select("id")
          .eq("user_id", userId)
          .eq("dedup_key", dedup_key)
          .maybeSingle();
        if (existing) {
          results[userId] = { status: "duplicate" };
          continue;
        }
      }

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (prefs && type !== "test") {
        if (type === "email" && !prefs.email_enabled) { results[userId] = { status: "disabled" }; continue; }
        if (type === "todo" && !prefs.todo_enabled) { results[userId] = { status: "disabled" }; continue; }
        if (type === "calendar" && !prefs.calendar_enabled) { results[userId] = { status: "disabled" }; continue; }
        if (inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) { results[userId] = { status: "quiet_hours" }; continue; }
      }

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (!subs?.length) {
        results[userId] = { status: "no_subscription", server_vapid_fp: serverVapidFp };
        continue;
      }

      const defaultIcon = "/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png";
      const notif = JSON.stringify({
        title,
        body: body ?? "",
        icon: icon ?? defaultIcon,
        badge: defaultIcon,
        tag: tag ?? dedup_key,
        requireInteraction: requireInteraction ?? type === "test",
        data: { url: url ?? "/", type, dedup_key },
      });

      let userSent = 0;
      const devices: any[] = [];
      for (const sub of subs) {
        const epHash = (await sha256Hex(sub.endpoint)).slice(0, 16);
        const subVapidFp = sub.vapid_fingerprint ?? null;
        const vapidMismatch = subVapidFp && subVapidFp !== serverVapidFp;

        if (vapidMismatch) {
          devices.push({
            id: sub.id, endpoint_hash: epHash, device_label: sub.device_label,
            user_agent: sub.user_agent, last_used_at: sub.last_used_at,
            sub_vapid_fp: subVapidFp, server_vapid_fp: serverVapidFp,
            status: "vapid_mismatch",
          });
          await supabase.from("push_subscriptions")
            .update({ last_delivery_status: "vapid_mismatch", last_delivery_at: new Date().toISOString() })
            .eq("id", sub.id);
          continue;
        }

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notif,
          );
          userSent++;
          await supabase.from("push_subscriptions").update({
            last_used_at: new Date().toISOString(),
            last_delivery_status: "sent",
            last_delivery_at: new Date().toISOString(),
            last_delivery_code: 201,
          }).eq("id", sub.id);
          devices.push({
            id: sub.id, endpoint_hash: epHash, device_label: sub.device_label,
            user_agent: sub.user_agent, last_used_at: sub.last_used_at,
            sub_vapid_fp: subVapidFp, server_vapid_fp: serverVapidFp,
            status: "sent",
          });
        } catch (err: any) {
          const code = err?.statusCode;
          console.error("push error", code, err?.body);
          let status = `failed:${code ?? "unknown"}`;
          if (code === 404 || code === 410) {
            status = `removed:${code}`;
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            await supabase.from("push_subscriptions").update({
              last_delivery_status: status,
              last_delivery_at: new Date().toISOString(),
              last_delivery_code: code ?? null,
            }).eq("id", sub.id);
          }
          devices.push({
            id: sub.id, endpoint_hash: epHash, device_label: sub.device_label,
            user_agent: sub.user_agent, last_used_at: sub.last_used_at,
            sub_vapid_fp: subVapidFp, server_vapid_fp: serverVapidFp,
            status, code, error: String(err?.body ?? err?.message ?? err).slice(0, 240),
          });
        }
      }

      await supabase.from("notification_log").insert({
        user_id: userId,
        dedup_key,
        type,
        title,
        body,
        url,
        payload: { ...payload, server_vapid_fp: serverVapidFp, devices } as any,
        sent_count: userSent,
      });

      totalSent += userSent;
      results[userId] = {
        status: userSent > 0 ? `sent:${userSent}` : "no_delivery",
        server_vapid_fp: serverVapidFp,
        devices,
      };
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
