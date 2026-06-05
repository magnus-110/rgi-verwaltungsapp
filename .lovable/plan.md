## Plan

1. **Word-Generierung zuverlässig machen**
   - `rgi-render-invoice` so erweitern, dass der Fehler `Object not found` aus der Word-Vorlage nicht mehr als generischer Toast endet.
   - Die DOCX-Platzhalter robuster auslesen/normalisieren und fehlende Felder konsequent leer befüllen.
   - Fehlerdetails aus `docxtemplater` verständlich an die App zurückgeben, damit künftig sichtbar ist, welcher Platzhalter problematisch ist.

2. **Vorlagen-Parsing korrigieren**
   - Den Upload-Flow der Word-Vorlagen korrigieren: aktuell ruft `TemplatesTab` die Parser-Funktion mit `storage_path` auf, die Edge Function erwartet aber `template_id`. Dadurch bleibt `placeholder_schema` leer.
   - Nach dem Upload zuerst den Template-Datensatz mit ID erzeugen und dann diese ID an `rgi-parse-template-placeholders` übergeben.
   - Die Parser-Funktion optional kompatibel machen, sodass sie auch ältere Aufrufe mit `storage_path` sauber verarbeiten kann.

3. **Rechnungseditor als Vollbild statt Dialog**
   - `InvoiceEditorDialog` visuell zu einer fullscreen Arbeitsfläche umbauen: kein kleines Fenster mehr, sondern viewport-füllend mit Kopfzeile, linker Eingabespalte und rechter Vorschau.
   - Bestehende Öffnen/Schließen-Logik beibehalten, aber die Darstellung wirkt wie eine eigene Vollbild-Seite.

4. **Linke Seite übersichtlicher machen**
   - Formular in klare Abschnitte aufteilen: Basisdaten, Positionen, Texte, Zahlungen.
   - Basisdaten kompakter gruppieren, lange Button-Reihen entschärfen und Positionszeilen besser lesbar machen.
   - Wichtige Aktionen unten/fest erreichbar lassen: Entwurf speichern, Word, PDF, versenden/rendern.

5. **Rechte Vorschau als App-Container statt HTML/Papierlook**
   - `InvoiceLivePreview` in eine strukturierte In-App-Vorschau umbauen: Header, Kundendaten, Rechnungsdaten, Positionen, Summen und Zahlungshinweise als Container/Listen.
   - Kein A4-/HTML-Dokumentlook mehr nötig; Fokus auf sofortige Prüfbarkeit im Programm.

6. **Validierung**
   - Edge Function deployen und mit einer vorhandenen Rechnung/Vorlage testen.
   - Prüfen, dass Word-/PDF-Erzeugung keine `Object not found`-Meldung mehr wirft und der neue Vollbild-Editor korrekt angezeigt wird.