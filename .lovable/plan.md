
## Ziel
Die Abrechnung für **Birkenweg 6 / WJ 2025** soll aus den in Supabase hinterlegten Daten **rechnerisch auf dieselben Werte wie HV Office** kommen — nicht nur optisch ähnlich.

## Warum das Ergebnis aktuell noch abweicht

### 1) UI und PDF rechnen nicht mit derselben Datenbasis
Die App-UI lädt Buchungen aktuell über `fiscal_year = 2025`, die PDF-Function dagegen über `booking_date` im Abrechnungszeitraum.  
Dadurch fehlen in der UI periodisch relevante Buchungen, z. B. die **Gas-Rückerstattung 427,68 € auf 4130** mit `booking_date = 2025-02-18`, aber `fiscal_year = 2024`.

Folge:
- Abgrenzungen/Einnahmen weichen ab
- UI und PDF können trotz identischer Daten unterschiedliche Werte zeigen

### 2) Die Kontensalden werden für Bank-/Bestandskonten fachlich falsch aggregiert
Der aktuelle Helper `sumForAccount()` behandelt:
- `account_id` immer als `+amount`
- `counter_account_id` immer als `-amount`

Das funktioniert für viele **Kostenkonten**, aber **nicht** für:
- **1800 Giro**
- **1810 Rücklage**
- Personenkonten
- Salden-/Bilanzkonten allgemein

Denn dort muss die Richtung von `booking_type` bzw. der fachlichen Kontoart abhängen.  
Darum entstehen falsche Endbestände.

### 3) Die Rücklagen-Zuführung wird nicht wie HV Office hergeleitet
HV Office weist für 2025 eine **Zuführung zur Rücklage von 3.600,00 €** aus (im PDF als **1720**).  
In der App fehlt dafür aktuell eine belastbare Quelle:
- `economic_plans.total_reserve` ist leer
- auf `1710/1720` liegt keine verwertbare Buchung
- in `contact_building_costs` gibt es nur **Hausgeld**, aber keine getrennte **Rücklage**

Folge:
- Reserveblock wird in der App zu klein oder 0
- daraus folgen falsche Einzelabrechnung, falsche Abrechnungsspitze und falsche Rücklagen-Endstände

### 4) Die HV-Office-Logik trennt Hausgeld intern in Betriebskosten-Vorschuss und Rücklagen-Vorschuss
HV Office zeigt:
- Vorschüsse zur Kostendeckung
- Vorschüsse auf EHR

In Supabase liegen die Zahlungen aber aktuell nur als **Hausgeld auf Personenkonten** vor.  
Damit die App exakt gleich rechnet, muss sie diese Zahlungen **synthetisch in Betriebskostenanteil und Rücklagenanteil aufteilen**.

### 5) Mindestens ein Building-Override ist noch falsch
Für Birkenweg 6 sind noch Overrides aktiv, die nicht zu HV Office passen:
- **1010** ist noch überschrieben
- **1011** ist ebenfalls überschrieben, obwohl die HV-Abrechnung hier praktisch nach **MEA** verteilt

Folge:
- Einzelabrechnung weicht je Einheit ab, obwohl die Buchungen identisch sind

### 6) Die Abrechnung enthält HV-Office-Synthesepositionen, die die App noch nicht sauber modelliert
Dazu gehören insbesondere:
- **Rücklagenzuführung (1720 / 1710-Äquivalent)**
- **Vorschuss-Split Betrieb / EHR**
- **WEG-Abrech.-Sollstellung (4020)**
- saubere HV-konforme Behandlung von **4110 / 4130 / 4160 / 4180**

Diese Werte sind nicht einfach „gebuchte Kontensummen“, sondern teils **abgeleitete Jahresabrechnungswerte**.

---

## Was umgesetzt werden muss

### A) Eine zentrale Abrechnungs-Engine bauen
Die Logik darf nicht mehr doppelt existieren.

Es wird eine gemeinsame Engine eingeführt, die von:
- `src/components/finance/BillingSettlement.tsx`
- `supabase/functions/generate-billing-pdf/index.ts`

gleichermaßen verwendet wird.

Diese Engine liefert:
1. Gesamtabrechnung
2. Einzelabrechnungen je Einheit
3. Rücklagenentwicklung
4. Vorschuss-Soll / Ist / Abrechnungsspitze
5. HV-Office-kompatible synthetische Zeilen

### B) Buchungen künftig immer periodisch statt nur per fiscal_year ziehen
Für die Abrechnung werden Buchungen primär über:

- `booking_date >= period_from`
- `booking_date <= period_to`

geladen.

`fiscal_year` bleibt nur noch Kontroll-/Diagnosefeld, nicht Hauptfilter.

### C) Bewegungslogik fachlich korrekt aufbauen
Statt `sumForAccount()` für alles zu missbrauchen, wird ein normalisierter Bewegungsstrom eingeführt:

```text
Buchung
→ fachlicher Bewegungsvektor je Konto
→ je nach Kontoart / booking_type anders signiert
```

Getrennte Regeln für:
- Aufwand/Ertrag
- Bankkonten
- Rücklagenkonten
- Personenkonten
- Abgrenzungskonten

Damit werden Anfangs- und Endbestände endlich korrekt.

