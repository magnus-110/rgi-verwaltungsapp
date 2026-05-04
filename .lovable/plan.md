
# Finaler Umsetzungsplan: KI-Buchen mit RAG, Rechnungstext-Verständnis & Cold-Start

Bestätigte Eckpunkte aus deinen Antworten:
- HV-Office-Buchungen werden mit-gelernt (kein Ausschluss von `imported_legacy`).
- `booking_type` (income/expense) wird Pflicht im KI-Output → schließt den Vorzeichen-Bug für immer.
- DB-Trigger via `pg_net` (versionierbar in Migration).

Neu in diesem Plan (deine zwei Ergänzungen):
- **Rechnungstext (Verwendungszweck + OCR-Positionen) ist erste Bürgersignal-Quelle**, nicht nur Lieferantenname.
- **Cold-Start für neue Liegenschaften** über drei zusätzliche RAG-Schichten + Lieferanten-Memory.

---

## Architektur-Überblick

```text
Banktransaktion / Rechnung
          │
          ▼
1) Multi-Field Embedding (mistral-embed, 1024-dim)
   Input = creditor + amount + booking_type + VERWENDUNGSZWECK + OCR-Positionen
          │
          ▼
2) RAG mit GESTUFTEM Scope:
   a) building_id  +  management_mode               (Stufe 1, höchste Prio)
   b) gleicher mgmt_mode des Mandanten              (Stufe 2, Cold-Start-Hilfe)
   c) globaler Vendor-Memory pro IBAN/Name          (Stufe 3, Cold-Start-Hilfe)
          │
          ▼
3) Smart Account-Whitelist (RAG-Konten + booking_instructions
   + Standard-Bank/Verrechnung + Versorger-Pattern)
          │
          ▼
4) Mistral-large mit STRUKTURIERTEM PROMPT + Tool Calling
   - Klare Bank-Zentrik-Regel
   - RAG-Beispiele mit Verwendungszweck-Vergleich
   - `confidence_score` und `rag_references` Pflicht
          │
          ▼
5) Validation Layer
   (Konto existiert? Soll=Haben? Vorzeichen passt zu booking_type?
    §35a plausibel? Whitelist eingehalten?)
          │
          ▼
6) UI: ConfidenceBadge + RAG-Referenzen mit Verwendungszweck-Snippet
          │
          ▼ User bestätigt/korrigiert
7) ai_booking_feedback INSERT  →  Booking saved
                                     │
                                     ▼ (DB-Trigger via pg_net)
                       Re-Embedding (auch Vendor-Memory wird mitgepflegt)
```

---

## Phase 1 — DB-Fundament (Migration)

### Tabelle `booking_embeddings`
- `id uuid PK`
- `booking_id uuid UNIQUE REFERENCES bookings(id) ON DELETE CASCADE`
- `building_id uuid`, `management_mode public.management_mode NOT NULL`
- `input_text text` — kompletter Embedding-Input (für Debug + Re-Run)
- `embedding vector(1024)`
- Schnellzugriff-Spalten: `creditor_name`, `amount`, `booking_type`, `purpose_text`, `account_number`, `account_name`, `counter_account_number`, `counter_account_name`, `booking_description`, `is_35a_relevant`
- `source text` — `confirmed_human` | `imported_legacy` | `template_match` | `invoice_match`
- `embedded_at timestamptz`
- HNSW-Index `embedding vector_cosine_ops` (m=16, ef_construction=64)
- B-Tree-Index `(building_id, management_mode)`
- RLS via `user_can_access_building`

### NEU — Tabelle `vendor_memory` (Cold-Start-Hilfe)
Lernt liegenschaftsübergreifend, welche Konten ein konkreter Lieferant (per IBAN bzw. Name) typischerweise bekommt — nützlich, wenn neue Liegenschaft 0 Buchungen hat.
- `id uuid PK`
- `vendor_iban text` (nullable), `vendor_name_normalized text` (lowercase, ohne Sonderzeichen) — eines von beiden Pflicht (CHECK)
- `management_mode public.management_mode NOT NULL`
- `account_number text`, `account_category text`
- `purpose_pattern text` — typischer Verwendungszweck-Stamm
- `usage_count int DEFAULT 1`, `last_used_at timestamptz`
- `is_35a_relevant bool`
- UNIQUE `(COALESCE(vendor_iban,''), vendor_name_normalized, management_mode, account_number)`
- RLS: alle authentifizierten Mitarbeiter dürfen lesen (Mandanten-Trennung greift schon über `management_mode` + `chart_of_accounts.building_id`); schreiben nur Service-Role aus dem Re-Embed-Trigger.

