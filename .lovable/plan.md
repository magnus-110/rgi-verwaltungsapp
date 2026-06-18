# KI-Auslese Heizkostenabrechnung (Nebenkosten-Tool)

Prinzip: **KI schlägt vor, Mensch bestätigt.** Das bestehende manuelle Heizungsfeld bleibt unverändert. Der hochgeladene Wert wird erst nach Klick auf "Übernehmen" eingetragen.

## 1. Neue Edge Function: `extract-heating-statement`

Kopie der Struktur von `supabase/functions/extract-invoice/index.ts`, zwei Schritte:

**Auth (eigentümerfähig):** Muster aus `get-owner-billing-positions`. User via `userClient.auth.getUser()`, dann `assignment_id` gegen `contact_building_assignments` prüfen (gehört Wohnung diesem User?).

**Schritt 1 – OCR:** `mistral-ocr-latest` mit Signed URL aus `building-files`. PDF → `document_url`, JPG/PNG → `image_url`.

**Schritt 2 – Strukturierte Auslese:** `mistral-small-latest` mit Tool-Calling. Festes JSON-Schema:

```
found, anteil_gesamtkosten, heizkosten, warmwasserkosten,
co2_vermieteranteil, suggested_value,
nutzungszeitraum_von, nutzungszeitraum_bis, mieterwechsel_verdacht,
confidence ("hoch"|"mittel"|"niedrig"),
source_quote, warnings[]
```

**Prompt-Regeln (Fachwissen):**
- Suche "Ihr Anteil an den Gesamtkosten" bzw. Summe Heiz+Warmwasser
- Vermieteranteil CO₂ ("CO₂KostAufG") abziehen → `suggested_value = anteil_gesamtkosten − co2_vermieteranteil`
- Kein volles Jahr im Nutzungszeitraum → `mieterwechsel_verdacht=true`, `confidence="niedrig"`
- Niemals Zahlen erfinden. Fehlt Hauptbetrag → `found=false`
- Herstellerunabhängig (Techem, ista, Brunata, Minol)

## 2. Upload + UI in `NebenkostenTool.tsx` (Abschnitt 3 "Heizung / Warmwasser / Wasser")

Bestehendes Eingabefeld (`heatingOverride`, Zeile 712) bleibt 1:1 erhalten.

**Darunter neuer Bereich** "Optional: Heizkostenabrechnung hochladen":
- File-Input (PDF/JPG/PNG)
- Upload nach `building-files` unter `service/heating-uploads/{assignment_id}/{ts}-{name}`
- Aufruf `supabase.functions.invoke("extract-heating-statement", { body: { assignment_id, file_path } })`
- Nach Auslese: Datei wieder aus Storage entfernen (Datensparsamkeit)

**Ergebniskarte – 3 Zustände:**

a) **Treffer** (`found=true`, `confidence!=niedrig`): Herleitung zeigen (Anteil − CO₂-Vermieteranteil = Vorschlag), Buttons **[Wert übernehmen]** / **[Verwerfen]**.

b) **Unsicher** (`mieterwechsel_verdacht` oder `confidence=niedrig`): Gefundene Zahlen zur Orientierung, **kein** Übernehmen-Button, Hinweis "bitte selbst eintragen".

c) **Nichts gefunden** (`found=false`): Klare Meldung "keinen eindeutigen Betrag erkannt".

**Übernehmen-Logik:**
```ts
onClick={() => { setHeatingOverride(aiResult.suggested_value); setAiResult(null); }}
```
Wert ist danach weiterhin manuell editierbar.

**Snapshot in `handleBuy` (heating-Objekt, Zeile 414 ff.)** zusätzlich:
- `ai_assisted: boolean`
- `ai_confidence?: string`
- `ai_source_quote?: string`

Für Audit/Haftung nachvollziehbar.

## 3. Sicherheits-/Sonderfälle (im Prompt + UI)

- **Mieterwechsel**: Bestehender Mieterwechsel-Hinweis im Tool bleibt; KI-Vorschlag wird in diesem Fall blockiert (Zustand b).
- **CO₂-Falle**: Herleitung sichtbar zeigen (Anteil minus Vermieteranteil), damit User Logik versteht.
- **Doppelt-Wasser**: Als `warning` ausgeben, ergänzt bestehenden gelben Hinweis Abschnitt 4.
- **Datenschutz**: Upload nach Auslese löschen.
- **Kauf-Dialog mit Widerrufsverzicht** bleibt unverändert die finale Bestätigung.

## 4. Umsetzungsreihenfolge

1. Edge Function `extract-heating-statement` (Kopie + neuer Prompt + Owner-Auth)
2. Upload-Komponente + Ergebniskarte (3 Zustände) im Heizungs-Abschnitt
3. Übernehmen-Button + `ai_assisted`-Felder im Snapshot
4. Kurzhilfe "So finden Sie Ihren Wert" als Inline-Hinweis am Heizungsfeld

## 5. Betroffene Dateien

- **NEU:** `supabase/functions/extract-heating-statement/index.ts`
- **NEU:** `supabase/config.toml` Eintrag (verify_jwt nach Pattern)
- **EDIT:** `src/pages/weg-owner/NebenkostenTool.tsx` (Abschnitt 3 + `handleBuy`-Snapshot)

Keine Datenbank-Migration nötig (nutzt bestehenden `building-files`-Bucket und `contact_building_assignments`).

## 6. Test-Checkliste

- [ ] Techem mit CO₂-Abzug → Vorschlag = Anteil − Vermieteranteil
- [ ] Abrechnung ohne CO₂ → voller Anteil, kein Phantom-Abzug
- [ ] Foto schräg/unscharf → sauber "nichts gefunden"
- [ ] Mieterwechsel-Abrechnung → `confidence=niedrig`, kein Übernehmen-Button
- [ ] Fremdes Dokument (Rechnung) → `found=false`
- [ ] Übernommener Wert ist nachträglich manuell änderbar
