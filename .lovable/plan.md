

# Fix: WEG-Gebäudezuordnung bei Einladung + Gebäudedaten editierbar machen

## Problem 1: WEG-Nutzer wird keinem Gebäude zugeordnet
Die Edge Function `invite-contact-user` erstellt für den Miet-Modus korrekt einen Eintrag in `tenants`, aber für den WEG-Modus fehlt der Eintrag in `weg_owner_buildings`. Ohne diesen Eintrag sieht der WEG-Eigentümer in seiner App kein Gebäude.

## Problem 2: Gebäudespezifische Daten editierbar machen
Die Kontaktdaten (Telefon, E-Mail, Adresse) im "Übersicht"-Tab sind aktuell read-only. Diese sollen weiterhin read-only bleiben (Stammdaten werden nur über die Adressseite geändert). Die gebäudespezifischen Daten (Einheit, Etage, Nutzungsart, etc.) sind bereits editierbar. Alle Tabs (Anteile, Kosten, Bank) sind ebenfalls editierbar.

## Lösung

### 1. Edge Function `invite-contact-user` (Kritischer Bug-Fix)
- Nach Zeile 177 (`// For rent mode: upsert tenant record`) einen Block für WEG-Modus hinzufügen:
```typescript
if (management_mode === 'weg') {
  await supabaseAdmin.from('weg_owner_buildings').upsert({
    user_id: authUserId,
    building_id,
  }, { onConflict: 'user_id,building_id' })
}
```

### 2. Kontaktdaten im Gebäude-Tab editierbar machen (ohne Adresse zu ändern)
In `BuildingContactsList.tsx` im "Übersicht"-Tab die Kontaktdaten (Telefon, E-Mail) von read-only auf editierbar umstellen. Dabei werden die Daten direkt in den `contact_phones` / `contact_emails` Tabellen geändert -- das betrifft die globalen Kontaktdaten, nicht die Gebäude-spezifische Zuordnung. Die Adresse bleibt read-only und wird nur über die Kontaktseite bearbeitet.

Konkret:
- Telefonnummern: Inline-Bearbeitung + Hinzufügen/Löschen direkt im Tab
- E-Mail-Adressen: Inline-Bearbeitung + Hinzufügen/Löschen direkt im Tab
- Adresse: Bleibt read-only (Hinweis "Adresse wird über Kontaktseite verwaltet")

## Technische Details

**Datei: `supabase/functions/invite-contact-user/index.ts`**
- WEG-Modus: `weg_owner_buildings` Eintrag upserten (analog zum `tenants` upsert)

**Datei: `src/components/contacts/BuildingContactsList.tsx`**
- Neue Funktionen: `addPhone`, `updatePhone`, `deletePhone`, `addEmail`, `updateEmail`, `deleteEmail`
- Im Übersicht-Tab: Telefon/E-Mail-Felder mit Input-Feldern + Add/Delete-Buttons
- Adresse bleibt als nicht-editierbarer Info-Block

