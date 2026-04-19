

## Plan: RGI-Firmenrechnungen — minimal im Überweisungstab

### Konzept
**Kein separater Bereich, kein neuer Tab.** Firmenrechnungen werden direkt im bestehenden Überweisungstab mitverwaltet — nur durch einen einfachen Filter/Marker unterschieden. Maximal pragmatisch.

### Umsetzung

**1. Migration (minimal)**
- `invoices.is_company_invoice` (bool, default false)
- `building_id` bleibt `NULL` bei Firmenrechnungen (bereits nullable)
- Keine neuen Tabellen

**2. Email-Anhang-Import**
- Im `SaveAttachmentToBuildingDialog` (bzw. Rechnungs-Import-Dialog) erscheint im Liegenschafts-Dropdown oben eine zusätzliche Option **„🏢 RGI Immobilien (Firma)"**
- Bei Wahl: `is_company_invoice = true`, `building_id = null`, OCR läuft normal

**3. Überweisungstab erweitern (`Transfers.tsx`)**
- Building-Filter bekommt zusätzliche Option **„🏢 RGI Firma"** ganz oben
- Standardansicht „Alle Gebäude" zeigt Firmenrechnungen mit
- In der Spalte „Liegenschaft": statt Gebäudename → Badge **„🏢 Firma"** (dezent, eigene Farbe)
- Ablage der PDF: einfach im bestehenden `invoices` Storage-Bucket unter Ordner `company/`

**4. Drop-Zone (`InvoiceDropZone.tsx`)**
- Liegenschafts-Dropdown bekommt ebenfalls Option „🏢 RGI Firma" oben
- Beim Upload mit dieser Auswahl: `is_company_invoice = true`

**5. Edge Function `extract-invoice`**
- Akzeptiert `is_company_invoice`-Flag, überspringt Liegenschafts-Auto-Erkennung
- Keine Buchung, keine Kontenzuordnung — nur OCR + Speicherung

**6. Was wegfällt (vs. vorheriger Plan)**
- ❌ Kein separater „Intern"-Bereich
- ❌ Keine Kontakte/Zugangsdaten/Inventar/Todos
- ❌ Keine eigene Dokumenten-Stammakte für RGI (Dokumente können bei Bedarf später ergänzt werden)
- ❌ Kein neuer Sidebar-Eintrag

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| Migration | `invoices.is_company_invoice` bool default false |
| `src/pages/Transfers.tsx` | Filter-Option „RGI Firma", Badge in Liegenschaftsspalte |
| `src/components/finance/InvoiceDropZone.tsx` | „RGI Firma" als Ziel im Dropdown |
| `src/components/email/SaveAttachmentToBuildingDialog.tsx` | „RGI Firma" als Ziel |
| `supabase/functions/extract-invoice/index.ts` | `is_company_invoice` durchreichen, keine Liegenschafts-Erkennung |

### Spätere Erweiterung (nur falls Bedarf entsteht)
Wenn später doch ein Dokumenten-Ablageort für RGI benötigt wird, kann man `building_files.is_company_file` in einem späteren Schritt nachziehen — kostet dann <1h Arbeit.