### Tabelle `ai_booking_feedback`
Wie zuvor — KI-Vorschlag, User-Korrektur, `rag_example_ids uuid[]`, `confidence_score`.

### SQL-Funktion `find_similar_bookings` (mit gestuftem Scope)
```sql
find_similar_bookings(
  query_embedding vector(1024),
  p_building_id uuid,
  p_management_mode public.management_mode,
  p_match_count int DEFAULT 6,
  p_similarity_threshold float DEFAULT 0.72,
  p_include_other_buildings bool DEFAULT false  -- Stufe 2 für Cold-Start
) RETURNS TABLE(..., scope text)  -- 'building' | 'mode'
```
Logik: Erst building-scoped suchen. Wenn weniger als `p_match_count/2` Treffer und `p_include_other_buildings=true` → zweite Suche über alle Buildings desselben `management_mode`, gekennzeichnet mit `scope='mode'`.

### NEU — SQL-Funktion `find_vendor_memory`
```sql
find_vendor_memory(
  p_vendor_iban text,
  p_vendor_name text,
  p_management_mode public.management_mode
) RETURNS TABLE(account_number text, usage_count int, is_35a_relevant bool, purpose_pattern text)
```
Top-3 Konten nach `usage_count DESC` für genau diesen Lieferanten.

### DB-Trigger
- AFTER INSERT OR UPDATE OF (`account_id, counter_account_id, amount, booking_type, booking_description, status`) ON `bookings`
- Bedingung: `NEW.status = 'confirmed'`
- Aktion: `pg_net.http_post` → Edge `generate-booking-embeddings` mit `{ booking_id }`

### Backfill-Filter (lockerer als zuvor — auf deinen Wunsch)
Alle 397 Buchungen werden eingebettet. HV-Office-Import bekommt `source='imported_legacy'`, wird im Retrieval **nicht ausgeschlossen**, aber im Prompt mit dem Hinweis „aus Legacy-Import" gelabelt, damit die KI weiß, dass diese Quelle weniger streng als manuelle Bestätigungen ist.

---

## Phase 2 — Edge Function `generate-booking-embeddings`

Schritte:
1. Buchung + Konten + verknüpfte Bank-Transaktion + (falls vorhanden) Rechnung laden.
2. **Multi-Field-Input** bauen (kritisch für deine Rechnungstext-Anforderung):
   ```text
   KREDITOR: {creditor_name} | IBAN: {iban}
   BETRAG: {amount} EUR | TYP: {booking_type}
   VERWENDUNGSZWECK: {bank_purpose}
   RECHNUNGSPOSITIONEN: {invoice_line_items_oder_leer}
   BUCHUNGSTEXT: {booking_description}
   KONTIERUNG:
     account     = {account_number} "{account_name}"
     counter_acc = {counter_account_number} "{counter_account_name}"
   §35a: {true|false}
   ```
3. `mistral-embed` Call → 1024-dim Vektor.
4. UPSERT `booking_embeddings` (`ON CONFLICT (booking_id) DO UPDATE`).
5. **NEU**: Vendor-Memory pflegen
   - Wenn `creditor_iban` oder `creditor_name` vorhanden:
     `INSERT INTO vendor_memory ... ON CONFLICT (...) DO UPDATE SET usage_count = usage_count+1, last_used_at = now()`.
   - `purpose_pattern`: erste 80 Zeichen des Verwendungszwecks (überschrieben falls zwei Verwendungszwecke divergieren → dann auf NULL setzen).
6. Retry-Wrapper (2 Versuche, Backoff).

Backfill: gleiche Function im Modus `?mode=backfill&building_id=…&offset=…` (10er-Batches, 1s Delay).

---

## Phase 3 — `suggest-match` Refactor

### 3.1 Vor dem KI-Call
1. **Query-Embedding** der Transaktion mit identischem Multi-Field-Format wie beim Speichern (sonst keine sinnvollen Cosine-Distances).
2. **RAG-Retrieval Stufe 1**: building-scoped (`find_similar_bookings(..., false)`).
3. **NEU — Cold-Start-Erkennung**: Wenn `building_embedding_count < 20` → `find_similar_bookings(..., true)` mit `mode`-Scope und zusätzlich `find_vendor_memory(...)` aufrufen.
4. **Smart Account-Whitelist**.

