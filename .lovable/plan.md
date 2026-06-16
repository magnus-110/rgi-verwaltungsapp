
# Plan: Service-Hub – Fundament + Tool 1 (Nebenkostenabrechnung)

Ziel: Neuer Navigationspunkt „Service-Hub" im Eigentümer-Portal. Eigentümer kann eine Nebenkostenabrechnung für seinen Mieter kostenpflichtig (Stripe) erzeugen. Die Architektur wird so gebaut, dass Tool 2 (Anlage V) und Tool 3 (Mietvertrag) später ohne Refactoring eingehängt werden können.

## 1. Datenbank-Fundament (eine Migration)

**Neue Tabellen** (alle mit RLS, GRANTs, updated_at-Trigger):

- `service_owner_costs` – direkte Eigentümerkosten je Wohnung & Jahr (Grundsteuer, Versicherung, Kabel …). Wiederverwendbar von Anlage V später.
  - Spalten: `assignment_id`, `fiscal_year`, `cost_type`, `amount`, `note`
  - RLS: Owner sieht nur eigene Wohnungen (via `contact_building_assignments`); Admin alles.

- `service_tenancies` – vom Eigentümer erfasste Mieterdaten je Wohnung.
  - Spalten: `assignment_id`, `name`, `address`, `persons`, `move_in`, `move_out`, `nk_prepayment_monthly`

- `service_orders` – Käufe / Freischaltungen (Append-only).
  - Spalten: `user_id`, `service_type` (enum: nebenkosten|anlage_v|mietvertrag), `assignment_id`, `fiscal_year`, `price_cents`, `currency`, `status` (pending|paid|failed|refunded), `agb_version`, `widerruf_waiver_confirmed`, `stripe_session_id`, `stripe_payment_intent_id`, `stripe_invoice_id`, `stripe_invoice_pdf_url`, `document_storage_path`, `input_snapshot` (jsonb), `paid_at`
  - RLS: nur eigene; kein UPDATE/DELETE für authenticated (nur service_role via Webhook).

- `legal_acceptances` – revisionssicheres Zustimmungsprotokoll (Append-only).
  - Spalten: `user_id`, `document_type` (agb|datenschutz), `document_version`, `accepted_at`, `ip_address`, `user_agent`

- `service_pricing` – konfigurierbare Preise pro `service_type` (so kann Preis ohne Code-Deploy geändert werden). Seed: nebenkosten=3500 cents, anlage_v=2900, mietvertrag=3900.

**Storage:** Neuer privater Bucket `service-documents` für die finalen PDFs/DOCX. Zugriff per Signed URL nur durch den Käufer.

## 2. Stripe-Integration (BYOK)

Eigener Stripe-Account, kein Lovable-Gateway. Erforderliche Secrets (über `add_secret`):
- `STRIPE_SECRET_KEY` (sk_live_… bzw. sk_test_…)
- `STRIPE_WEBHOOK_SECRET` (whsec_…)

**Zwei Edge Functions:**

1. `create-service-checkout` – Eingabe: `service_type`, `assignment_id`, `fiscal_year`, `input_snapshot`, `widerruf_waiver_confirmed`.
   - Validiert: User ist Owner dieser Assignment, finalisierte `billing_periods` existiert, AGB-Zustimmung aktuell, Widerrufsverzicht=true.
   - Legt `service_orders` mit status=`pending` an.
   - Erzeugt Stripe Checkout Session mit `automatic_tax: enabled`, `invoice_creation: enabled` (Stripe erzeugt Rechnung & PDF), `customer_email` aus contact_emails, `metadata.order_id`.
   - Gibt Checkout-URL zurück.

2. `stripe-webhook` (verify_jwt=false, eigene Signatur-Prüfung) – verarbeitet:
   - `checkout.session.completed` → setzt `paid_at`, `status=paid`, speichert `payment_intent_id`, `invoice_id`, `invoice_pdf_url`.
   - Triggert anschließend `generate-service-document` (siehe Punkt 4).
   - `charge.refunded` → `status=refunded`.

