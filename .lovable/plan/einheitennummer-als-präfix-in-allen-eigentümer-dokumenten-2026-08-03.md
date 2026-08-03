# Einheitennummer als Präfix in allen Eigentümer-Dokumenten

Ziel: Jedes eigentümerbezogene Dokument beginnt einheitlich mit der 4-stelligen Einheitennummer (`0003_…`), damit die automatische Zuordnung persönlicher Anhänge in Rundmails funktioniert und Dateien im ZIP nicht kollidieren.

## Ist-Zustand (geprüft)

| Dokument | DMS-Ablage | ZIP / Einzel-Download |
|---|---|---|
| Einzelabrechnung | `0003_Einzelabrechnung_2025_Name_3` — korrekt | `Abrechnung_2025_Name_3.pdf` bzw. `Einzelabrechnung_Name_2025.pdf` — **kein Präfix** |
| §35a Bescheinigung | `0003_§35a_2025_Name_3` — korrekt | `35a_2025_Name_3.pdf` — **kein Präfix** |
| Sammelbericht | `0003_Sammelbericht_…` — korrekt | ZIP-Namen kommen aus der Edge Function — **kein Präfix** |
| Einzelwirtschaftsplan | `Einzelwirtschaftsplan_2026_Name` — **kein Präfix** | **kein Präfix** |
| ETV-Einladung (Briefe) | ZIP-Dateien heißen `001_Name.pdf` (laufende Nummer) — **keine Einheitennummer** |

## Was geändert wird

1. **Gemeinsame Hilfsfunktion** `unitFilePrefix()` (heute lokal in `BillingSettlement.tsx`) wird nach `src/lib/unitFilePrefix.ts` ausgelagert und überall wiederverwendet.

2. **Einzelwirtschaftsplan** (`ManualEconomicPlanEditor.tsx`): DMS-Anzeigename, ZIP-Dateiname und Einzel-Download bekommen das Präfix der Einheit (`0003_Einzelwirtschaftsplan_2026_Name_3`).

3. **Einzelabrechnung, §35a, Sammelbericht** (`BillingSettlement.tsx`): Präfix auch in den ZIP-Einträgen und bei Einzel-Downloads – damit ZIP-Inhalt und DMS-Ablage identisch benannt sind.

4. **ETV-Einladung** (`comm-render-letters`): Dateiname wird `0003_Name.pdf` statt `001_Name.pdf`. Bei gebündelten Eigentümern mit mehreren Einheiten wird die kleinste Einheitennummer als Präfix verwendet und die weiteren Einheiten angehängt (`0003-0007_Name.pdf`), damit die Datei eindeutig bleibt. Ohne Einheitennummer bleibt die laufende Nummer als Fallback.

## Technische Details

- Präfix-Regel: erste Ziffernfolge der `unit_number`, als Zahl geparst und auf 4 Stellen mit Nullen aufgefüllt, plus `_`. Keine Einheitennummer → kein Präfix.
- `comm-render-letters` liest die Einheiten aus den bereits geladenen Empfänger-Variablen (`einheit` bzw. `einheiten_liste`), keine zusätzliche Abfrage nötig.
- Die Rundmail-Auto-Zuordnung (Präfix-Matching auf 4-stellige Einheitennummer) bleibt unverändert und greift dann für alle vier Dokumenttypen.
- Keine Datenbank- oder Schemaänderungen; die Edge Function `comm-render-letters` wird neu deployed.