### 3.2 Whitelist-Logik
```text
whitelist =
   ⋃ Konten der RAG-Top-Treffer (account + counter_account)
 ∪ ⋃ Konten aus vendor_memory-Treffer
 ∪ Konten in building.booking_instructions
 ∪ Standard-Bank/Verrechnungsblock: 1800, 1700, 1710, 4900, 4910
 ∪ Vorauszahlungskonten 1470–1473 falls Versorger-Pattern matcht
```
Falls < 8 Einträge → fallback auf vollen Kontenrahmen (Sicherheitsnetz; trifft v. a. nagelneue Liegenschaften vor erstem Lernzyklus).

### 3.3 Validation Layer (Pflicht-Checks vor Anzeige)
- Beide Konto-IDs existieren in `chart_of_accounts` und gehören zur Liegenschaft (oder sind global).
- `booking_type=expense` → `account_id` ist abgebende Seite, `counter_account_id` belastete Seite. Bei `income` umgekehrt. (Konsistent zu `signedTotalForAccount`.)
- Bei `type=split`: Σ `amounts` == |transaction.amount| ± 0,01 €.
- §35a: `amount_35a ≤ |amount| / 1.19`.
- Verstoß → `confidence_score *= 0.5` und `validation_warnings[]` wird ans Frontend mitgegeben.

---

## Phase 3.4 — Der vollständige neue Mistral-Prompt

### System-Prompt (statisch, deutsch, exakter Wortlaut)

```text
Du bist ein hochspezialisierter WEG- und Mietverwaltungs-Buchhalter
(Deutschland). Du verbuchst Banktransaktionen ausschließlich
BANK-ZENTRISCH und nutzt ausschließlich den dir übergebenen
Kontenrahmen sowie die übergebenen historischen Beispiele.

═══════════════════════════════════════════════════════════
GRUNDREGELN (NICHT VERHANDELBAR)
═══════════════════════════════════════════════════════════

1. BANK-ZENTRISCHE BUCHUNG
   booking_type = "expense"  → Geld verlässt die Bank.
       account_id         = abgebendes Konto (Effekt -amount)
       counter_account_id = belastetes Konto (Effekt +amount)
   booking_type = "income"   → Geld kommt rein.
       account_id         = empfangendes Konto (Effekt +amount)
       counter_account_id = entlastetes Konto (Effekt -amount)
   booking_type ist PFLICHT.

2. KONTENRAHMEN-TREUE
   Verwende ausschließlich Konten aus der WHITELIST.
   Erfinde NIEMALS SKR03/SKR04-Nummern.

3. RECHNUNGSTEXT VOR LIEFERANTENNAME
   Wenn ein Lieferant verschiedene Leistungen erbringt
   (z.B. Hausmeister macht auch Gartenpflege),
   ENTSCHEIDE ANHAND DES VERWENDUNGSZWECKS UND DER
   RECHNUNGSPOSITIONEN, nicht nur anhand des Namens.
   Beispiele:
   - "Schneeräumung Januar"      → 1061 Winterdienst, §35a 80%
   - "Heckenschnitt"              → 1080 Gartenpflege, §35a 80%
   - "Treppenhausreinigung"       → 1070 Hausreinigung, §35a 100%
   Auch wenn alle drei vom selben Lieferanten kommen.

4. LIEGENSCHAFTSHINWEISE HABEN VORRANG
   building.booking_instructions überschreiben generische Konventionen.

5. RAG-BEISPIELE NACH PRIORITÄT
   Stufe 1 (building): Treffer dieser Liegenschaft. Bei Ähnlichkeit
       ≥ 0.85 UND ähnlichem Verwendungszweck → übernimm Konto.
   Stufe 2 (mode):    Treffer aus anderen Liegenschaften gleichen
       Verwaltungstyps. Nur als Hinweis nutzen, niedrigere Confidence.
   Stufe 3 (vendor):  Lieferanten-Memory. Verwende nur, wenn
       Verwendungszweck zur historischen Verwendung passt.

6. ANTI-HALLUZINATION
   Bei Unsicherheit: confidence_score < 0.6 UND
   missing_invoice_hint oder template_suggestion setzen.
   Lieber ehrlich unsicher als falsch sicher.

═══════════════════════════════════════════════════════════
KONTEN-KONVENTIONEN (Fallback bei leerer Historie)
═══════════════════════════════════════════════════════════

Aufwand:
  1000 Straßenreinigung [§35a 100%]
  1010 Müllabfuhr
  1030 Wasser, 1040 Abwasser, 1050 Allgemeinstrom
  1060 Hausmeister [§35a 100%]   1061 Winterdienst [§35a 80%]
  1070 Hausreinigung [§35a 100%] 1080 Gartenpflege  [§35a 80%]
  1090 Schädlingsbekämpfung [§35a 100%]
  1100 Wartung allg. [§35a 50%]  1103 Aufzugwartung [§35a 50%]
  1200 Grundsteuer    1300 Versicherungen
  1400 Heizung/Warmwasser  1410 Brennstoffkauf
  1440 Heizungswartung [§35a 70%]
  1500 Verwaltervergütung   1520 Bankgebühren
  1600 Instandhaltung [§35a 60%]

Vorauszahlungs-Aktivkonten (gleiche Beträge monatlich an Versorger):
  1470 Gas, 1471 Fernwärme, 1472 Strom, 1473 Wasser
  → IMMER hier buchen, NIE direkt auf Aufwand.

Bank/Verrechnung: 1800, 1810, 1700, 1710, 4900, 4910

§35a: amount_35a = brutto × Arbeitsanteil% / 1,19
      is_35a_relevant nur bei Arbeitsleistungen.

WIRTSCHAFTSJAHR ≠ zwingend Kalenderjahr.
Nutze die übergebenen billing_periods.

═══════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════

Antworte AUSSCHLIESSLICH über das Tool `suggest_matches`.
Pflichtfelder pro suggested_booking:
  account_id, counter_account_id, booking_type, amount.
Pflicht auf Top-Level: confidence_score (0..1), rag_references[].

Bei Sammelzahlung: type="split"  (Σ amounts == |transaction.amount|).
Bei Teilzahlung:    type="partial".
Bei wiederkehrendem neuen Lieferanten ohne Rechnung:
                    template_suggestion.
Bei wahrscheinlicher fehlender Rechnung:
                    missing_invoice_hint.
```

