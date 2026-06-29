## Ziel
Drei Probleme der Nebenkostenabrechnung beheben: (1) leere PDFs, (2) fehlende zweite Mieter-Card bei Mieterwechsel, (3) zwei separate Abrechnungen + Dokumente + Preis bei Mieterwechsel.

## Aufgabe 1 — PDF-Befüllung reparieren
`supabase/functions/generate-service-document/index.ts`
- `buildPayload` komplett ersetzen: liefert beide Feldnamen-Varianten (`anteil_eur`/`mieteranteil`, `positionen`/`positions`, etc.) für sichere Platzhalter-Treffer.
- Delimiter von `{{ }}` auf `{ }` umstellen (entspricht eurer Vorlage `Vorlage_Nebenkostenabrechnung_v2.docx`).

## Aufgabe 2 — Zweite Mieter-Card bei Mieterwechsel
`src/pages/weg-owner/NebenkostenTool.tsx`
- States `tenant2Name/Persons/PrepayMonthly/MoveIn/MoveOut/HeatingOverride` ergänzen.
- Zweite `useMemo` für `prorata2` (Zeitraum Mieter 2).
- Neue Card „Mieter 2 – nach dem Wechsel" zwischen Heizkosten-Card und Pro-Rata-Banner, mit eigenem Heizkosten-Feld.
- Nummerierung der nachfolgenden Cards (4./5.) anpassen, erste Card umbenennen in „Mieter 1 – vor dem Wechsel" wenn aktiv.

## Aufgabe 3 — Zwei Produkte / zwei PDFs

### 3a. Migration
`service_orders`: Spalten `quantity int default 1` und `document_paths jsonb`.

### 3b. Frontend `NebenkostenTool.tsx`
- Helper `buildTenantSnapshot(...)` für anteiligen Snapshot pro Mieter.
- `canBuy` um Pflichtfelder Mieter 2 erweitern; `quantity = tenantChanged ? 2 : 1`.
- In `handleBuy`: bei Mieterwechsel `tenants: [snap1, snap2]` in `input_snapshot`, `quantity` an Edge Function übergeben.
- Button-Preis und Dialog-Zusammenfassung × quantity, mit „(2 Abrechnungen)" / „(2×)".

### 3c. Edge Function `create-service-checkout`
- `quantity` aus Body lesen (clamp 1–10).
- `price_cents * qty` und `quantity: qty` im `service_orders`-Insert.
- Stripe-Lineitem `quantity: qty`.

### 3d. Edge Function `generate-service-document` (komplett ersetzt — enthält Aufgabe 1)
- Wenn `input_snapshot.tenants[]` vorhanden: pro Mieter rendern → PDF → Upload als `{user_id}/{order_id}_{i}.pdf`.
- `document_paths` (Array mit index/path/mieter_name/saldo) und `document_storage_path` (erstes) speichern.
- Make.com-Webhook einmal pro Dokument.

### 3e. Edge Function `get-service-document-url`
- Optionalen `index`-Parameter akzeptieren, passenden Pfad aus `document_paths` signieren.

### 3f. `ServiceHubSuccess.tsx`
- Mehrere Download-Buttons aus `document_paths` rendern, je Mieter ein Button mit Name.

## Reihenfolge / Verifikation
1. Migration zuerst (Approval).
2. Edge Functions deployen.
3. Frontend-Änderungen.
4. Build/Typecheck (automatisch).
5. Testkauf einzeln → 1 gefülltes PDF. Testkauf mit Mieterwechsel → 2× 35 € im Checkout, 2 PDFs anteilig.

## Hinweise
- Falls die Word-Vorlage doch `{{...}}` nutzt, Delimiter in `generate-service-document` auf `{{`/`}}` zurückstellen.
- Tour-/HelpButton-Änderungen aus vorheriger Runde bleiben unangetastet.
