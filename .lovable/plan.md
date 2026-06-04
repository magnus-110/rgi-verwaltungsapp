## Ziel
Stabiles Live-Voting: Weisungen werden zuverlässig 1× übernommen, manuelle Overrides bleiben bestehen, Reset wird nicht überschrieben, und nach „Beenden" sind alle Stimmen mit korrekten Counts gespeichert und sichtbar.

## Änderungen in `src/components/meetings/MeetingLiveSession.tsx`

### 1. Auto-Cast-Effekt entkoppeln
- `useEffect` Dependencies auf `[activeVoteItem, attendees]` reduzieren – `currentVotes` raus.
- Innen synchron einmalig `queryClient.getQueryData(["etv-votes-live", activeVoteItem])` lesen, um zu prüfen welche Assignments schon eine Stimme haben (statt aus React-State).
- `autoCastAttempted` Ref durch eine **DB-getriebene Markierung** ersetzen: vor dem Upsert prüfen, ob bereits ein Vote (egal ob manual oder auto) existiert. Damit wird ein gelöschter Reset NICHT neu übergeschrieben, weil wir zusätzlich ein lokales `Set<itemId+assignmentId>` für „in dieser Session bereits behandelt" führen, das **nicht** beim `activeVoteItem`-Wechsel geleert wird (nur einmal pro Mount).

### 2. Reset respektiert Weisung
- In `resetVoteMutation` nach erfolgreichem Delete den Key `${itemId}:${assignmentId}` in `autoCastAttempted` eintragen (oder in ein neues `manuallyClearedRef`), damit der Auto-Cast die Stimme NICHT erneut aus der Weisung wiederherstellt.

### 3. Override stabil
- `castVoteMutation` (manueller Ja/Nein/Enth.) trägt assignment ebenfalls in `autoCastAttempted` ein, damit kein Re-Run die Stimme zurück auf die Weisung schreibt, falls der Admin die Weisung nicht parallel ändert.

### 4. „Beenden" korrigieren
- `endVotingMutation.mutationFn`: **vor** der Berechnung frische Votes per `await supabase.from("etv_votes").select("*").eq("agenda_item_id", itemId)` holen, dann counts und Ergebnis daraus berechnen. Keine Closure-Variable mehr verwenden.
- `onSuccess`: `activeVoteItem` NICHT sofort auf `null` setzen – erst nach dem Schließen des Result-Dialogs (oder Grid soll bei `status='closed'` weiterhin die Votes aus DB anzeigen). Konkret: Query `etv-votes-live` auch für `closed` Items aktiv halten, indem in Grid-Render-Code auf `selectedItem.status === 'voting' || selectedItem.status === 'closed'` geprüft wird.

### 5. Klarere Indikatoren (UI nur, optional)
- Badges in der Stimmen-Tabelle: „aus Weisung" vs. „manuell" (Lesen aus `is_manual_override`).

## Verifikation
- Edge Function nicht betroffen, kein Migration nötig.
- Manueller Test im Preview:
  1. TOP A mit 2 Vorab-Weisungen starten → 2 Stimmen erscheinen, kein Doppel-Cast.
  2. Manuell überschreiben → bleibt stehen, läuft nicht zurück.
  3. Reset (↩) → Stimme bleibt gelöscht, wird nicht aus Weisung wiederhergestellt.
  4. „Beenden" klicken → korrekte Counts gespeichert, Stimmen weiter sichtbar.
