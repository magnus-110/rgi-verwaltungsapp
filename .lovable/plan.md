# Umfrage-Ergebnisse: Einzelstimmen aufklappbar anzeigen

## Ziel
In der Verwaltungs-Ansicht (Umfragen → Tab „Ergebnisse") soll pro Umfragepunkt aufklappbar sichtbar sein, welcher Eigentümer wie abgestimmt hat — inklusive Folgeantwort, „dringend"-Kennzeichen und Kommentar.

## Was der Verwalter sieht
Unter jedem Ergebnis-Balken eine unauffällige Zeile „Einzelstimmen anzeigen (12)". Nach dem Aufklappen eine kompakte Liste:

```text
Max Mustermann · Einheit 0003 · MEA 84,50    [Ja]  dringend
   Folgeantwort: „Nur Südseite"
   „Bitte vorher Angebote einholen."
```

- Sortierung: Stimmen mit Kommentar zuerst, danach alphabetisch nach Name.
- Farbige Badges für Ja (grün) / Neutral (grau) / Nein (rot), passend zu den bestehenden Balkenfarben.
- Kommentare kursiv, Folgeantwort als Klartext (Text aus `followup_options` statt Index-Nummer).
- Kein Kommentar/keine Folgeantwort → Zeile bleibt einzeilig.
- Sind für einen Punkt keine Stimmen vorhanden, erscheint kein Aufklapper.

## Technische Umsetzung
- Neuer Hook `useSurveyVoteDetails(surveyId)` in `src/hooks/useSurvey.ts`: lädt `survey_votes` (item_id, choice, followup_choice, urgent, comment, mea_weight, contact_id) für die Umfrage und dazu die Namen aus `contacts`; gruppiert nach `item_id`. Die bestehende RLS-Policy `votes_select_own` erlaubt Verwaltungs-Nutzern (`is_rgi_staff()`) bereits den Vollzugriff — keine Migration nötig.
- `survey_items.followup_question` / `followup_options` werden mitgeladen, um Folgeantworten als Text darzustellen.
- `src/components/survey/SurveyDashboard.tsx`: `ResultRow` erhält die Stimmen des Punktes und rendert sie in einem `Collapsible` (shadcn) — standardmäßig zugeklappt.
- Rein additive Änderung: KPIs, Einstufung und der Schalter „Auf Tagesordnung" bleiben unverändert.
