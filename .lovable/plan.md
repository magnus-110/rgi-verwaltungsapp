

## E-Rechnung (XRechnung & ZUGFeRD) Support

### Status Quo
Aktuell akzeptiert die App **nur PDF-Dateien** (`accept=".pdf"`) und verarbeitet diese rein per Mistral-OCR. Das funktioniert für:
- ✅ Klassische Papier-/PDF-Rechnungen
- ✅ ZUGFeRD-PDFs **rein optisch** (das sichtbare PDF-Layout wird per OCR gelesen — die strukturierten XML-Daten im Anhang werden ignoriert)
- ❌ XRechnung (reine `.xml`-Datei) — wird gar nicht akzeptiert

### Warum das wichtig ist
Ab **2025** müssen Unternehmen E-Rechnungen empfangen können (B2B), ab **2027/2028** auch versenden. Formate:
- **XRechnung**: reine XML (UBL/CII), kein PDF
- **ZUGFeRD**: hybrides PDF/A-3 mit eingebettetem XML (`factur-x.xml`)

Die strukturierten XML-Daten sind **100 % präzise** (Beträge, IBAN, Steuersätze, Positionen) — viel zuverlässiger als OCR und kostenfrei (keine Mistral-API-Calls nötig).

### Lösungsansatz

**1. Upload-Layer erweitern**
- `InvoiceDropZone` und `EmailAttachments`: zusätzlich `.xml` akzeptieren (`accept=".pdf,.xml"`)
- MIME-Check erweitern (`application/xml`, `text/xml`)

**2. Neue Edge Function `parse-einvoice`**
- Erkennt Format anhand Inhalt:
  - `.xml` → XRechnung (UBL `Invoice` oder CII `CrossIndustryInvoice`)
  - `.pdf` → prüft, ob ZUGFeRD-Anhang `factur-x.xml` / `ZUGFeRD-invoice.xml` vorhanden (via PDF/A-3 Embedded Files)
- Parst XML mit `deno-dom` oder simplem XPath/Regex
- Extrahiert Standardfelder: Vendor, IBAN, Rechnungsnummer, Datum, Netto/MwSt/Brutto, Positionen, Empfängeradresse, Leitweg-ID
- Schreibt direkt strukturiert in `invoices`-Tabelle — **kein Mistral-Call nötig**

**3. Integration in `extract-invoice` Pipeline**
- Workflow am Anfang: 
  1. Wenn Datei `.xml` → direkt `parse-einvoice` und fertig
  2. Wenn `.pdf` → erst auf eingebettetes ZUGFeRD-XML prüfen
     - Gefunden → XML parsen (strukturierte Daten als „Source of Truth")
     - Nicht gefunden → bisheriger Mistral-OCR-Pfad (Fallback)
- Building-Auto-Match-Logik bleibt identisch
- Duplikat-Check bleibt identisch

**4. UI-Hinweise**
- Badge in der Rechnungsliste „E-Rechnung" (grün) wenn aus XML extrahiert → signalisiert hohe Datenqualität
- Drop-Zone-Text aktualisieren: „PDF oder XML (XRechnung/ZUGFeRD)"
- In `Transfers.tsx` und `InvoicesTab.tsx`: kleines Icon (z. B. `FileCode`) bei E-Rechnungen

**5. Datenbank-Erweiterung (Migration)**
Neue Spalten in `invoices`:
- `einvoice_format` (text, nullable): `'xrechnung' | 'zugferd' | null`
- `einvoice_xml_path` (text, nullable): Pfad zur extrahierten/originalen XML-Datei
- `leitweg_id` (text, nullable): nur für B2G-Pflicht relevant, aber gut zu speichern

### Geänderte / Neue Dateien
- **NEU**: `supabase/functions/parse-einvoice/index.ts` — XML-Parser für UBL & CII
- `supabase/functions/extract-invoice/index.ts` — Format-Detection vorgeschaltet, ZUGFeRD-Extraktion
- `supabase/config.toml` — `verify_jwt = false` für neue Function
- `src/components/finance/InvoiceDropZone.tsx` — XML akzeptieren
- `src/components/email/EmailAttachments.tsx` — XML als Rechnung importierbar
- `src/pages/Transfers.tsx` — Badge „E-Rechnung"
- `src/components/finance/InvoicesTab.tsx` — Badge „E-Rechnung"
- **Migration**: 3 neue Spalten in `invoices`

### Was unverändert bleibt
- Building-Auto-Match
- Duplikat-Schutz
- Mistral-OCR (als Fallback für klassische PDFs)
- Make.com-Integration / Buchungs-Workflow
- Brennstoff-/Abschlags-Erkennung (Regeln auf XML-Beschreibungen anwenden)

### Aufwand
Mittelgroß — ein Edge Function (~250 Zeilen), eine Migration, kleinere UI-Anpassungen. Beide Formate (XRechnung + ZUGFeRD) werden in einem Aufwasch erschlagen, da beide CII oder UBL nutzen.

