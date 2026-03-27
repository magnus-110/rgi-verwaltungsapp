

# Plan: Quorum-Fix, Abstimmungs-Workflow, TOP-Detail & Live-Voting-Popup

## 5 Anforderungen

1. **Quorum**: Beschlussfähig ab 1 anwesendem Eigentümer (nicht >50%)
2. **Admin**: Keine Vollmacht-Vergabe, aber Stimmabgabe für Eigentümer beibehalten
3. **Abstimmung**: Wiedereröffnung nach Schließen möglich; separater "Bestätigen"-Button für endgültiges Ergebnis
4. **Owner-Portal TOP-Detail**: Klick auf TOP in Einladung öffnet Dialog mit Beschreibung + Anhängen
5. **Live-Voting-Popup**: Realtime-Popup für Eigentümer wenn Abstimmung geöffnet wird (egal wo in der App); schließt nach Stimmabgabe; Live-Ergebnisse während Versammlung sichtbar

## Technische Details

### 1. Quorum-Fix (`MeetingLiveSession.tsx`, Zeile 163)
```
// Vorher: quorumReached = presentCount > totalOwners / 2
// Nachher:
const quorumReached = presentCount >= 1;
```

### 2. Admin-Vollmacht entfernen (`MeetingLiveSession.tsx`)
- Shield-Button (Zeile 625-627) und den ganzen Proxy-Dialog (Zeile 684-727) entfernen
- Manuelle Stimmabgabe bleibt erhalten (Zeile 446-467)

### 3. Abstimmungs-Workflow (`MeetingLiveSession.tsx`)
- `endVotingMutation`: Status auf `"closed"` statt `"voted"` setzen; Ergebnis berechnen aber NICHT bestätigen
- Neuer Status-Flow: `null/open` → `voting` → `closed` → `confirmed`
- Bei Status `"closed"`: "Abstimmung erneut öffnen" Button + "Ergebnis bestätigen" Button anzeigen
- "Ergebnis bestätigen" setzt Status auf `"voted"` (final)
- `getStatusBadge`: Neuer Badge für `"closed"` Status ("Abstimmung beendet - unbestätigt")

### 4. TOP-Detail im Owner-Portal (`weg-owner/Meetings.tsx`)
- Agenda-Items in der Einladung (Zeile 600-618) klickbar machen
- Neuer State `selectedAgendaItemId` + Dialog mit:
  - Titel, Beschreibung
  - Anhänge (aus `attachment_paths`) mit Download-Links
  - Abstimmungsergebnis (wenn vorhanden)

### 5. Live-Voting-Popup (Global)
- **Neue Komponente**: `src/components/meetings/VotingPopup.tsx`
  - Supabase Realtime Subscription auf `etv_agenda_items` (filter: `status=eq.voting`)
  - Prüft ob der User ein `etv_attendee` für das betroffene Meeting ist
  - Zeigt fullscreen-Dialog mit TOP-Titel, Beschlusstext, Ja/Nein/Enthaltung Buttons
  - Nach Stimmabgabe: Dialog schließt sich automatisch
  - RLS: Neue INSERT-Policy auf `etv_votes` für WEG-Owner nötig
- **Integration in `WegOwnerLayout.tsx`**: VotingPopup als permanente Komponente einbinden
- **Live-Ergebnisse**: Im Meeting-Detail-Dialog (Owner) bei Status `in_progress` die Ergebnisse pro TOP anzeigen (yes_count, no_count, abstain_count) mit Realtime-Refresh

### DB-Migration
- Neue RLS Policy auf `etv_votes` für INSERT durch WEG-Owner (damit sie selbst abstimmen können)

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/meetings/MeetingLiveSession.tsx` | Quorum auf ≥1; Proxy-Vergabe entfernen; Abstimmungs-Workflow mit closed/confirmed Status |
| `src/pages/weg-owner/Meetings.tsx` | TOP-Detail-Dialog mit Anhängen; Live-Ergebnisse bei in_progress Meetings |
| `src/components/meetings/VotingPopup.tsx` | **Neu** — Globaler Realtime-Abstimmungs-Dialog |
| `src/components/WegOwnerLayout.tsx` | VotingPopup einbinden |
| Migration | INSERT-Policy auf `etv_votes` für WEG-Owner |

