

## Plan: Nutzer-Loeschung und Neuanlage reparieren

### Probleme identifiziert

1. **Passwort funktioniert nicht nach Neuanlage**: Wenn ein Nutzer geloescht und mit gleicher E-Mail neu erstellt wird, erkennt `admin-create-user` den noch existierenden Auth-User und ueberspringt das Passwort-Update. Das generierte Passwort wird zwar per Webhook verschickt, aber nie in Supabase Auth gesetzt.

2. **AGB/Erklaervideo wird nicht angezeigt**: Beim Upsert des Profils wird `terms_accepted_at` nicht auf `null` zurueckgesetzt. Der alte Wert bleibt bestehen, daher wird der TermsAcceptanceDialog nicht getriggert.

3. **Nutzer wird nicht komplett geloescht**: Die Loesch-Funktion in `UsersList.tsx` entfernt nur den Eintrag aus `tenants` oder `weg_owner_buildings`, loescht aber nicht den Auth-User, das Profil oder sonstige Daten. Der Nutzer bleibt als "Geist" im System.

### Aenderungen

**1. `supabase/functions/admin-create-user/index.ts`**
- Im "user already exists"-Pfad: Passwort des bestehenden Auth-Users via `supabaseAdmin.auth.admin.updateUserById()` aktualisieren
- Im Profile-Upsert: `terms_accepted_at: null` setzen, damit AGB-Dialog erneut erscheint

**2. `src/components/UsersList.tsx`**
- Beim Loeschen eines Nutzers aus einem Gebaeude pruefen, ob der Nutzer noch in anderen Gebaeuden zugewiesen ist
- Fuer Mieter: Pruefen ob weitere Eintraege in `tenants` existieren
- Fuer WEG-Eigentuemer: Pruefen ob weitere Eintraege in `weg_owner_buildings` existieren
- Falls keine weiteren Zuweisungen: `admin-delete-user` Edge Function aufrufen (komplette Loeschung inkl. Auth-User, Profil, etc.)
- Falls noch andere Zuweisungen bestehen: Nur die Gebaeude-Zuweisung entfernen (wie bisher)
- Dialog-Text anpassen, um den Nutzer zu informieren ob komplett oder nur vom Gebaeude geloescht wird

### Ablauflogik beim Loeschen

```text
Nutzer loeschen geklickt
  |
  v
Hat Nutzer weitere Gebaeude-Zuweisungen?
  |
  +-- JA --> Nur Zuweisung entfernen (tenants/weg_owner_buildings)
  |          Dialog: "Nutzer wird nur von diesem Gebaeude entfernt"
  |
  +-- NEIN -> admin-delete-user aufrufen (komplett loeschen)
              Dialog: "Nutzer wird vollstaendig geloescht"
```

