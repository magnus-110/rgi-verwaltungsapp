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

async function sha256Fingerprint(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 12);
}

export type PushPermissionState = NotificationPermission | "unsupported";

export interface PushDiagnostics {
  swRegistered: boolean;
  swActive: boolean;
  swVersion: string | null;
  lastPushReceivedAt: number | null;
  lastPushShownAt: number | null;
  lastPushShowError: string | null;
  vapidFingerprint: string | null;
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
    swVersion: null,
    lastPushReceivedAt: null,
    lastPushShownAt: null,
    lastPushShowError: null,
    vapidFingerprint: null,
  });
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js")
          ?? await navigator.serviceWorker.ready;
        try { await reg.update(); } catch (_) {}
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        setDiagnostics((d) => ({ ...d, swRegistered: !!reg, swActive: !!reg.active }));
        const target = reg.active || navigator.serviceWorker.controller;
        if (target) {
          const mc = new MessageChannel();
          mc.port1.onmessage = (ev) => {
            if (ev.data?.type === "pong") {
              setDiagnostics((d) => ({ ...d, swVersion: ev.data.version || "unknown" }));
            }
          };
          target.postMessage({ type: "ping" }, [mc.port2]);
        }
      } catch (_) {}
    })();

    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "push-received") {
        setDiagnostics((d) => ({ ...d, lastPushReceivedAt: ev.data.ts || Date.now(), swVersion: ev.data.version || d.swVersion }));
      }
      if (ev.data?.type === "push-shown") {
        setDiagnostics((d) => ({ ...d, lastPushShownAt: ev.data.ts || Date.now(), lastPushShowError: null, swVersion: ev.data.version || d.swVersion }));
      }
      if (ev.data?.type === "push-show-error") {
        setDiagnostics((d) => ({ ...d, lastPushShowError: ev.data.error || "Notification konnte nicht angezeigt werden", swVersion: ev.data.version || d.swVersion }));
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

      // Service Worker frisch registrieren (cache-busted), damit Chrome eine alte SW-Instanz nicht weiter benutzt
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${Date.now()}`);
      await navigator.serviceWorker.ready;
      setDiagnostics((d) => ({ ...d, swRegistered: true, swActive: !!reg.active }));

      const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-vapid-public-key");
      if (keyErr || !keyData?.publicKey) {
        lastErrorRef.current = "VAPID-Public-Key konnte nicht geladen werden.";
        return { error: lastErrorRef.current };
      }

      const vapidFp = keyData.fingerprint || (await sha256Fingerprint(keyData.publicKey));
      setDiagnostics((d) => ({ ...d, vapidFingerprint: vapidFp }));

      // 1) ALLE Server-Subscriptions dieses Users löschen (verhindert Karteileichen mit altem VAPID-Key)
      try { await supabase.from("push_subscriptions").delete().eq("user_id", user.id); } catch (_) {}

      // 2) Browser-Subscription robust entfernen — bis getSubscription() wirklich null liefert
      for (let i = 0; i < 3; i++) {
        const existing = await reg.pushManager.getSubscription();
        if (!existing) break;
        try { await existing.unsubscribe(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 150));
      }

      // 3) Frische Subscription mit aktuellem VAPID-Key
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey).buffer as ArrayBuffer,
      });

      const json = sub.toJSON() as any;
      const endpoint = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));
      console.info("[push] new subscription", { endpoint: endpoint.slice(0, 60), vapidFp });

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
            vapid_fingerprint: vapidFp,
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

  const showLocalTest = useCallback(async () => {
    if (!supported) return { error: "not supported" };
    if (Notification.permission !== "granted") return { error: "permission not granted" };
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Lokaler Test", {
        body: "Diese Benachrichtigung wurde direkt vom Browser angezeigt.",
        badge: "/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png",
        tag: "local-test",
      });
      return {};
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  }, [supported]);

  /** Removes ALL prior subscriptions for this user (any device), then re-subscribes the current one. */
  const hardReset = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Delete server-side subs for this user (cleans stale Windows/Android entries with old VAPID key)
      if (user) {
        try { await supabase.from("push_subscriptions").delete().eq("user_id", user.id); } catch (_) {}
      }
      // 2) Unregister all SWs locally
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try {
            const s = await r.pushManager.getSubscription();
            if (s) { try { await s.unsubscribe(); } catch (_) {} }
          } catch (_) {}
          await r.unregister();
        }
      } catch (_) {}
      setSubscribed(false);
      setDiagnostics({ swRegistered: false, swActive: false, swVersion: null, lastPushReceivedAt: null, lastPushShownAt: null, lastPushShowError: null, vapidFingerprint: null });
    } finally {
      setLoading(false);
    }
    return subscribe();
  }, [subscribe, user]);

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
    hardReset,
  };
}
