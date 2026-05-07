# Root Cause gefunden: `npm:web-push` ist in Supabase Edge Functions kaputt

## Was wirklich los ist

Beim Recherchieren in offenen GitHub-Issues bin ich auf das exakte Symptom gestoßen:

> **Deno Issue #23693: „npm:web-push not working"**
> *„AES-GCM decryption in Chrome fails… This prevents us from receiving messages sent from the server."*
> *„I have a Supabase Edge Function that runs on the Deno runtime that uses web-push to my subscribed devices… When my devices receive push notifications I receive the `AES-GCM decryption failed` log in `chrome://gcm-internals/`."*

Genau das passiert bei uns:

1. Edge Function ruft `webpush.sendNotification(...)` auf (npm:web-push@3.6.7).
2. `web-push` verschlüsselt die Payload via Node-Crypto-Shim.
3. FCM/Mozilla-Push nehmen den Request an → **HTTP 201**, deshalb sieht unser Server „erfolgreich gesendet".
4. Der Browser empfängt den Push, versucht ihn mit dem `auth`-Secret zu entschlüsseln → **AES-GCM-Decryption-Failure** → der `push`-Event wird **stillschweigend verworfen**, ohne Error im Service Worker.

Das erklärt **lückenlos** alle Beobachtungen:
- Windows-Chrome bekommt nichts (gleicher Defekt) ✅
- Android-Chrome bekommt nichts (gleicher Defekt) ✅
- Lokaler Test funktioniert (verschlüsselt nichts, ruft direkt `showNotification` auf) ✅
- Server meldet `sent: true` (FCM hat ja angenommen) ✅
- Service Worker `push`-Listener wird nie aufgerufen (Browser verwirft) ✅
- Neue VAPID-Keys ändern nichts (Defekt liegt in der Payload-Verschlüsselung, nicht in der Signatur) ✅

## Lösung: web-push durch eine Deno-native Library ersetzen

Es gibt eine direkt in Deno funktionierende Bibliothek, die genau für dieses Problem geschrieben wurde:

**`jsr:@negrel/webpush`** (oder als Fallback: eigene Implementierung mit Web Crypto API).

Diese Library nutzt `crypto.subtle` direkt statt Node-Shims und hat in Deno keinen AES-GCM-Bug.

## Schritt 1 — `send-push` umbauen

In `supabase/functions/send-push/index.ts`:

```ts
// ALT
import webpush from "npm:web-push@3.6.7";
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
await webpush.sendNotification({endpoint, keys:{p256dh, auth}}, notif);

// NEU
import * as webpush from "jsr:@negrel/webpush";
const vapid = await webpush.importVapidKeys({
  publicKey: VAPID_PUBLIC,   // base64url
  privateKey: VAPID_PRIVATE, // base64url
}, { extractable: false });

const appServer = await webpush.ApplicationServer.new({
  contactInformation: VAPID_SUBJECT, // mailto:...
  vapidKeys: vapid,
});

const subscriber = appServer.subscribe({
  endpoint, keys: { p256dh, auth },
});
await subscriber.pushTextMessage(notif, {});
```

Die restliche Logik bleibt 1:1 erhalten:
- VAPID-Fingerprint-Check
- Per-Device-Diagnose
- 404/410 → Subscription löschen
- Dedup-Log

## Schritt 2 — In allen anderen Functions ersetzen

Suchen nach weiteren Vorkommen von `npm:web-push` (vermutlich nur `send-push`, evtl. ein älterer Test). Falls noch wo verwendet, gleich umstellen.

## Schritt 3 — Hard-Reset + Test

Da bestehende Subscriptions weiterhin gültig sind (das Problem war ja Server-seitig), muss **kein** Re-Subscribe stattfinden. Trotzdem sicherheitshalber:

1. Edge Function deployt sich automatisch.
2. In den Einstellungen einmal **Server-Test** klicken.
3. Wenn die Notification jetzt erscheint → wir sind fertig.
4. Falls nicht → über `chrome://gcm-internals/` → „Message Decryption Failure Log" prüfen, dort steht dann der nächste Hinweis.

## Schritt 4 — Plan B (falls jsr-Library Probleme macht)

Es gibt zwei bewährte Alternativen:
- **`https://deno.land/x/webpush@v1.0.0/mod.ts`** — etwas älter, aber stabil.
- **Reines Web-Crypto-API selbst geschrieben** (~150 Zeilen): ECDH + HKDF + AES-128-GCM nach RFC 8291 + VAPID-JWT signieren. Hätte den Vorteil, dass wir keinerlei externe Crypto-Dependency mehr haben.

Wir starten mit `jsr:@negrel/webpush` und fallen nur bei konkretem Problem auf Plan B zurück.

## Was NICHT geändert wird

- VAPID-Keys (frische sind drin, in Ordnung).
- `public/sw.js` (Listener funktioniert lokal).
- `usePushSubscription.ts` (Subscriptions in DB sind valide).
- Keine DB-Migration nötig.
- Kein User-Action erforderlich (kein erneutes Aktivieren von Push, kein Hard-Reset zwingend).

## Quellen

- https://github.com/denoland/deno/issues/23693 — exaktes Symptom
- https://web.dev/articles/push-notifications-common-issues-and-reporting-bugs — „201 received but no message" → Encryption Issue
- https://jsr.io/@negrel/webpush — Deno-native Web-Push, nutzt Web Crypto direkt

## Warum ich mir diesmal sehr sicher bin

- Das Issue beschreibt **wortgleich** unser Verhalten (201 OK + kein push event + lokal geht alles).
- Es betrifft **alle Browser/OS gleich**, weil der Defekt in der Server-Payload-Verschlüsselung liegt → erklärt warum Windows UND Android scheitern.
- Es erklärt, warum neue VAPID-Keys nichts geändert haben (VAPID = Signatur des JWT-Headers, NICHT die Payload-Verschlüsselung).
- Lokale Notifications gehen, weil sie im Browser bleiben und nichts verschlüsseln.

Das ist die Kette, die alle Symptome erklärt — und der Fix ist eine reine Server-seitige Library-Umstellung.
