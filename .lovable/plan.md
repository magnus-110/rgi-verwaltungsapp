

## Plan: KI-Vorlagenvorschlag anzeigen + Prefetch-Zuverlässigkeit verbessern

### Problem 1: Template-Vorschlag wird nicht angezeigt
Die `suggest-match` Edge Function gibt `template_suggestion` zurück (Name, Lieferant, Betrag, Intervall), aber das UI im TransactionReviewMode zeigt diesen Vorschlag nirgends an. Es fehlt ein UI-Block, der den Vorschlag darstellt und einen "Vorlage erstellen"-Button bietet.

### Problem 2: KI-Analyse fehlt oft
Mehrere Ursachen:
- Der Prefetch-Hook filtert nur `match_status === "unmatched" || "invoice_pending"` — Transaktionen mit anderen Status werden nie analysiert
- Der `useEffect`-Dependency auf `transactions.length` triggert nicht bei Datenänderungen innerhalb der Transaktion (z.B. nach Reload)
- Wenn `runningRef.current` noch `true` ist (z.B. nach Tab-Wechsel), startet der Prefetch nicht erneut

### Änderungen

#### 1. TransactionReviewMode.tsx — Template-Vorschlag im rechten Panel

Im KI-Analyse-Bereich (rechtes Panel, ab Zeile 716) wird ein neuer Block eingefügt für `template_suggestion`:
- Karte mit Vorlagendetails: Name, Lieferant, IBAN, Betrag, Intervall, Konto
- Grüner "Vorlage erstellen"-Button, der die Vorlage direkt in `booking_templates` anlegt
- Nach Erstellung: Erfolgsmeldung + automatisches Verknüpfen mit der Transaktion

#### 2. TransactionReviewMode.tsx — Buchungsformular auto-fill aus template_suggestion

Wenn die KI eine `template_suggestion` liefert (aber keine bestehende Vorlage matcht), werden die Felder des Buchungsformulars (Gegenkonto, Beschreibung) aus der Suggestion vorausgefüllt — analog zur bestehenden Template-Logik.

#### 3. useTransactionAiPrefetch.ts — Robustere Auslösung

- Filter erweitern: Auch Transaktionen mit `match_status === "matched_template"` oder `"matched_invoice"` können `ai_suggestion` bekommen (für zusätzliche Hinweise)
- **Hauptfix**: Dependency-Array auf stabile ID-Liste statt `transactions.length` umstellen, damit Neuladungen den Prefetch triggern
- Reset `runningRef` beim Cleanup sauberer handhaben

#### 4. suggest-match Edge Function — Historische Buchungen mitliefern

Der Prefetch-Hook lädt bereits Templates und Invoices, sendet aber keine `historicalBookings`. Das führt dazu, dass die KI keine fundierte Entscheidung treffen kann, ob eine Vorlage oder ein `missing_invoice_hint` vorgeschlagen werden soll. Fix: Im Prefetch zusätzlich die letzten Buchungen desselben Kreditors (per IBAN/Name) laden und mitsenden.

### Dateien

| Datei | Änderung |
|-------|----------|
| `TransactionReviewMode.tsx` | Template-Suggestion-UI, Auto-Fill aus Suggestion |
| `useTransactionAiPrefetch.ts` | Historische Buchungen laden, robustere Dependencies |

