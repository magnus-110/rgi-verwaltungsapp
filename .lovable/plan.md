## Analyse: Sollstellungen Adolf-Haff-Weg 3

Im Kontenplan dieser Liegenschaft existieren:
- **Personenkonten 0001–0008** (Kategorie „0. Personenkonten") — je ein Hausgeld-Konto pro Eigentümer (Baraniak, Bschorr, Fahrner, Mickerts, Pawlak, Scholz, Mießen, Falls).
- **Konto 4020 „WEG-Abrechnung Sollstellung"** (Kategorie „5. Eröffnungen & Abgrenzung") — globales Verrechnungskonto für die Jahresabrechnung.

### Beobachtetes Buchungsmuster (Abrechnung 2024, Buchungsdatum 01.06.2025)

Für jeden Eigentümer existieren **zwei** Buchungen:

1. **Externe Bank-Buchung** (über Kontoauszug erfasst, Bestand): `1800 Bank ↔ Personenkonto` — die tatsächliche Auszahlung des Guthabens bzw. Eingang einer Nachzahlung.
2. **Interne Sollstellungs-Buchung** (manuell, ohne Bankbezug): `Personenkonto ↔ 4020`, `booking_type = expense`, Beschreibung z. B. *„Sollstellung Guth. Abr. 2024 BARANIAK"* (949,58 €) oder *„Nachzahl. Abr. 2024 – Wollmann (intern)"*.

Die Richtung (Personenkonto auf Soll vs. Haben) hängt davon ab, ob es ein **Guthaben** (Eigentümer bekommt zurück) oder eine **Nachzahlung** (Eigentümer schuldet) ist. Über die Kombination `account_id` / `counter_account_id` + `booking_type` ergibt sich der korrekte signierte Saldo auf dem Personenkonto.

**Zweck:** Das Konto 4020 dient als Gegenkonto, damit das Abrechnungsergebnis als Forderung/Verbindlichkeit auf dem Hausgeldkonto des Eigentümers entsteht, ohne dass eine Aufwands-/Ertragsbuchung im laufenden Jahr verfälscht wird. Die spätere Bankbewegung (Auszahlung/Eingang) gleicht das Personenkonto wieder aus → Saldo geht gegen 0.

---

## Plan: „Sollstellen"-Quick-Button in der Buchungsmaske

### Trigger / Sichtbarkeit
- Button erscheint **immer dann**, wenn das aktuell ausgewählte Konto (`account_id` **oder** `counter_account_id`) ein Personenkonto ist (Kategorie beginnt mit `0. Personenkonten`).
- Sichtbar in **allen** Buchungsmasken, in denen Personenkonten erfasst werden:
  - `CreateBookingDialog` (manuelle Buchung)
  - `BankStatementsTab` / `TransactionVerificationMode` (sofern dort Personenkonto wählbar)
  - `TransferReviewMode`
  - inline Buchungs-Editor in `BookingsTab`
- Implementierung als kleine, wiederverwendbare Komponente `SollstellenQuickButton`, die in jede Maske eingebunden wird.

### Aussehen / UX
- Optisch **unscheinbar**: gleiche Größe wie der `§35a`-Pill-Button daneben, aber neutrale Farbe (`text-muted-foreground`, `border-border`, kein Akzentton). Beschriftung „Sollstellen".
- **`tabIndex={-1}`** und nicht als Default-Submit → wird beim Tab/Enter-Durchklicken übersprungen. Nur per Maus oder gezieltem Tab erreichbar.
- Kein Auto-Fokus, kein Keyboard-Shortcut.

### Verhalten beim Klick
1. Ermittle in der aktuellen Maske: das Personenkonto (Personen-ID), das Datum, den Betrag, die Beschreibung.
2. Suche/erstelle Konto **4020 „WEG-Abrechnung Sollstellung"** für das aktuelle Building (gleiche Kategorie/Settlement-Section wie Vorlage; Konto wird automatisch angelegt, falls nicht vorhanden).
3. Lege eine **zusätzliche, interne Buchung** an mit:
   - `account_id = Personenkonto`
   - `counter_account_id = 4020`
   - `booking_type = "expense"`
   - `amount` = Betrag aus der Maske (Default; im Bestätigungs-Popup editierbar)
   - `booking_date` = Datum aus der Maske
   - `description` = Vorschlag „Sollstellung <Beschreibung der Hauptbuchung>" — frei editierbar
   - kein Bank-Bezug (`bank_transaction_id = null`), `is_internal_transfer = true` (Marker)
4. **Mini-Bestätigungsdialog** (Popover / kleines Modal) zeigt vor dem Speichern: Richtung (Guthaben → Personenkonto Haben / Nachzahlung → Personenkonto Soll), Konten, Betrag, Beschreibung. Auswahl Guthaben/Nachzahlung steuert nur die Vorzeichen-/Richtungslogik.
5. Nach Speichern: Toast „Sollstellung gebucht", Liste/Cache invalidieren. **Die Hauptbuchung der Maske bleibt unverändert** — die Sollstellung ist eine zusätzliche, parallele Buchung.

### Edge Cases
- Kein Building gewählt → Button disabled mit Tooltip.
- Personenkonto-Erkennung über `chart_of_accounts.category` (genauer Match-String wie heute).
- Konto 4020 fehlt im Building → automatisch via `building_account_overrides`/`chart_of_accounts`-Insert anlegen (Standard-Kategorie „5. Eröffnungen & Abgrenzung").
- Keine Auswirkung auf den Enter-/Tab-Workflow der bestehenden Speichern-Buttons.

### Technische Details (für später)
- Neue Datei: `src/components/finance/SollstellenQuickButton.tsx` mit Props `{ buildingId, personenkontoId, amount, date, description, onCreated }`.
- Hilfsfunktion `ensureSollstellungAccount(buildingId)` in `src/components/finance/lib/sollstellung.ts`.
- Einbindung im `CreateBookingDialog` direkt rechts neben dem `§35a`-Button (Zeile ~516–530).
- Erkennung „ist Personenkonto?": prüfen ob das aktuell relevante Konto-Objekt `category?.startsWith("0. Personenkonten")` erfüllt.
- Keine Datenbank-Migration nötig — Konto 4020 wird über bestehende `chart_of_accounts` angelegt, Buchung über bestehende `bookings`-Logik.

---

**Keine Code-Änderungen in diesem Plan-Modus.** Nach Bestätigung implementiere ich Button + Dialog + Einbindung in alle Buchungsmasken.