## 3. Rechtstexte v2.0 & Zustimmungs-Dialog

- Konstante `CURRENT_LEGAL_VERSION = "2.0"` in `src/lib/legal.ts`.
- AGB & Datenschutz-Texte als statische Markdown/JSX-Komponenten unter `src/pages/legal/AGB.tsx`, `Datenschutz.tsx` (Inhalt aus Spec Anhang A/B).
- Bestehende `compliance-onboarding` Logik erweitern: zwei getrennte Checkboxen, schreibt **zwei** Zeilen in `legal_acceptances`.
- Bei App-Start (im Owner-Portal) prüfen, ob für beide Dokumenttypen Eintrag mit Version 2.0 existiert; sonst blockierender Dialog.

## 4. Dokumentenerzeugung

- Template `Vorlage_Nebenkostenabrechnung.docx` wird im bestehenden `templates`-Storage abgelegt (analog zu Abrechnungs-Vorlagen).
- Edge Function `generate-service-document` (Wiederverwendung des Musters aus `generate-billing-document`): lädt Template, rendert mit docxtemplater (Delimiter `{`/`}`), konvertiert via CloudConvert nach PDF, lädt in `service-documents/{user_id}/{order_id}.pdf`, schreibt Pfad in `service_orders.document_storage_path`.
- Haftungsausschluss-Block ist Teil der Word-Vorlage (letzte Seite).

## 5. Frontend – Service-Hub

**Navigation:** Neuer Eintrag „Service-Hub" in `WegOwnerLayout.tsx`, Route `/weg-owner/service-hub`.

**Seiten:**

