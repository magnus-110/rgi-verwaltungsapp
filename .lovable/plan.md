

## Plan: Buchungen mit "Zur Prüfung markieren"-Funktion

### Konzept

Ein Mitarbeiter kann beim Buchen oder nachträglich eine Buchung als **"Zur Prüfung"** markieren. Das signalisiert dem Vorgesetzten, dass diese Buchung nochmal geprüft werden muss. In der Buchungsübersicht kann nach markierten Buchungen gefiltert werden.

### Schritt 1: Datenbank-Migration
Neue Spalte `needs_review` (boolean, default false) auf der `bookings`-Tabelle:
```sql
ALTER TABLE bookings ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN review_note text;
```
- `needs_review`: Flag ob Prüfung nötig
- `review_note`: Optionaler Kommentar warum (z.B. "IBAN unklar", "Betrag weicht ab")

### Schritt 2: TransactionReviewMode – Flag-Button beim Buchen
Neben den bestehenden Buttons (Buchen, Weiter) einen kleinen **Flaggen-Button** (🚩 `Flag` Icon) hinzufügen. Beim Klick:
- Setzt `needs_review = true` in der Insert-Query (Zeile ~473)
- Optionales Popover für kurze Notiz (review_note)
- Visuelles Feedback: oranges Badge "Zur Prüfung" erscheint

### Schritt 3: BookingsTab – Filter & Anzeige
- Neuer Filter-Toggle "Nur zur Prüfung" in der Filterleiste
- Markierte Buchungen bekommen ein oranges 🚩-Badge in der Statuszeile
- Klick auf Badge in EditBookingDialog → kann Review-Flag entfernen (= "geprüft")

### Schritt 4: EditBookingDialog – Review verwalten
- Anzeige des Review-Flags + review_note
- Button "Als geprüft markieren" der `needs_review = false` setzt

### Technische Details

**Dateien:**
1. **Migration**: `supabase/migrations/` – `needs_review` boolean + `review_note` text
2. **TransactionReviewMode.tsx** (~Zeile 473): `needs_review` in Insert-Payload; Flag-Button im UI (~Zeile 1206)
3. **BookingsTab.tsx** (~Zeile 27): State `filterReview`, Query-Filter `.eq("needs_review", true)`, Badge in `renderBookingRow`
4. **EditBookingDialog.tsx**: Review-Status anzeigen/ändern

**UI-Verhalten im TransactionReviewMode:**
- Kleiner `Flag`-Icon-Button neben den +/- Buttons oder am unteren Rand der Buchungszeile
- Toggle: einmal klicken = markiert (orange), nochmal = entfernt
- Beim Buchen wird der Flag-Status mitgespeichert

**UI-Verhalten in BookingsTab:**
- Neuer Toggle-Button "🚩 Zur Prüfung" in der Filterleiste
- Zeigt Anzahl markierter Buchungen als Badge
- Markierte Buchungen: oranges Flag-Icon + optional review_note als Tooltip

