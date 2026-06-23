Ziel: Telefonnummern in der App so verlinken, dass PhonerLite (und andere Softphones) sie sauber wählen können, ohne die Datenbank oder die Anzeige zu ändern.

Umsetzung:

1. Zentrale Hilfsfunktion anlegen
   - Neue Datei: src/lib/phone.ts
   - Funktion toTelHref(raw?: string | null): string | null
   - Bereinigt beliebig formatierte Telefonnummern für tel:-Links (RFC 3966):
     - Entfernt deutsches "(0)": +49 (0)170 -> +49170
     - Wandelt führendes "00" in "+" um
     - Entfernt alle Nicht-Ziffern
     - Deutsche Inlandsnummern ohne führendes + werden zu +49
     - Ausländische Nummern mit + bleiben erhalten

2. Vier bestehende tel:-Links auf toTelHref umstellen
   - src/components/contacts/ContactList.tsx
     - Zeile ~77: tel:-Erzeugung für Telefon-Icon ersetzen
     - Import toTelHref hinzufügen
   - src/components/buildings/BuildingOverviewTab.tsx
     - Zeile ~256: Eigentümer-Telefon-Link ersetzen
     - Zeile ~304: Dienstleister-Telefon-Link ersetzen
     - Import toTelHref hinzufügen
   - src/components/buildings/BuildingServiceProvidersTab.tsx
     - Zeile ~167: Dienstleister-Telefon-Link ersetzen
     - Import toTelHref hinzufügen

3. Anzeige bleibt unverändert
   - Nur der href-Wert des Links wird bereinigt.
   - Die sichtbare Telefonnummer in der UI behält ihre Originalformatierung.

4. Validierung
   - TypeScript-Build prüfen
   - Kurze Browser-Prüfung: Links zeigen tel:+49... statt rohe Nummer