### D) Rücklagenlogik HV-Office-konform machen
Die Engine bekommt eine feste Prioritätslogik für die **jährliche Rücklagenzuführung**:

1. expliziter Wirtschaftsplan (`economic_plans.total_reserve`)
2. vorhandenes Plan-/Systemkonto (`1710/1720`)
3. abgeleitete Rücklagen-Sollstellung aus Hausgeldstruktur / Stammdaten

Zusätzlich wird die **Rücklagenentnahme 1920** weiterhin neutralisiert, aber nun gegen die korrekt ermittelte Zuführung gerechnet.

### E) Vorschüsse in zwei Ebenen berechnen
Die Engine berechnet getrennt:

- **Vorschuss-Soll laut WPL**
- **tatsächlich gezahlte Vorschüsse**
- davon **Betriebskostenanteil**
- davon **Rücklagenanteil**

So können exakt die HV-Office-Zeilen erzeugt werden:
- Vorschüsse zur Kostendeckung
- Vorschüsse auf EHR
- Abrechnungsspitze
- Abrechnungssaldo

### F) Konten- und Override-Fixes für Birkenweg 6 nachziehen
Zusätzlich zur bisherigen Kontenrahmen-Korrektur werden die noch abweichenden Birkenweg-Overrides bereinigt, insbesondere:
- 1010 nicht auf falschen Verteiler
- 1011 nicht auf falschen Verteiler
- Heiz-/Rücklagen-/Abgrenzungskonten nochmals gegen HV-Ergebnis prüfen

---

## Konkrete Bugs, die ich fixen werde

1. `BillingSettlement.tsx` nutzt falschen Hauptfilter (`fiscal_year`) statt Periodenlogik
2. `sumForAccount()` wird für Bank-/Saldo-Konten falsch verwendet
3. Anfangs-/Endbestände 1800/1810 werden dadurch falsch berechnet
4. Rücklagenzuführung fehlt, wenn `economic_plans.total_reserve` leer ist
5. UI und PDF nutzen unterschiedliche Abrechnungslogik
6. Vorschuss-Split Betrieb/EHR fehlt
7. HV-Office-Synthesekonto 4020 wird nicht korrekt hergeleitet
8. Building-Overrides für Birkenweg 6 sind noch nicht vollständig HV-konform
9. Die PDF-Engine nutzt teilweise andere Reserve-/Kontenklassifikation als das Frontend
10. Abgrenzungskonten 4110/4130/4160/4180 werden nicht strikt HV-konform periodisiert/dargestellt

---

## Zielbild des Systems nach dem Fix

```text
Supabase Buchungen + Stammdaten + Shares + Kosten + Heizwerte
            ↓
   Shared Settlement Engine
            ↓
  1. periodische Bewegungen
  2. HV-konforme Ableitungen
     - Betriebskosten
     - Rücklagenzuführung
     - Rücklagenentnahme
     - Vorschuss Soll/Ist
     - Abgrenzungen
     - 4020 / Spitzenausweis
            ↓
  UI = PDF = CSV = exakt gleiche Zahlenbasis
```

---

## Technische Umsetzung

### Dateien
- `src/components/finance/BillingSettlement.tsx`
- `src/components/finance/lib/bookingAggregation.ts`
- neue Shared-Settlement-Helpers im Frontend
- `supabase/functions/_shared/booking-aggregation.ts`
- `supabase/functions/generate-billing-pdf/index.ts`
- ggf. neue Migration für korrigierte `building_account_overrides`

### Rechenmodell
Es werden drei getrennte Rechenebenen eingeführt:

1. **Bewegungsrechnung**
   - aus realen Buchungen
   - streng nach `booking_date`

2. **Plan-/Sollrechnung**
   - Hausgeld-Soll
   - Rücklagen-Soll
   - Eigentümerverpflichtung

3. **Abrechnungsableitung**
   - HV-konforme Gesamtabrechnung
   - HV-konforme Einzelabrechnung
   - Abrechnungsspitze / Abrechnungssaldo
   - synthetische Abrechnungszeilen

### Validierung gegen Birkenweg 6
Nach Umsetzung wird Birkenweg 6 / 2025 explizit gegen die beigefügten PDFs geprüft:

- Anfangsbestand Giro
- Anfangsbestand Rücklage
- Heizkosten gesamt
- nicht umlagefähige Kosten
- Rücklagenzuführung
- Rücklagenentnahme
- Abgrenzungen
- Abrechnungssumme gesamt
- Vorschussverpflichtung gesamt
- Abrechnungsspitze gesamt
- Einzelwerte Einheit 0001 / 0002 / 0003

---

## Reihenfolge
1. Shared-Settlement-Engine definieren
2. Periodenfilter und Bewegungslogik korrigieren
3. Bank-/Saldo-Logik für 1800/1810 fachlich richtig machen
4. Reserve-Soll und Vorschuss-Split implementieren
5. 4020 / Abgrenzungslogik HV-konform ergänzen
6. Building-Overrides Birkenweg 6 korrigieren
7. UI, PDF und CSV vollständig auf dieselbe Engine umstellen
8. Birkenweg 6 / 2025 gegen die HV-Office-PDFs numerisch abgleichen
