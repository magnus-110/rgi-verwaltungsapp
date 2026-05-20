## Ziel

In `FinanceDocumentsDialog` (Abrechnung → Dokumente) bekommt jeder der 7 Dokument-Slots zusätzlich zu **DOCX** und **PDF** einen dritten Button **„Im DMS ablegen"**. Beim Klick wird das PDF über die vorhandene PDF-Generierung erzeugt und automatisch ins DMS (`building_files`) gespeichert – bei pro-Eigentümer-Dokumenten als eine eigene Datei pro Eigentümer mit Sichtbarkeits-Restriktion, sodass jeder nur seine eigenen Dokumente sieht.

## UI-Änderungen

`src/components/finance/FinanceDocumentsDialog.tsx`
- In `SlotCard` einen neuen Button „DMS" (Icon `FolderUp`) neben PDF.
- Neuer Aufruf `requestDownload(scope, "dms")` – wir erweitern den bestehenden `format`-Typ um `"dms"`.
- Toast „Wird ins DMS abgelegt…" statt „Download wird vorbereitet…".

## Eventfluss (unverändert, neuer Modus)

`finance:request-download` → detail `{ target, format: "docx" | "pdf" | "dms", template_id }`.

Die bestehenden Handler in `BillingSettlement.tsx` und `ManualEconomicPlanEditor.tsx` werden so erweitert, dass bei `format === "dms"`:

1. PDF-Bytes werden wie bisher per Edge-Function generiert (`generate-billing-document`, `generate-35a-docx`, Sammelbericht-Pfad). Bei ZIP-Scopes (`single`, `economic_plan_single`, `paragraph_35a`, `combined_report`) wird **kein** ZIP gebaut, sondern stattdessen **pro Eigentümer ein einzelnes PDF** angefordert (Edge-Function wird im Loop per Eigentümer mit `mode: "owner"` aufgerufen – das ist der bereits verwendete Pfad für die Einzeldownloads).
2. Die Bytes werden via neuer Helper-Funktion `uploadGeneratedPdfToDms(...)` in den Storage-Bucket `building-files` hochgeladen und ein Eintrag in `building_files` angelegt.

## DMS-Ablage-Regeln

Gemeinsamer Helper (neu, z.B. `src/components/finance/lib/uploadGeneratedPdfToDms.ts`):

| Scope | Datei(en) | building_files Felder |
|-------|-----------|------------------------|
| `overall` | 1 Datei für die Liegenschaft | `building_id`, `linked_billing_period_id`, `assigned_user_id=null`, `linked_contact_id=null`, `visible_to_users=false` (intern) |
| `asset_report` | 1 Datei | wie oben |
| `economic_plan_overall` | 1 Datei | wie oben |
| `single` (Einzelabrechnung) | 1 Datei je Eigentümer | `building_id`, `linked_billing_period_id`, `linked_contact_id = ownerContactId`, `assigned_user_id = contacts.user_id` (falls vorhanden), `visible_to_users=true` |
| `economic_plan_single` | 1 Datei je Eigentümer | wie oben |
| `paragraph_35a` | 1 Datei je Eigentümer | wie oben |
| `combined_report` | 1 Datei je Eigentümer (Sammelbericht) | wie oben |

- `display_name` z.B. `Einzelabrechnung 2024 – Müller`, `Wirtschaftsplan 2025`, etc.
- `file_path`: `${buildingId}/abrechnungen/${periodId}/${uuid}.pdf`.
- `category_id`: Falls Kategorie „Abrechnungen" existiert, wird sie verwendet; ansonsten `null` (keine Migration nötig).
- `mime_type`: `application/pdf`, `source`: `'system'` (oder vorhandenen Enum-Wert; wir lesen den Enum aus den Types und fallen auf `'upload'` zurück).
- `management_mode`: aus dem aktuellen Finance-Kontext (`weg` für Abrechnungen).
- `uploaded_by`: aktueller `auth.user.id`.

## Sichtbarkeitslogik (kein DB-Schema-Change nötig)

- Owner-Auflösung pro Eigentümer: aus `ownerResults` haben wir `contact_id`. Über `contacts.user_id` mappen wir auf den eingeladenen Portal-User. Existiert noch kein User, wird das File trotzdem angelegt (mit `linked_contact_id`), `assigned_user_id` bleibt `null` – Verwalter sieht es weiterhin, der Eigentümer sieht es automatisch, sobald er per `invite-contact-user` mit dem Contact verknüpft wird.
- Die bestehende RLS für `building_files` (siehe DMS-Architektur Memory) filtert Endnutzer-Sichten bereits auf `assigned_user_id = auth.uid()` / `linked_contact_id` ihrer eigenen Contacts, daher reicht das korrekte Setzen dieser zwei Felder.

## Edge-Function-Aufrufe

- Wiederverwendung der bestehenden Funktionen, **keine** neue Edge Function:
  - `generate-billing-document` (overall, owner, asset_report, economic_plan_*)
  - `generate-35a-docx` (per owner)
  - Sammelbericht-Pipeline aus `BillingSettlement.tsx` (Payloads sammeln + `generate-billing-document` mit `combined_report`-Vorlage).
- Für die DMS-Variante zwingend `format: "pdf"` an die Edge Functions schicken.

## Fortschritt & Fehlerhandling

- Toast „X von N abgelegt…" während der Schleife pro Eigentümer.
- Bei Fehler einzelner Eigentümer: weiterlaufen, fehlerhafte Namen am Ende in einem Error-Toast listen.
- Nach Erfolg: `qc.invalidateQueries({ queryKey: ["building-files"] })` triggern (Event `dms:refresh`), damit DMS-Listen aktualisieren.

## Betroffene Dateien

- `src/components/finance/FinanceDocumentsDialog.tsx` – neuer DMS-Button + Toast-Text.
- `src/components/finance/BillingSettlement.tsx` – `format === "dms"` Branch in den 4 Downloads (`overall`, `all` / per-owner, `asset_report`, `combined`).
- `src/components/finance/ManualEconomicPlanEditor.tsx` – `format === "dms"` Branch für `economic_plan_overall` + `economic_plan_single`.
- `src/components/finance/lib/uploadGeneratedPdfToDms.ts` (neu) – wiederverwendbarer Upload-Helper.
- Kein DB-Migration und keine neue Edge Function nötig.

## Offene Annahmen

- Wir gehen davon aus, dass die bestehende Edge-Function `generate-billing-document` einen einzelnen Owner-PDF-Aufruf unterstützt (Pfad `target: "owner"` ist im Code bereits vorhanden). Falls nicht, holen wir das ZIP und entpacken es client-seitig nicht, sondern nutzen die vorhandene Per-Owner-Schleife aus `BillingSettlement` (Zeile 1033).
