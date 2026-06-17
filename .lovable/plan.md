# Stripe Price-ID & End-to-End-Test Nebenkostenabrechnung

## Ziel
1. Den Checkout sauber auf das in Stripe angelegte **Produkt/Preis** (Price-ID) umstellen, statt bei jedem Checkout dynamisch `price_data` zu erzeugen. Vorteil: saubere Reports, Steuer-/MwSt-Konfiguration und Produktpflege direkt in Stripe.
2. Den kompletten Flow live durchklicken: Eingabe → Checkout → Webhook → `service_orders.status = paid` → Dokument-Generierung → Download.

---

## Schritt 1 — Stripe Price-ID speichern

`service_pricing` bekommt ein neues Feld `stripe_price_id` (TEXT, nullable).

Migration:
- `ALTER TABLE public.service_pricing ADD COLUMN stripe_price_id text;`
- Eintrag für `service_type = 'nebenkosten'` mit der vom User in Stripe angelegten Price-ID befüllen (User trägt die ID nach Migration ein — entweder per kleinem Admin-UI oder direkt im SQL-Editor; ich frage die ID im Build-Modus ab).

Keine Änderung an Grants nötig (Tabelle existiert bereits).

## Schritt 2 — `create-service-checkout` umstellen

Datei: `supabase/functions/create-service-checkout/index.ts`

- `service_pricing` weiterhin lesen (jetzt inkl. `stripe_price_id`).
- Wenn `stripe_price_id` vorhanden ist → `line_items: [{ price: pricing.stripe_price_id, quantity: 1 }]` verwenden. Kein `price_data`, kein `product_data`, kein `tax_behavior` mehr im Code — alles kommt aus Stripe.
- Fallback: wenn keine `stripe_price_id` gesetzt ist, alter `price_data`-Pfad bleibt als Sicherheitsnetz erhalten.
- `metadata.order_id` / `user_id` / `service_type` bleiben unverändert (Webhook ist davon abhängig).
- `automatic_tax`, `invoice_creation`, `success_url`, `cancel_url` unverändert.

## Schritt 3 — End-to-End-Test (live, Stripe Test-Mode)

Ablauf, den ich nach dem Deploy gemeinsam mit dir durchgehe:

1. **Eingabe** im Service-Hub → Nebenkostenabrechnung ausfüllen, „Jetzt erstellen“.
2. **Checkout** öffnet sich → Stripe-Testkarte `4242 4242 4242 4242` durchspielen.
3. **Redirect** auf `/weg-owner/service-hub/erfolg?order_id=…`.
4. **Webhook** prüfen:
   - `stripe-webhook`-Logs (Dashboard) → `checkout.session.completed` empfangen.
   - `service_orders.status` muss auf `paid` springen, `stripe_invoice_pdf_url` befüllt sein.
5. **Dokument-Generierung**: `generate-service-document` wird vom Webhook angetriggert.
   - Aktuell liefert die Funktion noch einen Platzhalter → wir prüfen nur, dass sie ohne Fehler durchläuft und `status = document_ready` setzt.
6. **Download**: auf der Erfolgsseite „PDF herunterladen“ klicken → `get-service-document-url` liefert signierte URL.

Bei jedem Schritt schaue ich aktiv in:
- `supabase--edge_function_logs` für `create-service-checkout`, `stripe-webhook`, `generate-service-document`.
- `service_orders`-Zeile via `supabase--read_query`.

## Schritt 4 — Fehler beheben (bei Bedarf)
Häufige Stolperer, auf die ich gezielt achte:
- Webhook-Signaturfehler → `STRIPE_WEBHOOK_SECRET` falsch / für falsche Endpoint-Version.
- `automatic_tax` schlägt fehl, wenn das Stripe-Produkt keinen Tax-Code/Adresse hat → ggf. `automatic_tax` deaktivieren oder Tax-Code in Stripe setzen.
- CORS bei `create-service-checkout` (sollte ok sein, prüfen wir im Browser-Network-Tab).

## Nicht enthalten
- docxtemplater-Integration (echte Vorlagen-Renderung) — eigener nächster Schritt.
- Anlage V & Mietvertrag — analog, sobald Nebenkosten sauber durchläuft.

## Technische Notizen
- Keine Änderung an `stripe-webhook` nötig — der arbeitet bereits mit `metadata.order_id`.
- Migration erzeugt nur ein neues Feld; bestehende Zeilen bleiben gültig (Fallback greift).
- Live-Test erfolgt im Stripe **Test-Mode** mit dem aktuell hinterlegten `STRIPE_SECRET_KEY` (sk_test_…). Falls du bereits den Live-Key hinterlegt hast: bitte vor dem Test auf Test-Key umstellen, sonst entstehen echte Buchungen.
