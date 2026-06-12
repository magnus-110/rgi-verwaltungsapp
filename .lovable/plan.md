# Mietverwaltung — Buchhaltung (Phase 1 + 2, überarbeitet)

Gilt **nur** für `buildings.management_mode = 'rent'`. WEG bleibt unangetastet, mit einer Ausnahme: KI-Buchungsvorschläge werden auch dort entfernt (siehe unten). Make.com bleibt entfernt.

## Klarstellungen (vom User)
- Du pflegst Defaults für `umlagefaehig` und Abrechnungsrelevanz selbst → keine UPDATE-Heuristik im SQL.
- **Keine KI-Buchungsvorschläge** mehr — weder in Mieter noch in WEG. Claude bucht extern, die Buchungen kommen fertig rein.
- WEG behält Match nach Rechnung und Vorlage (das bleibt unverändert).
- Mietverwaltung: **nur umlagefähige Positionen werden gebucht**, alles andere wird gar nicht erfasst.
- Upload-Feld nimmt PDF, CAMT (XML) und XLSX entgegen, ohne automatische Verarbeitung. Dateien landen als Anhang/Beleg im Gebäude und stehen für Claude bereit.

## Phase 1 — DB-Migration

Eine Migration mit:
- `chart_of_accounts.umlagefaehig boolean not null default false`
- `bookings.umlagefaehig text` mit `CHECK (umlagefaehig IN ('ja','nein','unklar'))`, nullable
- Index `bookings(building_id, fiscal_year, umlagefaehig)` für die spätere Abrechnungs-Aggregation

Kein automatisches UPDATE auf bestehende Konten — Defaults setzt der User selbst über den Kontenrahmen-Editor.

### Kontenrahmen-Editor
In `AccountPlanView.tsx` ein Inline-Toggle "umlagefähig" je Konto — analog zu den bestehenden Toggles `is_billing_relevant`, `is_asset_report_relevant`.

### KI-Buchungsvorschläge entfernen (global)
- `suggest-match` Edge Function und alle Aufrufer (`useSuggestMatchContext`, `useTransactionAiPrefetch`, BookingReviewMode-AI-Pfade) deinstallieren.
- Edge Function via `supabase--delete_edge_functions(['suggest-match'])` löschen, Eintrag in `supabase/config.toml` raus.
- Hooks und Aufrufstellen aus `BookingReviewMode`, `BankStatementsTab`, `CreateBookingDialog`, `EditBookingDialog` entfernen.
- `ConfidenceBadge` bleibt erstmal stehen (zeigt evtl. noch Werte aus alten Buchungen), wird aber nicht mehr neu gesetzt.
- WEG-Pfad behält Rechnungs- und Vorlagen-Match (TemplateMatching + Invoice-Match in `BankStatementsTab`/`BookingReviewMode`).
- Buchungshinweise (`buildings.booking_instructions`) bleiben als Notizfeld pro Liegenschaft — Claude liest sie extern.

## Phase 2 — Buchhaltungsseite im Mieter-Modus

Wenn das ausgewählte Gebäude `management_mode = 'rent'` hat, zeigt die Buchhaltungs-Seite eine schlanke Variante. WEG-Liegenschaften behalten die heutige Tab-Struktur.

```text
┌────────────────────────────────────────────────┐
│ BillingPeriodSelector (Liegenschaft → Jahr)    │
├────────────────────────────────────────────────┤
│ Buchungshinweis (BookingInstructionsSection)   │
│   Freitext für Claude, speichert in            │
│   buildings.booking_instructions               │
├────────────────────────────────────────────────┤
│ Belege-Upload (PDF · CAMT-XML · XLSX)          │
│   Drop-Zone, speichert nur Datei (keine OCR,   │
│   keine Buchungserzeugung)                     │
│   Liste der hochgeladenen Belege je Periode    │
├────────────────────────────────────────────────┤
│ Buchungsliste (BookingsTab, gefiltert)         │
│   + Spalte "umlagefähig" (ja/nein/unklar)      │
│   "Neue Buchung" wie bisher                    │
└────────────────────────────────────────────────┘
```

Konkrete Schritte:
1. `RentAccountingPage` (neu, `src/components/finance/rent/RentAccountingPage.tsx`). In `Finance.tsx` schaltet `management_mode` zwischen der bestehenden Tab-Struktur (`weg`) und dieser Seite (`rent`) — Mieter-Modus blendet "Vorlagen", "Kontoauszüge" und "Kontenabgleich" aus, da hier nicht relevant.
2. Buchungshinweis oben via `BookingInstructionsSection` (Hilfetext aktualisieren: "Notizen für die externe Buchung durch Claude").
3. **Beleg-Upload** als neue, schlanke Komponente `RentBelegDropZone`:
   - Akzeptiert `.pdf, .xml, .xlsx`
   - Speichert in Storage-Bucket `building-files` unter `{building_id}/belege/{fiscal_year}/...`
   - Legt einen Eintrag in `building_files` (bestehende Tabelle) mit Kategorie "beleg" und Verweis auf Periode/Jahr an
   - **Keine** OCR, kein `extract-invoice`, kein `suggest-match`
   - Darunter Liste der hochgeladenen Belege mit Download-Link
4. **Buchungsliste** = `BookingsTab` mit Filter `building_id` + `fiscal_year`. Neue Spalte: Inline-Select `umlagefähig` (ja/nein/unklar), aktualisiert `bookings.umlagefaehig`. Default-Vorbelegung beim manuellen Neuanlegen: aus `chart_of_accounts.umlagefaehig` des Kostenkontos.
5. "Neue Buchung" via bestehendem `CreateBookingDialog` (ohne KI-Vorschläge, nur manueller Workflow).

## Aus dem Plan ausgeklammert (spätere Phasen)
- Phase 3: Mietverhältnis-Pflege-UI (Mieter↔Einheit mit Zeitraum + NK-Vorauszahlung)
- Phase 4: BillingSettlement Mieter-Modus (Gesamt/Einzel/§35a, Schlüssel: Wohnfläche · Einheit · Personen · Verbrauch; Heizkosten 1:1 wie WEG)
- Phase 5: Mieterwechsel zeitanteilig vs. nach Zähler
- Phase 6: USt-Schalter, settlement_note, PDF

## Technische Details

**Migration:**
```sql
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS umlagefaehig boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS umlagefaehig text
    CHECK (umlagefaehig IN ('ja','nein','unklar'));

CREATE INDEX IF NOT EXISTS idx_bookings_building_year_umlage
  ON public.bookings(building_id, fiscal_year, umlagefaehig);
```

**Zu entfernen (KI-Buchungsvorschläge):**
- `supabase/functions/suggest-match/` (Function löschen, config.toml-Eintrag entfernen)
- `src/hooks/useSuggestMatchContext.ts`
- `src/hooks/useTransactionAiPrefetch.ts`
- AI-Pfade in `BookingReviewMode`, `BankStatementsTab`, `CreateBookingDialog`, `EditBookingDialog` (Vorlagen-/Rechnungs-Match bleibt!)

**Tests nach Phase 2:**
- Mieter-Liegenschaft: Upload PDF/CAMT/XLSX → erscheint in Beleg-Liste, keine automatischen Buchungen.
- Manuell angelegte Buchung erbt `umlagefaehig` vom Kostenkonto, ist in Liste umschaltbar.
- WEG-Liegenschaft: Vorlagen- und Rechnungs-Match funktionieren weiterhin, KI-Vorschlag-Buttons sind weg.
