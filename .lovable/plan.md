

# Plan: Fix fetch-emails Edge Function

## Problem

Die Edge Function `fetch-emails` verbindet sich erfolgreich zum Strato IMAP-Server und oeffnet die Mailbox (7 Nachrichten sichtbar), haengt dann aber in der Fetch-Schleife. Ursache: `client.fetch()` von ImapFlow erwartet einen **String** als Range (z.B. `"1:*"`), bekommt aber ein **Objekt** (`{ seq: "1:*" }`). Dadurch haengt der Iterator still bis zum Timeout.

Ausserdem: `last_sync_at` und `last_uid` bleiben `null` -- die 2 existierenden Emails wurden vermutlich bei einem frueheren Versuch eingefuegt, bevor der Bug auftrat.

## Loesung

### Datei: `supabase/functions/fetch-emails/index.ts`

1. **Range als String statt Objekt**: 
   - Ohne `last_uid`: `range = "1:*"` (Sequence-basiert, `uid: true` aus Options entfernen fuer diesen Fall -- oder direkt UID-basiert)
   - Mit `last_uid`: `range = "${lastUid+1}:*"` mit `uid: true` in den fetch-Options

2. **Konkret**:
   - Wenn `account.last_uid` vorhanden: `range = "${parseInt(account.last_uid) + 1}:*"`, fetch mit `{ uid: true, ... }`
   - Wenn kein `last_uid`: `range = "1:*"`, fetch mit `{ uid: true, ... }` (holt alle per UID)

3. **Logging hinzufuegen**: Nach dem Fetch-Loop `console.log("Fetched X emails")` damit in den Logs sichtbar ist, ob die Schleife durchlaeuft.

4. **Edge Function neu deployen** nach der Aenderung.

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/functions/fetch-emails/index.ts` | `searchCriteria` von Objekt zu String aendern, Logging verbessern |

