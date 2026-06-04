## Ziel
Admin kann vor/während der Versammlung für **weisungsgebundene Papier-Vollmachten** die Stimmen pro Eigentümer und TOP vorbelegen. Beim Start der Abstimmung werden diese automatisch als reguläre Ja/Nein/Enthaltung-Stimme eingetragen — der Admin kann sie danach noch ändern.

## Was schon da ist
- Spalte `etv_attendees.pre_vote_instructions` (jsonb, `{ "<agenda_item_id>": "yes|no|abstain" }`) existiert bereits.
- `LiveVotingManager` castet diese beim Start automatisch — aber genutzt wird produktiv `MeetingLiveSession`, dort fehlt die Logik.
- Bisher gibt es nur das Eigentümerportal, um Weisungen zu setzen — **keine Admin-UI**.

## Änderungen

### 1. Neue Admin-UI: „Weisungs-Matrix" (`ProxyInstructionsMatrix.tsx`)
Aufruf als Button/Sheet aus `MeetingLiveSession` (oben im Abstimmungs-Bereich): **„Papier-Vollmachten vorbereiten"**.

Inhalt: Tabelle
- Zeilen: alle Anwesenden mit `attendance_type = 'proxy'` (paper-Vollmacht-Halter + per-App-Bevollmächtigte ohne eigene Weisung).
- Spalten: alle TOPs mit `requires_resolution = true`.
- Zelle: 3 kompakte Toggle-Buttons **Ja / Nein / Enth.** + Reset-X.
- Header pro TOP zeigt Kurztitel; bei langem Text Tooltip.
- „Alle Ja / Alle Nein / Alle Enth." Quick-Aktion pro Zeile.

Speichert direkt `etv_attendees.pre_vote_instructions` (merge per assignment) — kein Vote-Insert hier. Toast „Weisung gespeichert".

### 2. Auto-Cast in `MeetingLiveSession.tsx`
In `startVotingMutation` nach dem Status-Update: `pre_vote_instructions[itemId]` aller `proxy`-Attendees als `etv_votes`-Upsert eintragen (`mea_weight` aus Attendee-Shares, `is_manual_override: false`). Toast zeigt: „X Vorab-Weisungen übernommen".

### 3. Visueller Hinweis im Live-Voting
Pro Attendee-Zeile in der Abstimmungsmaske kleiner Badge **„Weisung: Ja"** (grün/rot/grau), wenn `pre_vote_instructions[itemId]` gesetzt ist, damit der Admin sieht, was vorbelegt war.

## Nicht im Scope
- Bestehender Vote-Logik / Mehrheits-Berechnung (gerade gefixt) bleibt unverändert.
- Owner-Portal-Weisungen bleiben unverändert.
- Keine Schema-Änderungen nötig (`pre_vote_instructions` existiert bereits).

## Dateien
- **Neu:** `src/components/meetings/ProxyInstructionsMatrix.tsx`
- **Edit:** `src/components/meetings/MeetingLiveSession.tsx` (Button + Sheet-Mount + Auto-Cast in startVotingMutation + Weisungs-Badge)
