## Problem

Du findest die Mail von Markus Gschwend nicht, weil die aktuelle Suche zwei harte Einschränkungen hat:

1. **Nur 100 neueste Mails pro Ordner** — die Query in `src/pages/Inbox.tsx` (Zeile 331) endet mit `.limit(100)`. Liegt die gesuchte Mail älter, wird sie nie geladen und damit auch nie in der Suche gefunden — selbst wenn Name/Adresse exakt matchen.
2. **Suche nur im aktuell gewählten Ordner** — die Query filtert auf `folder_id = aktueller Ordner` (oder `is_archived=true` im Archiv). Wenn die Mail im Archiv, einem Unterordner, im Spam oder bei einem anderen Account liegt, taucht sie nicht auf.

Zusätzlich werden `cc_addresses` nicht durchsucht, und der `from_address`-Match scheitert manchmal, weil im Feld z.B. `"Markus Gschwend <m.gschwend@…>"` als ein String drinsteht, der bei einer reinen Adress-Eingabe noch matcht, bei einer Namens-Eingabe aber nur greift, wenn der Name dort tatsächlich steht (nicht immer der Fall — manche Server liefern nur die Adresse).

## Plan

Nur Frontend-Änderung in `src/pages/Inbox.tsx` an der `emails`-Query (Zeilen 324–375):

1. **Suchmodus erkennen:** `const isSearching = searchTerm.trim().length >= 2;`
2. **Im Suchmodus ordner-übergreifend suchen:**
   - Folder-Filter (`folder_id`, `is_archived`) NICHT anwenden, wenn `isSearching`.
   - Account-Filter bleibt (damit man nur in seinen Accounts sucht).
   - Papierkorb (`deleted_at`) bleibt ausgeschlossen.
3. **Limit hochsetzen im Suchmodus:** `.limit(isSearching ? 500 : 100)`.
4. **Suchfelder erweitern:** zusätzlich `cc_addresses.ilike.%…%` mit aufnehmen (subject, from_name, from_address, to_addresses, cc_addresses, body_text).
5. **UI-Hinweis:** Wenn `isSearching`, im Header der Mailliste kleinen Text anzeigen: „Suche in allen Ordnern …" damit klar ist, warum plötzlich Mails aus anderen Ordnern auftauchen. Beim Klick auf ein Suchergebnis kann der Folder daran erkannt werden, dass `email.folder_id` ohnehin im Datensatz mitkommt — kein weiterer Umbau nötig.

## Optional (separat, falls Punkt 1–5 nicht reicht)

Falls die Mail trotzdem nicht auftaucht, ist die wahrscheinlichste Restursache, dass sie schlicht nie vom IMAP gefetched wurde (z.B. Ordner nicht synchronisiert). Dann hilft nur ein Refresh/Sync des betreffenden Accounts — das ist außerhalb dieser Code-Änderung.

## Geänderte Datei

- `src/pages/Inbox.tsx` — nur die `useQuery({ queryKey: ["emails", …] })`-Block.
