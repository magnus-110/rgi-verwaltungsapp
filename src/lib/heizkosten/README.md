# Heizkostenmodul — Fundament

Eigene Heizkostenabrechnung nach HeizkostenV, statt sie beim Messdienstleister
einzukaufen. Die Ablesung bleibt beim Anbieter; die Rechnung entsteht hier.

## Aufbau

```
kern.ts         Rundung, FIFO, § 9-Trennung, Verteilung, CO₂-Stufenmodell
erfassung.ts    mehrere Erfassungssysteme, Gerätewechsel im Zeitraum
ersatzwerte.ts  § 9a — Dreistufenmodell und die 25-%-Grenze
pruefungen.ts   alle Prüfungen mit ihrer Norm
abrechnung.ts   Orchestrierung: Eingang → Ergebnis
typen.ts        gemeinsame Typen
daten.ts        einzige Stelle mit Supabase-Zugriff
index.ts        öffentliche Schnittstelle
```

Der Rechenkern (alles außer `daten.ts`) kennt weder Datenbank noch Oberfläche.
Er bekommt einen `AbrechnungEingang` und liefert ein `AbrechnungErgebnis` samt
Rechenweg und Prüfhinweisen. Das macht ihn testbar und die Abrechnung
nachvollziehbar.

## Rechenweg

1. Kosten nach Kostenart trennen — nur Heizung, nur Warmwasser, beides.
   Die Messdienste drucken das als `H)`, `W)`, `H/W)`. In der App steht es auf
   dem Konto in `chart_of_accounts.heating_cost_type`.
2. Heizung und Warmwasser trennen (§ 9) — über Wärmemengenzähler oder,
   ersatzweise, über die Formel des Absatzes 3.
3. Grund- und Verbrauchskosten bilden (§ 7, § 8) — 50 bis 70 % nach Verbrauch.
4. Auf die Nutzeinheiten verteilen, summenerhaltend gerundet.
5. Prüfen.

## Nahtstelle zur Jahresabrechnung

`heating_distribution_values` bleibt die einzige Übergabestelle. Aus dieser
Tabelle lesen bereits heute:

- die WEG-Jahresabrechnung (`BillingSettlement.tsx`)
- die Einzelabrechnung im PDF (`buildBillingPayload.ts`)
- die Mieter-Nebenkostenabrechnung (`get-owner-billing-positions`)

Das Modul ersetzt nur, **woher** die Werte kommen. Nach unten ändert sich
nichts. Die Spalte `source` unterscheidet `messdienst` (von Hand aus einer
fremden Abrechnung übernommen) von `eigene_abrechnung`.

Geschrieben wird erst mit `uebergebeAnJahresabrechnung` — ein bewusst eigener
Schritt nach der Freigabe, damit ein Probelauf nichts verändert.

## Die Umbuchungen bleiben

`1410 → 1450 → 1400` ist Buchhaltung, nicht Heizkostenabrechnung, und bleibt
unverändert. Heizkosten sind die Ausnahme vom Abflussprinzip
(BGH V ZR 251/10): in die Abrechnung geht der verbrauchte Brennstoff, nicht
der gekaufte. Der Rest bleibt als Bestand auf 1450 und erscheint im
Vermögensbericht.

Das Modul liest die **einzelnen** Kostenkonten, nicht den Saldo auf 1400 —
die Trennung nach § 9 braucht die Kostenart je Position. Umbuchungen
(`heating_repost`) und Splitts (`heating_split`) werden dabei ausgeklammert,
sonst zählt dieselbe Position zweimal.

## Fallen, die uns schon begegnet sind

**Rundung.** `4102,45 × 0,3` ergibt in JavaScript `1230,7349999999999` und
würde zu `1230,73` statt `1230,74`. Deshalb normalisiert `round()` erst auf
15 signifikante Stellen. Ein Cent pro Position reißt die Summenkontrolle.

**Summenerhaltende Rundung.** Unabhängig gerundete Einzelbeträge summieren
sich fast nie exakt auf den Verteilungsbetrag. Fehlt der Ausgleich, stimmt die
Summe der Einzelabrechnungen nicht mit der Gesamtabrechnung überein — ein
formaler Fehler, der zur Anfechtbarkeit führt.

**Bewertungsfaktoren aus dem Zwischenableseprotokoll.** RegioMess druckt
Faktoren unter 1 um eine Dezimalstelle verschoben: `0.088` bedeutet `0,88`.
Bei Funkgeräten vom Typ `HZK` steht überhaupt kein Faktor, nur ein Platzhalter.
`rating_factor_source` hält fest, woher ein Faktor stammt.

**Nutzernummern.** Die Nummerierung des Messdienstes stimmt nicht mit der
Einheitennummer der App überein. In der Rudolfstr. 2e sind alle sechs Einheiten
paarweise vertauscht. Ohne `heating_user_mapping` bekäme jeder Bewohner die
Abrechnung seines Nachbarn. Eine Zuordnung gilt erst als `bestaetigt`, wenn ein
Mensch sie geprüft hat — automatisch erkannte bleiben `vorschlag`.

**Zeitanteile bei Nutzerwechsel.** Heizungs-Grundkosten nach Gradtagen, alles
Übrige nach Kalendertagen (§ 9b Abs. 2). Wer im Winter einzieht, trägt einen
höheren Anteil der Grundkosten als seinen Kalenderanteil.

## Generierte Supabase-Typen

Die sechs neuen Tabellen sind in `src/integrations/supabase/types.ts` noch
nicht enthalten. Einmal neu erzeugen:

```
npm run db:types
```

Danach kann der Zugang `hk()` in `daten.ts` durch den normalen typisierten
Client ersetzt werden. Bis dahin ist er die einzige Stelle im Modul, an der
die Typprüfung nachgibt.

## Tests

```
npm test
```

74 Tests, davon 41 gegen echte Abrechnungen von BRUNATA-METRONA, RegioMess,
ista und Allgäu Messpartner. Die Testfälle in `__tests__/faelle.ts` enthalten
die Eingangsdaten UND das Soll-Ergebnis des Anbieters.

Drei Positionen weichen um zwei Cent ab, weil der Anbieter Gleichstände bei der
summenerhaltenden Rundung anders auflöst als wir. Sie sind in
`bekannteAbweichung` einzeln benannt und begründet; die Gesamtsumme stimmt in
allen Fällen. Beim Sorgschrofenweg fehlen der Anbieter-Abrechnung sogar zwei
Cent gegenüber den Gesamtkosten — unsere Summe stimmt per Konstruktion.
