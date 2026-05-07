import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export type PushPermissionState = NotificationPermission | "unsupported";

export interface PushDiagnostics {
  swRegistered: boolean;
  swActive: boolean;
  lastPushReceivedAt: number | null;
}

export function usePushSubscription() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics>({
    swRegistered: false,
    swActive: false,
    lastPushReceivedAt: null,
  });
  const lastErrorRef = useRef<string | null>(null);

  // Init: detect support, check existing subscription, listen for SW messages
  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js")
          ?? await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        setDiagnostics((d) => ({ ...d, swRegistered: !!reg, swActive: !!reg.active }));
      } catch (_) {}
    })();

    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "push-received") {
        setDiagnostics((d) => ({ ...d, lastPushReceivedAt: ev.data.ts || Date.now() }));
      }
      if (ev.data?.type === "notification-click" && ev.data.url) {
        try { window.location.assign(ev.data.url); } catch (_) {}
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);

  const subscribe = useCallback(async () => {
    lastErrorRef.current = null;
    if (!user) return { error: "not signed in" };
    if (!supported) return { error: "Browser unterstützt keine Web-Push." };
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        lastErrorRef.current = "Berechtigung im Browser nicht erteilt.";
        return { error: lastErrorRef.current };
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      setDiagnostics((d) => ({ ...d, swRegistered: true, swActive: !!reg.active }));

      const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-vapid-public-key");
      if (keyErr || !keyData?.publicKey) {
        lastErrorRef.current = "VAPID-Public-Key konnte nicht geladen werden.";
        return { error: lastErrorRef.current };
      }

      // Reuse existing if it matches the public key, else recreate
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        try { await sub.unsubscribe(); } catch (_) {}
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey).buffer as ArrayBuffer,
      });

      const json = sub.toJSON() as any;
      const endpoint = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
            device_label: navigator.platform,
          },
          { onConflict: "endpoint" },
        );
      if (error) {
        lastErrorRef.current = error.message;
        return { error: error.message };
      }
      setSubscribed(true);
      return {};
    } catch (e: any) {
      lastErrorRef.current = e?.message || String(e);
      return { error: lastErrorRef.current };
    } finally {
      setLoading(false);
    }
  }, [user, supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", ep);
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  /** Triggers a local SW notification (no server). Proves OS/browser can display. */
  const showLocalTest = useCallback(async () => {
    if (!supported) return { error: "not supported" };
    if (Notification.permission !== "granted") return { error: "permission not granted" };
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("🔔 Lokaler Test", {
        body: "Diese Benachrichtigung wurde direkt vom Browser angezeigt.",
        icon: "/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png",
        badge: "/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png",
        tag: "local-test",
      });
      return {};
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    loading,
    diagnostics,
    lastError: lastErrorRef.current,
    subscribe,
    unsubscribe,
    showLocalTest,
  };
}
