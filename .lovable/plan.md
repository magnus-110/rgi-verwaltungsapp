## Ziel

1. **Hintergrund-Generierung**: Wenn der Nutzer auf „DMS" klickt und die Seite/Tab verlässt, läuft die Generierung weiter und die Dokumente landen trotzdem im DMS.
2. **Richtige Ordner im DMS**: Jedes erzeugte Dokument wird automatisch in den passenden `building_file_categories`-Ordner einer Liegenschaft abgelegt (Finanzen → Gesamtabrechnungen / Einzelabrechnungen / Wirtschaftspläne / §35a / Sammelberichte / Vermögensberichte).
3. **Sichtbarkeit**:
   - **Alle Eigentümer** sehen: Gesamtabrechnung, Wirtschaftsplan (Gesamt), Sammelbericht (overall), Vermögensbericht.
   - **Nur ein einzelner Eigentümer** sieht: Einzelabrechnung, Einzelwirtschaftsplan, §35a-Bescheinigung – und zwar **immer der Eigentümer, dessen Name im Dokument steht** (Match über `contact_id` aus dem `ownerResults`-Loop, nicht über Dateiname).

## Problem mit dem aktuellen Stand

- Generierung und Upload laufen in den Event-Handlern von `BillingSettlement.tsx` und `ManualEconomicPlanEditor.tsx`. Sobald der Nutzer die Abrechnungs-/Wirtschaftsplan-Seite verlässt, werden die Komponenten unmounted und der `for`-Loop bricht ab.
- `uploadGeneratedPdfToDms` setzt aktuell **kein** `category_id` (alle Dokumente landen im Root „Alle Dokumente" – wie im Screenshot sichtbar).
- `visible_to_users` wird heute auf `isOwnerDoc` gesetzt – also **umgekehrt** wie gewünscht: Gesamtdokumente sind aktuell `false` (nur Verwaltung), Eigentümerdokumente sind `true`. Logik muss invertiert + verfeinert werden.

## Lösungs-Architektur

### A) Globaler DMS-Job-Provider (Hintergrund)

Neuer Provider `DmsJobsProvider` (mountet einmal in `AdminLayout` ganz oben, **außerhalb** der Routen-Outlets), damit die Jobs Routenwechsel überleben.

```text
src/contexts/DmsJobsProvider.tsx        // Context + Queue
src/hooks/useDmsJobs.ts                 // enqueue(job), jobs[], cancel(id)
src/components/finance/DmsJobsTray.tsx  // kleines Floating-Widget (rechts unten),
                                        // zeigt laufende/erledigte Jobs + Fehler
```

Job-Typen:

```ts
type DmsJob =
  | { kind: "billing_overall"; periodId; buildingId; payload; templateId; fileName }
  | { kind: "billing_single"; periodId; buildingId; owners: OwnerPayload[]; templateId }
  | { kind: "asset_report"; ... }
  | { kind: "combined_report_overall"; ... }
  | { kind: "combined_report_per_owner"; owners: [...] }
  | { kind: "paragraph_35a_per_owner"; owners: [...] }
  | { kind: "economic_plan_overall"; ... }
  | { kind: "economic_plan_single"; owners: [...] };
```

Der Provider arbeitet die Queue sequenziell ab (max. 2 parallel), ruft die bestehenden Edge Functions (`generate-billing-document`, `generate-35a-docx`) auf und benutzt einen neuen Helper `uploadGeneratedPdfToDms` (s.u.). Beim Verlassen der Tab-Seite läuft alles weiter, weil der Provider im `AdminLayout` lebt. `beforeunload` warnt den Nutzer nur, wenn noch Jobs offen sind.

Toast/Tray:
- Pro Job: Fortschritt „X von N Eigentümern abgelegt".
- Bei Fehler einzelner Eigentümer: weiterlaufen, Fehlerliste am Ende.
- Nach Abschluss: `qc.invalidateQueries({ queryKey: ["building-files"] })`.

### B) BillingSettlement / ManualEconomicPlanEditor

Die heutigen `format === "dms"`-Branches werden **nicht mehr selbst hochladen**, sondern bauen nur den Payload (denselben wie heute) und rufen `enqueueDmsJob({...})` auf. Damit kann die Seite sofort verlassen werden.

`FinanceDocumentsDialog` bleibt unverändert (Event `finance:request-download` mit `format: "dms"`).

### C) Ordner-Auflösung (`building_file_categories`)

Neuer Helper `src/components/finance/lib/resolveDmsFolder.ts`:

```ts
type DmsFolderKey =
  | "gesamtabrechnung" | "einzelabrechnung"
  | "wirtschaftsplan_gesamt" | "wirtschaftsplan_einzel"
  | "paragraph_35a" | "sammelbericht" | "vermoegensbericht";

async function resolveDmsFolder(buildingId, key): Promise<string /*category_id*/>
```

- Sucht die Liegenschaft nach Parent „Finanzen" (case-insensitive) und einem Kind mit passendem Namen.
- Mapping (Kind-Ordnername, wird angelegt falls fehlend):
  - `gesamtabrechnung` → „Gesamtabrechnungen"
  - `einzelabrechnung` → „Einzelabrechnungen"
  - `wirtschaftsplan_gesamt` → „Wirtschaftspläne"
  - `wirtschaftsplan_einzel` → „Wirtschaftspläne / Einzel" (Unter-Ordner)
  - `paragraph_35a` → „§35a Bescheinigungen"
  - `sammelbericht` → „Sammelberichte"
  - `vermoegensbericht` → „Vermögensberichte"
- Fehlende Parents/Kinder werden lazy via `building_file_categories.insert(...)` angelegt (Idempotent über `building_id + name + parent_id`-Lookup).

### D) `uploadGeneratedPdfToDms` – Korrekturen

```ts
export interface DmsUploadParams {
  bytes; displayName; buildingId; periodId?;
  contactId?: string | null;          // gesetzt nur bei eigentümerspezifisch
  folderKey: DmsFolderKey;            // ersetzt freies "category"
  visibility: "alle" | "eigentuemer_only";
  managementMode: "weg" | "rent";
}
```

Änderungen:
1. `category_id` über `resolveDmsFolder(buildingId, folderKey)` setzen.
2. Sichtbarkeits-Logik **invertieren / präzisieren**:
   - `visibility === "alle"` → `visible_to_users = true`, `assigned_user_id = null`, `linked_contact_id = null`, `visibility_role = 'alle'`.
   - `visibility === "eigentuemer_only"` → `visible_to_users = true` (sonst sieht der Eigentümer es ja nicht), aber zusätzlich gefiltert über `linked_contact_id = contactId` + `assigned_user_id = contacts.user_id`, `visibility_role = 'personen'`. RLS filtert dann auf den passenden User/Contact.
3. Dateiname enthält weiterhin den Eigentümernamen (`Einzelabrechnung_2025_Andrea_Busia.pdf`), aber der **Match Eigentümer ↔ Dokument** läuft über die übergebene `contactId` aus dem Owner-Loop (nicht über Namens-Parsing). Das ist robuster und entspricht dem Wunsch „immer für den Eigentümer zu dem der Name passt".

### E) Mapping pro Dokument-Slot

| Slot | folderKey | visibility | contactId |
|---|---|---|---|
| Gesamtabrechnung | gesamtabrechnung | alle | null |
| Einzelabrechnung (je Owner) | einzelabrechnung | eigentuemer_only | owner.contact_id |
| Sammelbericht (Gesamt) | sammelbericht | alle | null |
| Sammelbericht (je Owner) | sammelbericht | eigentuemer_only | owner.contact_id |
| Vermögensbericht | vermoegensbericht | alle | null |
| Wirtschaftsplan Gesamt | wirtschaftsplan_gesamt | alle | null |
| Einzelwirtschaftsplan (je Owner) | wirtschaftsplan_einzel | eigentuemer_only | owner.contact_id |
| §35a Bescheinigung (je Owner) | paragraph_35a | eigentuemer_only | owner.contact_id |

## Betroffene Dateien

- **Neu**: `src/contexts/DmsJobsProvider.tsx`, `src/hooks/useDmsJobs.ts`, `src/components/finance/DmsJobsTray.tsx`, `src/components/finance/lib/resolveDmsFolder.ts`.
- **Geändert**:
  - `src/components/AdminLayout.tsx` – Provider + Tray einhängen.
  - `src/components/finance/lib/uploadGeneratedPdfToDms.ts` – neue Signatur (folderKey, visibility), Sichtbarkeits-Logik gefixt, `category_id` gesetzt.
  - `src/components/finance/BillingSettlement.tsx` – `format === "dms"`-Branches rufen nur noch `enqueueDmsJob`, kein direkter Upload mehr im Komponenten-Loop.
  - `src/components/finance/ManualEconomicPlanEditor.tsx` – analog.
- **Keine DB-Migration nötig** (Ordner werden zur Laufzeit lazy angelegt).
- **Keine neue Edge Function** nötig.

## Offene Punkte / Annahmen

- Wenn ein eigentümerspezifisches Dokument auf einen Contact ohne Portal-User trifft, wird die Datei trotzdem angelegt (`linked_contact_id` gesetzt, `assigned_user_id` bleibt `null`). Sobald der Eigentümer via `invite-contact-user` einen User bekommt, sieht er die Datei automatisch (bestehende RLS).
- Der Tray zeigt nur die Jobs der aktuellen Browser-Session; läuft der Tab komplett zu, brechen offene Jobs ab (echte Server-Queue wäre ein größerer Folge-Schritt und nicht Teil dieses Plans).
- Falls der Nutzer beim Verlassen des Tabs noch offene Jobs hat, kommt ein `beforeunload`-Hinweis („Es werden noch Dokumente erzeugt – wirklich schließen?").
