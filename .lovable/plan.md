# Rundmail-Fehler beheben + Schlüssel im Anhänger bearbeitbar machen

## 1. Unique-Constraint-Fehler bei Rundmails mit Anhängen

Geprüft: Die Tabelle der persönlichen Empfänger-Anpassungen (`comm_recipient_overrides`) hat noch die alte Regel „nur ein Eintrag pro Kampagne und Kontakt".
Der Rundmail-Editor speichert aber inzwischen **pro Empfängerzeile** (Kontakt + Einheit/Zuordnung + E-Mail). Sobald derselbe Eigentümer in einem Gebäude mehrere Einheiten hat und für mindestens zwei dieser Zeilen ein persönlicher Anhang oder ein eigener Text hinterlegt ist, versucht die App zwei Zeilen mit gleichem Kontakt zu speichern → Datenbank lehnt mit „duplicate key … unique constraint" ab, Speichern/Senden schlägt fehl.

Lösung:

- Migration: alte Eindeutigkeitsregel `(Kampagne, Kontakt)` entfernen und durch `(Kampagne, Kontakt, Zuordnung, E-Mail)` ersetzen — passend zur heutigen Empfängerlogik. Damit sind mehrere Einheiten desselben Eigentümers erlaubt, echte Doppel bleiben ausgeschlossen.
- Im Editor beim Speichern zusätzlich absichern: identische Empfängerzeilen (gleiche Zuordnung + E-Mail) vor dem Schreiben zusammenführen, damit auch bei „Kein Doppel" nie zwei gleiche Zeilen entstehen.
- Fehlermeldungen beim Speichern bleiben sichtbar (Toast), damit ein künftiger DB-Fehler nicht mehr still bleibt.

## 2. Schlüssel unter einem Anhänger bearbeiten

Aktuell lassen sich die einzelnen Schlüssel nur in der aufgeklappten Anhänger-Zeile bearbeiten; im Anhänger-Dialog (dort, wo man Nummer, Art, Foto und Dateien pflegt) gibt es gar keine Schlüsselverwaltung.

Geplant:

- Im Anhänger-Dialog einen Abschnitt „Schlüssel" ergänzen: Liste aller Schlüssel des Anhängers mit Schlüsselart, Nummer, Hersteller, Notiz.
- Pro Zeile Bearbeiten (Inline-Formular mit vorbefüllten Werten) und Löschen; darunter „Schlüssel hinzufügen".
- Speichern aktualisiert die Liste sofort; Fehler werden als Toast angezeigt.
- In der Anhänger-Liste bleibt die bestehende Bearbeitung erhalten, wird aber optisch als „Bearbeiten"-Modus gekennzeichnet (Titel „Schlüssel bearbeiten" statt Hinzufügen-Formular), damit klar ist, was passiert.

## Technisch

- Migration: `ALTER TABLE public.comm_recipient_overrides DROP CONSTRAINT comm_recipient_overrides_campaign_id_contact_id_key;` + neuer Unique-Index auf `(campaign_id, contact_id, assignment_id, coalesce(lower(email),''))`.
- `src/components/communication/bulk/BulkMailEditor.tsx`: `persist()` — Dedupe der `rows` per `assignment_id|email` vor dem Insert.
- `src/components/buildings/keys/KeyTagDialog.tsx`: neue Sektion mit Query auf `keys` (`tag_id`), Insert/Update/Delete, `DropdownWithAdd` für `key_subject_types` und `key_manufacturers` — Logik analog zu `TagListRow` in `BuildingKeysTab.tsx`, ausgelagert in eine kleine gemeinsame Komponente `KeyItemsSection`.
