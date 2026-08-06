# TOP-Beschreibungen schön formatiert in der ETV-Einladung

## Ausgangslage

Der Platzhalter `{agenda_list}` existiert bereits und übernimmt die Beschreibung eines TOPs, sobald die Checkbox „Beschreibung in Einladung übernehmen" aktiv ist. Die Ausgabe ist aktuell aber sehr schlicht:

```text
- TOP 1: Jahresabrechnung 2025
  Die Abrechnung wurde geprüft...
- TOP 2: Wirtschaftsplan 2026
```

Alles landet als ein einziger Text-Platzhalter im Word-Dokument, Beschreibung wird nur mit zwei Leerzeichen eingerückt.

## Was geändert wird

Die Aufbereitung in der Edge Function `comm-render-letters` wird auf eine saubere, lesbare Struktur umgestellt:

- TOP-Zeile als klare Überschrift: `TOP 1 – Jahresabrechnung 2025` (keine Aufzählungsstriche mehr).
- Beschreibung darunter in eigener Zeile, eingerückt, mehrzeilige Beschreibungen behalten ihre Absätze.
- Leerzeile zwischen den TOPs, damit Block und Beschreibung optisch zusammengehören.
- Leere/whitespace-only Beschreibungen werden ignoriert, sodass keine leeren Einrückungszeilen entstehen.

Zusätzlich kommen zwei neue Platzhalter dazu, damit die Word-Vorlage das Layout selbst bestimmen kann (fett, kursiv, Einzug):

- `{#agenda}` … `{/agenda}` — Schleife über die TOPs mit den Feldern `nummer`, `titel`, `beschreibung` und `hat_beschreibung` (Boolean für `{#hat_beschreibung}`).
- `{agenda_list}` bleibt unverändert nutzbar, damit die bestehende Vorlage „Einladung" weiter funktioniert.

Die Platzhalter-Hilfe im UI (Variablen-Übersicht für Vorlagen) wird um die neuen Tags ergänzt, damit sie beim Erstellen einer Word-Vorlage auffindbar sind.

## Vorlage

Die bestehende globale Vorlage `ETV-Einladung.docx` nutzt `{agenda_list}` und profitiert sofort von der besseren Formatierung — kein Neu-Upload nötig. Wenn du je TOP echtes Word-Layout (fette Überschrift, kursive Beschreibung) willst, kannst du die Vorlage später auf den `{#agenda}`-Loop umstellen.

## Technische Details

- `supabase/functions/comm-render-letters/index.ts` → `loadMeetingVars()`: Aufbau von `agenda_list` neu, zusätzlich Array `agenda` in die Vars. Renderer läuft bereits mit `linebreaks: true` und `paragraphLoop: true`, Umbrüche und Loops funktionieren also out of the box.
- `src/components/communication/VariableHelpSheet.tsx`: neue Tags dokumentieren.
