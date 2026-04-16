

## Plan: Zeitraum in Vorlagen + Keine doppelten Konten

### Änderungen

**1. `BuildingContactsList.tsx` — `ensureAccountAndTemplate` Funktion anpassen**

- **Konto-Logik bleibt**: Suche per `account_number` (= Einheitennummer). Wenn vorhanden → wiederverwenden, nicht duplizieren.
- **Vorlage-Logik ändern**: Statt per `ilike` nach Name zu suchen und zu updaten, wird jetzt geprüft ob eine Vorlage mit gleichem Kostentyp + Einheit + **überlappenden Zeiträumen** existiert.
  - Wenn **ja** → bestehende Vorlage updaten (Betrag, IBAN etc.)
  - Wenn **nein** (anderer Zeitraum oder keine Überlappung) → **neue Vorlage** erstellen
- **Zeitraum aus Kostenzeile übernehmen**: `valid_from` und `valid_to` der `contact_building_costs` Zeile werden in die Vorlage geschrieben

**2. Zeitraum an die Funktion übergeben**

- Die `ensureAccountAndTemplate`-Funktion bekommt zusätzlich `validFrom` und `validTo` als Parameter
- Der Knopfdruck-Handler liest die Werte aus der jeweiligen Kostenzeile und übergibt sie

**3. Template-Name differenzieren**

- Bei mehreren Vorlagen gleichen Typs wird der Name um den Zeitraum ergänzt:
  - `mtl. Hausgeld 0001 EG (01.07.2025–31.12.2025)`
  - `mtl. Hausgeld 0001 EG (01.01.2025–30.06.2025)`

### Keine DB-Migration nötig
`valid_from` und `valid_to` existieren bereits in `booking_templates`.

