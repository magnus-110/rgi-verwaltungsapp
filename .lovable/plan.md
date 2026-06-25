## 1) Mehrfachauswahl im Gebäude-Mitglieder-Dropdown reparieren

**Bug:** In `RecipientField` (src/components/email/FloatingComposeWindow.tsx) wird nach dem Hinzufügen einer Person das Eingabefeld auf `…, mail@x.de, ` gesetzt. Das letzte Segment beginnt dadurch nicht mehr mit `/` → `buildingMode = false` → der `useEffect` (Zeile 1573) setzt `selectedBuilding` auf `null` → die Mitgliederliste schließt sich nach dem ersten Klick. Genau dieser Effekt blockt die gewünschte Mehrfachauswahl.

**Fix (nur Frontend, eine Datei):**

- Den auto-Reset-Effekt entfernen bzw. so umstellen, dass `selectedBuilding` **nicht** allein deshalb zurückgesetzt wird, weil das aktive Segment leer ist oder kein `/` mehr enthält. Reset nur, wenn der User aktiv neuen Text (ohne `/`) tippt — Erkennung: nach `onChange` prüfen, ob das `lastSegment` nicht leer ist und kein `/` enthält → dann `setSelectedBuilding(null)`. Leeres Segment (direkt nach Hinzufügen) hält die Mitgliederansicht offen.
- `activeList`/`dropdownOpen` so anpassen, dass das Dropdown solange offen bleibt, wie `selectedBuilding` gesetzt ist — also `dropdownOpen = suggestionsOpen && (activeList.length > 0 || !!selectedBuilding)`.
- Sticky-Header der Mitgliederansicht: kleinen „Fertig"-Button rechts ergänzen, der `selectedBuilding` zurücksetzt und das Dropdown schließt (klare Exit-Option zusätzlich zu Esc / „← Zurück" / Klick außerhalb).
- Verhalten bestätigt: bereits hinzugefügte Adressen bleiben ausgegraut mit Häkchen; weitere Klicks fügen weitere Mitglieder an, Reihenfolge der Eingabe bleibt erhalten.

Kein Schema-, Edge-Function- oder Datenänderungs-Bedarf.

## 2) Fehlende Mail von Marcel Wnendt (23.6.2026 11:39)

**Befund aus der DB (read-only):**

- Alle Mails von `wnendt@contigo-energie.de` sind vorhanden bis 18.6.2026, danach nichts mehr.
- Account-Status `email_accounts`:
  - `magnus.goettinger@rgi-immobilien.de`: `last_sync_at = 2026-06-22 17:10:04` (**seit fast 3 Tagen kein Sync**), `last_sync_error = NULL`, `is_active = true`.
  - Alle anderen Postfächer (info, andreas, christine, maximilian, regina): synchronisieren weiter alle ~2 Min (zuletzt 25.6. 08:54).

**Ursache (sehr wahrscheinlich):** Der IMAP-Fetch für Magnus' Postfach hängt seit dem 22.6. Da `last_sync_error` leer ist, hat der Cron-Job entweder still abgebrochen (Timeout/Hang in der `fetch-emails`-Edge-Function ohne `catch`-Pfad, der den Fehler in `last_sync_error` schreibt), oder Strato hat die IMAP-Session blockiert (zu viele parallele Verbindungen / Passwort-/IP-Sperre nach Fehlversuchen). Die Wnendt-Mail vom 23.6. 11:39 ging vermutlich an Magnus und wurde daher nie importiert.

**Vorgeschlagenes Vorgehen (zur Bestätigung, KEINE Änderungen ohne Freigabe):**

1. Edge-Function-Logs der letzten 3 Tage für die Mail-Fetch-Function (`fetch-emails` o. ä.) speziell für `account_id = f57f1f88-2c19-4123-8597-50619c2ad4c7` durchgehen, um den Hänger zu identifizieren.
2. Manueller Test-Fetch nur für dieses Konto (Edge-Function direkt curlen) — bringt entweder die fehlenden Mails (inkl. Wnendt) sofort nach oder liefert den echten IMAP-Fehler (z. B. Auth-Failure, Verbindungslimit).
3. Falls Auth/Connection-Problem: bei Strato im Webmail prüfen, ob die Mail überhaupt angekommen ist (Inbox vs. Spam). Falls ja: IMAP-Passwort in `email_accounts` aktualisieren bzw. Verbindung zurücksetzen.
4. Robustheits-Fix in der Fetch-Function: jeden Account-Loop in try/catch + Timeout (z. B. 60 s), bei Timeout/Error `last_sync_error` schreiben statt still hängen, damit so ein Ausfall sofort sichtbar wird. (Separate Aufgabe, eigenes Edit, wenn gewünscht.)

**Sofort lieferbar in diesem Plan:** nur der UI-Fix unter Punkt 1. Punkt 2 sind Diagnose-Schritte — bitte freigeben, ob ich (a) nur die Logs prüfen, (b) einen manuellen Re-Sync auslösen und/oder (c) den Robustheits-Fix in der Edge-Function umsetzen soll.

## Technische Details (Punkt 1)

Datei: `src/components/email/FloatingComposeWindow.tsx` (RecipientField, ~Zeilen 1560–1690).

```diff
- useEffect(() => {
-   if (!buildingMode && selectedBuilding) setSelectedBuilding(null);
- }, [buildingMode, selectedBuilding]);
+ // Mitgliederansicht NICHT zurücksetzen, wenn das letzte Segment leer ist
+ // (Zustand direkt nach Hinzufügen). Nur zurücksetzen, wenn der User aktiv
+ // neuen Suchtext ohne führenden "/" tippt.
+ useEffect(() => {
+   if (!selectedBuilding) return;
+   const seg = lastSegment;
+   if (seg.length > 0 && !seg.startsWith("/")) setSelectedBuilding(null);
+ }, [lastSegment, selectedBuilding]);

- const dropdownOpen = suggestionsOpen && activeList.length > 0;
+ const dropdownOpen = suggestionsOpen && (activeList.length > 0 || !!selectedBuilding);
```

Sticky-Header der Mitgliederansicht erweitern um einen `"Fertig"`-Button (rechts), der `setSelectedBuilding(null)` + `setSuggestionsOpen(false)` aufruft.
