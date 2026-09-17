import { describe, it, expect } from "vitest";
import { extractEmailAddress, normalizeAddressList, buildReplyAllRecipients } from "../emailRecipients";

describe("extractEmailAddress", () => {
  it("liest die Adresse aus einem Namensformat", () => {
    expect(extractEmailAddress("Max Muster <max@example.de>")).toBe("max@example.de");
    expect(extractEmailAddress('"Muster, Max" <max@example.de>')).toBe("max@example.de");
    expect(extractEmailAddress(" max@example.de ")).toBe("max@example.de");
    expect(extractEmailAddress("kein Empfänger")).toBeNull();
  });
});

describe("normalizeAddressList", () => {
  it("verarbeitet Arrays und Strings", () => {
    expect(normalizeAddressList(["a@x.de", "B Muster <b@x.de>"])).toEqual(["a@x.de", "b@x.de"]);
    expect(normalizeAddressList("a@x.de, b@x.de; c@x.de")).toEqual(["a@x.de", "b@x.de", "c@x.de"]);
    expect(normalizeAddressList(null)).toEqual([]);
  });
});

describe("buildReplyAllRecipients", () => {
  const self = ["info@rgi-immobilien.de"];

  it("antwortet Absender und allen weiteren Empfängern, CC bleibt CC", () => {
    const { to, cc } = buildReplyAllRecipients({
      fromAddress: "eigentuemer@example.de",
      toAddresses: ["info@rgi-immobilien.de", "zweiter@example.de"],
      ccAddresses: ["beirat@example.de", "info@rgi-immobilien.de"],
      selfAddresses: self,
    });
    expect(to).toEqual(["eigentuemer@example.de", "zweiter@example.de"]);
    expect(cc).toEqual(["beirat@example.de"]);
  });

  it("entfernt Dubletten unabhängig von Gross-/Kleinschreibung", () => {
    const { to, cc } = buildReplyAllRecipients({
      fromAddress: "Max <MAX@example.de>",
      toAddresses: ["max@example.de", "zweiter@example.de"],
      ccAddresses: ["Zweiter@example.de"],
      selfAddresses: self,
    });
    expect(to).toEqual(["MAX@example.de", "zweiter@example.de"]);
    expect(cc).toEqual([]);
  });

  it("antwortet bei eigener Mail den ursprünglichen Empfängern", () => {
    const { to, cc } = buildReplyAllRecipients({
      fromAddress: "info@rgi-immobilien.de",
      toAddresses: ["eigentuemer@example.de"],
      ccAddresses: [],
      selfAddresses: self,
    });
    expect(to).toEqual(["eigentuemer@example.de"]);
    expect(cc).toEqual([]);
  });

  it("faellt auf den Absender zurueck, wenn sonst niemand uebrig bleibt", () => {
    const { to } = buildReplyAllRecipients({
      fromAddress: "info@rgi-immobilien.de",
      toAddresses: ["info@rgi-immobilien.de"],
      selfAddresses: self,
    });
    expect(to).toEqual(["info@rgi-immobilien.de"]);
  });
});
