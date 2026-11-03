// Erzeugt src/data/blzListe.json aus der Bankleitzahlendatei der Deutschen Bundesbank.
//
// Datei (TXT, ungepackt) hier laden:
//   https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592
// Aufruf:
//   node scripts/blz-liste-erzeugen.mjs <pfad/blz-aktuell-txt-data.txt>
//
// Die Bundesbank aktualisiert die Datei viermal im Jahr (März, Juni,
// September, Dezember). Übernommen werden nur die Hauptdatensätze
// (Merkmal 1) ohne Löschkennzeichen: BLZ → [Name, BIC, Ort].

import { readFileSync, writeFileSync } from "node:fs";

const quelle = process.argv[2];
if (!quelle) {
  console.error("Bitte den Pfad zur Bankleitzahlendatei (TXT) angeben.");
  process.exit(1);
}
const text = new TextDecoder("latin1").decode(readFileSync(quelle));
const b = {};
for (const zeile of text.split(/\r?\n/)) {
  if (zeile.length < 160) continue;
  const blz = zeile.slice(0, 8);
  if (zeile[8] !== "1" || zeile[158] === "D") continue;
  const name = zeile.slice(9, 67).trim();
  const ort = zeile.slice(72, 107).trim();
  const bic = zeile.slice(139, 150).trim();
  b[blz] = [name, bic, ort];
}
const ziel = new URL("../src/data/blzListe.json", import.meta.url);
writeFileSync(ziel, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), quelle: "Deutsche Bundesbank, Bankleitzahlendatei", b }));
console.log(`${Object.keys(b).length} Bankleitzahlen geschrieben.`);
