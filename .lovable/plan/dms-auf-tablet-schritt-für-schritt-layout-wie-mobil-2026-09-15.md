# DMS auf Tablet: Schritt-für-Schritt-Layout (wie mobil)

## Problem

Im DMS (Dokumente-Tab im Gebäude, `src/components/buildings/BuildingDocumentsTab.tsx`) gilt ab 768 px Breite das Desktop-Layout mit drei festen Spalten: Ordnerbaum 260 px + Detailspalte 320 px. Auf Tablets (768–1023 px) bleibt für die Dokumentenliste nur ~150–200 px — die Dokumenttitel werden fast vollständig abgeschnitten.

## Lösung

Der bestehende Schritt-für-Schritt-Modus (Ordner → Liste → Detail, jeweils voll bildfüllend mit Zurück-Button) wird nicht nur unter 768 px, sondern unter 1024 px aktiviert. Damit nutzen Tablets denselben Drill-down wie Handys, und die Titel haben die volle Breite.

## Änderungen

Datei: `src/components/buildings/BuildingDocumentsTab.tsx`

1. Hook tauschen: statt `useIsMobile()` den bereits vorhandenen Hook `useIsTabletOrBelow()` (aus `src/hooks/use-mobile.tsx`, Schwelle < 1024 px) verwenden.
2. Desktop-Drei-Spalten-Layout nur noch ab 1024 px Breite rendern — unverändert für große Screens.
3. Der Schritt-für-Schritt-Modus bleibt ansonsten genau wie bisher: Zurück-Buttons, Suchfeld in der Liste, Hochladen-Button, Upload-Dialog.

## Keine Änderungen an

- Dokumentenliste selbst, Detail-Panel, Ordnerbaum, Upload-Logik, Datenbank.

## Verifikation

- Build/Typcheck läuft automatisch.
- Gegenprüfung der Breakpoint-Logik im Code (768 px vs. 1024 px).
- Sichtbarer Test im Preview: Gerätetablet-Ansicht wählen → DMS öffnen → Ordner antippen → Liste zeigt Titel in voller Breite → Dokument antippen → Detail.
