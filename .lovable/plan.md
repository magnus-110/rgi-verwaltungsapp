

# Plan: Auto-Konto/Vorlage bei Hausgeld + Legacy-System entfernen

## Teil 1: Automatisches Konto & Buchungsvorlage bei Hausgeld-Zuweisung

### Trigger-Punkt
Wenn in `BuildingContactsList.tsx` ein Hausgeld-Eintrag in `contact_building_costs` erstellt oder aktualisiert wird (Funktionen `addCost`, `updateCost`), soll automatisch geprueft werden, ob ein passendes Konto und eine Buchungsvorlage existieren. Falls nicht, werden sie angelegt.

### Neue Hilfsfunktion (in `BuildingContactsList.tsx`)
`ensureAccountAndTemplate(buildingId, assignment, costType, amount)`:
1. Liest `contact.last_name`, `unit_number`, `floor_location` aus dem Assignment
2. **Konto**: Sucht in `chart_of_accounts` nach `account_number = unitNumber` + building_id. Falls nicht vorhanden, erstellt neues Konto:
   - `account_number`: z.B. `"0001"`
   - `account_name`: z.B. `"Hausgeld Goettinger"`
   - `building_id`: die Liegenschaft
   - `category`: `"Einnahmen"`
3. **Vorlage**: Sucht in `booking_templates` nach `name ILIKE '%Hausgeld%' AND name ILIKE '%unitNumber%'` + building_id. Falls nicht vorhanden, erstellt:
   - `name`: z.B. `"mtl. Hausgeld 0001 EG rechts"`
   - `building_id`: die Liegenschaft
   - `expected_amount`: der Hausgeld-Betrag
   - `interval`: `"monatlich"`
   - `account_id`: das gerade erstellte/gefundene Konto

### Ausloesung
- Bei `addCost`: nach dem Insert, wenn `cost_type === "Hausgeld"` und `amount > 0`
- Bei `updateCost`: wenn `field === "amount"` oder `field === "cost_type"`, Konto/Vorlage aktualisieren

## Teil 2: Legacy-Nutzer-System entfernen

### Dateien loeschen
- `src/components/UsersList.tsx`
- `src/components/CreateUserDialog.tsx`
- `src/components/EditUserDialog.tsx`
- `src/components/BulkUpload.tsx`

### Dateien bereinigen

| Datei | Aenderung |
|---|---|
| `src/components/buildings/BuildingDashboard.tsx` | Imports fuer UsersList, CreateUserDialog, BulkUpload entfernen. Legacy-Nutzer-Sektion (Zeilen 255-279) komplett entfernen. States `isCreateUserOpen`, `selectedUserType`, `handleCreateUser`, `totalUsers`, `userCounts`-Query entfernen. CreateUserDialog aus Dialogs entfernen. Personen-Card im Overview-Tab vereinfachen (nur Kontakte-Anzahl zeigen). |
| `src/components/BuildingRow.tsx` | Imports/Referenzen auf UsersList, CreateUserDialog, BulkUpload entfernen. Legacy-User-Sektion entfernen. |
| `src/components/contacts/BuildingContactsList.tsx` | `ensureAccountAndTemplate`-Logik in `addCost` und `updateCost` integrieren |

### Edge Functions bleiben
`admin-create-user` und `admin-delete-user` bleiben bestehen (werden fuer Admin/Employee-Erstellung und ggf. Kontakt-Einladungen weiterhin genutzt).

### Tenant-Seiten bleiben
Die Tenant/WEG-Owner Portal-Seiten (`/tenant/*`, `/weg-owner/*`) bleiben, da sie fuer eingeladene Kontakt-Nutzer weiterhin relevant sind.

