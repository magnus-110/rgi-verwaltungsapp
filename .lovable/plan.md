## Ziel

Die Route **„Überweisungen"** wird zu **„Zahlungen"** umbenannt und in zwei Tabs gegliedert — analog zur Rechnungsliste-Logik:

- **Ausgehend** (Default) — alle Eingangsrechnungen, die wir bezahlen müssen (`invoice_type ≠ credit_note`)
- **Eingehend** — alle Belege für Zahlungseingänge (`invoice_type = credit_note`), z. B. Versicherungs-Erstattungen

Dazu die 404-Bugs fixen, damit importierte Belege nicht mehr „verschwinden".

## Änderungen

### 1. Route + Navigation umbenennen
- **Neue Route** `/zahlungen` ergänzen (zeigt `Payments`-Komponente).
- **Alte Route** `/ueberweisungen` per `<Navigate to="/zahlungen" replace />` weiterleiten — keine Broken Links für Bookmarks.
- **Sidebar** (`AdminSidebar.tsx`): Label `Überweisungen` → `Zahlungen`, URL → `/zahlungen`. Icon bleibt `CreditCard`.
- **MobileHeader** (`MobileHeader.tsx`): gleiches Update.
- **Dashboard** Quick-Link auf `/zahlungen` aktualisieren.

### 2. Seite umbauen (`src/pages/Transfers.tsx` → `src/pages/Payments.tsx`)
- Datei umbenennen, Komponente in `Payments` exportieren.
- Oben im Header: H1 = **„Zahlungen"**.
- Direkt darunter ein **Segmented-Tab** (`Tabs`, `variant="segment"`):
  - **„Ausgehend"** (Default, aktiv beim ersten Aufruf)
  - **„Eingehend"**
- Tab-Wahl über URL-Param `?direction=outgoing|incoming` persistierbar (für Deep-Links aus Toasts).

### 3. Query nach Tab differenzieren
- **Ausgehend** (bleibt wie heute): `invoices` mit `.neq("invoice_type", "credit_note")`, sortiert nach Fälligkeit, mit allen bestehenden Aktionen (Prüfmodus, Bezahlt-Markieren, OCR-Retry, Notizen).
- **Eingehend** (neu): `invoices` mit `.eq("invoice_type", "credit_note")`, sortiert nach `created_at` desc.
  - Spalten angepasst: **Datum · Absender · Betrag · Status (offen / zugeordnet) · Bank-Match · Aktionen**.
  - Status-Badge:
    - `credit_open` ohne Match → gelb **„Wartet auf Bank-Eingang"**
    - `credit_open` mit `suggested_transaction_id` → blau **„Vorschlag prüfen"**
    - `credit_matched` → grün **„Zugeordnet"**
  - Aktionen: **„Bank-Eingang manuell zuordnen"** (öffnet Dialog mit positiven Bank-Transaktionen der letzten 90 Tage des passenden Gebäudes) + OCR-Retry + Notiz.

### 4. Mini-Dashboard oben
Über beiden Tabs eine kleine Summenleiste:
- **„Offen ausgehend"** (rot) = Summe unbezahlter Eingangsrechnungen
- **„Offen eingehend"** (grün) = Summe noch nicht zugeordneter Belege

### 5. Toast-Bug aus E-Mail-Import fixen (`EmailAttachments.tsx`)
- Bei `asCreditNote = true`: Action-Label **„Zu Zahlungen (Eingehend)"**, Ziel `/zahlungen?direction=incoming`.
- Bei normaler Eingangsrechnung: Label **„Zu Zahlungen"**, Ziel `/zahlungen?direction=outgoing`.
→ Das fixt die 404-Meldung und führt direkt in den richtigen Tab.

### 6. Belege fallen nicht mehr durchs Raster
Da der „Eingehend"-Tab **alle** `credit_note`-Einträge zeigt — egal ob Auto-Match erfolgreich war oder nicht — verschwindet kein Beleg mehr. Bei fehlgeschlagenem Match ist der Status sofort sichtbar („Wartet auf Bank-Eingang") und manuell zuordenbar.

## Files

- **Edit/Rename** `src/pages/Transfers.tsx` → `src/pages/Payments.tsx` (Komponente + Tabs + Eingehend-Sektion)
- **Edit** `src/App.tsx` — neue Route `/zahlungen`, Redirect von `/ueberweisungen`, Lazy-Import auf `Payments`
- **Edit** `src/components/AdminSidebar.tsx` — Label + URL
- **Edit** `src/components/MobileHeader.tsx` — Label + URL
- **Edit** `src/pages/Dashboard.tsx` — Navigationsziel
- **Edit** `src/components/email/EmailAttachments.tsx` — Toast-Action-URL fixen
- **Edit** `src/components/transfers/TransferReviewMode.tsx` — Header-Text „Überweisungen" → „Zahlungen"

Keine DB-Migration nötig — alle Felder existieren bereits (`invoice_type`, `status = credit_open / credit_matched`, `suggested_transaction_id`).

## Ergebnis

- Sidebar zeigt **„Zahlungen"**.
- Beim Öffnen sieht der Nutzer wie gewohnt alle ausgehenden Rechnungen — nichts an seinem Workflow ändert sich.
- Ein Klick auf Tab **„Eingehend"** zeigt alle importierten Belege für Zahlungseingänge mit klarem Status.
- Nach E-Mail-Import landet man per Toast-Klick direkt im passenden Tab — kein 404 mehr.