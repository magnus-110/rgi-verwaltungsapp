

## Plan: Digitale Kassenprüfung (aktualisiert)

### Konzept

Die Kassenprüfung wird als flexibler, nicht-linearer Prüfprozess gestaltet. Prüfer können gründlich oder stichprobenartig prüfen — kein Zwang, jede Position einzeln abzuhaken. Der Fokus liegt auf drei Hauptbereichen plus Export.

### Prüfbereiche (Tabs statt Wizard-Steps)

Statt eines erzwungenen 5-Schritt-Wizards verwenden wir **horizontale Tabs**, damit der Prüfer frei zwischen Bereichen springen kann:

```text
┌─────────────────────────────────────────────────┐
│  Kassenprüfung: Musterstr. 1 · 2024            │
│  Prüfer: Max Mustermann                        │
├─────────────────────────────────────────────────┤
│  [Kontenblätter] [Buchungsjournal] [Dokumente]  │
├─────────────────────────────────────────────────┤
│  ... Inhalt ...                                 │
├─────────────────────────────────────────────────┤
│  [📥 Export] [✍️ Prüfung abschließen]           │
└─────────────────────────────────────────────────┘
```

**Tab 1 – Kontenblätter**
- Pro Konto eine aufklappbare Karte: Buchungstext, Gegenkonto, Datum, Belegnr., Zugang/Abgang, kumuliertes Saldo
- Summenzeile am Ende pro Konto
- Optional: Häkchen "Geprüft" pro Konto (nicht erzwungen)
- Prüfer kann Anmerkungen pro Konto hinterlassen

**Tab 2 – Buchungsjournal**
- Chronologische Liste aller Buchungen, filterbar nach Monat/Konto
- Klick auf eine Buchung öffnet einen **Prüfmodus-Dialog**:
  - Links: Buchungsdetails (Konto, Betrag, Datum, Beschreibung)
  - Rechts: Verknüpfte Rechnung (PDF-Viewer) ODER Vorlage mit verknüpfter Rechnung ODER textuelle Erklärung (bei Templates ohne Rechnung: zeigt Vorlage-Name + erwarteter Betrag + Intervall)
  - Button "Geprüft" / "Auffällig" mit optionaler Notiz

**Tab 3 – Dokumente & Pläne**
- Aufklappbare Sektionen:
  - Kontoauszüge (PDFs)
  - Gesamtabrechnung / Einzelabrechnung des Prüfers
  - Wirtschaftsplan
  - Heizkostenabrechnung (falls vorhanden)
- Inline PDF-Viewer (bestehende PdfViewerModal)

### Export-Funktion

Ein "Export"-Button generiert ein **ZIP** oder zusammengeführtes **PDF-Paket** mit folgender Struktur:
1. Kontenblätter (als Tabellen-PDF)
2. Buchungsjournal (als Tabellen-PDF)
3. Kontoauszüge (originale PDFs)
4. Rechnungen & Vorlagen – **sortiert nach Kontoauszug/Transaktion** (nicht alphabetisch, sondern in der Reihenfolge wie sie auf den Auszügen erscheinen)
5. Gesamtabrechnung, Einzelabrechnung, Wirtschaftsplan

### Unterschrift & Abschluss

- Button "Prüfung abschließen" öffnet Dialog mit:
  - Zusammenfassung: X von Y Konten geprüft, Z Anmerkungen
  - Freitext für Gesamtanmerkung
  - Canvas-Signatur-Pad (digitale Unterschrift)
  - "Bestätigen & Unterschreiben" setzt Status auf `completed`
- Kein Zwang alle Konten/Buchungen abgehakt zu haben

### Datenbank

Neue Tabelle `cash_audits`:
- `id`, `building_id`, `billing_period_id`, `fiscal_year`
- `auditor_contact_id` → contacts
- `status` (draft / in_progress / completed)
- `access_token` (unique, für Token-Link)
- `visible_in_portal_until` (timestamptz)
- `progress` (JSONB: geprüfte Konten, Anmerkungen, Buchungs-Flags)
- `signature_data` (text, base64)
- `signed_at`, `completed_at`
- `notes` (Freitext)
- RLS: Admin = ALL, Owner via `auditor_contact_id → contacts.user_id`
- RPC `get_audit_by_token(p_token text)` (security definer)

### Dateien

| Datei | Zweck |
|-------|-------|
| Migration | `cash_audits` + RLS + RPC |
| `src/pages/CashAudit.tsx` | Hauptseite (Admin + Prüfer) |
| `src/pages/CashAuditProxy.tsx` | Token-Zugang ohne Login |
| `src/components/finance/CashAuditWizard.tsx` | Tab-basierte Prüfungs-UI |
| `src/components/finance/CashAuditAccountSheet.tsx` | Kontenblatt pro Konto |
| `src/components/finance/CashAuditJournal.tsx` | Buchungsjournal + Prüfmodus-Dialog |
| `src/components/finance/CashAuditDocuments.tsx` | Dokumente & Pläne Viewer |
| `src/components/finance/CashAuditSignature.tsx` | Signatur-Canvas + Abschluss |
| `src/components/finance/CreateAuditDialog.tsx` | Admin erstellt Prüfauftrag |
| `src/pages/Finance.tsx` | Neuer Tab "Kassenprüfung" |
| `src/components/WegOwnerLayout.tsx` | Bedingter Menüpunkt |
| `src/App.tsx` | Routen `/kassenpruefung` + `/kassenpruefung/:token` |

### Implementierungsreihenfolge

1. Migration: `cash_audits` Tabelle + RLS + Token-RPC
2. Admin-UI: Tab in Finance + CreateAuditDialog
3. CashAuditWizard (3 Tabs) mit lesenden Queries auf bookings, chart_of_accounts, invoices, bank_statements
4. Buchungsjournal Prüfmodus-Dialog (Buchung ↔ Rechnung/Vorlage)
5. Signatur-Pad + Abschluss
6. Export-Funktion (ZIP mit Kontenblätter-PDF, Journal-PDF, Belege sortiert nach Kontoauszug)
7. Token-basierte Proxy-Seite
8. Owner-Portal Menüpunkt

