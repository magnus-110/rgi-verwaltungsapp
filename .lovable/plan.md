
# Abrechnung: Vorlagen-basierte DOCX/PDF-Generierung

Analog zum §35a-System. Bestehende `generate-billing-docx`-Function und alle UI-Aufrufe werden gelöscht und neu gebaut. **Kernprinzip: Die UI ist die einzige Datenquelle.** Die Edge Function rechnet nichts mehr selbst — sie rendert nur noch eine vom Frontend übergebene Payload in die Word-Vorlage und konvertiert nach PDF.

## Architektur

```
BillingSettlement.tsx (UI rechnet)
    │
    ├─ baut buildPayload(ownerResult | gesamt)  ← exakt die Werte, die in der UI stehen
    │
    └─ supabase.functions.invoke("generate-billing-document", {
          template_id, building_id, period_id, fiscal_year,
          mode: "single" | "all", format: "docx" | "pdf",
          payload: {...}              ← fertig berechnete Daten
       })
                │
                ▼
      Edge Function:
        1. Vorlage aus storage laden
        2. docxtemplater render(payload)
        3. optional: CloudConvert → PDF
        4. mode=all → ZIP
```

Das ist der einzige Weg, der "UI-Daten == Dokument-Daten" garantiert. Doppelte Rechenwege sind die Ursache der heutigen Diskrepanzen.

## Schritte

### 1. Aufräumen
- `supabase/functions/generate-billing-docx/` komplett löschen
- In `BillingSettlement.tsx`: `downloadDocx`, `generatingDocx`-State und alle DOCX-Buttons entfernen

### 2. Vorlagen-Verwaltung (neu)
- Neue Tabelle `billing_templates` (Spalten: id, name, storage_path, management_mode, created_at)
- Neuer Storage-Bucket `billing-templates` (privat, nur Admins via RLS)
- Neue Komponente `BillingTemplatesDialog.tsx` (1:1 nach Vorbild `Paragraph35aTemplatesDialog.tsx`): Upload, Liste, Löschen

### 3. Payload-Builder (neu, im Frontend)
- Neue Datei `src/components/finance/lib/buildBillingPayload.ts`
- Nutzt **dieselben** `ownerResults`, `getAccountBookingTotal`, Sektions-Summen, Heizkosten-Verteilung etc., die die UI bereits berechnet
- Liefert ein flaches JSON für docxtemplater (siehe Variablen unten)
- Wird sowohl für Einzelabrechnung (mit `ownerId`) als auch Gesamtabrechnung verwendet

### 4. Edge Function `generate-billing-document` (neu)
- Übernimmt CloudConvert-Konvertierung 1:1 von `generate-35a-docx`
- Lädt Vorlage aus `billing-templates`-Bucket
- Rendert Payload mit `docxtemplater`
- `mode=all`: Schleife über alle Eigentümer-Payloads + Gesamt-Payload, ZIP zurück
- `format=pdf`: nach Render via CloudConvert
- Secret `CLOUDCONVERT_API_KEY` ist bereits gesetzt

### 5. UI-Buttons in `BillingSettlement.tsx`
- Header: Vorlagen-Verwaltung + Dropdown (DOCX/PDF, ZIP über alle)
- Pro Eigentümer-Zeile: Download-Icon-Dropdown (DOCX/PDF) — analog §35a

## Variablen für die Vorlage (das gibst du Claude weiter)

Claude bekommt den Variablen-Katalog + ein Beispiel-Payload-JSON. Wichtig: docxtemplater nutzt `{var}` für Felder und `{#liste}…{/liste}` für Schleifen.

### Kopf / Stammdaten
- `{building_name}`, `{building_address}`
- `{fiscal_year}`, `{period_label}`, `{period_from}`, `{period_to}`
- `{document_title}` ("Gesamtabrechnung" oder "Einzelabrechnung")
- `{owner_name}`, `{owner_address}`, `{unit_number}`, `{unit_label}` (nur Einzel)
- `{owner_mea}`, `{owner_qm}`, `{owner_personen}`, `{owner_einheiten}` (Anteile)

### Sektions-Summen (Spiegel der UI-Sektionen)
- `{sum_einnahmen}`, `{sum_bewirtschaftung_umlagefaehig}`, `{sum_bewirtschaftung_nicht_umlagefaehig}`, `{sum_heizkosten}`, `{sum_ruecklage}`, `{sum_ruecklage_entnahme}`, `{sum_abrechnung}`

### Konten-Listen (Schleifen)
Pro Sektion eine Liste, jede Position:
- `{account_number}`, `{account_name}`, `{distribution_key_label}`, `{total_amount}`, `{owner_share_amount}` (nur Einzel), `{owner_share_factor}` (nur Einzel)

Schleifen: `{#einnahmen}…{/einnahmen}`, `{#bewirtschaftung}…{/bewirtschaftung}`, `{#nicht_umlagefaehig}…{/nicht_umlagefaehig}`, `{#heizkosten}…{/heizkosten}`, `{#ruecklage}…{/ruecklage}`, `{#abgrenzungen}…{/abgrenzungen}`

### Vorschuss / Saldo (nur Einzelabrechnung)
- `{ist_vorschuss}` (gezahlte Hausgelder), `{soll_vorschuss}` (Plan), `{abrechnungsspitze}`, `{nachzahlung_oder_guthaben}`, `{saldo_label}` ("Nachzahlung" / "Guthaben")

### Vermögensbericht (optional, falls in der Vorlage gewünscht)
- `{bank_anfangsbestand}`, `{bank_endbestand}`, `{ruecklage_anfangsbestand}`, `{ruecklage_endbestand}`, `{brennstoffbestand_eur}`

### Eigentümer-Tabelle (nur Gesamtabrechnung)
Schleife `{#eigentuemer}…{/eigentuemer}` mit: `{name}`, `{unit_number}`, `{ist_vorschuss}`, `{soll_vorschuss}`, `{owner_total_cost}`, `{saldo}`

## Was du Claude weitergeben sollst

> "Bau mir eine Word-Vorlage (.docx) für eine WEG-Jahresabrechnung. Verwende docxtemplater-Syntax (`{variable}` und `{#liste}…{/liste}`). Variablen-Katalog siehe unten. Zwei Vorlagen werden später benötigt — eine Einzelabrechnung und eine Gesamtabrechnung — du kannst aber zunächst eine kombinierte machen, die beide Felder enthält. Layout: A4, deutscher Behördenstil, Century Gothic für Überschriften, Work Sans für Fließtext (analog §35a)."
> 
> Plus den vollständigen Variablen-Katalog (oben) als Klartext.

## Was nicht geändert wird
- Berechnungslogik in `BillingSettlement.tsx` bleibt unverändert — sie ist die Quelle
- Verteilerschlüssel-Logik, Heizkosten-Repost, Brunata-Verteilung: keine Änderung
- §35a-Generator bleibt unverändert
