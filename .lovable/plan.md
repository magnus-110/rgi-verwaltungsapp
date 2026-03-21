

# Plan: Rechnungspositionen und Beschreibung an Webhook senden

## Problem
1. Die `line_items` (Einzelpositionen) der Rechnung werden nicht an Make.com gesendet
2. Der `purpose` im Payload nutzt nur den Banktransaktions-Verwendungszweck, nicht die Rechnungsbeschreibung

## Aenderungen in `send-booking-data/index.ts`

### Invoice-Query erweitern (Zeile 82)
Zusaetzlich `description` und `line_items` aus `invoices` laden:
```
id, invoice_number, invoice_date, vendor_name, net_amount, gross_amount, vat_amount, description, line_items, suggested_account_id, chart_of_accounts:...
```

### Payload erweitern (Zeile 114-142)
Zwei neue Felder hinzufuegen (Webhook-Struktur bleibt gleich, nur neue Felder kommen dazu):
- `line_items`: Array der Rechnungspositionen direkt aus `invoice.line_items`
- `invoice_description`: Die Beschreibung der Rechnung aus `invoice.description`

### Purpose-Feld anreichern
Wenn eine Rechnung zugeordnet ist und eine `description` hat, wird diese als `purpose` verwendet (Fallback auf den Bank-Verwendungszweck):
```
purpose: invoice?.description || txn.purpose
```

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/functions/send-booking-data/index.ts` | Query um `description, line_items` erweitern, Payload um `line_items` und `invoice_description` ergaenzen, `purpose` mit Rechnungsbeschreibung anreichern |

