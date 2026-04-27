## Ziel

1. **Revisionssichere Protokollierung** der SEPA-Mandat-Erteilung (rechtsverbindlich nach §§ 126a/127 BGB-Niveau für digitale Einwilligung).
2. **Schließen-X** im SEPA-Warn-Dialog (wenn Nutzer fortfahren will ohne Mandat).

---

## 1. Revisionssichere SEPA-Protokollierung

**Ja, das ist umsetzbar** — und für ein digitales SEPA-Mandat ohne Papierunterschrift sogar dringend empfohlen. Wir erfassen alle relevanten Beweismittel in einer dedizierten, unveränderlichen Audit-Tabelle.

### Neue Tabelle: `sepa_mandate_audit_log`

| Feld | Zweck |
|---|---|
| `id` (uuid) | Primary key |
| `user_id` (uuid) | wer hat bestätigt |
| `contact_id` (uuid) | zugeordneter Kontakt |
| `building_id` (uuid) | Liegenschaft |
| `mandate_reference` (text) | z.B. `RGI-E1010-0019-01092025` |
| `creditor_id` (text) | Gläubiger-ID des Gebäudes |
| `creditor_name` (text) | "RGI Immobilien GmbH & Co. KG" |
| `iban` (text) | IBAN-Snapshot zum Zeitpunkt der Bestätigung |
| `account_holder` (text) | Kontoinhaber-Snapshot |
| `mandate_text` (text) | **exakter Wortlaut**, der angezeigt wurde |
| `mandate_text_hash` (text) | SHA-256 des Wortlauts (Manipulationsschutz) |
| `accepted` (bool) | true = bestätigt, false = abgelehnt |
| `accepted_at` (timestamptz) | Server-Zeitstempel |
| `ip_address` (inet) | Client-IP (aus Request-Headern) |
| `user_agent` (text) | Browser/Gerät |
| `session_id` (text) | Auth-Session-ID |
| `event_type` (text) | `mandate_granted` \| `mandate_declined` \| `mandate_warning_shown` \| `mandate_changed_after_warning` |
| `metadata` (jsonb) | Erweiterbar (z.B. Wizard-Step, Versionsnummer) |
| `created_at` (timestamptz) | DB-Insert-Zeit |

### Sicherheit & Unveränderlichkeit
- **RLS**: `INSERT` für authentifizierte Nutzer (nur eigene Einträge); `SELECT` nur für Admins; **kein UPDATE/DELETE** (auch nicht für Admins → revisionssicher, append-only).
- Admin-Policy bewusst NUR `SELECT` — kein Verändern möglich.
- DB-Trigger blockiert UPDATE/DELETE explizit.

### Erfassungspunkte (Edge Function `log-sepa-mandate-event`)
Neue Edge Function loggt jedes relevante Ereignis serverseitig (IP/UA werden aus den Request-Headern serverseitig erfasst, nicht vom Client gesendet → fälschungssicher):

1. **Warn-Dialog angezeigt** (`mandate_warning_shown`) — wenn Nutzer ohne Häkchen weiter klickt.
2. **Mandat erteilt** (`mandate_granted`) — beim Anklicken der Checkbox / "Ja, Mandat jetzt erteilen".
3. **Mandat verweigert** (`mandate_declined`) — bei "Nein, ohne Mandat fortfahren".
4. **Mandat nachträglich geändert** (`mandate_changed_after_warning`).

### Anzeige im Wizard
Nach Bestätigung wird unter der Checkbox zusätzlich angezeigt:
- Mandatsreferenz
- Bestätigungs-Zeitstempel (deutsch formatiert)
- Hinweis: *"Diese Bestätigung wurde revisionssicher protokolliert."*

### Admin-Sicht (optional, klein)
Im `BuildingGeneralInfoCard` o.ä. erhält jeder Eigentümer eine kleine Badge "SEPA-Mandat: erteilt am [Datum]" — Detail-View könnte später die Audit-Einträge zeigen (in diesem Schritt nicht im Scope, nur Datenerfassung).

---

## 2. Schließen-X im SEPA-Warn-Dialog

Der `AlertDialog` in `OnboardingWizardModal.tsx` bekommt rechts oben einen `X`-Button (analog zu `Dialog`-Komponente). Klick auf X = Dialog schließen, **ohne** weiterzugehen, **ohne** Mandat zu ändern → Nutzer bleibt auf Step 1, kann Häkchen setzen oder nochmal entscheiden.

Logging: auch das X-Klick-Ereignis wird als `mandate_warning_dismissed` protokolliert.

---

## Technische Umsetzung

**Migration** (`supabase/migrations/...`):
- Tabelle `sepa_mandate_audit_log` mit obigen Feldern
- RLS aktivieren, Policies (INSERT eigene, SELECT admin)
- Trigger `prevent_sepa_audit_mutation()` blockt UPDATE/DELETE

**Neue Edge Function** `supabase/functions/log-sepa-mandate-event/index.ts`:
- Validiert JWT, erfasst IP aus `x-forwarded-for`, UA aus `user-agent` Header
- Berechnet SHA-256-Hash des Mandatstextes
- Insert in `sepa_mandate_audit_log` mit Service Role

**Frontend-Änderungen**:
- `src/components/onboarding/steps/Step1Stammdaten.tsx`:
  - Konstante `SEPA_MANDATE_TEXT` exportieren (zentrale Quelle der Wahrheit)
  - Bei Checkbox-Klick: `log-sepa-mandate-event` aufrufen mit `mandate_granted` / `mandate_changed_after_warning`
  - Hinweistext "revisionssicher protokolliert" unter Bestätigung anzeigen
- `src/components/onboarding/OnboardingWizardModal.tsx`:
  - Beim Öffnen des Warn-Dialogs → log `mandate_warning_shown`
  - Bei "Ja, Mandat jetzt erteilen" → log `mandate_granted`
  - Bei "Nein, ohne Mandat fortfahren" → log `mandate_declined`
  - **X-Button** oben rechts im `AlertDialogContent` (lucide `X`-Icon, absolut positioniert), Klick → `setPendingSepaWarning(false)` + log `mandate_warning_dismissed`

**Geänderte/neue Dateien**:
- `supabase/migrations/<timestamp>_sepa_mandate_audit_log.sql` (neu)
- `supabase/functions/log-sepa-mandate-event/index.ts` (neu)
- `src/components/onboarding/steps/Step1Stammdaten.tsx` (Logging + Hinweis)
- `src/components/onboarding/OnboardingWizardModal.tsx` (X-Button + Logging)

---

**Bestätigen Sie zur Umsetzung.**