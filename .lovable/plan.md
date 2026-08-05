# Wirtschaftsplan: Anteile auf 2 Nachkommastellen runden

## Problem
Im Einzelwirtschaftsplan-Dokument werden Anteilswerte (z. B. Heizkosten-Anteil) als rohe Fließkommazahl ausgegeben: `579.5699999999999`. Grund: die Anteilsfelder werden ungerundet und unformatiert in die Dokumentvorlage geschrieben. In der UI werden sie mit 3 Nachkommastellen angezeigt.

## Lösung
1. **Dokument** (`ManualEconomicPlanEditor.tsx`, `buildOwnerPlanPayload`): Die Felder `owner_share`, `total_share`, `your_share`, `ihr_share`, `gesamt_share` über eine Zahlformatierung im deutschen Format mit genau 2 Nachkommastellen ausgeben (z. B. `579,57`) statt des Rohwerts. Leere Werte bleiben leer.
2. **UI** (`EconomicPlanLayout.tsx`): Die Spalten „Ges. Anteil" und „Ihr Anteil" von 3 auf 2 Nachkommastellen umstellen, damit Bildschirm und Dokument identisch aussehen.

Rein darstellend — die Berechnung selbst bleibt unverändert (weiterhin volle Genauigkeit).
