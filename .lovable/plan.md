
# Plan: Persistenten Sync-Fehler bei `fetch-emails` robust beheben

## Kurzdiagnose (warum der Fehler trotz CORS-Fix bleibt)
- CORS ist bereits korrekt konfiguriert.
- Die Function ist erreichbar, bricht aber zur Laufzeit mit `UnexpectedEof ... TLS close_notify` ab (Logs zeigen `UncaughtException`).
- Reproduzierbar per direktem Function-Call: aktuell `502 Bad Gateway`.
- Ursache ist sehr wahrscheinlich IMAP/TLS-Verbindungsabbruch (Strato), der nicht an allen Stellen sauber abgefangen wird (EventEmitter/Socket-Ebene), daher sieht der Client nur: **“Failed to send a request to the Edge Function”**.

## Umsetzung

### 1) IMAP-Fehler zentral und vollständig abfangen (`supabase/functions/fetch-emails/index.ts`)
- Helper für ignorable Fehler ergänzen (z. B. `UnexpectedEof`, `close_notify`, “Connection not available” bei Logout-Race).
- Zusätzlich zu `unhandledrejection` auch globale `error`-Events für diese bekannten TLS-Abbrüche unterdrücken.
- Pro `ImapFlow`-Instanz `client.on("error", ...)` registrieren, damit Socket-/Stream-Fehler nicht als unhandled Exception den Request killen.

### 2) Connection-Lifecycle stabilisieren (Race beim Beenden vermeiden)
- Cleanup-Block anpassen: kein aggressives Doppel-Close (`logout` + `close`) ohne Guard.
- Saubere Reihenfolge + Guard-Checks, damit Strato-Abbrüche beim Beenden nicht den gesamten HTTP-Request crashen.
- `secure` auf Basis von `account.use_ssl` (mit Port-Fallback) nutzen, damit die Konfiguration konsistent zur DB ist.

### 3) Account-Loop gegen Teilfehler härten
- Bei IMAP-Abbruch eines Kontos nur dieses Konto als Fehler im `results` markieren und mit dem nächsten Konto weitermachen.
- Sicherstellen, dass am Ende immer eine gültige JSON-Response zurückkommt (kein Gateway-Fehler mehr für den Frontend-Call).

### 4) Frontend-Feedback minimal verbessern (`src/pages/Inbox.tsx`)
- Bestehende Toast-Fehlermeldung beibehalten, aber bei Function-Fehlern wenn möglich Status/Details aus der Response anzeigen (statt nur generischem “Failed to send...”).
- Kein UX-Umbau nötig, nur bessere Transparenz bei Restfehlern.

## Technische Details (kompakt)
- **Dateien:**  
  - `supabase/functions/fetch-emails/index.ts` (Hauptfix)  
  - optional `src/pages/Inbox.tsx` (bessere Fehlermeldung)
- **Keine DB-Migration erforderlich.**
- **Keine CORS-Änderung mehr nötig** (bereits korrekt).

## Validierung nach Umsetzung
1. Function direkt aufrufen (`/fetch-emails`) → erwartet `200` + JSON.
2. Logs prüfen: keine neuen `UncaughtException UnexpectedEof`-Abstürze.
3. In `/postfach` manuell “Synchronisieren” klicken → Success-Toast statt Fehltoast.
4. 1–2 Cron-Zyklen beobachten → weiterhin stabile Responses ohne 502.
