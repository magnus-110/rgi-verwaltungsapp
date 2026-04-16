

## Plan: KI-Analyse nur für relevante Transaktionen

### Problem
Aktuell analysiert die KI alle 77 nicht-gebuchten Transaktionen ohne `ai_suggestion`. Das schließt auch Transaktionen ein, die bereits einer **Vorlage** zugeordnet sind (`matched_template`). Diese brauchen keine KI-Analyse, da die Vorlage bereits das Konto definiert.

### Lösung
Den Filter in `useTransactionAiPrefetch.ts` ändern: Nur Transaktionen analysieren, die:
1. **`match_status = "unmatched"`** — offene Transaktionen ohne Zuordnung
2. **`match_status = "matched_invoice"`** — Transaktionen mit zugeordneter Rechnung (hier soll die KI eine vollständige Buchung mit allen Feldern vorschlagen)

Transaktionen mit `matched_template` oder `booked_at` werden **ausgeschlossen**.

### Änderung

**`src/hooks/useTransactionAiPrefetch.ts`**

Zeilen 33 und 53: Filter ändern von:
```typescript
.filter((t: any) => !t.ai_suggestion && !t.booked_at)
```
zu:
```typescript
.filter((t: any) => !t.ai_suggestion && !t.booked_at && 
  (t.match_status === "unmatched" || t.match_status === "matched_invoice"))
```

Das reduziert die Anzahl von ~77 auf ~25 (offene) + Rechnungs-Matches = deutlich weniger API-Calls und Kosten.

### Dateien
| Datei | Änderung |
|---|---|
| `src/hooks/useTransactionAiPrefetch.ts` | Filter auf `unmatched` + `matched_invoice` einschränken (2 Stellen) |