### User-Prompt (dynamisch)

```text
TRANSAKTION
  Datum:           {booking_date}
  Betrag:          {amount} EUR  ({"Ausgabe"|"Eingang"})
  Gegenpartei:     {creditor_or_debtor_name}
  IBAN:            {iban}
  Verwendungszweck: {purpose}     ← WICHTIG für Konto-Wahl
  Bank-Konto:      {bank_account_number} {bank_account_name}

═══════ HISTORIE STUFE 1 — diese Liegenschaft ═══════
{für jeden Treffer mit scope='building':}
[BSP #{i} | sim {sim%} | id={id} | Quelle: {source}]
  Kreditor:       {creditor_name}
  Verw.zweck:     "{purpose_text}"
  Betrag:         {amount} EUR | Typ: {booking_type}
  → account       {account_number} "{account_name}"
  → counter_acc   {counter_account_number} "{counter_account_name}"
  Buchungstext:   "{booking_description}"
  §35a:           {JA|NEIN}

═══════ HISTORIE STUFE 2 — andere Liegenschaften ({mgmt_mode}) ═══════
(nur falls Stufe 1 unzureichend; sonst Block weglassen)
{gleiche Struktur, scope='mode'}

═══════ LIEFERANTEN-MEMORY ═══════
(nur falls Treffer)
Lieferant {creditor_name|iban} wurde liegenschaftsübergreifend
({mgmt_mode}-Verwaltung) bisher so gebucht:
  - Konto {account_number} "{name}" — {usage_count}× verwendet
    typischer Verwendungszweck: "{purpose_pattern}"
    §35a: {JA|NEIN}

═══════ KANDIDATEN ═══════
{INVOICEs (gross_amount, vendor, invoice_number, invoice_date)
 und TEMPLATEs (vendor, expected_amount±tolerance, account, valid_from/to)
 wie heute}

═══════ ANDERE OFFENE TRANSAKTIONEN (Kontext, max 30) ═══════
{wie heute}

═══════ ABRECHNUNGSZEITRÄUME ═══════
{billing_periods}

═══════ KONTEN-WHITELIST ═══════
{nur die smart-gefilterten Konten:}
KONTO {account_number} "{account_name}" id={uuid}
  Kategorie={category} | §35a={JA|NEIN}
  Quelle: {RAG-building | RAG-mode | Vendor-Memory | Buchungshinweis | Standard-Bank | Versorger-Pattern}

═══════ LIEGENSCHAFTS-BUCHUNGSHINWEISE ═══════
{building.booking_instructions, falls vorhanden}

AUFGABE
  1. Prüfe zuerst die HISTORIE STUFE 1 mit Fokus auf
     Verwendungszweck-Ähnlichkeit (nicht nur Kreditor).
  2. Falls Stufe 1 unzureichend: STUFE 2 + LIEFERANTEN-MEMORY +
     Buchungshinweise + WEG-Konventionen kombinieren.
  3. Wähle confidence_score:
       ≥ 0.85 nur bei Stufe-1-Match mit passendem Verwendungszweck.
       0.65-0.84 bei Stufe-2/Vendor-Match oder konventioneller Ableitung.
       < 0.65 bei echter Unsicherheit.
  4. Liefere matches[] (max 5), genau ein booking_hint mit
     suggested_bookings, rag_references[] (jedes mit embedding_id +
     similarity + weight) und ggf. fiscal_year_hint /
     template_suggestion / missing_invoice_hint.
```

