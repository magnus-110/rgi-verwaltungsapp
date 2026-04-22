

# Plan: Wirtschaftsplan-Editor mit manueller Erfassung

## Ziel
Wirtschaftsplan in 3 Quellen befüllbar machen — **Vorjahr**, **ETV-Beschluss**, **manuell** — damit auch neu übernommene Liegenschaften ohne Vorjahresdaten einen vollständigen Plan haben. Editor zeigt das gleiche Layout wie das spätere PDF. Sowohl Gesamt- als auch Einzelwirtschaftspläne sind editierbar.

## Konzept: Gesamt → Einzel (mit Override-Möglichkeit)

Der Nutzer pflegt primär den **Gesamtwirtschaftsplan** (Beträge pro Konto auf Gebäudeebene). Die Einzelwirtschaftspläne pro Eigentümer werden **automatisch berechnet** über die hinterlegten Umlageschlüssel — können aber **pro Eigentümer/Konto manuell überschrieben** werden (z. B. bei Sondervereinbarungen, abweichenden Schlüsseln, Mieter-Umlagen).

```text
GESAMTWIRTSCHAFTSPLAN 2025 — Birkenweg 6
Konto                     Plan €    Schlüssel
1010 Müll                  480,00   Personen
1050 Allgemeinstrom        720,00   MEA
1400 Heizung             5.149,00   Brunata
1620 Verwaltervergütung  2.880,00   pro Einheit
…
Σ Hausgeld gesamt       22.320,00

   ↓  automatische Berechnung über Umlageschlüssel  ↓

EINZELWIRTSCHAFTSPLAN — Wohnung 0001 (Wollmann/Deng)  [bearbeitbar]
Konto                Anteil    Plan €/Jahr  €/Monat   Override
1010 Müll          2/5 Pers.    192,00       16,00      –
1050 Allgemstr.   325/1000      234,00       19,50      –
1400 Heizung      Brunata     2.536,64      211,39    ✏️ manuell
…
Σ Hausgeld                    4.860,00      405,00
```

## Was gebaut wird

### 1. Datenbank
- `economic_plans.source` neu: `'previous_year' | 'etv_resolution' | 'manual'`
- `economic_plans.status`: `'draft' | 'active' | 'archived'` (nur ein aktiver pro Gebäude/Jahr)
- `economic_plan_items.manually_overridden` neu (boolean)
- **Neue Tabelle** `economic_plan_unit_items` für Einzelplan-Overrides:
  - `plan_id`, `unit_id`, `account_id`, `amount`, `manually_overridden`, `override_reason`
  - Ohne Override-Eintrag → Wert wird live aus Gesamtplan + Schlüssel berechnet
  - Mit Override → fester Wert wird verwendet

### 2. Seite `/wirtschaftsplan`
Neuer Button **„Manuell anlegen"** neben „Aus Vorjahr generieren". Erscheint immer, ist besonders prominent wenn keine Vorjahresperiode existiert.

### 3. Komponente `EconomicPlanEditor` (erweitert) — Tab „Gesamtplan"
- **PDF-Look-Layout** — gleiche Sektionen, Spalten und Summen wie das spätere PDF
- **Inline-Edit** direkt in den Tabellenzellen
- **Auto-Save als Entwurf** (debounced 800ms)
- **Toggle-Button**: „Bearbeiten" ↔ „Vorschau"
- Geänderte Werte zeigen Reset-Icon zur Wiederherstellung des Original-Wertes

### 4. Komponente `UnitEconomicPlanEditor` (neu) — Tab „Einzelpläne"
- Liste aller Einheiten links, Detail rechts (oder Akkordeon mobil)
- Pro Einheit: Tabelle wie Einzelplan-PDF
- Jede Zelle hat **Edit-Modus**:
  - Standard: live berechneter Wert (grau, Tooltip „berechnet aus Gesamtplan × Schlüssel")
  - Edit: User trägt eigenen Wert ein → wird als `manually_overridden=true` gespeichert
  - Visueller Marker (Stift-Icon) für überschriebene Werte
  - Reset-Button pro Zelle: zurück zum berechneten Wert
- **Abweichungs-Warnung** unten: „Σ Einzelpläne weicht von Σ Gesamtplan ab um X €" — als bewusste Hinweis-Zeile, nicht als Fehler (manche Sondervereinbarungen sind legitim)

### 5. Komponente `EconomicPlanLayout` (neu)
Single Source of Truth für das Layout — wird genutzt von:
- Gesamtplan-Editor (Inline-Edit)
- Einzelplan-Editor (Inline-Edit)
- Vorschau-Modus (read-only)
- PDF-Export

So sind Bildschirm und PDF 1:1 identisch.

### 6. Aktivierung & Versionierung
- Status: `draft` → `active` (nur ein aktiver Plan pro Gebäude/Jahr)
- Beim Aktivieren: alter aktiver Plan → `archived`
- Audit pro Änderung (`updated_by`, `updated_at`)

### 7. Anschluss an Abrechnung
- Abrechnungs-Engine liest den **aktiven Wirtschaftsplan** für die „Plan"-Spalte
- Bei Einzelabrechnung: ggf. Overrides aus `economic_plan_unit_items` berücksichtigen

## UI-Flow

```text
/wirtschaftsplan
   │
   ├─ Liegenschaft + Jahr wählen
   │
   ├─ Hat Vorjahres-Plan?
   │     ja  → [Aus Vorjahr] [Manuell] [Bestehenden bearbeiten]
   │     nein → [Manuell anlegen] (Hinweis: kein Vorjahr verfügbar)
   │
   ├─ Editor öffnet sich
   │     ├─ Tab „Gesamtplan" — Inline-Edit, Auto-Save
   │     ├─ Tab „Einzelpläne" — Live-Berechnung + Override pro Zelle
   │     └─ Toggle: Bearbeiten ↔ Vorschau
   │
   └─ Button „Plan aktivieren"
         ├─ Status: Entwurf → aktiv
         ├─ Vorheriger aktiver Plan → archiviert
         └─ Plan steht für Abrechnung bereit
```

## Reihenfolge der Umsetzung

1. **Schritt 1** — Datenbank-Migration (neue Felder + `economic_plan_unit_items`)
2. **Schritt 2** — `EconomicPlanLayout` als gemeinsame Layout-Komponente extrahieren
3. **Schritt 3** — `EconomicPlanEditor` Tab „Gesamtplan" mit Inline-Edit + Auto-Save + „Manuell anlegen"
4. **Schritt 4** — `UnitEconomicPlanEditor` Tab „Einzelpläne" mit Live-Berechnung + Override
5. **Schritt 5** — „Aktivieren"-Button + Versionierung
6. **Schritt 6** — PDF-Export auf gemeinsame Layout-Komponente umstellen
7. **Direkt im Anschluss**: Plan für **Birkenweg 6 / 2025** manuell anlegen + aktivieren → dann Abrechnung bauen (Schritt A)

## Hinweis
Die Buchhaltung BW6/2025 ist abgeschlossen (Konto 1400 = 5.149,00 € bestätigt). Der manuelle Plan ändert daran nichts — er liefert nur die Plan-Spalte für die Gesamt- und Einzelabrechnung.

