

## Plan: Absender-Anzeige mit IBAN-Mapping zu Eigentümern

### Kontext
Die Transaktionsdetails im `TransactionReviewMode` zeigen aktuell nur Datum, Betrag und Verwendungszweck. Der Absender (bei Einnahmen: `debtor_name`/`debtor_iban`, bei Ausgaben: `creditor_name`/`creditor_iban`) fehlt. Zusätzlich sollen IBANs automatisch gegen die `contact_bank_accounts`-Tabelle abgeglichen werden, um den zugehörigen Kontakt (z.B. Eigentümer) direkt anzuzeigen.

### 1. IBAN-Lookup Query

Neue Query im `TransactionReviewMode`, die beim Laden einer Transaktion die relevante IBAN (debtor oder creditor) gegen `contact_bank_accounts` prüft:

```sql
contact_bank_accounts.iban → contact_persons.contact_id → contacts.name
+ contact_building_assignments (gefiltert auf buildingId) → unit_number, role
```

Dies liefert: Kontaktname, Einheitsnummer, Rolle im Gebäude (owner/tenant).

### 2. UI-Erweiterung im Transaktions-Header

Im bestehenden Summary-Block (Zeilen 494-522) wird zwischen Betrag und Verwendungszweck eine neue Zeile eingefügt:

```text
┌──────────────────────────────────────────┐
│ 01.12.2025   ✓ Betrag   KI-Vorschlag    │
│ +1.170,00 €                              │
│ 👤 Max Mustermann (DE89...)  → Whg. 2   │  ← NEU
│ Hausgeld Whg. 2 (3 Monate)              │
└──────────────────────────────────────────┘
```

- Bei **Einnahmen** (amount > 0): Absender = `debtor_name` + `debtor_iban`
- Bei **Ausgaben** (amount < 0): Empfänger = `creditor_name` + `creditor_iban`
- Wenn IBAN-Match gefunden: Kontaktname + Einheit als grünes Badge
- Wenn kein Match: Name + IBAN in grau (ohne Badge)

### 3. Dateien

| Datei | Änderung |
|-------|----------|
| `TransactionReviewMode.tsx` | Neue `useQuery` für IBAN-Lookup, UI-Block im Header |

Keine Migration nötig — alle Daten existieren bereits in `bank_transactions` und `contact_bank_accounts`.

