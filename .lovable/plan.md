## Ziel
Statt fix zwei Mieter (Mieter 1 + Mieter 2) sollen beliebig viele Mieter pro Jahr unterstützt werden — z. B. bei zwei oder drei Mieterwechseln. Pro Mieter wird wie bisher eine eigene anteilige Abrechnung + eigenes PDF erzeugt, und der Preis skaliert mit der Anzahl.

## Aufgabe 1 — UI: dynamische Mieterliste (`src/pages/weg-owner/NebenkostenTool.tsx`)

- Bisherige Einzel-States für „Mieter 2" (`tenant2Name`, `tenant2Persons`, …) entfernen.
- Neuer State: `additionalTenants: TenantInput[]`, wobei `TenantInput = { id, name, persons, prepayMonthly, moveIn, moveOut, heatingOverride }`.
- Checkbox „Mieterwechsel im Abrechnungszeitraum" steuert nur noch, ob die Liste angezeigt wird. Beim Aktivieren wird automatisch ein erster zusätzlicher Mieter angelegt (damit sofort sichtbar ist, wo Daten eingetragen werden).
- Unter der Heizkosten-Card erscheint pro Eintrag eine kompakte SectionCard „Weiterer Mieter #n" mit:
  - Name, Personen, Vorauszahlung/Monat, Einzug, Auszug, optionales Heizkosten-Override-Feld
  - Button „Entfernen" pro Eintrag
- Unter der Liste: Button „Weiteren Mieter hinzufügen" (fügt leeren Eintrag an). Kein Hardlimit, aber soft cap 9 (insgesamt 10 Mieter inkl. Mieter 1), passend zum `quantity`-Clamp in der Edge Function.
- Card „Mieter 1" wird umbenannt zu „Mieter 1 – ursprünglicher Mieter" sobald mindestens ein zusätzlicher Mieter aktiv ist.

## Aufgabe 2 — Berechnung & Kauf

- `buildTenantSnapshot(...)` bleibt; wird in einer Schleife für `[mieter1, ...additionalTenants]` aufgerufen.
- `prorataList = useMemo(...)` liefert ein Array von Snapshots; Pro-Rata-Banner zeigt eine kurze Zusammenfassung (z. B. „3 Mieter erkannt – 3 Abrechnungen werden erstellt").
- `canBuy`: alle aktiven Mieter müssen Name + Einzug haben und die Zeiträume müssen innerhalb des Abrechnungsjahres liegen (einfache Validierung, kein Lücken-/Überlapp-Check — wie bisher).
- `quantity = 1 + additionalTenants.length`.
- `handleBuy`:
  - `input_snapshot.tenants = [snap1, ...additionalSnaps]`
  - `quantity` an `create-service-checkout` übergeben.
- Preisanzeige & Bestätigungsdialog: Gesamtpreis = `price.price_cents * quantity`; Zusatztext „({quantity} Abrechnungen)" wenn quantity > 1.

## Aufgabe 3 — Edge Functions
Bereits generisch über `input_snapshot.tenants[]` implementiert — keine Änderungen nötig:
- `create-service-checkout`: `quantity` wird bereits geclamped (1–10) und multipliziert.
- `generate-service-document`: iteriert bereits über `tenants[]` und erzeugt n PDFs.
- `get-service-document-url`: akzeptiert bereits `index`.

## Aufgabe 4 — Success-Seite
`ServiceHubSuccess.tsx` rendert bereits dynamisch alle Einträge aus `document_paths` — keine Änderung nötig, funktioniert automatisch für 2, 3, 4… PDFs.

## Hinweise
- Datenbank-Migration (`quantity`, `document_paths`) ist bereits aktiv.
- Hardcap 10 Mieter pro Bestellung (matches Stripe-/Edge-Clamp).
- Keine Backend-/Tour-/HelpButton-Änderungen.
