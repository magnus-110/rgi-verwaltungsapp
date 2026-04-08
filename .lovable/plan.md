

## Inline-Bearbeitung der Buchungsvorschläge + Vorlagen-Erstellung im AssignmentDialog

### Problem
1. Die vorgeschlagenen Buchungen im KI-Hinweis sind statisch — man kann sie nicht bearbeiten, bevor sie angelegt werden
2. Wenn die KI erkennt, dass eine Vorlage erstellt werden sollte (wie im Screenshot: "sollte hierfür eine neue Vorlage erstellt werden"), gibt es keine Möglichkeit das direkt zu tun

### Lösung

**1. Inline-editierbare Buchungsvorschläge** (`AssignmentDialog.tsx`)

Die statischen Buchungskarten werden durch editierbare Felder ersetzt:
- Jede `suggested_booking` wird als editierbarer Block dargestellt
- Felder: Beschreibung (Input), Betrag (Input), Buchungstyp (Toggle income/expense)
- Konto-Auswahl per Combobox (wie in CreateBookingDialog)
- State: `editableBookings` Array im Dialog, initialisiert aus `bookingHint.suggested_bookings`
- "Buchung anlegen" Button pro Einzelbuchung + "Alle anlegen" Button
- Einzelne Buchungen können entfernt werden (X-Button)

**2. Vorlagen-Vorschlag von der KI** (`suggest-match/index.ts`)

Erweiterung des AI Tool-Schemas um ein neues optionales Feld `template_suggestion`:
```
template_suggestion: {
  name: string,           // z.B. "Abschlagszahlung Strom"
  vendor_name: string,    
  vendor_iban: string,
  expected_amount: number,
  interval: string,       // "monatlich", "quartalsweise", etc.
  account_number: string, // Vorgeschlagenes Konto
  account_name: string,
  description: string
}
```

Im System-Prompt wird die KI angewiesen: Wenn keine passende Vorlage existiert und es sich um eine wiederkehrende Zahlung handelt (erkennbar an Verwendungszweck-Keywords wie "Abschlag", "monatlich", Kundennummer), soll sie einen `template_suggestion` zurückgeben.

**3. Vorlagen-Erstellungs-UI im AssignmentDialog** (`AssignmentDialog.tsx`)

Wenn `template_suggestion` vorhanden:
- Neuer Block unter dem KI-Hinweis: "Vorlage erstellen"
- Inline-Formular mit editierbaren Feldern (Name, Lieferant, IBAN, Betrag, Intervall, Konto)
- Button: "Vorlage erstellen & zuordnen"
- Nach Klick: Insert in `booking_templates`, dann automatisch Zuordnung der Transaktion zur neuen Vorlage
- `queryClient.invalidateQueries` für booking-templates

### Technische Details

**AssignmentDialog.tsx Änderungen:**
- Neuer State: `editableBookings: SuggestedBooking[]` — wird aus `bookingHint.suggested_bookings` initialisiert wenn hint kommt
- Neuer State: `templateSuggestion` — aus AI-Response
- Neuer State: `editableTemplate` — editierbare Version des Vorschlags
- Konten-Query laden (chart_of_accounts) für die Konto-Combobox
- Pro Buchung: Inline-Inputs für description, amount; Combobox für account
- Pro Buchung: eigener "Anlegen"-Button
- Template-Block: Inline-Formular mit allen Vorlage-Feldern, "Erstellen"-Button

**suggest-match/index.ts Änderungen:**
- Neues `template_suggestion` Feld im Tool-Schema
- System-Prompt Ergänzung: "Wenn keine passende Vorlage existiert und die Transaktion auf eine wiederkehrende Zahlung hindeutet, schlage eine neue Vorlage vor"

**BankStatementsTab.tsx Änderungen:**
- Neue Prop `onCreateTemplate` an AssignmentDialog durchreichen
- Handler: Insert in booking_templates + Transaktion zuordnen + Queries invalidieren

### Dateien
1. `supabase/functions/suggest-match/index.ts` — template_suggestion im Tool-Schema
2. `src/components/finance/AssignmentDialog.tsx` — Editierbare Buchungen + Template-Erstellung
3. `src/components/finance/BankStatementsTab.tsx` — onCreateTemplate Handler

