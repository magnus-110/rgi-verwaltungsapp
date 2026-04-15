

## Plan: Wirtschaftsjahr-Erkennung & Abgrenzungshinweise in der KI-Analyse

### Konzept

Die KI soll bei der Transaktionsanalyse automatisch erkennen, in welches Wirtschaftsjahr eine Buchung gehört, und warnen, wenn eine Abgrenzungsbuchung nötig ist. Die Logik basiert auf drei Datenpunkten:

1. **Kontoauszugsdatum** (`booking_date` der Transaktion)
2. **Rechnungsdatum** (falls eine Rechnung zugeordnet wurde)
3. **Leistungszeitraum** (falls aus Rechnung/Verwendungszweck erkennbar)

### Regeln

- **Standard**: `fiscal_year` = Jahr des Kontoauszugsdatums (bereits so implementiert)
- **Abgrenzung nötig** wenn:
  - Rechnungsdatum in anderem Jahr als Kontoauszugsdatum
  - Leistungszeitraum übergreift Jahresgrenzen (z.B. Versicherung 07/2024–06/2025)
- Die KI liefert einen neuen `fiscal_year_hint` mit Begründung

### Änderungen

#### 1. `suggest-match` Edge Function — `fiscal_year_hint` hinzufügen

Erweiterung des System-Prompts:
- KI soll prüfen, ob Kontoauszugsdatum und Verwendungszweck/Rechnungsdatum auf unterschiedliche Wirtschaftsjahre hindeuten
- Neues Tool-Feld `fiscal_year_hint` mit: `fiscal_year` (empfohlenes Jahr), `needs_accrual` (boolean), `accrual_explanation` (Begründung), `service_period_from`/`service_period_to`

Erweiterung des Tool-Schemas um ein neues optionales Feld in `suggest_matches`.

#### 2. `TransactionReviewMode.tsx` — Wirtschaftsjahr-Feld editierbar machen + Hinweis

- **Wirtschaftsjahr-Feld** sichtbar im Buchungsformular (aktuell fehlt es im UI, wird nur intern gesetzt)
- Wenn `ai_suggestion.fiscal_year_hint` vorhanden:
  - Warnung anzeigen (gelbes Banner) mit der KI-Begründung
  - Auto-Fill des `fiscal_year`-Felds aus dem KI-Vorschlag
  - Bei `needs_accrual=true`: Hinweis "Abgrenzungsbuchung empfohlen" mit Erklärung
- Feld bleibt manuell änderbar

#### 3. `useTransactionAiPrefetch.ts` — Rechnungsdatum mitsenden

Wenn die Transaktion eine gematchte Rechnung hat (`matched_invoice_id`), das `invoice_date` der Rechnung im Request an `suggest-match` mitsenden, damit die KI den Vergleich machen kann. Die Rechnungsdaten werden bereits geladen (`invoices`), also nur noch das Datum an die passende Transaktion anhängen.

### Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/suggest-match/index.ts` | Neues `fiscal_year_hint`-Feld im Tool-Schema + Prompt-Erweiterung |
| `src/components/finance/TransactionReviewMode.tsx` | Wirtschaftsjahr-Feld im Formular + Abgrenzungs-Warnung |
| `src/hooks/useTransactionAiPrefetch.ts` | Rechnungsdatum an Transaktion anhängen |

