import { describe, it, expect } from "vitest";
import { findTrigger, searchContacts, contactFields, formatBlock, insertBlock, buildSearchText, type ContactCard } from "../contactInsert";

const card = (over: Partial<ContactCard>): ContactCard => ({
  id: "1", displayName: "Max Doser GmbH", subtitle: "", companyName: "Max Doser GmbH", personName: null,
  address: "Musterstr. 1, 87459 Pfronten", phones: [{ number: "08363 123", label: null, note: null }],
  emails: [{ email: "info@doser.de", label: null }], persons: [], searchText: buildSearchText(["Max Doser GmbH", "info@doser.de"]),
  ...over,
});

describe("contactInsert", () => {
  it("erkennt # am Wortanfang", () => {
    expect(findTrigger("bitte an #dos", 13)).toEqual({ start: 9, query: "dos" });
    expect(findTrigger("#do", 3)).toEqual({ start: 0, query: "do" });
    expect(findTrigger("Hausnr#dos", 10)).toBeNull();
    expect(findTrigger("#d", 2)).toBeNull();
    expect(findTrigger("#dos weiter", 11)).toBeNull();
  });
  it("findet Kontakte ohne Umlaut-Probleme", () => {
    const cs = [card({}), card({ id: "2", displayName: "Göttinger", companyName: null, searchText: buildSearchText(["Göttinger"]) })];
    expect(searchContacts(cs, "dos").map((c) => c.id)).toEqual(["1"]);
    expect(searchContacts(cs, "gott").map((c) => c.id)).toEqual(["2"]);
  });
  it("baut Block und ersetzt das Kürzel", () => {
    const c = card({});
    const f = contactFields(c);
    const sel = new Set(f.filter((x) => x.defaultOn).map((x) => x.key));
    const block = formatBlock(f, sel);
    expect(block).toBe("Max Doser GmbH\nTelefon: 08363 123\nE-Mail: info@doser.de");
    const r = insertBlock("Firma: #dos\nGruß", 7, 11, block);
    expect(r.text).toBe("Firma:\nMax Doser GmbH\nTelefon: 08363 123\nE-Mail: info@doser.de\nGruß");
  });
  it("Person ohne Firma: kein doppelter Ansprechpartner, Telefon/E-Mail sichtbar", () => {
    const c = card({
      displayName: "Markus Gschwend", companyName: null, personName: "Markus Gschwend",
      persons: [{ id: "p", name: "Herr Markus Gschwend", position: null, phone: null, email: null }],
      phones: [{ number: "08363-926241", label: "Festnetz", note: null }, { number: "0160-97029078", label: "Mobil", note: null }],
      emails: [{ email: "markusgschwend@web.de", label: "Geschäftlich" }],
    });
    const f = contactFields(c);
    expect(f.map((x) => x.label)).toEqual(["Name", "Festnetz", "Mobil", "E-Mail Geschäftlich", "Adresse"]);
  });
});
