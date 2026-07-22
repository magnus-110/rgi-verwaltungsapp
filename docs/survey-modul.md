# Modul „Eigentümer-Umfrage" – Integrationsanleitung

## Dateien / Ablage
| Datei | Ziel im Repo |
|---|---|
| `supabase/migrations/20260722_survey_feature.sql` | `supabase/migrations/` (Zeitstempel ggf. anpassen) |
| `supabase/seed_survey_achweg.sql` | einmalig ausführen zum Befüllen (Beispiel Achweg 3-5) |
| `src/hooks/useSurvey.ts` | `src/hooks/` |
| `src/components/survey/SurveyRunner.tsx` | `src/components/survey/` (Eigentümer-Ansicht) |
| `src/components/survey/SurveyDashboard.tsx` | `src/components/survey/` (Verwaltungs-Ansicht) |

## Schritte
1. **Migration anwenden** (`supabase db push` bzw. über euer übliches Deployment).
2. In `is_rgi_staff()` das **Rollenmodell anpassen** (der Platzhalter prüft `profiles.role IN ('admin','mitarbeiter','verwalter')`). Nutzt hier eure vorhandene Rollenprüfung/`has_role()`.
3. **Typen neu generieren** (`supabase gen types typescript`), damit `surveys`, `survey_items`, `survey_votes`, `survey_item_results` in `types.ts` landen. Danach verschwinden evtl. `any`-Warnungen.
4. **Routen ergänzen**:
   - Eigentümer-Portal: neuer Menüpunkt „Umfrage" → `<SurveyRunner />` (analog zu `weg-owner/Resolutions`).
   - Verwaltung: Seite/Tab → `<SurveyDashboard surveyId=… buildingId=… agendaMap=… />` (nur für `is_rgi_staff`).
5. Seed ausführen und die Umfrage in der Verwaltung von `draft` auf `open` setzen.

## Wie funktioniert das Stimmgewicht (MEA)?
- Der eingeloggte Eigentümer wird über `contacts.user_id = auth.uid()` erkannt.
- Sein MEA kommt aus `contact_building_shares` (share_type = `mea`) – bei Achweg 3-5 ist die Gesamtsumme **2.060,61**, nicht 2000. Deshalb wird alles **dynamisch** über `building_total_mea()` berechnet.
- Beim Speichern setzt der Trigger `survey_vote_fill()` `contact_id`, `building_id` und `mea_weight` **serverseitig** – der Client kann das Gewicht nicht manipulieren.
- Auswertung im Dashboard: Ja-Anteil = `mea_ja / (mea_ja+mea_neutral+mea_nein)`. Einstufung: Sicherheit → Pflicht; ≥50 % → Beschlussantrag; 25–50 % → Diskussionspunkt; <25 % → zurückgestellt. Schwellen in `classify()` bzw. `EINSTUFUNG` anpassbar.

## Sicherheits-/Pflichtpunkte
Items mit `is_safety = true` (Handläufe/Geländer, Entwässerung, Wasserleck, Brandschutz) zeigen **keine Ja/Nein-Abstimmung**, sondern den Hinweis „wird aus Gründen der Verkehrssicherungspflicht ohnehin umgesetzt" + optionales Kommentarfeld. Sie sind im Dashboard fest als „Pflicht/Sicherheit – kommt auf TO" markiert.

## Bilder – so machen wir es
Bucket **`survey-images`** (privat) wird von der Migration angelegt; Auslieferung über **signierte URLs** (1 h), damit die Fotos nicht öffentlich im Netz stehen.

Drei Wege, Bilder an ein Item zu hängen (Tabelle `survey_item_images`):

1. **Neu hochladen (Verwaltung):** im Admin-UI Datei wählen →
   ```ts
   const path = `${surveyId}/${itemId}/${crypto.randomUUID()}.jpg`;
   await supabase.storage.from("survey-images").upload(path, file, { upsert: true });
   await supabase.from("survey_item_images").insert({ item_id, storage_path: path, caption });
   ```
2. **Aus dem DMS übernehmen:** viele Fotos liegen schon in `building_files` (z. B. Handlauf, Treppen, Beleuchtung, Spundwand, Schilder). Datei aus dem `building_files`-Bucket in `survey-images` kopieren und `source_file_id` setzen (Herkunft dokumentiert). So bleibt die DMS-Datei die Quelle.
3. **Vor-Ort-Fotos vom Handy:** gleicher Upload-Weg wie 1) – ideal für die noch fehlenden Bilder (z. B. Pfütze unterer Eingang).

Empfehlung: Fotos vor dem Upload auf **ca. 1200 px Breite / < 300 KB** verkleinern (schnelles Laden auch bei älteren Geräten/mobil). Ein Item kann mehrere Bilder haben (`position`), im Runner wird aktuell das erste angezeigt – für eine Galerie lässt sich das leicht erweitern.

## Barrierefreiheit (älteres Publikum)
Große Schrift, große Tap-Flächen, ein Thema pro Seite, Fortschrittsanzeige, Zwischenspeichern (jede Antwort wird beim „Weiter" sofort gespeichert). Für Eigentümer ohne App empfiehlt sich zusätzlich eine Papier-/PDF-Variante mit denselben Fragen (Ergebnisse trägt die Verwaltung nach).
