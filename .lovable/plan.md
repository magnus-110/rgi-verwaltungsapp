## Ziel

Wenn der Nutzer in der App eingeloggt ist (egal welche Seite), erscheint unten rechts ein dezentes Toast-Pop-up bei drei Ereignissen:

- Neue **E-Mail** in einem abonnierten Postfach
- Neue **Meldung** (`reports`-Tabelle)
- Neue **Aufgabe** (`todos`), die dem Nutzer zugewiesen wurde

Verhalten:
- Klein, clean, oben Icon + Titel, darunter Kurzinfo (Absender/Betreff bzw. Titel)
- Auto-Hide nach 4 Sekunden
- Manuell schließbar (X)
- Klick auf Toast → springt zur passenden Seite (`/postfach`, `/tickets`, `/todos`)
- In Einstellungen → Benachrichtigungen unabhängig pro Typ ein-/ausschaltbar (analog zu den bestehenden Push-Switches)
- Keine doppelten Toasts (Dedupe per Event-ID, nur Events seit Login zeigen)

## Datenbank-Migration

Neue Spalten in `notification_preferences` (alle `boolean DEFAULT true`):
- `in_app_email_enabled`
- `in_app_report_enabled`
- `in_app_todo_enabled`

(Bestehende Push-Spalten `email_enabled`, `todo_enabled`, `calendar_enabled` bleiben getrennt — Push und In-App sind unabhängige Kanäle.)

Realtime-Publication für die drei Tabellen sicherstellen:
- `emails`, `reports`, `todos` zur Publication `supabase_realtime` hinzufügen, falls noch nicht enthalten
- `REPLICA IDENTITY FULL` für saubere Payloads

## Frontend

### Neuer Provider: `src/contexts/InAppNotificationsProvider.tsx`
- Wird in `src/App.tsx` innerhalb von `AuthProvider` gerendert (oberhalb der Routen)
- Lädt einmalig die Prefs des Users (`notification_preferences`) und die abonnierten Account-IDs (`email_account_subscriptions`)
- Merkt sich `mountedAt = Date.now()` — nur Inserts mit `created_at > mountedAt` lösen Toasts aus (keine Backfill-Flut beim Login)
- Realtime-Channel `inapp-notifications`:
  - `emails` INSERT → wenn `in_app_email_enabled` UND `account_id ∈ subscribedAccountIds` → Toast „Neue E-Mail" + Absendername/Betreff
  - `reports` INSERT → wenn `in_app_report_enabled` → Toast „Neue Meldung" + Titel/Gebäude
  - `todos` INSERT → wenn `in_app_todo_enabled` UND `assignee_id = user.id` (oder Mehrfach-Assign-Tabelle, je nach Schema) → Toast „Neue Aufgabe" + Titel
- Reagiert auf Realtime-Änderungen an `notification_preferences` und `email_account_subscriptions`, damit Settings-Änderungen sofort greifen

### Toast-Anzeige
- Nutzt das vorhandene **sonner** (`<Sonner />` ist bereits in `App.tsx`)
- `toast.custom(...)` mit kleiner Karte: Icon links, Titel + Subtext, X-Button, `duration: 4000`, `position: "bottom-right"` (wird global beim Sonner-Toaster gesetzt, falls nicht schon)
- Klick auf Karte → `navigate(targetUrl)`

### Settings-Erweiterung
`src/components/settings/NotificationSettingsSection.tsx`:
- Neue Card **„In-App-Benachrichtigungen"** unterhalb der Push-Card
- Drei Switches (E-Mail / Meldungen / Aufgaben), schreiben in `notification_preferences`
- Kurzer Hinweis: „Erscheinen unten rechts während du in der App arbeitest, 4 Sekunden lang."

### App-Einbindung
`src/App.tsx`: `<InAppNotificationsProvider>` direkt unter `<UploadProvider>`, umschließt `<Suspense>` mit den Routen.

## Was nicht angefasst wird

- Bestehende Push-Logik (`usePushSubscription`, `send-push` Edge Function) bleibt unverändert — In-App ist ein zusätzlicher, davon unabhängiger Kanal
- Keine Änderungen an bestehendem Toast-System für andere Use-Cases (Speichern-Bestätigungen etc.)

## Technische Details

- Schema-Check `todos`: prüfen, ob die Zuordnung über `assignee_id` oder eine Verknüpfungstabelle erfolgt — entsprechend Filter setzen
- Bei `reports` ggf. nach `building_id` filtern, wenn der Nutzer nicht alle Gebäude sehen soll (nutzt RLS automatisch — Realtime liefert nur Rows, die RLS erlaubt)
- Subject-Truncation auf ~60 Zeichen für saubere Darstellung
