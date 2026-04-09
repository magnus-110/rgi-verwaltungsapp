

## Buchungskontrolle: Split-View mit Schnellbestätigung

### Konzept

Eine neue Vollbild-Ansicht ("Prüfmodus") speziell für die schnelle Kontrolle von offenen Buchungen. Statt Dialog-basiert wird eine dedizierte Seite/Overlay mit Split-Layout genutzt:

```text
┌─────────────────────────────────────────────────────────────┐
│  ◀ Zurück   Buchung 3 / 47   ████████░░░░░░   [Shift] ✓   │
├────────────────────────────┬────────────────────────────────┤
│                            │                               │
│   BUCHUNG                  │   RECHNUNG / VORLAGE          │
│                            │                               │
│   Konto: 4100 Heizkosten  │   PDF-Vorschau (iframe)       │
│   Betrag: 1.234,56 €  ✓   │   oder                        │
│   Datum: 15.03.2025        │   Vorlage-Details:            │
│   Buchungstext: Abschlag   │     Name: Heizöl Abschlag     │
│   Beleg-Nr: RE-2025-042   │     Erw. Betrag: 1.234,56 € ✓│
│   MwSt: 19%               │     Intervall: monatlich      │
│   §35a: Ja                 │     Lieferant: Stadtwerke     │
│   Kürzel: KI               │                               │
│                            │                               │
│   [Bearbeiten]             │                               │
├────────────────────────────┴────────────────────────────────┤
│  ← Zurück (Pfeil)    [Shift] Bestätigen & Weiter →        │
│                       [S] Überspringen                      │
└─────────────────────────────────────────────────────────────┘
```

### Kernfeatures

1. **Split-View**: Links Buchungsdetails (read-only), rechts die verknüpfte Rechnung (PDF-Embed) oder Vorlage (Detailansicht). Wenn weder Rechnung noch Vorlage vorhanden: Hinweis "Keine Referenz verknüpft"

2. **Match-Highlighting**: Felder die zwischen Buchung und Referenz übereinstimmen werden grün markiert (z.B. Betrag Buchung = Bruttobetrag Rechnung, oder Betrag = expected_amount der Vorlage)

3. **Keyboard-Navigation**:
   - `Shift` → Bestätigen & nächste Buchung
   - `→` Pfeil → Überspringen (nächste ohne Bestätigung)
   - `←` Pfeil → Zurück zur vorherigen
   - `E` → Edit-Dialog öffnen für Korrekturen

4. **Fortschrittsanzeige**: Progress-Bar oben mit "X / Y geprüft"

5. **Auto-Advance**: Nach Bestätigung rutscht automatisch die nächste offene Buchung nach

### Aenderungen

**1. Neue Komponente `src/components/finance/BookingReviewMode.tsx`**
- Props: `buildingId`, `fiscalYear`, `onClose`
- Lädt alle pending Buchungen mit Joins auf `invoices` und `booking_templates`
- State: `currentIndex`, navigiert durch die Liste
- Linke Seite: Readonly-Darstellung aller Buchungsfelder
- Rechte Seite: Wenn `invoice_id` → PDF via signedUrl in iframe. Wenn `matched_template_id` → Template-Detailkarte. Sonst Platzhalter
- Match-Logik: Vergleicht `amount` vs `invoice.gross_amount` oder `template.expected_amount`, markiert Übereinstimmungen grün
- Keyboard-Handler auf dem Container-Element

**2. `src/components/finance/BookingsTab.tsx`**
- Neuer Button "Prüfmodus starten" neben "Neue Buchung"
- Öffnet `BookingReviewMode` als Fullscreen-Overlay (Dialog mit `max-w-[95vw] max-h-[95vh]`)
- Nur sichtbar wenn pending Buchungen > 0

**3. Keine DB-Änderung nötig** — nutzt bestehende `bookings`, `invoices`, `booking_templates` Tabellen und den bestehenden Confirm-Flow

### Praxis-Optimierungen
- Buchungen werden nach Liegenschaft gruppiert, damit man zusammenhängende Buchungen am Stück prüft
- Bereits bestätigte werden übersprungen und der Zähler aktualisiert sich live
- Bei Bedarf kann man per "E" in den Edit-Dialog springen, Änderungen vornehmen, und kehrt danach automatisch zurück

