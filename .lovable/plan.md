

## Optimale WEG-Abrechnung — Skalierbar für 3 bis 100+ Einheiten

### Kern-Probleme im Ist-Zustand

1. **Keine Kontensektions-Steuerung**: Alle billing-relevanten Konten werden gleich behandelt — es fehlt die Unterscheidung "umlagefähig vs. nicht umlagefähig vs. Abgrenzung vs. Rücklage vs. Einnahme"
2. **Heizkosten werden per Verteilerschlüssel verteilt** statt per echten Heizkostenabrechner-Werten (Brunata/ista)
3. **Vorschussverpflichtung nur aus SOLL** (`contact_building_costs`) — kein Abgleich mit tatsächlich gezahlten Beträgen
4. **PDF-Layout zu simpel** — fehlt die professionelle Tabellenstruktur mit WP-Spalte und verteilungsrelevanter Spalte
5. **§35a nicht differenziert** zwischen haushaltsnahen Dienstleistungen und Handwerkerleistungen

### Skalierungs-Design-Prinzipien

- **Virtualisierung**: Eigentümer-Tabellen mit 100+ Zeilen brauchen Lazy-Rendering (keine Änderung nötig — React-Table handled das)
- **Batch-PDF**: Statt 100 einzelne Edge-Function-Calls → ein Call der alle PDFs als ZIP zurückgibt
- **Heizkosten-Import**: CSV-Upload statt 100 manuelle Eingabefelder
- **Paginierte Buchungsprüfung**: Bei 100 Einheiten × 12 Monate = 1.200+ Buchungen → Gruppierung mit Lazy-Load pro Konto

---

### Phase 1: Datenmodell (Migration)

**Neue Spalten auf `chart_of_accounts`:**

```sql
ALTER TABLE chart_of_accounts 
  ADD COLUMN is_distributable boolean NOT NULL DEFAULT false,
  ADD COLUMN settlement_section text,  
  -- 'income' | 'operating_distributable' | 'operating_non_distributable' | 
  -- 'accrual' | 'reserve' | 'reserve_withdrawal' | 'bank'
  ADD COLUMN settlement_35a_type text;  
  -- 'dienste' | 'handwerker' | null

-- Defaults setzen basierend auf bestehenden Flags
UPDATE chart_of_accounts SET is_distributable = true WHERE is_billing_relevant = true;
UPDATE chart_of_accounts SET settlement_section = 'operating_distributable' WHERE is_billing_relevant = true;
UPDATE chart_of_accounts SET settlement_section = 'reserve' WHERE category = 'ruecklage';
```

**Neue Tabelle für Heizkosten-Verteilungswerte:**

```sql
CREATE TABLE heating_distribution_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES contact_building_assignments(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(billing_period_id, assignment_id)
);
ALTER TABLE heating_distribution_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage heating_distribution_values" ON heating_distribution_values
  FOR ALL TO authenticated USING (user_has_admin_access(auth.uid()))
  WITH CHECK (user_has_admin_access(auth.uid()));
```

**Dateien:** 1 Migration, `types.ts` Update

---

### Phase 2: Kontenrahmen-UI erweitern (`ChartOfAccountsTab.tsx`)

Neue Spalten in der Bearbeitungs-UI:
- **Abrechnungssektion** Dropdown: Einnahme / Umlagefähig / Nicht umlagefähig / Abgrenzung / Rücklage / Bank
- **Verteilungsrelevant** Toggle (= `is_distributable`)
- **§35a Typ** Dropdown: Dienste / Handwerker / keine

Wichtig für Skalierung: Diese Konfiguration wird einmal pro Kontenrahmen gemacht, nicht pro Liegenschaft. Liegenschaftsspezifische Overrides existieren bereits via `building_account_overrides`.

---

### Phase 3: Heizkosten-Verteilungswerte (`HeatingRebookingSection.tsx` erweitern)

Nach der Umbuchung auf Konto 1400:
- **Tabelle aller Eigentümer** mit Eingabefeld für Euro-Betrag (vom Heizkostenabrechner)
- **CSV-Import-Button** für Brunata/ista-Daten (bei 50+ Einheiten unverzichtbar)
- **Validierung**: Summe aller Eigentümer-Beträge muss = Gesamtbetrag Konto 1400 sein
- **Fallback**: Wenn keine Werte eingetragen → Verteilung nach MEA mit Warnung

