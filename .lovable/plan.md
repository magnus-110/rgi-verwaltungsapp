

# Plan: Kontenrahmen-Korrektur für saubere Jahres- und Einzelabrechnung

Vollständiger Audit aller 95 Konten im globalen Kontenrahmen + 3 Liegenschafts-Overrides für Birkenweg 6. Ziel: Jedes Konto hat konsistente, fachlich korrekte Settings.

## Was korrigiert wird (Daten-Migration, kein Code)

### A) Müllkonten — §35a-Flags entfernen
Müllabfuhr ist nach BFH-Rechtsprechung **keine** §35a-Leistung (kein Personeneinsatz im Haushalt).
- **1010 Müllabfuhr**: `is_35a_relevant=false`, `settlement_35a_type=null`

### B) Vermieter-/Leerstandskonten — richtige Sektion
Diese Konten erfassen Kosten, die **nicht** auf Eigentümer/Mieter verteilt werden, sondern beim Vermieter bleiben.
- **1031 Wasser Vermieteranteil**, **1051 Allgemeinstrom Vermieteranteil**, **1461 CO2 Vermieteranteil**: `settlement_section=operating_non_distributable` (statt distributable, da `vr=0` schon korrekt war)

### C) Heizungs-Wartungskonten — saubere Trennung
- **1431 Gerätemiete**: `is_35a_relevant=false`, `settlement_35a_type=null` (Miete, kein Handwerker)
- **1430 Messdienst**: `is_35a_relevant=false` (Dienstleistung ohne Vor-Ort-Personal-Einsatz im Haushalt)

### D) Instandhaltung 1600–1610 — für WEG umlagefähig
In der WEG-Gesamtabrechnung wird laufende Instandhaltung auf alle Eigentümer nach MEA verteilt.
- **1600, 1601, 1602, 1603, 1610**: `settlement_section=operating_distributable`

### E) Zinsen & Steuern auf Rücklage
- **1840 Zinseinnahmen**: `settlement_section=reserve`, `is_distributable=false` (erhöht direkt die Rücklage, wird nicht verteilt)
- 1850/1860 sind bereits korrekt

### F) Mitteilungs-/Memo-Konten — aus der Abrechnung raus
Reine Reportingkonten dürfen weder in Bewirtschaftung noch verteilt werden.
- **1900, 1910, 1930**: `settlement_section=null`, `is_distributable=false`, `is_billing_relevant=false`, `default_vat_rate=0`
- **7100, 7120 §35a-Bescheinigung**: `settlement_section=null`

### G) 1920 Reparaturen aus Rücklage — Neutralisierung sicherstellen
Damit die `is_reserve_funded`-Logik im PDF/Settlement greift, muss das Konto in der Bewirtschaftung erscheinen.
- **1920**: `settlement_section=operating_distributable`, `is_distributable=true`, `default_vat_rate=0`

### H) Summen-/System-Konten — keine Buchungen, keine MwSt
- **1700, 1730, 1740, 1770, 1780**: `settlement_section=null`, `is_distributable=false`, `default_vat_rate=0` (reine Aggregat-Etiketten)
- **00000, 09999.998, 09999.999**: `default_vat_rate=0` (System-Marker)

### I) Verrechnungs-/Abgrenzungskonten — MwSt 0 %
- **4000, 4010, 4020, 4021, 4025, 4030, 4040, 4100, 4110–4180, 4900, 4910, 9000**: `default_vat_rate=0`

### J) Birkenweg 6 — falsche Overrides bereinigen
- Override 1010 → `heizkostenverordnung` **löschen** (Müll nach Heizkostenverordnung ist sinnlos; fällt zurück auf Standard `mea`)
- Overrides 1011 → `einheiten` und 1470 → `einheiten` **bestehen lassen** (waren bewusst gesetzt)

## Was unverändert bleibt
- Alle korrekt konfigurierten Aufwandskonten (1000, 1030–1090, 1100–1130, 1200, 1300–1303, 1400–1420, 1440, 1450, 1460, 1470–1473, 1500–1540, 1800, 1810)
- Personenkonten 0001/0002/0003 (gestern bereits korrigiert)

## Test nach Migration
Birkenweg 6 / Abrechnung 2025 neu laden:
- Warnung „Kein Verteilerschlüssel hinterlegt" sollte komplett leer sein
- §35a-Bescheinigung enthält nur noch echte Handwerker-/Dienstleister-Konten
- 1900/1910 erscheinen nirgends mehr in der Bewirtschaftung
- Zinsen 1840 erhöhen die Rücklage statt verteilt zu werden

## Reihenfolge nach Approval
1. Eine SQL-Migration mit allen `UPDATE chart_of_accounts SET …` und einem `DELETE FROM building_account_overrides WHERE id='ec30c219-…'`
2. User testet Birkenweg 6 → Banner muss leer sein
3. Falls weitere Inkonsistenzen auftauchen, Nachzieh-Migration

