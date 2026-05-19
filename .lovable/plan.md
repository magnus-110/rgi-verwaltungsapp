
# Einheitliches Dokumenten-Center für die Finanz-App

## Ziel
Ein einziger Button **„Dokumente"** im Finanzen-Bereich, der für alle 5 Dokumenttypen funktioniert:

1. **Jahresabrechnung** (Gesamt + Einzel) — heute schon via `generate-billing-document`
2. **Wirtschaftsplan** (Gesamt + Einzel) — neu
3. **§35a-Bescheinigung** — heute schon via `generate-35a-docx`
4. **Vermögensbericht** — neu
5. **Heizkostenabrechnung** / weitere PDF-Reports — vorbereitet, erweiterbar

Beide Funktionen (Vorlagen hochladen **und** Dokumente herunterladen) leben hinter diesem einen Button.

---

## UI: Ein Button, zwei Bereiche

Im Header der Finanz-Seite (sichtbar in **allen** Tabs) erscheint:

```
[ 📄 Dokumente ▾ ]
```

Klick öffnet einen großen Dialog mit zwei Tabs:

### Tab 1 — Herunterladen
```
Dokumenttyp:   [ Wirtschaftsplan ▾ ]   (5 Optionen)
Umfang:        ◯ Gesamt   ◯ Einzel (Eigentümer-Auswahl)   ◯ Alle Einzel als ZIP
Vorlage:       [ HV-Office Stil 2026 ▾ ]   ← nur aktive Vorlagen dieses Typs
Format:        ◯ DOCX   ◯ PDF
                                         [ Herunterladen ]
```
- Eigentümer-Auswahl ist eine durchsuchbare Liste, wenn „Einzel" gewählt ist.
- Bei „Alle als ZIP" entstehen N Dateien gebündelt (DOCX oder PDF).

### Tab 2 — Vorlagen verwalten
Akkordeon mit einem Eintrag pro Dokumenttyp:

```
▾ Jahresabrechnung
   • Gesamt   [HV-Office_2025.docx]  (aktiv ●)   [ Hochladen ]
   • Einzel   [Einzelabrechnung.docx] (aktiv ●)  [ Hochladen ]
▸ Wirtschaftsplan
▸ §35a-Bescheinigung
▸ Vermögensbericht
▸ Heizkostenabrechnung
```
- Pro (Typ + Umfang) ist genau **eine** Vorlage aktiv (Trigger erzwingt das).
- Direkter Link „Platzhalter-Referenz anzeigen" pro Typ → öffnet Doku-Modal mit allen verfügbaren `{platzhaltern}` für genau diese Vorlage (für Word/Claude.ai).

---

## Datenmodell — eine Tabelle für alle Vorlagen

Neue Tabelle `document_templates` (ersetzt schrittweise `billing_templates`; alte Daten werden migriert, alte Tabelle bleibt vorerst lesbar):

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | uuid | PK |
| `doc_type` | text | `billing` \| `economic_plan` \| `paragraph_35a` \| `asset_report` \| `heating` |
| `scope` | text | `gesamt` \| `einzel` (für 35a/Vermögensbericht meist nur `gesamt`) |
| `name` | text | Anzeigename |
| `storage_path` | text | Pfad im neuen Bucket `document-templates` |
| `is_active` | bool | genau eine aktive Vorlage pro (doc_type, scope) |
| `management_mode` | text | `weg` \| `rent` \| `both` (optional) |
| `created_at`, `created_by` | | |

- Neuer Storage-Bucket `document-templates` (privat, RLS analog billing-templates).
- Migration kopiert vorhandene `billing_templates`-Einträge in `document_templates` mit `doc_type='billing'`.

## Backend — eine Edge Function für alle Typen

Neue Function `generate-document` (löst `generate-billing-document` + `generate-35a-docx` perspektivisch ab; alte Functions bleiben, neue ruft sie initial intern auf, dann konsolidieren).

**Input:**
```
{
  doc_type: 'billing' | 'economic_plan' | 'paragraph_35a' | 'asset_report' | 'heating',
  scope: 'gesamt' | 'einzel',
  format: 'docx' | 'pdf',
  template_id: uuid,
  selection: { building_id, fiscal_year, owner_ids?: uuid[] },
  payload: {...}   // vom Frontend gebauter, fertig berechneter JSON-Datenblock
}
```

**Verarbeitung:**
- Template aus Storage laden → Docxtemplater-Render (Delimiter `{…}`, paragraphLoop, linebreaks).
- Wenn `owner_ids.length > 1`: pro Eigentümer rendern, mit `jszip` zu ZIP bündeln.
- Wenn `format === 'pdf'`: CloudConvert-Konvertierung (gemeinsamer Helper in `supabase/functions/_shared/cloudconvert.ts`).
- Antwort: Binary mit korrekten Headers + Dateinamen.

**Strikte Linie:** Function rechnet nichts selbst — Quelle der Wahrheit bleibt das Frontend (gleiche Regel wie `generate-billing-document` heute).

## Payload-Builder pro Dokumenttyp (Frontend)

Ein Builder pro `doc_type` in `src/components/finance/lib/payloads/`:
- `buildBillingPayload.ts` (existiert)
- `build35aPayload.ts` (existiert in Form, in das neue Schema bringen)
- `buildEconomicPlanPayload.ts` (neu)
- `buildAssetReportPayload.ts` (neu)
- `buildHeatingPayload.ts` (Stub, später)

Jeder Builder liefert flaches JSON + Schleifenarrays (`{#owners}…{/owners}`, `{#accounts}…{/accounts}`).

---

## Wo der Button erscheint
- Im Header der Finanz-Seite (`/finanzen`) **global**, sichtbar in allen 5 Tabs.
- Wenn man bereits in einem Tab steht (z. B. Wirtschaftsplan), öffnet sich der Dialog mit diesem Dokumenttyp **vorausgewählt** (Komfort, kein Pflichtweg).
- Die bestehenden Buttons in `BillingSettlement` und `Paragraph35aSection` werden zugunsten dieses einen Buttons entfernt (Vereinheitlichung).

---

## Migrationsschritte (Umsetzungsreihenfolge)

1. **DB**: Tabelle `document_templates` + Bucket + RLS + Trigger „genau eine aktive pro (doc_type, scope)" + Daten-Migration aus `billing_templates`.
2. **Edge Function** `generate-document` mit gemeinsamem CloudConvert-Helper + JSZip für ZIP-Renderings.
3. **Frontend**: globaler `<DocumentsButton />` im Finanz-Header + `<DocumentsDialog />` (Tabs „Herunterladen" / „Vorlagen verwalten").
4. **Payload-Builder** für die fehlenden Typen (Wirtschaftsplan, Vermögensbericht).
5. **Platzhalter-Referenz-Modal** pro `doc_type` (lebt als Markdown unter `src/components/finance/lib/placeholderReference/<doc_type>.md`).
6. **Cleanup**: alte Einzelbuttons + `BillingTemplatesDialog` entfernen, `generate-billing-document` und `generate-35a-docx` als Wrapper auf `generate-document` umstellen oder löschen.

## Was sich für den User ändert
- Ein einziger, immer sichtbarer Button **„Dokumente"** ersetzt alle bisherigen Download-/Vorlagen-Buttons.
- Ein Ort für **alle** Vorlagen — kein Suchen mehr pro Tab.
- Konsistentes Format-/Umfang-Auswahlerlebnis für jeden Dokumenttyp.
- Erstdownload eines noch nicht eingerichteten Typs zeigt direkt einen „Vorlage hochladen"-Hinweis im selben Dialog.
