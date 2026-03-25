
Ziel: Das Kürzel in der E-Mail-Liste soll zuverlässig erscheinen, wenn ein Konto einem Mitarbeiter zugeordnet ist, und bei fehlender Zuordnung wirklich leer bleiben.

## Ursache (aus Code + Daten geprüft)
- In `emails.assigned_to` sind die betroffenen E-Mails aktuell `NULL`.
- Das Kürzel-Badge in `Inbox.tsx` liest nur `email.assigned_to` (nicht die Konto-Zuordnung aus `email_account_users`).
- Deshalb wird trotz Konto-Zuordnung (z. B. Magnus/MG) kein Kürzel angezeigt.
- Zusätzlich zeigt der aktuelle Fallback bei leerer Zuordnung einen Punkt (`·`) statt leer.

## Umsetzungsplan

### 1) Bestehende E-Mails korrekt vorbelegen (Backfill)
- Neue Migration:
  - Setzt `emails.assigned_to` für bestehende E-Mails, wenn das zugehörige Konto genau **einem** Mitarbeiter zugeordnet ist.
  - Nur für E-Mails mit `assigned_to IS NULL`.
- Ergebnis: Bereits importierte E-Mails zeigen sofort ein Kürzel.

### 2) Neue E-Mails beim Import automatisch zuordnen
- `supabase/functions/fetch-emails/index.ts` erweitern:
  - Vor dem Import `email_account_users` laden.
  - Pro Konto eine Default-Zuordnung nur dann bestimmen, wenn genau ein Mitarbeiter hinterlegt ist.
  - Beim `emails`-Insert `assigned_to` mit dieser User-ID setzen.
- Ergebnis: Neu synchronisierte E-Mails haben direkt die Mitarbeiter-Zuordnung.

### 3) UI-Logik im Postfach stabilisieren
- `src/pages/Inbox.tsx`:
  - Kürzel weiterhin aus der tatsächlich zugeordneten Person (`assigned_to`) berechnen.
  - Fallback-Darstellung bei keiner Zuordnung auf **leer** setzen (kein Punkt, kein Platzhalterzeichen).
  - Klick-Änderung bleibt wie gewünscht: auf Kürzel klicken → Zuordnung ändern.

### 4) Konto-Zuordnung sofort wirksam machen
- `src/components/email/EmailSettingsSection.tsx`:
  - Beim Hinzufügen eines Mitarbeiters zu einem Konto optional direkt unzugeordnete E-Mails dieses Kontos auf diese Person setzen, **wenn** das Konto danach genau eine Zuordnung hat.
- Ergebnis: Kein „erst nach nächster Sync sichtbar“-Effekt.

## Betroffene Dateien
- `supabase/migrations/<neu>.sql`
- `supabase/functions/fetch-emails/index.ts`
- `src/pages/Inbox.tsx`
- `src/components/email/EmailSettingsSection.tsx`

## Technische Details (kompakt)
- Backfill-SQL mit CTE auf `email_account_users`, `GROUP BY account_id HAVING count(*) = 1`.
- Insert in `fetch-emails` bekommt Feld `assigned_to`.
- Badge-Text in `Inbox.tsx`:
  - zugeordnet: Initialen der Person (z. B. MG)
  - nicht zugeordnet: leerer Text
- Query-Invalidierung wie bisher über React Query (`["emails"]`, ggf. `["email-account-users"]`).

## Abnahme / Testfälle
1. Konto „magnus.goettiger@…“ ist Magnus zugeordnet → bestehende E-Mails zeigen „MG“.
2. Neue eingehende E-Mail auf dem Konto → direkt „MG“ sichtbar.
3. Klick auf Kürzel → auf andere Person ändern funktioniert.
4. „Keine Zuordnung“ wählen → Anzeige bleibt leer (kein Punkt/Placeholder).
