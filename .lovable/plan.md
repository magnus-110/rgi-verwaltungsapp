## Ziel

In der „Geplante E-Mails"-Liste sollen Rundmails ihre konkreten Empfänger sichtbar machen — also pro Empfänger eine eigene Zeile (Name + E-Mail + geplanter Zeitpunkt), gruppiert unterhalb des Kampagnen-Headers. Aktuell steht dort nur „0 Kontakte", weil die Empfänger-Auflösung erst zur Versandzeit in `comm-send-bulk-email` passiert.

## Umsetzung

### 1. Neue Edge Function `comm-preview-recipients`
- Input: `{ campaign_id }`
- Lädt die Kampagne (`recipient_filter`, `building_id`, `free_vars`)
- Ruft die bestehende `loadRecipients(...)` aus `_shared/comm-vars.ts` mit `require_email: true`
- Gibt zurück: `[{ contact_id, person_id, display_name, email }]`
- Nutzt Service-Role und prüft Auth-Header (nur eingeloggte Nutzer)

### 2. Frontend: `Inbox.tsx` — `scheduled-mails-virtual`
- Beim Laden der geplanten Kampagnen für jede Kampagne `comm-preview-recipients` parallel aufrufen (Promise.all, mit Fallback auf leeres Array bei Fehler).
- Ergebnis in den Campaign-Item als `resolved_recipients: { display_name, email, contact_id }[]` hängen.
- `recipient_count` aus tatsächlicher Anzahl ableiten (statt aus `comm_campaigns.recipient_count`, das beim Planen oft 0 ist).
- Auto-Refresh bleibt bei 60 s.

### 3. `ScheduledMailsPanel.tsx` — Gruppierte Darstellung
- `ScheduledItem` um `resolved_recipients?` erweitern.
- Bei `kind === "campaign"`: Kampagnen-Header (wie heute, mit Symbol, Betreff, Zeitpunkt, Absender, „Rundmail (email)"-Badge, Anzahl Empfänger).
- Darunter: für jeden Empfänger eine eingerückte, kompakte Zeile mit:
  - Mail-Icon (klein, ausgegraut)
  - `Name` und `email@…`
  - „Aus Versand entfernen"-Icon-Button (X) → aktualisiert `comm_campaigns.recipient_filter`, indem die `contact_id` aus `contact_ids` entfernt wird, dann Query invalidieren.
- Top-Level „Abbrechen"-Button (Trash) bleibt → storniert ganze Kampagne wie bisher.
- Loading-Skeleton (3 ausgegraute Sub-Zeilen) solange `resolved_recipients` undefined ist.
- Falls 0 Empfänger nach Auflösung: kleine Warnung „Keine Empfänger mit hinterlegter E-Mail — Versand wird fehlschlagen".

### 4. Backwards-Compat
- Einzelmails (`kind === "single"`) bleiben unverändert (eine Zeile, keine Sub-Rows).
- `comm_campaigns.recipient_count` wird weiterhin geschrieben, nur in der Anzeige durch die echte Auflösung ersetzt.

## Technische Details

- **Neue Datei**: `supabase/functions/comm-preview-recipients/index.ts`
- **Geänderte Dateien**: 
  - `src/pages/Inbox.tsx` (scheduled-mails-virtual Query)
  - `src/components/email/ScheduledMailsPanel.tsx` (UI + Remove-Logik)
- **Performance**: bei N geplanten Kampagnen N parallele Funktion-Aufrufe; bei den üblichen 1–5 Kampagnen unkritisch. React-Query cached pro `queryKey`, kein Hot-Spam.
- **Keine DB-Migration nötig** — `recipient_filter` ist bereits jsonb und schreibbar.