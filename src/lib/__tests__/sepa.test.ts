import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { erzeugePain001, ibanGueltig, naechsterBankarbeitstag, sepaText } from "../sepa";

describe("ibanGueltig", () => {
  it("erkennt gültige deutsche IBANs", () => {
    expect(ibanGueltig("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(ibanGueltig("DE24720900000001190024")).toBe(true);
  });
  it("lehnt falsche Prüfziffer und falsche Länge ab", () => {
    expect(ibanGueltig("DE89370400440532013001")).toBe(false);
    expect(ibanGueltig("DE8937040044053201300")).toBe(false);
    expect(ibanGueltig("")).toBe(false);
    expect(ibanGueltig(null)).toBe(false);
  });
});

describe("sepaText", () => {
  it("ersetzt Umlaute und unzulässige Zeichen und kürzt", () => {
    expect(sepaText("Köpf & Söhne GmbH", 70)).toBe("Koepf + Soehne GmbH");
    expect(sepaText("Re.Nr. 12 – Juli; €", 140)).toBe("Re.Nr. 12 Juli");
    expect(sepaText("x".repeat(200), 140)).toHaveLength(140);
  });
});

describe("erzeugePain001", () => {
  const xml = erzeugePain001({
    absender: "RGI Immobilien GmbH & Co. KG",
    msgId: "RGI-TEST-1",
    bloecke: [
      {
        kontoInhaber: "WEG Achweg 3-5",
        kontoIban: "DE24720900000001190024",
        ausfuehrungAm: "2026-10-16",
        zahlungen: [
          { empfaenger: "BauAss Köpf GmbH & Co. KG", iban: "DE48720900000008046328", betrag: 19762.46, verwendungszweck: "Re. Nr. 260064", endToEndId: "RE-1" },
          { empfaenger: "Gschwend Markus", iban: "DE32 7335 0000 0515 8255 29", betrag: 870.489, verwendungszweck: "Re. Nr. 212115", endToEndId: "RE-2" },
        ],
      },
    ],
  });
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const text = (tag: string) => doc.getElementsByTagName(tag)[0]?.textContent;

  it("ist wohlgeformt und hat den richtigen Namensraum", () => {
    expect(doc.documentElement.getAttribute("xmlns")).toBe("urn:iso:std:iso:20022:tech:xsd:pain.001.001.09");
  });
  it("hat stimmige Anzahl und Kontrollsumme", () => {
    expect(text("NbOfTxs")).toBe("2");
    expect(text("CtrlSum")).toBe("20632.95");
    const betraege = Array.from(doc.getElementsByTagName("InstdAmt")).map((e) => e.textContent);
    expect(betraege).toEqual(["19762.46", "870.49"]);
  });
  it("schreibt IBANs ohne Leerzeichen und Namen ohne Umlaute", () => {
    const ibans = Array.from(doc.getElementsByTagName("IBAN")).map((e) => e.textContent);
    expect(ibans).toEqual(["DE24720900000001190024", "DE48720900000008046328", "DE32733500000515825529"]);
    expect(xml).toContain("<Nm>BauAss Koepf GmbH + Co. KG</Nm>");
    expect(text("Dt")).toBe("2026-10-16");
  });
});

describe("naechsterBankarbeitstag", () => {
  it("schiebt Wochenenden auf Montag", () => {
    expect(naechsterBankarbeitstag(new Date(2026, 9, 17))).toBe("2026-10-19"); // Samstag
    expect(naechsterBankarbeitstag(new Date(2026, 9, 15))).toBe("2026-10-15"); // Donnerstag
  });
});
