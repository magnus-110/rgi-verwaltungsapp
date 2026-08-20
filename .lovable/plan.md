# Wirtschaftsplan Birkenweg 6: Vorjahres-IST bei Allgemeinstrom und Heizung korrigieren

## Was ich geprüft habe

Ich habe die Buchungen 2025 der Liegenschaft Birkenweg 6 direkt in der Datenbank ausgewertet:

| Konto | Wert im Wirtschaftsplan | Tatsächlicher Saldo 2025 |
|---|---|---|
| 1050 Allgemeinstrom | 279,19 € | **111,68 €** |
| 1400 Heizung / Warmwasser | 636,04 € | **5.148,99 €** |

Die tatsächlichen Werte entsprechen genau dem, was du erwartet hast.

## Ursache

Zum 31.12.2025 gibt es fünf Umbuchungen auf Konto 1400 (Kategorie `heating_repost`):

- 167,51 € Heizungsstrom (von 1050)
- 3.075,90 € Gas (von 1470)
- 745,83 € Wasser/Kanal (von 1473)
- 389,54 € Gerätemiete Brunata (von 1431)
- 134,17 € Heizungswartung (von 1440)

Die Vorjahres-IST-Berechnung im Wirtschaftsplan-Editor blendet alle Buchungen mit der Kategorie `heating_repost` grundsätzlich aus. Dadurch passiert genau das, was du siehst:

- Konto 1050 bleibt beim Bruttowert 279,19 €, weil der Abzug des Heizungsstroms (167,51 €) ignoriert wird.
- Konto 1400 zeigt nur die direkt gebuchten 636,04 €, weil die gesamte Heizkosten-Umbuchung (4.512,95 €) ignoriert wird.

## Fix

In `src/components/finance/ManualEconomicPlanEditor.tsx` in der Funktion `sumForAccount` den pauschalen Ausschluss von `heating_repost` entfernen, sodass Umbuchungen wie jede andere Buchung auf beide beteiligten Konten wirken (Quellkonto entlastet, 1400 belastet).

Ergebnis danach: Allgemeinstrom 111,68 €, Heizung/Warmwasser 5.148,99 €, und ebenso korrekt reduziert bei 1431, 1440, 1470, 1473.

## Kontrolle

Nach der Änderung prüfe ich per Datenbankabfrage gegen die UI, dass die Vorjahresspalte für Birkenweg 6 exakt die oben genannten Salden zeigt, und kontrolliere, dass die Summenzeile weiterhin stimmig ist (keine Doppelzählung, da die Umbuchung auf beiden Seiten wirkt).

## Technischer Hinweis

Betroffen ist nur die Vorjahres-IST-Spalte des Wirtschaftsplan-Editors. Die Abrechnungslogik (`BillingSettlement`, DOCX-Erzeugung) bleibt unverändert.