### Tool-Schema-Erweiterung
```json
"confidence_score": { "type": "number", "minimum": 0, "maximum": 1 },
"confidence_reason": { "type": "string", "description": "Kurzbegründung mit Verweis auf den entscheidenden RAG-Treffer oder Verwendungszweck" },
"rag_references": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "embedding_id": { "type": "string" },
      "similarity":   { "type": "number" },
      "scope":        { "type": "string", "enum": ["building", "mode", "vendor_memory", "convention"] },
      "weight":       { "type": "number" }
    },
    "required": ["embedding_id", "similarity", "scope"]
  }
}
```
`suggested_bookings`-Items: `account_id`, `counter_account_id`, `booking_type` werden Pflicht.

---

## Phase 4 — `extract-invoice` und `match-credit-note`

### `extract-invoice`
1. Vor OCR-Call: Kontenrahmen für `building_id` in den System-Prompt.
2. Nach OCR: Vendor-Memory + (falls vorhanden) building-RAG für ähnliche frühere Rechnungen ziehen, als Few-Shot in den Prompt.
3. **Rechnungspositionen** werden zusätzlich als eigener Block übergeben, damit z. B. „Heckenschnitt 200 € + Schneeräumung 350 €" automatisch zu Split-Vorschlag wird.
4. Output `suggested_account_id` zwingend aus Whitelist.

### `match-credit-note`
- Selbe RAG-Helper + Whitelist-Mechanik. Kein Prompt-Rewrite nötig.

---

## Phase 5 — Frontend

### `TransactionReviewMode.tsx`
1. **ConfidenceBadge** (neu):
   - ≥ 0.85: grün „Sehr sicher (xx%)"
   - 0.65–0.84: gelb „Wahrscheinlich (xx%)"
   - < 0.65: rot „Unsicher (xx%) — bitte prüfen"
   - Tooltip: `confidence_reason` aus dem KI-Output.
2. **RAG-Referenzen** als `<Collapsible>` „Basiert auf N ähnlichen Buchungen":
   - Liste pro Eintrag: Kreditor, Konto, Verwendungszweck-Snippet, Ähnlichkeit %, Scope-Badge (Liegenschaft/Verwaltungstyp/Vendor-Memory).
