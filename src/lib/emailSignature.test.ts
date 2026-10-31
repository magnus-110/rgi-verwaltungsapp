import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNATURE_COMPANY,
  insertTextSignature,
  normalizeSignatureFields,
  phoneHref,
  renderSignatureHtml,
  renderSignatureText,
  stripTextSignatures,
} from "./emailSignature";

const fields = {
  greeting: "Mit freundlichen Grüßen",
  name: "Magnus Göttinger",
  title: "Geschäftsführer",
  qualification: "zert. Verwalter (IHK) nach § 26a WEG",
  phone: "+49 8363 92 97 973",
  email: "magnus.goettinger@rgi-immobilien.de",
};

describe("emailSignature", () => {
  it("baut tel:-Links", () => {
    expect(phoneHref("+49 (0)8363 / 92 97 973")).toBe("+4983639297973");
    expect(phoneHref("08363 960656")).toBe("+498363960656");
    expect(phoneHref("0049 151 123")).toBe("+49151123");
  });

  it("Textversion enthält Grußformel, Name und Pflichtangaben", () => {
    const t = renderSignatureText(fields, DEFAULT_SIGNATURE_COMPANY);
    expect(t.startsWith("Mit freundlichen Grüßen\n\nMagnus Göttinger\n")).toBe(true);
    expect(t).toContain("Geschäftsführer · zert. Verwalter (IHK) nach § 26a WEG");
    expect(t).toContain("RGI-Immobilien GmbH & Co. KG · Sitz Pfronten · Amtsgericht Kempten (Allgäu) HRA 11535");
    expect(t).toContain("Komplementärin: RGI-Immobilien Verwaltungs GmbH");
    expect(t).toContain("Geschäftsführer der Komplementärin: Regina Göttinger, Andreas Göttinger, Maximilian Göttinger");
    expect(t).not.toMatch(/\n{3,}/);
  });

  it("HTML escaped Eingaben und enthält Logo + Links", () => {
    const h = renderSignatureHtml({ ...fields, name: "A <b>&" }, DEFAULT_SIGNATURE_COMPANY);
    expect(h).toContain("A &lt;b&gt;&amp;");
    expect(h).toContain('href="tel:+4983639297973"');
    expect(h).toContain('href="mailto:magnus.goettinger@rgi-immobilien.de"');
    expect(h).toContain(DEFAULT_SIGNATURE_COMPANY.logo_url);
    expect(h).toContain("<strong");
  });

  it("lässt leere Felder weg", () => {
    const h = renderSignatureHtml({ ...fields, phone: "", title: "", qualification: "" }, DEFAULT_SIGNATURE_COMPANY);
    expect(h).not.toContain("tel:");
    const t = renderSignatureText({ ...fields, greeting: "", phone: "" }, DEFAULT_SIGNATURE_COMPANY);
    expect(t.startsWith("Magnus Göttinger")).toBe(true);
    expect(t).not.toContain("Tel.");
  });

  it("setzt die Signatur über die zitierte Nachricht", () => {
    const body = "Hallo Herr X,\n\ndanke.\n\n\n--- Ursprüngliche Nachricht ---\nVon: x\n\nText";
    const out = insertTextSignature(body, "SIG");
    expect(out).toBe("Hallo Herr X,\n\ndanke.\n\nSIG\n\n--- Ursprüngliche Nachricht ---\nVon: x\n\nText");
    expect(insertTextSignature("Hallo", "SIG")).toBe("Hallo\n\nSIG");
    expect(insertTextSignature("", "SIG")).toBe("SIG");
    expect(insertTextSignature("Hallo", "")).toBe("Hallo");
  });

  it("entfernt alte Textsignaturen nur am Ende des eigenen Texts", () => {
    const body = "Hallo\n\nALT-SIG\n\n--- Ursprüngliche Nachricht ---\nALT-SIG im Zitat";
    expect(stripTextSignatures(body, ["ALT-SIG"])).toBe("Hallo\n\n--- Ursprüngliche Nachricht ---\nALT-SIG im Zitat");
    expect(stripTextSignatures("ALT-SIG steht vorne\nund Text danach", ["ALT-SIG"])).toBe("ALT-SIG steht vorne\nund Text danach");
    expect(stripTextSignatures("Hallo", [null, ""])).toBe("Hallo");
  });

  it("normalisiert gespeicherte Felder", () => {
    const f = normalizeSignatureFields({ name: "X", phone: 5 }, "a@b.de");
    expect(f).toEqual({ greeting: "Mit freundlichen Grüßen", name: "X", title: "", qualification: "", phone: "", email: "a@b.de" });
  });
});