- `ServiceHubPage.tsx` – drei Karten (Nebenkosten aktiv, Anlage V / Mietvertrag als „Bald verfügbar"-Cards platzhalten).
- `NebenkostenTool.tsx` – Layout: Form links / Preview-Card rechts (sticky).

**NebenkostenTool – Schritte:**

1. **Auswahl Wohnung & Jahr** – Dropdown der eigenen Assignments + Jahre mit finalisierter `billing_periods`. Falls keine: Hinweistext „Für dieses Jahr ist noch keine WEG-Abrechnung finalisiert. Bitte wenden Sie sich an die Verwaltung." → Tool gesperrt.
2. **Datenladen** (Hook `useNebenkostenData`): Lädt Stammdaten (grün/auto), bestehende `service_tenancies` & `service_owner_costs` (gelb/editierbar). Lädt aus der gewählten Periode die **bereits berechneten umlagefähigen Einzelpositionen** (Helper `getOwnerBillingPositions` – wiederverwendet Logik aus `generate-billing-document` / `BillingSettlement`, filtert auf `chart_of_accounts.umlagefaehig=true` ohne `is_reserve_funded`, ohne Verwaltung).
3. **Eingabeformular:**
   - Mieter-Block: Name, Adresse, Personen, Einzug/Auszug, NK-Vorauszahlung/Monat → speichert in `service_tenancies`.
   - Heizkosten-Block: Vorbelegt aus `heating_distribution_values`, editierbar.
   - Automatische Positionen: Liste mit Checkbox (alle an, einzeln abwählbar).
   - Direkte Eigentümerkosten: Grundsteuer, Kabel/TV, Wartung Sondereigentum, freie Positionen („+"-Button) → speichert in `service_owner_costs`.
4. **Preview-Card (rechts, sticky):**
   - Zeigt alle Positionen, Summe Kosten, Summe Vorauszahlungen.
   - **Ergebnis-Betrag maskiert:** `XX,** €` und „Nachzahlung/Guthaben" verdeckt bis zur Zahlung.
   - Field-Highlighting: grün=auto, gelb=user.
5. **Kauf-Dialog:**
   - Zusammenfassung + Preis.
   - **Separate** aktiv anzuhakende Checkbox: „Ich verlange ausdrücklich, dass mit der Erstellung des Dokuments sofort begonnen wird … Widerrufsrecht erlischt mit vollständiger Ausführung."
   - Button „Zahlungspflichtig bestellen" → ruft `create-service-checkout` → Redirect zur Stripe Checkout URL.
6. **Erfolgsseite** `/weg-owner/service-hub/erfolg?order_id=…`:
   - Polling auf `service_orders.status='paid'` + `document_storage_path != null`.
   - Sobald da: Download-Button (Signed URL) + Link zur Stripe-Rechnung (`stripe_invoice_pdf_url`).
   - „Meine Bestellungen"-Liste mit allen historischen Käufen.

**Typografie:** Century Gothic Überschriften, Work Sans Body (bestehende Tailwind-Klassen).

## 6. Fachlogik-Helper (in `src/lib/services/nebenkosten.ts`)

- `getOwnerBillingPositions(assignment_id, period_id)` – holt die je-Wohnung berechneten umlagefähigen Beträge aus der finalisierten Periode. Nutzt vorhandene Funktion (oder DB-Funktion, je nachdem wie `generate-billing-document` strukturiert ist) – kein Neuberechnen.
- `buildNebenkostenPayload(...)` – baut das Payload-Objekt für die Word-Vorlage (Schema aus Spec §11).
- Doppelzählungs-Schutz: Wenn Heizung in `heating_distribution_values` enthalten ist, Konten 1400/1410/1450 aus den Auto-Positionen ausschließen.

## 7. Was später (außerhalb dieses Plans)

- Anlage V & Mietvertrag-Tools (eigene Iterationen, nutzen dieselben Tabellen `service_orders`, `service_owner_costs`, `service_tenancies`, dieselbe Stripe-Function, dieselbe Dokumentgenerator-Function – nur neue Templates + UI).
- E-Mail-Benachrichtigung an Eigentümer nach erfolgter Erzeugung (kann später in den Webhook eingehängt werden).

## Technische Details

**Datenflüsse:**
```text
Owner-UI → create-service-checkout (Edge Fn) → Stripe Checkout
                                                      ↓
                                            User zahlt bei Stripe
                                                      ↓
                                         stripe-webhook (Edge Fn)
                                            ↓                  ↓
                              update service_orders   trigger generate-service-document
                                                                ↓
                                                    PDF in service-documents/
                                                                ↓
                                          Erfolgsseite zeigt Download + Stripe-Rechnung
```

**Sicherheit:**
- Stripe Webhook verifiziert `stripe-signature` Header mit `STRIPE_WEBHOOK_SECRET`.
- `service_orders` ist Append-only für authenticated (kein UPDATE/DELETE Policy); Mutation nur durch service_role im Webhook.
- `legal_acceptances` ebenfalls Append-only.
- Document-Download nur via Signed URL (5min Gültigkeit), generiert in einer Edge Function die zuvor `service_orders.user_id = auth.uid()` und `status=paid` prüft.

**Aufbewahrung:** `service_orders` & `legal_acceptances` 10 Jahre (§147 AO) – kein Cleanup-Job.

**Was Sie als Nutzer noch tun müssen, nachdem ich gebaut habe:**
1. Stripe-Account einrichten, Stripe Tax in DE aktivieren, Produkte/Preise dort NICHT manuell anlegen (wird per `price_data` in Checkout-Session erzeugt).
2. Webhook-Endpoint in Stripe-Dashboard auf die Edge-Function-URL setzen, Events: `checkout.session.completed`, `charge.refunded`.
3. Secrets liefern: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
4. Word-Vorlage `Vorlage_Nebenkostenabrechnung.docx` hochladen (bzw. mir bereitstellen).
5. Rechtstexte (AGB/Datenschutz v2.0) vor Live-Gang anwaltlich prüfen lassen.
