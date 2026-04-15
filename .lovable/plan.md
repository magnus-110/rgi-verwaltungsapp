

## Plan: Zwei Tabs auf der rechten Seite — Analyse & Zuordnung

### Konzept

Die rechte Seite des Prüfmodus bekommt zwei Tabs:
1. **Analyse** — Zeigt wie bisher: Rechnungs-PDF, Vorlagendetails oder KI-Analyse
2. **Zuordnung** — Neue Ansicht zum Verknüpfen mit Rechnungen oder Vorlagen, mit KI-Ranking

### Änderungen in `TransactionReviewMode.tsx`

#### Rechte Seite: Tabs-Struktur

- Import `Tabs, TabsList, TabsTrigger, TabsContent` aus `@/components/ui/tabs`
- Die rechte Hälfte (`w-1/2`) wird in eine `Tabs`-Komponente gewickelt mit Tabs `analyse` und `zuordnung`
- **Tab "Analyse"**: Enthält den bisherigen Inhalt (Rechnungs-PDF, Vorlagendetails, KI-Analyse, oder "Kein Beleg")
- **Tab "Zuordnung"**: Neuer Inhalt (siehe unten)

#### Tab "Zuordnung" — Inhalt

**Zwei Sektionen: Rechnungen & Vorlagen**

1. **Rechnungen-Sektion**
   - Neuer Query: Alle Rechnungen des Gebäudes laden (`invoices` Tabelle, `building_id`)
   - Toggle "Bereits zugeordnete anzeigen" — filtert Rechnungen mit `status = 'paid'` ein/aus
   - KI-Ranking: Aus `ai_suggestion.matches` die Invoice-Matches extrahieren und oben als "Empfohlen" anzeigen
   - Jede Rechnung als kompakte Zeile: Lieferant, Betrag, Datum, Re-Nr, 1-Satz-Begründung aus dem KI-Match
   - Klick auf eine Rechnung → setzt `invoice_id` und `matched_invoice_id` in der aktuellen Buchungszeile und auf der Transaktion

2. **Vorlagen-Sektion**
   - Bestehende Templates des Gebäudes laden (query existiert bereits teilweise)
   - KI-Ranking: Aus `ai_suggestion.matches` die Template-Matches extrahieren und oben als "Empfohlen" anzeigen
   - Jede Vorlage als kompakte Zeile: Name, Lieferant, Betrag, Intervall, 1-Satz-Begründung
   - Klick → setzt `matched_template_id` in der Buchungszeile und füllt Konto/MwSt vor

3. **KI-Vorschläge hervorheben**
   - Matches aus `ai_suggestion.matches` werden nach Score sortiert
   - Top-Vorschläge bekommen ein Badge "Empfohlen" + Score-Prozent
   - Die 1-Satz-Begründung kommt aus `match.reason` (bereits von der KI geliefert)

#### State-Erweiterungen

- `activeRightTab`: `"analyse" | "zuordnung"` — Default `"analyse"`
- `showAssignedInvoices`: boolean Toggle
- Neuer Query für alle Rechnungen des Gebäudes

#### Zuordnungs-Logik

Wenn eine Rechnung/Vorlage ausgewählt wird:
- Die aktuelle `formRow` wird aktualisiert (`invoice_id`, `matched_template_id`, Konto, Beschreibung, MwSt)
- Die Transaktion wird per Update in `bank_transactions` aktualisiert (`matched_invoice_id` / `matched_template_id`)
- Der Analyse-Tab aktualisiert sich automatisch (da der Query-Key sich ändert)

### Dateien

| Datei | Änderung |
|-------|----------|
| `TransactionReviewMode.tsx` | Tabs-Struktur rechts, Zuordnungs-Tab mit Rechnungs-/Vorlagenliste, KI-Ranking, Toggle |

