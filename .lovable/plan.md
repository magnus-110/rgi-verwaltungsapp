## Probleme

1. **Push bei eigenen versendeten Mails**: `notify-pending` filtert in `notifyEmails()` nur auf `is_draft = false`, nicht auf die Mailbox. Da `send-email` die versendete Mail in den Ordner "Gesendet" einfügt, wird auch dafür ein Push ausgelöst.
2. **Nicht jede eingehende Mail erzeugt Push**: Push wird nur an User aus `email_account_subscriptions` für genau dieses Konto verschickt. Wer nicht abonniert ist, bekommt nichts. User möchte „jede" eingehende Mail.
3. **In‑App‑Toasts funktionieren nicht zuverlässig**: Realtime ist für `emails` aktiv und `InAppNotificationsProvider` ist gemountet. Es fehlt aber der gleiche „Eingang"-Filter wie beim Push, sonst ploppt der Toast bei jeder eigenen gesendeten Mail auf. Außerdem hängt das Anzeigen von `in_app_email_subscriptions` ab – wer keine Konten abonniert hat, sieht zwar alles, wer aber nur ein Konto markiert hat, sieht andere Postfächer nicht.

## Änderungen

### 1) `supabase/functions/notify-pending/index.ts` – nur Eingang, alle relevanten User
- Eingang‑Folder einmal laden: `select id from email_folders where name='Eingang' and is_system=true`.
- Query um `.eq("folder_id", inboxId)` ergänzen → keine Pushes mehr für „Gesendet", „Entwürfe", „Papierkorb" usw.
- Empfänger‑Logik:
  - Primär weiterhin `email_account_subscriptions` für das Konto.
  - **Fallback**: wenn keine Abos für das Konto existieren ⇒ alle internen User (admin/employee) mit aktivem `notification_preferences.email_enabled` benachrichtigen, damit jede eingehende Mail garantiert eine Push erzeugt.
- Dedup bleibt per `email:<id>` → keine doppelten Pushes.

### 2) `src/contexts/InAppNotificationsProvider.tsx` – sauberer Eingangs‑Filter
- Beim Mount einmalig die Inbox‑Folder‑ID laden und in einem Ref speichern.
- Im `INSERT emails`‑Handler zusätzlich prüfen: `row.folder_id === inboxFolderId`. Damit erscheint kein Toast für eigene Sendungen, Entwürfe oder verschobene Mails.
- `accountIdsRef`‑Filter so anpassen, dass er nur greift, wenn der User in den Settings explizit Konten gewählt hat; bei leerer Auswahl werden weiterhin alle Konten angezeigt (Status quo, aber dokumentiert).
- Sicherstellen, dass `<Sonner />` (ist bereits in `App.tsx` gemountet) korrekt geladen ist – keine Änderung nötig, nur Verifikation.

### 3) Verifikation
- `notify-pending` deployen und einmal manuell aufrufen → Logs prüfen.
- Test: eigene Mail senden → kein Push, keine Toast. Eingehende Mail (oder Test‑Insert in `emails` mit Inbox‑Folder) → Push + Toast erscheinen.

## Betroffene Dateien
- `supabase/functions/notify-pending/index.ts` (Logik anpassen, redeploy)
- `src/contexts/InAppNotificationsProvider.tsx` (Inbox‑Filter)

Keine DB‑Migration nötig.
