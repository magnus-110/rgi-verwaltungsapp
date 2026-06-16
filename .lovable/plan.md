## Ziel
Wenn ein Eigentümer mehrere Wohneinheiten im selben Gebäude hat, soll er **eine einzige Einladung** zur Eigentümerversammlung bekommen — mit einer Auflistung aller seiner Einheiten und der zugehörigen MEA-Anteile, statt mehrerer separater Briefe.

## Aktuelles Verhalten (kurz)
`comm-render-letters` läuft über `loadRecipients()` in `supabase/functions/_shared/comm-vars.ts`. Dort wird **pro `contact_building_assignments`-Zeile** (= pro Einheit) ein Empfänger erzeugt. Ein Eigentümer mit 3 Einheiten → 3 Briefe mit `{{einheit}}` = jeweils 1 Einheit.

## Lösung

### 1. Neuer Modus „Gruppieren nach Eigentümer"
- Filter-Erweiterung `RecipientFilter.group_by_contact?: boolean` in `comm-vars.ts`.
- Wenn aktiv: alle Assignments mit derselben `contact_id` zu **einem** Empfänger zusammenfassen.
- `MeetingInvitationPdf.tsx` (ETV-Einladung) setzt `group_by_contact: true` als festen Default — für ETV ist das immer korrekt (Stimmrecht hängt am Eigentümer, nicht an der Einheit).
- Andere Serienbriefe (LetterCampaignWizard) bleiben unverändert (kann optional später Checkbox bekommen).

### 2. Neue / erweiterte Platzhalter im DOCX
Zusätzlich zu den bestehenden Variablen (`einheit`, `mea` etc.) werden bei Gruppierung folgende **neuen** Variablen geliefert:

| Platzhalter | Inhalt (Beispiel) |
|---|---|
| `{{einheiten}}` | Komma-Liste, z. B. `"WE 1, WE 3, WE 7"` |
| `{{einheiten_count}}` | Anzahl, z. B. `"3"` |
| `{{mea_summe}}` | Summe der MEA aller Einheiten, formatiert `"0,3456"` |
| `{{#einheiten_liste}} … {{/einheiten_liste}}` | Loop-Block für eine Tabelle/Liste |

Innerhalb des Loops verfügbar:
- `{{einheit}}` – Einheitsnummer
- `{{mea}}` – MEA dieser Einheit
- `{{rolle}}` – Rolle für diese Einheit (i. d. R. „eigentuemer")

Abwärtskompatibilität: `{{einheit}}` und `{{mea}}` auf Top-Level bleiben gefüllt — bei Mehrfach-Einheit mit `einheiten` (Komma-Liste) bzw. `mea_summe`, damit alte Vorlagen nicht brechen.

### 3. Anpassung der Word-Vorlage (Anleitung für den Nutzer)
Zwei Varianten — beide funktionieren mit derselben Vorlage:

**Variante A — einfache Komma-Liste (1 Zeile):**
```
Betrifft Ihre Einheit(en): {{einheiten}}
Gesamt-MEA: {{mea_summe}}
```

**Variante B — Tabelle/Aufzählung mit Loop:**
```
Betrifft Ihre Einheiten:
{{#einheiten_liste}}
  • Einheit {{einheit}} — MEA {{mea}}
{{/einheiten_liste}}

Gesamt-MEA: {{mea_summe}}   ({{einheiten_count}} Einheiten)
```

Wichtig für DOCX:
- `{{#einheiten_liste}}` und `{{/einheiten_liste}}` müssen jeweils auf **eigenen Zeilen / in eigenen Tabellenzellen** stehen, damit der Loop-Block die richtige Granularität (Zeile bzw. Tabellenzeile) wiederholt — sonst wird der Inhalt inline mehrfach kopiert.

### 4. UI-Hinweise
- Im VariableHelpSheet die neuen Platzhalter mit kurzem Beispiel-Snippet ergänzen.
- Im Generierungs-Dialog Counter umstellen: statt „X Einladungen" wird jetzt „X Eigentümer (Y Einheiten)" angezeigt, damit der Nutzer den Effekt der Zusammenführung sieht.

## Technische Details
**Geänderte Dateien:**
- `supabase/functions/_shared/comm-vars.ts` — `group_by_contact` implementieren, beim Gruppieren neue Vars + Loop-Array aufbauen.
- `src/components/meetings/MeetingInvitationPdf.tsx` — `recipient_filter: { ..., group_by_contact: true }` setzen; Anzeige „X Eigentümer".
- `src/components/communication/VariableHelpSheet.tsx` — neue Platzhalter dokumentieren.

**Keine DB-Migration nötig.**
