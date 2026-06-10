## Ziel
Löschen eines Gebäudes nur nach doppelter Bestätigung mit Passwort-Eingabe ermöglichen, um Fehlbedienungen zu verhindern.

## Änderungen in `src/components/DeleteBuildingDialog.tsx`

Zwei-Stufen-Workflow im bestehenden Dialog:

**Stufe 1 — Eingabe Gebäudename als Tipp-Bestätigung**
- Nutzer muss exakten Gebäudenamen abtippen.
- Button „Weiter" nur aktiv, wenn Name übereinstimmt.

**Stufe 2 — Passwort-Bestätigung (Re-Authentication)**
- Passwortfeld (type=password) für das aktuell eingeloggte Konto.
- Verifikation über `supabase.auth.signInWithPassword({ email: currentUser.email, password })` — kein neuer Login, nur Validierung. Bei Erfolg läuft die bestehende Löschsequenz; bei Fehler Toast „Passwort falsch", Button bleibt aktiv für erneuten Versuch.
- E-Mail des Users via `supabase.auth.getUser()` ziehen.

**UI**
- Roter Warnhinweis bleibt sichtbar.
- Schritt-Indikator („Schritt 1 von 2" / „Schritt 2 von 2").
- „Zurück"-Button in Stufe 2.
- State zurücksetzen beim Schließen.

## Nicht geändert
- Bestehende Löschsequenz (forum_posts → buildings) bleibt unverändert.
- Keine DB-Migration, keine neuen Felder.
- Trigger-Punkt in `BuildingRow.tsx` bleibt gleich.
