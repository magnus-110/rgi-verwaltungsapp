
## Tiefenanalyse (Ist-Zustand, verifiziert)

1. **Hauptursache gefunden**: In der DB ist `chart_of_accounts.account_number` **global eindeutig** (`UNIQUE`).
   - Der Auto-Flow erstellt Konten mit `account_number = unit_number` (z. B. `0001`).
   - Für ein zweites Gebäude mit gleicher Einheit `0001` schlägt das Insert fehl (Unique-Konflikt).

2. **Warum trotzdem Erfolgs-Toast kommt**:
   - In `BuildingContactsList.tsx` (`ensureAccountAndTemplate`) werden Insert/Select-Fehler beim Konto **nicht geprüft**.
   - Die Funktion zeigt am Ende immer „Konto & Vorlage erstellt“.

3. **Nebeneffekt bestätigt**:
   - Die Vorlage wird trotzdem erstellt/aktualisiert.
   - Dabei bleibt `booking_templates.account_id` oft **null** (aktuell beim Beispielgebäude so vorhanden).

## Umsetzungsplan

### 1) DB-Korrektur für Kontonummern pro Gebäude
**Datei:** neue Migration in `supabase/migrations/*`

- Globales `UNIQUE(account_number)` entfernen.
- Ersetzen durch:
  - **Unique für globale Konten**: `UNIQUE(account_number) WHERE building_id IS NULL`
  - **Unique je Gebäude**: `UNIQUE(building_id, account_number) WHERE building_id IS NOT NULL`
- Ergebnis: `0001` darf in mehreren Gebäuden existieren, aber nicht doppelt im selben Gebäude.

### 2) Auto-Erstellung robust machen (kein falscher Erfolg mehr)
**Datei:** `src/components/contacts/BuildingContactsList.tsx`

- `ensureAccountAndTemplate` in `try/catch` + konsequente Fehlerprüfung für **jede** Supabase-Operation.
- Bei Kontofehler:
  - sofort abbrechen,
  - klaren Fehler-Toast zeigen (inkl. DB-Message sinnvoll gekürzt),
  - **kein** Erfolg-Toast.
- Erfolg-Toast nur, wenn Konto- und Vorlagenlogik wirklich erfolgreich war.
- Nach Erfolg relevante Queries invalidieren/refetchen (`chart-of-accounts-*`, `booking-templates`), damit UI sofort konsistent ist.

### 3) Vorlagen immer mit Konto verknüpfen
**Datei:** `src/components/contacts/BuildingContactsList.tsx`

- Wenn Vorlage bereits existiert, beim Update zusätzlich `account_id` setzen.
- Dadurch werden bestehende „halbfertige“ Vorlagen (mit `account_id = null`) beim nächsten Klick korrekt repariert.

### 4) Folgekonflikt in OCR-Accountlookup verhindern
**Datei:** `supabase/functions/extract-invoice/index.ts`

- Dort wird `account_number` aktuell per `maybeSingle()` gesucht.
- Nach Lockerung der Eindeutigkeit kann das mehrdeutig werden.
- Deshalb Lookup auf **globale Konten** einschränken (`building_id IS NULL`), damit OCR-Mapping stabil bleibt.

### 5) Kleine Konsistenzkorrektur im Finanz-Kontenrahmen
**Datei:** `src/components/finance/ChartOfAccountsTab.tsx`

- Beim manuellen „Konto hinzufügen“ auf der Finanzseite `building_id` aus Auswahl übernehmen (bei „global“ = `null`).
- Verhindert falsche Zuordnung bei manuell angelegten Konten.

---

## Technische Details (kurz)

```text
Aktuell:
  UNIQUE(account_number)  -> blockiert 0001 in Gebäude B, wenn 0001 schon in Gebäude A existiert.

Ziel:
  UNIQUE(account_number) WHERE building_id IS NULL
  UNIQUE(building_id, account_number) WHERE building_id IS NOT NULL
```

```text
Fehlerbild:
  Konto-Insert failt -> Fehler ignoriert -> Template wird erstellt (account_id null) -> Erfolgsmeldung trotzdem sichtbar.
```

## Akzeptanzkriterien nach Umsetzung

1. Für zwei verschiedene Gebäude kann jeweils ein Konto `0001` angelegt werden.
2. Beim Klick auf das orange Buch-Icon wird bei Erfolg **immer** ein Konto sichtbar erstellt.
3. Die zugehörige Buchungsvorlage hat danach ein gesetztes `account_id`.
4. Bei DB-Fehlern erscheint ein Fehler-Toast statt Erfolg.
5. OCR-Extraktion bleibt stabil und bricht nicht durch mehrdeutige `account_number`-Treffer.
