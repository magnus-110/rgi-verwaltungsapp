

## KI-gestützte Buchungshinweise statt automatischem Splitting

### Fachliche Analyse

In der deutschen Buchhaltung (insb. WEG-Verwaltung) gibt es bei Sammeltransaktionen zwei Szenarien:

1. **Sammeleingänge** (z.B. 1.180 € = 3x Hausgeld): Eine Bankbewegung → muss auf mehrere Personenkonten aufgeteilt werden (Splittbuchung)
2. **Teilzahlungen** (z.B. 500 € von einer 1.200 €-Rechnung): Mehrere Bankbewegungen → eine Rechnung

**Automatisches Splitting ist problematisch**, weil:
- Make.com erwartet 1 Transaktion = 1 Buchung im Webhook-Payload
- Splittbuchungen erfordern manuelle Prüfung (Beträge pro Eigentümer, Zuordnung zu Personenkonten)
- Rechtlich muss jede Buchung nachvollziehbar einer Bankbewegung zugeordnet sein

### Gewählte Lösung: "KI-Buchungsassistent" als Spickzettel

Statt automatisches Splitting wird die KI-Analyse im `suggest-match` erweitert, um **strukturierte Buchungshinweise** zu generieren. Bei unmatched Transaktionen erscheint ein "KI-Hinweis"-Panel mit:

- Erkennung von Summenbeträgen (Sammeleingänge aus mehreren Vorlagen)
- Erkennung von Teilbeträgen (Teilzahlung einer Rechnung)
- Hinweis auf verwandte Transaktionen (andere Teilzahlung derselben Rechnung)
- Konkreter Buchungsvorschlag: welche Konten, welche Beträge, welche Vorlagen

Der User kann dann per Klick die manuelle Buchung öffnen (**CreateBookingDialog**) mit **vorausgefüllten Feldern** (Konto, Betrag, Buchungstext, Datum) — ohne Make.com-Umweg.

### Technische Änderungen

**1. Edge Function `suggest-match/index.ts` erweitern**

Neue optionale Eingabe: `allTransactions` (andere ungebuchte Transaktionen der gleichen Liegenschaft). Die KI bekommt als zusätzlichen Kontext:
- Alle anderen offenen Transaktionen (für Teilbetrags-Erkennung)
- Die Vorlage-Summen-Logik (Erkennung ob Betrag = Summe mehrerer Vorlagen)

Neues Ausgabe-Feld im Tool-Schema:
```
booking_hint: {
  type: "split" | "partial" | "simple" | null,
  explanation: string,        // Freitext-Erklärung für den User
  suggested_bookings: [{      // Vorausgefüllte Buchungsvorschläge
    account_number: string,
    account_name: string,
    amount: number,
    booking_type: "income" | "expense",
    description: string,
    related_template_id?: string,
    related_invoice_id?: string
  }]
}
```

**2. `AssignmentDialog.tsx` erweitern**

- Neuer Bereich unter den Transaktionsdetails (linke Seite): "KI-Analyse" Panel
- Wenn `booking_hint` vorhanden:
  - Farbiges Info-Panel mit der Erklärung
  - Pro `suggested_booking`: eine Karte mit Konto, Betrag, Text
  - Button: "Als manuelle Buchung(en) anlegen" → öffnet `CreateBookingDialog` mit vorausgefüllten Werten
- Für Sammeleingänge: Mehrere Buchungen nacheinander anlegen oder alle auf einmal als `pending` in die `bookings`-Tabelle schreiben

**3. `BankStatementsTab.tsx` anpassen**

- `allTransactions` an den `AssignmentDialog` durchreichen (für den KI-Kontext)
- Neuer Button bei unmatched Transaktionen: "Manuell buchen" → öffnet `CreateBookingDialog` mit vorausgefülltem Datum, Betrag, Buchungstext aus der Transaktion
- Nach manueller Buchung: Transaktion als `booked_at` markieren + `booking_id` setzen

**4. `CreateBookingDialog.tsx` erweitern**

- Neue Props: `prefill?: { account_id, amount, description, booking_date, booking_type, counter_account_id }` 
- Wenn `prefill` gesetzt: Felder werden vorausgefüllt, ein Info-Banner zeigt "Vorausgefüllt basierend auf KI-Analyse"
- Neue optionale Prop: `linkedTransactionId?: string` → nach dem Speichern wird die Transaktion als gebucht markiert

### Ablauf (User-Sicht)

1. User sieht Sammeltransaktion (+1.180 €) als "Offen"
2. Klickt "Zuordnen" → Split-Screen öffnet sich
3. Links: Transaktionsdetails + KI-Panel: *"Diese Zahlung entspricht der Summe von 3 Hausgeldzahlungen: Schmidt (420 €), Müller (380 €), Weber (380 €)"*
4. Darunter 3 Buchungsvorschläge-Karten mit vorausgefüllten Konten
5. User klickt "Buchungen anlegen" → 3 Buchungen werden als `pending` in `bookings` eingefügt
6. Transaktion wird als gebucht markiert (Make.com wird umgangen)

### Dateien

1. `supabase/functions/suggest-match/index.ts` — Erweiterte KI-Analyse mit booking_hint
2. `src/components/finance/AssignmentDialog.tsx` — KI-Analyse Panel + Buchungsvorschläge
3. `src/components/finance/BankStatementsTab.tsx` — allTransactions durchreichen, manuelles Buchen
4. `src/components/finance/CreateBookingDialog.tsx` — Prefill-Props + Transaktions-Verlinkung

