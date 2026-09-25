# E-Mail-Anhänge einklappen und TOP-Dokumente in der Durchführung anzeigen

## Umsetzung

1. **E-Mail-Anhänge kompakt darstellen**
   - Die Anhangsleiste im Postfach zeigt standardmäßig höchstens eine sichtbare Zeile.
   - Nur wenn die Anhänge tatsächlich in eine weitere Zeile umbrechen, erscheint eine eindeutige Schaltfläche zum Auf- und Zuklappen.
   - Beim Aufklappen bleiben alle vorhandenen Funktionen erhalten: Vorschau, Download, ZIP-Download, Ablage im DMS, Auswahl und Rechnungsimport.
   - Beim Wechsel zu einer anderen E-Mail startet die Anzeige wieder im kompakten Zustand.

2. **TOP-Dokumente während der Versammlung zugänglich machen**
   - In der Detailansicht eines TOPs unter „Durchführung“ werden die bereits in der Vorbereitung gespeicherten Anhänge angezeigt.
   - Jeder Anhang erhält einen verständlichen Dateinamen und kann direkt angeklickt und in einem neuen Tab geöffnet werden.
   - Falls ein Dokument nicht geöffnet werden kann, erscheint eine verständliche Fehlermeldung statt eines wirkungslosen Klicks.
   - Die Übersicht bleibt kompakt; die Dokumente erscheinen beim geöffneten TOP bei Beschreibung und zugeordneten E-Mails.

## Technische Details

- Die E-Mail-Anzeige wird in der bestehenden Anhangskomponente um einen gemessenen Einzeilen-Zustand ergänzt, damit die Schaltfläche nur bei echtem Zeilenumbruch erscheint.
- Die Durchführung nutzt das vorhandene Feld `etv_agenda_items.attachment_paths`; eine Datenbankänderung ist nicht nötig.
- TOP-Dateien werden wie bereits in der Vorbereitung über zeitlich begrenzte, geschützte Dateilinks geöffnet.

## Prüfung

- E-Mail mit einem Anhang: keine unnötige Aufklapp-Schaltfläche.
- E-Mail mit vielen Anhängen: zunächst genau eine Zeile, danach vollständig auf- und wieder zuklappbar.
- Vorschau, ZIP, DMS-Ablage und Rechnungsimport funktionieren weiterhin.
- Ein TOP mit einem und mehreren Anhängen zeigt alle Dateien in der Durchführung; Klick öffnet das richtige Dokument.
- Darstellung auf Desktop, Tablet und Mobilgerät ohne Überlagerungen prüfen.
