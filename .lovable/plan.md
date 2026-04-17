

## Plan: Toggle "Liste vs. Kontenplan" auf der Buchungen-Seite

### Befund
- `BookingsTab.tsx` zeigt Buchungen aktuell nur als flache, paginierte Tabelle (50/Seite).
- Daten enthalten bereits `chart_of_accounts` (Konto-Nr., Name) und `counter_account` → Gruppierung pro Konto ist ohne neue Query möglich.
- `chart_of_accounts` hat `category`, `settlement_section`, `sort_order` → ideal für Kontenplan-Struktur.

### UI-Konzept
Toggle (`ToggleGroup`, 2 Optionen) in der Toolbar neben der Jahresauswahl:
- **Liste** (Default, bisheriges Verhalten)
- **Kontenplan** (neue gruppierte Ansicht)

### Kontenplan-Ansicht
Pro Konto eine `Collapsible`-Sektion, sortiert nach Kategorie und `account_number`:

```text
▼ 4300 Instandhaltung                    12 Buch.    -3.450,00 €
   ├ Datum    Beleg   Buchungstext              Gegenkto    Betrag
   ├ ...
▶ 4400 Versicherungen                     3 Buch.      -890,00 €
▶ 8000 Hausgeld-Einnahmen                24 Buch.   +14.400,00 €
```

Header pro Konto-Block zeigt:
- Konto-Nr. + Name
- Anzahl Buchungen
- **Saldo** (Summe der Beträge, mit Vorzeichen, farbcodiert)

Gruppierung nach `chart_of_accounts.category` (Aufwand, Ertrag, Aktiva, Passiva) als Section-Header darüber.

Suche und §a-Filter (Prüfung) wirken auch hier — Konten ohne Treffer werden ausgeblendet.

### Wichtige Aspekte, die du leicht vergessen könntest
1. **Split-Buchungen / Gegenkonto-Logik**: Eine Buchung erscheint im Kontenplan nur unter dem `account_id`, nicht zusätzlich unter `counter_account_id`. Sonst doppelte Salden. Optional: Schalter „Beidseitig anzeigen" für klassische Soll/Haben-Sicht.
2. **Saldo-Berechnung**: Eröffnungsbilanz (`account_balances.opening_balance`) sollte oben pro Konto angezeigt werden, sonst stimmt der Endsaldo nicht mit der Buchhaltung überein.
3. **Performance**: Bei vielen Buchungen Sektionen standardmäßig collapsed öffnen (außer die mit Treffern bei aktiver Suche). Pagination entfällt im Kontenplan-Modus, dafür Lazy-Render der Zeilen erst beim Aufklappen.
4. **Leere Konten**: Konten ohne Buchungen im Jahr standardmäßig ausblenden, mit Toggle „Alle Konten anzeigen".
5. **Persistenz**: Gewählten Modus in `localStorage` speichern, damit der Nutzer beim Reload nicht zurückspringt.
6. **Liegenschaftsbezug**: Bei Multi-Building-Ansicht braucht Kontenplan einen Building-Filter — sonst werden gleiche Kontonummern aus verschiedenen Häusern fälschlich vermischt (`chart_of_accounts.building_id` beachten).
7. **Export**: Kontenplan-Ansicht eignet sich später ideal für PDF-Kontenblatt-Export pro Konto (DATEV-ähnlich) — Architektur dafür offenhalten.
8. **Drill-down**: Klick auf Buchungszeile öffnet weiterhin `EditBookingDialog` (gleiche UX wie Liste).

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `src/components/finance/BookingsTab.tsx` | Toggle-State, neue `AccountPlanView`-Render-Logik, Gruppierung, Saldo-Berechnung, localStorage |
| `src/components/finance/AccountPlanView.tsx` (neu) | Collapsible Sektionen pro Kategorie/Konto, Saldo-Header, Lazy-Render |

### Erwartetes Ergebnis
- Toggle „Liste / Kontenplan" in der Toolbar.
- Kontenplan zeigt alle Konten mit Buchungen für das gewählte Jahr, gruppiert nach Kategorie, mit Saldo pro Konto.
- Suche & §a-Filter funktionieren in beiden Modi.
- Liegenschafts-Trennung sauber, Eröffnungsbilanz berücksichtigt, Modus bleibt nach Reload erhalten.