Skalierung: CSV-Import parst Name/Einheit/Betrag und matched automatisch gegen `contact_building_assignments.unit_number`.

---

### Phase 4: Settlement-Engine neu (`BillingSettlement.tsx`)

Komplett neue Berechnungslogik mit 3 Tabs:

**Tab 1: Gesamtabrechnung**
Struktur exakt wie Referenz-PDF:

```text
Anfangsbestände     (account_balances WHERE carry_forward_balance)
+ Einnahmen         (settlement_section = 'income')  
- Umlagefähig       (settlement_section = 'operating_distributable')
- Nicht umlagefähig  (settlement_section = 'operating_non_distributable')
- Abgrenzungen      (settlement_section = 'accrual')
- IHR Zuweisung     (settlement_section = 'reserve')
+/- RL-Entnahme     (settlement_section = 'reserve_withdrawal')
= Abrechnungssumme
vs. Vorschussverpflichtung (Summe aller HG-Zahlungen)
= Abrechnungsspitze
Kontrolle: Endbestände (Giro + RL) = berechneter Bestand
```

3-Spalten-Tabelle pro Zeile: **Wirtschaftsplan** | **Einnahmen/Ausgaben** | **Verteilungsrelevant**

**Tab 2: Einzelabrechnungen**
Pro Eigentümer: 7-spaltige Tabelle wie im Referenz-PDF:
- Konto | Bezeichnung | Verteilungsrel. Betrag | Verteiler | Gesamt-Anteil | Ihr Anteil | Ihre Kosten
- Heizkosten (1400): Direkt aus `heating_distribution_values` statt Verteilerschlüssel
- IHR nach MEA verteilt
- Abrechnungsspitze = Vorschüsse - Kosten

**Skalierung bei 100 Einheiten:**
- Eigentümer-Liste mit Suchfeld und Paginierung (10 pro Seite)
- Detail-Ansicht per Klick statt alle gleichzeitig rendern
- "Alle PDFs generieren" als Batch-Job mit Fortschrittsanzeige

**Tab 3: Vermögensbericht** (bereits vorhanden, minor Anpassungen)

---

### Phase 5: PDF-Engine (`generate-billing-pdf/index.ts`)

Komplett neu mit dem professionellen Layout:

**Gesamtabrechnung PDF:**
- Briefkopf (aus ReportTemplateSettings)
- 3-Spalten-Tabelle: WP | Ist | Verteilungsrelevant
- Anfangsbestände → Einnahmen → Ausgaben → Abgrenzungen → IHR → Spitze → Kontrolle

**Einzelabrechnung PDF (pro Eigentümer):**
- 7-Spalten-Tabelle mit allen verteilungsrelevanten Konten
- Heizkosten-Zeile mit Heizkostenabrechner-Verweis
- §35a Bescheinigung (Dienste + Handwerker getrennt) als separate Seite

**Skalierung:**
- Wenn `ownerId` nicht übergeben → alle Einzelabrechnungen als mehrseitiges PDF
- Optional ZIP-Download mit Einzel-PDFs pro Eigentümer
- Batch-Verarbeitung: Edge Function verarbeitet Eigentümer sequentiell, nicht parallel (Memory-Limit)

---

### Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| Migration (SQL) | `is_distributable`, `settlement_section`, `settlement_35a_type` auf `chart_of_accounts`; neue `heating_distribution_values` Tabelle |
| `types.ts` | Neue Spalten + neue Tabelle |
| `ChartOfAccountsTab.tsx` | 3 neue Felder im Edit-Dialog: Sektion, Verteilungsrelevant, §35a-Typ |
| `HeatingRebookingSection.tsx` | Heizkosten-Verteilungswerte-Eingabe + CSV-Import |
| `BillingSettlement.tsx` | Komplett neu: Gesamtabrechnung mit 3-Spalten-Struktur, Einzelabrechnung mit 7-Spalten, Heizkosten-Sonderlogik |
| `generate-billing-pdf/index.ts` | Komplett neu: Professionelles Layout mit WP-Spalte und §35a-Trennung |

### Implementierungsreihenfolge
1. Migration + types.ts
2. ChartOfAccountsTab (neue Flags konfigurierbar)
3. HeatingRebookingSection (Verteilungswerte-Eingabe)
4. BillingSettlement (neue Engine)
5. generate-billing-pdf (PDF-Layout)

