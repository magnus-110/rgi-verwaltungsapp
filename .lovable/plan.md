

## Plan: Fehlerhafte Buchungen löschen + Abrechnungsprozess-Audit

### 1. Datenbereinigung: 6 fehlerhafte Buchungen löschen

Die folgenden 6 Buchungen verweisen auf Konten einer fremden Liegenschaft (Beispielgebäude-Konten in Birkenweg 6):

| Buchung | Beschreibung | Betrag |
|---------|-------------|--------|
| 9c198285... | Gutschrift Abrechnung 2024 (Hausgeldrückerstattung) | 1.020,96 € |
| bb2cf315... | Gegenbuchung Hausgeldrückerstattung | 1.020,96 € |
| 5e83432a... | Hausgeldzahlung 08+09+10/2025 (OG) | 1.170,00 € |
| 89161692... | Umbuchung Hausgeld auf WEG-Einnahmenkonto | 1.170,00 € |
| 0cc7d86e... | HG 08+09+10/25 - DG | 930,00 € |
| 9cd2b328... | Gutschrift Abr. 2024 WEG Birkenweg 6 | 266,30 € |

**Aktion:** Migration mit `DELETE FROM bookings WHERE id IN (...)` für diese 6 IDs.

### 2. DB-Constraint: Zukünftige Fehler verhindern

Migration mit einem `BEFORE INSERT OR UPDATE`-Trigger auf `bookings`, der prüft:
- Wenn `account_id` ein Konto mit `building_id` hat → muss mit `bookings.building_id` übereinstimmen
- Wenn `counter_account_id` ein Konto mit `building_id` hat → muss mit `bookings.building_id` übereinstimmen
- Globale Konten (`building_id IS NULL`) bleiben erlaubt

---

### 3. Audit des Abrechnungsprozesses — Ergebnisse

#### Schritt 1: Buchungsprüfung (BookingReviewSection) ✅ OK
- Gruppiert korrekt nach Konto-Kategorie
- Prüft erwartete vs. tatsächliche Buchungsanzahl anhand Templates
- KI-Prüfung via `analyze-billing` funktioniert
- **Kein Problem gefunden**

#### Schritt 2: Heizkosten ✅ OK (mit Hinweisen)
- **HeatingAccountsSection**: Zeigt HK-relevante Konten + Vorjahresvergleich ✅
- **FuelInventorySection**: Anfangs-/Endbestand + Einkäufe mit Plausibilitätsprüfung ✅
- **HeatingExportSection**: CSV-Export für Ablesefirma ✅
- **HeatingRebookingSection**: Umbuchung auf Zielkonto + Heizkosten-Verteilung pro Eigentümer ✅
- **Hinweis**: Die Kontenauswahl bei der Umbuchung (`allAccounts`) filtert korrekt mit `or(building_id.is.null, building_id.eq.${buildingId})` ✅

#### Schritt 3: Abgrenzungen (AccrualSection) ✅ OK
- Erkennt Buchungen mit jahresübergreifendem Leistungszeitraum ✅
- Erkennt Buchungen mit falschem Buchungsjahr ✅
- KI-Vorschläge für Abgrenzungen ✅
- **Kein Problem gefunden**

#### Schritt 4: Gesamtabrechnung (BillingSettlement) — **3 Probleme gefunden**

**Problem A: Kontenfilterung unvollständig (KRITISCH)**
- Zeile 72-77: `accounts` werden mit `.or(building_id.is.null, building_id.eq.${buildingId})` geladen — das ist korrekt für globale + gebäudeeigene Konten
- ABER: Die `bookings`-Query (Zeile 92-104) filtert nur nach `building_id` und `fiscal_year`, NICHT nach Konto-Zugehörigkeit. Durch die 6 fehlerhaften Buchungen erschienen fremde Konten
- **Lösung**: Nach dem Löschen der 6 Buchungen + DB-Constraint ist das Problem behoben. Zusätzlich als Defense-in-depth einen Frontend-Filter einbauen, der Buchungen mit gebäudefremden Konten ausfiltert

**Problem B: IST-Vorschuss Matching fragil**
- Zeile 405-411: Die IST-Berechnung matched Personenkonten über Name-Substring-Suche oder unit_number-Padding. Das ist fehleranfällig
- **Aktuell kein Fix nötig**, aber sollte perspektivisch über eine direkte `contact_id`-Verknüpfung im Personenkonto gelöst werden

**Problem C: `account_number.startsWith("0000")` ist fragil**
- Zeile 112: Personenkonten werden über Prefix "0000" identifiziert. Das funktioniert nur, solange die Nummerierungskonvention eingehalten wird
- **Kein sofortiger Fix nötig**, aber sollte perspektivisch über eine Konto-Kategorie gelöst werden

#### Validierungspanel (BillingValidationPanel) ✅ OK
- Prüft: Saldenübernahme, Brennstoff, HK-Umbuchungen, Einnahmen/Ausgaben, Verteilerschlüssel, Abgrenzungen ✅
- **Kein Problem gefunden**

#### KI-Analyse (BillingAiAnalysis) ✅ OK
- Ruft `analyze-billing` auf mit allen Settlement-Daten ✅

#### Saldenvortrag (auto in BillingTab) ✅ OK
- Automatischer Vortrag bei Periodenwahl ✅

#### Schritt-Reihenfolge ✅ OK
Die 4 Schritte (Buchungsprüfung → Heizkosten → Abgrenzungen → Gesamtabrechnung) sind logisch korrekt und in der richtigen Reihenfolge.

---

### Zusammenfassung der Änderungen

| Datei | Änderung |
|-------|----------|
| `supabase/migrations/` | Neue Migration: 6 Buchungen löschen + Trigger-Constraint |
| `src/components/finance/BillingSettlement.tsx` | Defense-in-depth: Buchungen mit gebäudefremden Konten filtern |

### Technische Details

```sql
-- Migration: Datenbereinigung + Constraint
DELETE FROM bookings WHERE id IN (
  '9c198285-eeac-4aac-95c6-2e5ed8ace79d',
  'bb2cf315-6efa-4176-b063-7ae7d12cb1a9',
  '5e83432a-251c-4963-b09d-f42eff7aeeb4',
  '89161692-45a3-4968-8d3e-8479249f09a8',
  '0cc7d86e-bbdd-4a03-92cd-a118b27c0fcb',
  '9cd2b328-c3ba-4a1a-865f-9216bab58ef9'
);

CREATE OR REPLACE FUNCTION check_booking_account_building()
RETURNS trigger AS $$
BEGIN
  -- Check account_id
  IF NEW.account_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE id = NEW.account_id
        AND building_id IS NOT NULL
        AND building_id != NEW.building_id
    ) THEN
      RAISE EXCEPTION 'account_id belongs to different building';
    END IF;
  END IF;
  -- Check counter_account_id
  IF NEW.counter_account_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE id = NEW.counter_account_id
        AND building_id IS NOT NULL
        AND building_id != NEW.building_id
    ) THEN
      RAISE EXCEPTION 'counter_account_id belongs to different building';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_booking_account_building
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_account_building();
```

