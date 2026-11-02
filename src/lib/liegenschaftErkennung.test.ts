import { describe, expect, it } from "vitest";
import { erkenneLiegenschaft, ohneEigeneAnschrift } from "@shared/liegenschaft-erkennung";

// Auszug aus den echten Gebäuden (Stand 02.11.2026)
const gebaeude = [
  { id: "bischl", name: "Tiefgarage Bischlhaus", address: "Vilstalstr. 4 - 8 (Tiefgarage)", postal_code: "87459", city: "Pfronten" },
  { id: "vils48", name: "Vilstalstr. 4-8", address: "Vilstalstr. 4-8", postal_code: "87459", city: "Pfronten" },
  { id: "vils3", name: "Vilstalstr. 3", address: "Vilstalstr. 3", postal_code: "87459", city: "Pfronten" },
  { id: "vils9", name: "Vilstalstr. 9-9a", address: "Vilstalstr. 9-9a", postal_code: "87459", city: "Pfronten" },
  { id: "achweg", name: "Achweg 3-5", address: "Achweg 3-5", postal_code: "87459", city: "Pfronten" },
  { id: "ahorn", name: "Ahornstr. 26-28", address: "Ahornstr. 26-28", postal_code: "87629", city: "Füssen" },
  { id: "rudolf", name: "Rudolfstrasse 2e", address: "Rudolfstrasse 2e", postal_code: "87669", city: "Füssen" },
  { id: "wolfgang", name: "St.-Wolfgang-Str. 6", address: "St.-Wolfgang-Str. 6", postal_code: "87466", city: "Haslach" },
  { id: "neuer14", name: "Neuer Weg 14", address: "Neuer Weg 14", postal_code: "87459", city: "Pfronten" },
];
const eigeneAnschriften = [{ strasse: "Vilstalstr. 4", plz: "87459" }];
const erkenne = (a: { objektHinweis?: string; empfaenger?: string; volltext?: string }) =>
  erkenneLiegenschaft({ ...a, gebaeude, eigeneAnschriften })?.id ?? null;

describe("Liegenschafts-Erkennung", () => {
  it("ordnet die eigene Büroanschrift nicht der Tiefgarage Bischlhaus zu", () => {
    expect(erkenne({ empfaenger: "Vilstalstr. 4, 87459 Pfronten" })).toBeNull();
    expect(erkenne({ empfaenger: "Vilstalstr.  4, 87459 Pfronten" })).toBeNull();
    expect(erkenne({ empfaenger: "RGI-Immobilien GmbH & Co.KG, Vilstalstr.4, 87459 Pfronten" })).toBeNull();
    expect(erkenne({ empfaenger: "RGI-Immobilien GmbH & Co. KG\nMagnus Göttinger\nVilstalstraße 4\nDE-87459 Pfronten" })).toBeNull();
  });

  it("erkennt die WEG vor „vertreten durch RGI“", () => {
    expect(erkenne({ empfaenger: "WEG Achweg 3+5, vert. d. RGI-Immobilien GmbH & Co.KG, Vilstalstr. 4, 87459 Pfronten" })).toBe("achweg");
    expect(erkenne({ empfaenger: "WEG Ahornstr. 26-28\nvertreten durch RGI-Immobilien GmbH & Co.KG\nVilstalstr. 4\n87469 Pfronten" })).toBe("ahorn");
    expect(erkenne({ empfaenger: "GdWE St.-Wolfgang-Str. 6\nv.d. RGI-Immobilien GmbH & Co.KG\nVilstalstr. 4\n87459 Pfronten" })).toBe("wolfgang");
  });

  it("behält eine Objektanschrift, die nach der RGI-Anschrift steht", () => {
    expect(erkenne({ empfaenger: "RGI-Immobilien GmbH u. Co. KG\nVilstalstr. 4\n87459 Pfronten\n\nRudolfstraße 2E\n87669 Füssen" })).toBe("rudolf");
  });

  it("nimmt den Objekt-Hinweis vor der Empfängeranschrift", () => {
    expect(erkenne({ objektHinweis: "Objekt: Neuer Weg 14, 87459 Pfronten", empfaenger: "RGI Immobilien, Vilstalstr. 4, 87459 Pfronten" })).toBe("neuer14");
  });

  it("findet das Objekt im Rechnungstext, aber nur mit PLZ", () => {
    const text = "RGI Immobilien GmbH & Co. KG\nVilstalstr. 4\n87459 Pfronten\nRechnung 4711\nLeistungsort: Achweg 3\n87459 Pfronten\nBetrag 3,50 EUR";
    expect(erkenne({ empfaenger: "Vilstalstr. 4, 87459 Pfronten", volltext: text })).toBe("achweg");
    expect(erkenne({ volltext: "Arbeiten am Achweg erledigt\nMenge 3 Stück" })).toBeNull();
  });

  it("ordnet bei zwei gleichen Anschriften nicht zufällig zu, außer der Name steht da", () => {
    expect(erkenne({ objektHinweis: "Vilstalstr. 4-8, 87459 Pfronten" })).toBeNull();
    expect(erkenne({ objektHinweis: "Tiefgarage Bischlhaus, Vilstalstr. 4-8, 87459 Pfronten" })).toBe("bischl");
  });

  it("lässt Vilstalstr. 4-8 in der Anschrift stehen", () => {
    expect(ohneEigeneAnschrift("Vilstalstr. 4-8, 87459 Pfronten", eigeneAnschriften)).toContain("4-8");
    expect(ohneEigeneAnschrift("Vilstalstr. 4, 87459 Pfronten", eigeneAnschriften)).not.toContain("Vilstal");
  });

  it("liest „WEG … z.H. RGI …“ in einer Zeile (bisher fälschlich Bischlhaus)", () => {
    expect(erkenne({ empfaenger: "WEG Rudolfstr. 2 e z.H. RGI Immobilien GmbH & Co.KG Vilstalstr. 4 87459 Pfronten" })).toBe("rudolf");
  });

  it("nimmt die genannte WEG vor der Anschrift eines Beirats", () => {
    expect(erkenne({ empfaenger: "WEG Achweg 3-5, vertreten durch RGI Immobilien GmbH & Co. KG\nStefan Husemann\nVilstalstraße 3\n87459 Pfronten" })).toBe("achweg");
  });

  it("verwechselt Vilstalstr. 3 nicht mit der eigenen Anschrift", () => {
    expect(erkenne({ empfaenger: "Stefan Husemann, Vilstalstraße 3, 87459 Pfronten" })).toBe("vils3");
  });
});
