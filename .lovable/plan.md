# Heizkosten-Hilfe-Wizard im Nebenkosten-Tool

## Ziel
Im Eigentümer-Nebenkostentool (`src/pages/weg-owner/NebenkostenTool.tsx`) soll am Heizkosten-Feld ein aufklappbarer 3-Schritte-Wizard „Wo finde ich diesen Wert?" eingebaut werden. Die bisherige KI-Auslese der Heizkostenabrechnung wird ersatzlos entfernt – Frontend **und** Backend.

## 1. KI-Auslese entfernen
In `src/pages/weg-owner/NebenkostenTool.tsx`:
- State und Hilfsvariablen löschen: `aiLoading`, `aiResult`, `aiAssisted`, `handleHeatingUpload`, `acceptAiSuggestion`.
- Den kompletten „Optional: Heizkostenabrechnung hochladen"-Block (Zeilen ~823–1033) entfernen, inklusive Datei-Input, Vorschlags-Karte und „Wert übernehmen / Verwerfen".
- `aiAssisted`-Logik aus `onChange` des Heizkosten-Inputs (Zeile 815) und aus dem Save-Payload (Zeile 500 ff.) entfernen.
- Nicht mehr benötigte Imports aufräumen (`Loader2`, ggf. `HelpCircle` falls anderswo ungenutzt).

Backend / Edge Function:
- `supabase/functions/extract-heating-statement/` wird nicht mehr aufgerufen und kann entfernt werden (Verzeichnis + Eintrag in `supabase/config.toml`, falls vorhanden).

## 2. Neuer Hilfe-Wizard direkt unter dem Heizkosten-Eingabefeld
Neue Komponente `src/pages/weg-owner/HeizkostenHilfeWizard.tsx`, in `NebenkostenTool.tsx` an der Stelle des entfernten KI-Blocks gerendert. Props: `onUebernehmen(value: number) => void` (schreibt in `heatingOverride`).

UI-Rahmen
- Trigger: Sekundär-Button bzw. Link „Wo finde ich diesen Wert?" (mit `HelpCircle`-Icon) unter dem Input.
- Inhalt klappt **inline** auf (kein Modal), in einer abgesetzten Card. Alles einspaltig, gestapelt, mobil-freundlich.
- Footer immer mit „Zurück" (links, ab Schritt 2) und „Weiter" (rechts, Schritte 1+2) bzw. „Schließen" (Schritt 3). Schritt-Indikator „Schritt X von 3".
- Bilder: `<img>` mit `style={{ maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}` und Wrapper `max-w-[720px] mx-auto`.

Schritt 1 – „Hat Ihre Heizung überhaupt eine CO2-Umlage?"
- Liste, alle Heizungsarten untereinander, jede Zeile: farbiges Status-Icon (✅ grün CheckCircle2, ❌ rot XCircle, ⚠️ gelb AlertTriangle) + Name + Erklärung.
- Einträge wie vom Nutzer vorgegeben (Erdgas, Heizöl, Flüssiggas = ✅; Fernwärme = ⚠️; Wärmepumpe, Holzpellets = ❌).
- Hinweissatz unter der Liste: „Hat Ihre Heizung keinen CO2-Anteil, tragen Sie einfach den Heizungs-/Warmwasser-Wert ein. Kaltwasser/Hausnebenkosten gehören NICHT in dieses Feld."

Schritt 2 – „Wer ist Ihr Messdienstleister?"
- Grid aus großen, tippbaren Buttons (`grid-cols-2 sm:grid-cols-3`, min-height ~64 px), kein Dropdown.
- Anbieter: Brunata, Techem, RegioMess, Allgäu Messpartner, ista.
- Auswahl setzt `selectedAnbieter` und springt automatisch zu Schritt 3.

Schritt 3 – Anleitung + Beispiel + Mini-Rechner
- Headline „Anleitung für {Anbietername}" mit kleinem „Anbieter wechseln"-Link (springt zurück zu Schritt 2).
- Zwei nummerierte Schritte (ol/li): pro Schritt zuerst Text, darunter das Bild zentriert.
- Beispielzeile: „Beispiel: {betrag} € − {co2} € CO2 = {ergebnis} €".
- Mini-Rechner: zwei Number-Inputs („Betrag Heizung + Warmwasser (€)", „CO2-Vermieteranteil (€)", leer/0 erlaubt). Live-Ausgabe „Einzutragen: **{betrag − co2} €**" (auf 2 Nachkommastellen, „de-DE"-Format). Button „Wert übernehmen" → ruft `onUebernehmen(result)` auf, schließt den Wizard und setzt `heatingOverride`.

Datenstruktur `MESSDIENST_HILFE` wie vom Nutzer vorgegeben, oben in der Komponente als const exportiert, damit leicht änderbar. Bildpfade `/help/heizkosten/{anbieter}-{1|2}.png`.

## 3. Bilder
Die Bilder werden vom Nutzer im nächsten Schritt hochgeladen. Sie werden unter `public/help/heizkosten/` abgelegt (`brunata-1.png`, `brunata-2.png`, `techem-1.png`, `techem-2.png`, `ista-1.png`, `ista-2.png`, `allgaeu-1.png`, `allgaeu-2.png`, `regiomess-1.png`, `regiomess-2.png`), sodass die Pfade `/help/heizkosten/...` direkt funktionieren. Bis die Bilder vorliegen, wird ein neutrales Platzhalter-`<img>` mit `onError` → versteckt verwendet, damit der Wizard sofort nutzbar ist.

## Technische Details
- Keine Änderungen an Datenmodell oder Logik der Nebenkostenberechnung – `heatingOverride` bleibt das einzige Zielfeld.
- State im Wizard lokal: `step: 1|2|3`, `anbieter: keyof typeof MESSDIENST_HILFE | null`, `betrag: string`, `co2: string`.
- Ergebnisberechnung: `parseFloat(betrag.replace(",", ".")) - parseFloat(co2.replace(",", "."))`, NaN → 0; Anzeige via `toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- Beim Schließen (manuell oder nach Übernehmen) wird der Wizard-State zurückgesetzt.
- Styling konsistent mit bestehenden `RGI`-Tokens und shadcn-Buttons im File.
