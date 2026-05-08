## Was ich gefunden habe

**Die Rechnung selbst ist korrekt nicht zugeordnet:**
- Rechnung Nr. 7 von Magnus Göttinger über 589,05 € brutto (Software-Abos: Mistral, Supabase, Make.com, Lovable, KI-Tools), Datum 17.04.2026
- Rechnungsempfänger laut OCR: **RGI Immobilien GmbH & Co. KG** (also eine reine Firmenrechnung der Verwaltung)
- In der DB: `building_id = NULL`, `is_company_invoice = true`, Datei liegt unter `unassigned/...`
- Die Rechnung ist also gar **keinem** Gebäude zugeordnet — sie ist eine reine Hausverwaltungs-Eigenrechnung

**Der Fehler liegt bei den Buchungen, nicht bei der Rechnung:**
- An diese eine Rechnung sind **18 völlig fremde Buchungen** im Adolf‑Haff‑Weg 3 aus Juli 2025 verknüpft (HG‑Hausgelder, Versicherung Allianz, Hausmeister 314,20 €, Telekom, Kontogebühren …)
- Inhaltlich, betragsmäßig und zeitlich passt nichts davon zu der Software‑Rechnung
- Es ist projektweit der einzige Fall mit so vielen Fehlverknüpfungen — deutet auf einen einmaligen Bulk‑Klick / falsches "Rechnung verknüpfen" hin (z. B. Drag‑and‑Drop oder Massen‑Auswahl)

**Warum konnte das passieren:**
- Der Trigger `trg_check_booking_account_building` schützt nur Konto ↔ Gebäude
- Es gibt **keinen** Schutz dafür, dass `booking.invoice_id` zu einer Rechnung führt, die einem **anderen** (oder gar keinem) Gebäude zugeordnet ist
- Eine Firmenrechnung (`is_company_invoice = true`) darf aktuell überall verknüpft werden

## Vorgeschlagene Korrektur

### 1. Daten bereinigen (Migration)
Die 18 Buchungen behalten ihre Beträge, Konten und Beschreibungen — nur das falsch gesetzte `invoice_id` wird auf `NULL` gesetzt:

```sql
UPDATE bookings
SET invoice_id = NULL
WHERE invoice_id = 'f3541eb6-0848-4675-aa9f-c7cf04ff0ff1';
```

Die Rechnung selbst (`status = paid`) bleibt unverändert, korrekt als RGI‑Firmenrechnung ohne Gebäude.

### 2. Schutz‑Trigger ergänzen (Migration)
Neuer Trigger `trg_check_booking_invoice_building` auf `bookings`:

- **Blockiert**, wenn `invoice.is_company_invoice = true` und an eine Buchung mit `building_id IS NOT NULL` verknüpft werden soll
- **Blockiert**, wenn `invoice.building_id IS NOT NULL` und `invoice.building_id <> booking.building_id`
- Fehlermeldung im Stil der bestehenden Strict‑Separation‑Trigger

So wird dieselbe Fehlverknüpfung in Zukunft auf DB‑Ebene unmöglich — analog zum bestehenden Konto‑Gebäude‑Schutz (siehe Memory *Strict Building Separation v2*).

### 3. UI‑Hinweis (optional, klein)
Im Buchungs‑/Verknüpfungs‑Dialog: Wenn der Nutzer eine Rechnung ohne `building_id` oder mit `is_company_invoice` auswählen will, einen Warnhinweis anzeigen, bevor der Trigger zuschlägt. Damit es eine freundliche Frontend‑Meldung gibt statt eines DB‑Errors.

## Was ich nicht ändere
- Die Rechnung selbst (Inhalt, Status `paid`, Bezahldatum) — die ist sachlich richtig
- Buchungsbeträge, Konten, Datum — bleiben alle erhalten
- Bestehende Konto‑/Gebäude‑Trigger — bleiben unangetastet
