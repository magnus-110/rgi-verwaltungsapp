# Abstimmung: Live-Push raus, Verwalter-Maske stabil

Ziel: Eigentümer stimmen nicht mehr live in der App ab. Sie geben vorab Weisungen und Vollmachten. Während der Versammlung erfasst der Verwalter alle Stimmen selbst — alle TOPs gleichzeitig geöffnet, jede Eingabe wird sofort und zuverlässig gespeichert und bleibt änderbar, bis der TOP geschlossen wird.

## Was Eigentümer künftig sehen

- Kein Abstimmungs-Popup mehr, kein Live-Dashboard, keine Live-Ergebnisse während der Versammlung.
- Vor der Versammlung unverändert möglich: Weisungen zu TOPs erteilen und Vollmachten vergeben.
- Ergebnisse werden erst sichtbar, wenn der Verwalter den TOP geschlossen hat (bzw. im Protokoll/der Beschlusssammlung).

## Was der Verwalter bekommt

- Alle TOPs sind gleichzeitig abstimmbar — kein „Abstimmung starten" mehr für einen einzelnen TOP.
- Pro TOP eine Liste aller stimmberechtigten Einheiten mit Ja / Nein / Enthaltung und Zurücksetzen.
- Vorab erteilte Weisungen sind vorbelegt (als solche gekennzeichnet) und können vom Verwalter überschrieben werden.
- Jeder Klick speichert sofort; die Auswahl erscheint unmittelbar in der Oberfläche (optimistisch) und wird bei Fehlern mit Hinweis zurückgesetzt und erneut versucht.
- „Abstimmung schließen" pro TOP berechnet Ergebnis und friert die Stimmen ein; erst danach ist der TOP schreibgeschützt (Wiedereröffnen bleibt möglich).

## Technische Umsetzung

1. **Owner-App entkoppeln**
   - `VotingPopup` aus `WegOwnerLayout.tsx` entfernen; Komponente löschen.
   - `OwnerLiveDashboard` aus `src/pages/weg-owner/Meetings.tsx` entfernen (Komponente löschen) und den Block bei `item.status === "voting"` (Abstimm-UI) entfernen.
   - Realtime-Kanäle auf `etv_votes` / `etv_agenda_items` in der Eigentümer-Ansicht abbauen.
   - Weisungs- und Vollmacht-Flows bleiben unverändert.
   - `cast-proxy-vote` Edge Function und die Abstimm-Buttons in `EtvProxy.tsx` entfallen (Proxy-Seite bleibt für Weisungen/Vollmacht).

2. **Verwalter-Maske (`MeetingLiveSession.tsx`)**
   - `activeVoteItem`-Logik entfernen: Stimmen werden für alle TOPs gleichzeitig geladen (eine Query über `etv_votes` je `meeting_id` bzw. `agenda_item_id in (...)`), statt Polling alle 2 s + Realtime.
   - Statusmodell: TOP ist bis zum Schließen abstimmbar (`open`), nach Schließen `voted`. `voting` bleibt nur als Altbestand kompatibel.
   - Stimmabgabe über eine gemeinsame Mutation mit `onMutate` (optimistisches Setzen im Cache), `onError` (Rollback + Toast) und ohne Vollrefetch — dadurch keine „verschluckten" Klicks und kein Nachladeruckeln.
   - Vorbelegung aus `pre_vote_instructions` einmalig beim Laden pro TOP, nur wenn noch keine Stimme existiert; Kennzeichnung „Weisung" am Eintrag, Überschreiben setzt `is_manual_override = true`.
   - Ergebnisberechnung beim Schließen wie bisher (MEA / Kopf / doppelt qualifiziert), Ergebnisfelder auf dem TOP speichern.
   - Realtime-Abos in dieser Ansicht auf ein Minimum reduzieren (nur Anwesenheit), da niemand mehr extern abstimmt.

3. **LiveVotingManager**
   - `LiveVotingManager.tsx` wird durch die neue Logik überflüssig, sofern nicht mehr eingebunden — dann entfernen.

Keine Datenbank-Schemaänderung nötig: `etv_votes` und die Ergebnisfelder auf `etv_agenda_items` bleiben wie sie sind.
