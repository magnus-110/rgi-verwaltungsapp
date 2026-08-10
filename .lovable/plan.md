# Rundmail: Empfänger dürfen nicht stillschweigend verschwinden

## Ausgangslage (geprüft)

- Kontakt Claudia Bschorr (Adolf-Haff-Weg 3, Einheit 0002) ist sauber angelegt: aktive Zuordnung als Eigentümerin, genau eine E-Mail `claudia@bschorr-langweid.de` ohne Zusatztext.
- Für Adolf-Haff-Weg 3 existiert aktuell nur ein Entwurf "Neue Rundmail" (heute 14:43) — mit **leerer** Empfängerauswahl und **ohne** gespeicherte persönliche Anhänge. Es wurde für dieses Gebäude keine Rundmail versendet.
- Damit ist die Ursache für die fehlende Karte **noch nicht bewiesen**. Die Daten schließen ein Datenproblem aus, also liegt es an Client-Zustand/Logik. Schritt 1 ist deshalb Diagnose, nicht Blindfix.

## Ziel

Niemand darf aus der Empfängerliste verschwinden, ohne dass es sichtbar ist. Lieber eine deutlich markierte Karte ("keine E-Mail", "nicht ausgewählt", "kein Anhang") als gar keine.

## Schritt 1 — Ursache verifizieren

- Empfänger-Hook um eine Diagnose erweitern: pro Gebäude wird gezählt, wie viele aktive Zuordnungen es gibt und wie viele davon zu einer Empfänger-Karte werden. Differenz wird in der Konsole mit Name/Einheit ausgegeben.
- Danach den Fall im Browser nachstellen (Adolf-Haff-Weg 3, Dokumente hochladen) und prüfen, ob die Karte verschwindet und an welcher Stelle.

## Schritt 2 — Liste vollständig machen

- Zuordnungen **ohne** verwertbare E-Mail erzeugen künftig ebenfalls eine Karte: nicht auswählbar, grau, Hinweis "Keine E-Mail-Adresse hinterlegt". Bisher fallen sie unsichtbar heraus.
- Bei "Kein Doppel" werden Karten pro E-Mail zusammengefasst. Wenn dabei mehrere **verschiedene Personen** dieselbe Adresse teilen, werden beide Namen auf der Karte gezeigt, statt einen davon zu schlucken.
- Zähler oben zeigt zusätzlich "x Einheiten ohne Empfänger", anklickbar als Filter.

## Schritt 3 — Auswahl und Anhänge dürfen nicht verloren gehen

- Nach dem Upload persönlicher Anhänge und nach Änderungen an der Auswahl wird der Entwurf automatisch gespeichert (debounced), damit Auswahl + Zuordnungen nicht nur im Browser-Zustand hängen.
- Beim Laden eines Entwurfs mit gespeicherten Anhängen, aber leerer Auswahl, werden die betroffenen Empfänger automatisch wieder angehakt.

## Schritt 4 — Kontrolle vor dem Versand

- Vor dem Senden eine Zusammenfassung: Anzahl Empfänger, Einheiten ohne Empfänger, ausgewählte Empfänger ohne persönlichen Anhang. Versand erst nach Bestätigung.
- Serverseitig: Empfänger, die wegen nicht passendem Schlüssel übersprungen werden, werden geloggt und als Warnung an die Kampagne zurückgemeldet, statt lautlos zu fehlen.

## Technische Details

- `src/components/communication/bulk/useBulkRecipients.ts`: E-Mail-Zerlegung an die Server-Logik aus `supabase/functions/_shared/sanitize-email.ts` angleichen (Klammer-/Klammerzusätze strippen, gleiche Regex). Aktuell nutzt der Client eine laxere Regex ohne Entfernen von "(...)"-Anmerkungen — dadurch können Client-Schlüssel `assignment_id|email` entstehen, die der Server nie erzeugt, sodass ein Empfänger beim Versand stillschweigend übersprungen wird. Zusätzlich Rückgabe von Einträgen mit `email: null` für Zuordnungen ohne Adresse.
- `src/components/communication/bulk/BulkMailEditor.tsx`: Gruppierung um Mehrfach-Namen erweitern, Autosave, Vorab-Prüfung, Zähler.
- `src/components/communication/bulk/BulkRecipientCard.tsx`: Zustand "ohne E-Mail" (deaktiviert) darstellen.
- `supabase/functions/_shared/comm-vars.ts`: übersprungene Schlüssel sammeln; `comm-send-bulk-email` schreibt sie in `error_message`/Log.