3. **validation_warnings** als gelber Inline-Hinweis (z. B. „KI-Whitelist verletzt — bitte Konto prüfen").
4. Nach Confirm/Korrektur: `ai_booking_feedback`-Insert. Re-Embedding + Vendor-Memory-Update laufen automatisch via Trigger.

### `AssignmentDialog.tsx`
- ConfidenceBadge im Modal-Header, RAG-Block unter dem AI-Hint.

### `useSuggestMatchContext.ts`
- Payload um `management_mode` erweitern.
- Response-Typ um `confidence_score`, `confidence_reason`, `rag_references`, `validation_warnings` erweitern.

---

## Antwort auf deine zwei Fragen

### „Kann das auch der Rechnungstext entscheiden, wenn ein Lieferant mehrere Tätigkeiten macht?"
**Ja, und genau das ist jetzt strukturell verankert:**
- Verwendungszweck und Rechnungspositionen fließen in das **Embedding** ein → ähnliche Verwendungszwecke clustern auch dann zusammen, wenn es **derselbe Lieferant** ist.
- Die `find_similar_bookings`-Treffer enthalten `purpose_text`, sodass die KI im Prompt direkt vergleichen kann.
- Der System-Prompt enthält die explizite Regel „RECHNUNGSTEXT VOR LIEFERANTENNAME" mit Beispielen Hausmeister vs. Winterdienst vs. Gartenpflege.
- `extract-invoice` generiert bei mehreren Rechnungspositionen automatisch einen `type=split`-Vorschlag mit konto-spezifischen Teilbeträgen.

### „Funktioniert es auch ohne Altdaten bei neuen Liegenschaften?"
**Ja, dafür gibt es drei kombinierte Mechanismen:**
1. **Cold-Start-Detection**: Wenn `building_embedding_count < 20` → Stufe-2-Suche über alle Liegenschaften des gleichen `management_mode` wird automatisch aktiviert.
2. **Vendor-Memory**: Sobald irgendeine Liegenschaft denselben Lieferanten (per IBAN/Name) gebucht hat, steht die Empfehlung auch der neuen Liegenschaft zur Verfügung.
3. **WEG-Konventionen-Fallback**: Der System-Prompt enthält den kompletten WEG-Standardkontenrahmen mit §35a-Regeln. Selbst bei 0 RAG-Treffern und 0 Vendor-Memory kann die KI wie heute schon arbeiten — nur eben mit **niedrigerer Confidence (0.5-0.7)**, was im UI sofort sichtbar ist.

Praktischer Effekt: Eine neue WEG-Liegenschaft startet ab dem ersten Tag mit dem akkumulierten Wissen aller bestehenden WEG-Liegenschaften und wird mit jeder bestätigten Buchung schärfer.

---

## Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| Legacy-HV-Office-Buchungen verzerren RAG | Im Prompt mit „Quelle: imported_legacy" gelabelt → KI gewichtet niedriger |
| Vendor-Memory leakt zwischen Mandanten | Filter `management_mode` + RLS auf Lese-Ebene; Schreiben nur Service-Role |
| Verwendungszweck mit Sonderzeichen vergiftet Embedding | Trim + max 500 Zeichen vor Embedding |
| Mistral-Embed Rate-Limit beim Backfill | 10er-Batches, 1s Delay, 2 Retries |
| KI ignoriert Whitelist | Validation-Layer setzt Confidence ×0.5 + Warnung |
| Vorzeichen-Bug erneut | Validation prüft `booking_type` ↔ Konto-Position |

---

## Kosten

| Posten | Volumen | Kosten |
|---|---|---|
| Initial-Backfill | 397 Embeddings | ≈ 0,06 € |
| Pro neue Buchung | 1 Embedding | ≈ 0,0002 € |
| Pro `suggest-match` | 1 Embedding + 1 Chat | ≈ 0,02–0,05 € |
| Monatlich (~100 Buchungen) | | ~ 3–6 € |

---

## Reihenfolge der Umsetzung (eine Iteration, 8–10 h)

1. Migration: `booking_embeddings`, `vendor_memory`, `ai_booking_feedback`, RPCs, pg_net-Trigger
2. Edge Function `generate-booking-embeddings` (inkl. Vendor-Memory-Pflege)
3. Backfill aller 397 Buchungen
4. `suggest-match` Refactor (Multi-Field-Embedding, gestufte RAG, neuer Prompt, Validation)
5. `extract-invoice` und `match-credit-note` RAG-Aufrüstung mit Rechnungspositionen-Split
6. Frontend: ConfidenceBadge, RAG-Collapsible mit Verwendungszweck-Snippet, Feedback-Insert
7. Smoke-Test mit 3 echten Banktransaktionen (eine bekannt, eine neuer Lieferant, eine mehrdeutiger Verwendungszweck)
8. Memory-Update `mem://features/finance/ai-booking-rag-v1`

---

Wenn du mit diesem finalen Plan einverstanden bist, setze ich ihn in der angegebenen Reihenfolge um.
