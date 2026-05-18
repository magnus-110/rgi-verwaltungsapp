## Ziel
Die 5 vorhandenen IBANs + SEPA-Mandate aus dem Onboarding (Neuer Weg 8) in die Stammdaten (`contact_bank_accounts`) übernehmen und sicherstellen, dass künftiges Onboarding automatisch in die Stammdaten schreibt — damit Bankdaten im Admin-Bereich sofort sichtbar sind.

## Umfang

### 1. Einmal-Migration der bestehenden Daten (Neuer Weg 8)
Für die 5 Eigentümer (Weyand, Grimm, Gayer-Lesti, Hauber, Junk):
- IBAN, BIC, Kontoinhaber, SEPA-Mandatsdatum aus `onboarding_progress.step_data->step1` lesen
- Einträge in `contact_bank_accounts` anlegen/aktualisieren (verknüpft mit dem jeweiligen Contact)
- SEPA-Mandatsreferenz wird per Trigger automatisch generiert (`RGI-SEPA-XXXXXX`)
- Bei Gayer-Lesti: bestehenden leeren Eintrag aktualisieren statt neu anlegen
- Audit-Eintrag in `sepa_mandate_audit_log` mit Quelle "onboarding_migration"

Wird als reine Daten-Operation per Insert-Tool ausgeführt (keine Schemaänderung).

### 2. Onboarding-Logik anpassen (zukünftige Fälle)
Im Onboarding-Step 1 (Bankdaten) zusätzlich zum bisherigen Speichern in `onboarding_progress`:
- Direkt in `contact_bank_accounts` upserten, sobald der Eigentümer "Speichern" klickt
- Auf den Contact des eingeloggten Users verknüpfen (`contact_id` über `contacts.user_id = auth.uid()`)
- Falls bereits ein Bankkonto existiert: aktualisieren statt duplizieren
- Bei Ablehnung (kein SEPA): nichts schreiben, wie bisher

Betroffene Datei (zu prüfen): `src/components/onboarding/` (Step 1 Bankdaten-Komponente) und ggf. der zugehörige Hook/Service der das `onboarding_progress` aktualisiert.

### 3. Optional: Audit-Hinweis im Admin
Im Eigentümer-Detail/Building-People-Tab eine kleine Quelle-Anzeige ("aus Onboarding übernommen am ...") — nur falls schnell umsetzbar, sonst weglassen.

## Nicht enthalten
- Keine Migration für andere Liegenschaften — bitte separat freigeben, wenn gewünscht (kann ich danach für alle Buildings auf einmal laufen lassen)
- Keine Änderung am Onboarding-UI-Flow selbst (nur Persistenz-Layer)
- Kein Rückschreiben aus `contact_bank_accounts` nach `onboarding_progress` (Onboarding bleibt Quelle der Wahrheit für den Wizard-State, Stammdaten sind die Quelle für die App)

## Technische Details
- `contact_bank_accounts` Felder: `contact_id`, `iban`, `bic`, `account_holder`, `sepa_mandate_ref` (auto), `sepa_mandate_date`, `is_active`, ggf. `notes`
- Trigger `generate_sepa_mandate_ref` setzt die Mandatsreferenz automatisch
- Onboarding-Daten-Pfad: `onboarding_progress.step_data->'step1'` mit Feldern `iban`, `bic`, `account_holder`, `sepa_consent`, `sepa_date`

## Reihenfolge der Umsetzung
1. Schritt 1 ausführen (5 Datensätze für Neuer Weg 8 migrieren) — Ergebnis im Admin verifizieren
2. Schritt 2 (Onboarding-Code anpassen) — danach committen
3. Auf Wunsch: Migration für andere Liegenschaften nachziehen
