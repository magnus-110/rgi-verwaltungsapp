import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { bankZurBlz, blzAusEingabe, FINTS_BANKEN_STATISCH, fintsUrlFehler, vorschlagFuer, type FintsBank } from "@/lib/fintsBanken";

const commerzbank: FintsBank = {
  blz: "73340046",
  name: "Commerzbank",
  bic: "COBADEFFXXX",
  fints_url: "https://fints.commerzbank.de/fints",
  anmeldename_hinweis: "Teilnehmernummer",
  tan_app: "Commerzbank photoTAN",
  blz_muster: "^(?!20041)[0-9]{3}4[0-9]{4}$",
  blz_muster_text: "alle Commerzbank-Filialen",
  aktiv: true,
};

describe("fintsBanken", () => {
  it("liest die BLZ aus IBAN oder Eingabe", () => {
    expect(blzAusEingabe("DE89 3704 0044 0532 0130 00")).toBe("37040044");
    expect(blzAusEingabe("7334 0046")).toBe("73340046");
    expect(blzAusEingabe("123")).toBeNull();
  });

  it("findet Commerzbank-Filialen über das Muster, aber nicht comdirect", () => {
    const liste = [...FINTS_BANKEN_STATISCH, commerzbank];
    expect(bankZurBlz(liste, "72040046")?.name).toBe("Commerzbank");
    expect(bankZurBlz(liste, "20041111")).toBeNull();
    expect(bankZurBlz(liste, "73350000")?.name).toBe("Sparkasse Allgäu");
  });

  it("lässt nur https-Adressen mit Servernamen zu", () => {
    expect(fintsUrlFehler("https://fints.commerzbank.de/fints")).toBeNull();
    expect(fintsUrlFehler("http://fints.commerzbank.de/fints")).not.toBeNull();
    expect(fintsUrlFehler("https://10.0.0.1/fints")).not.toBeNull();
    expect(fintsUrlFehler("https://localhost/fints")).not.toBeNull();
    expect(fintsUrlFehler("https://bank.internal/fints")).not.toBeNull();
    expect(fintsUrlFehler("https://fints.bank.de:8443/")).not.toBeNull();
    expect(fintsUrlFehler("https://user:pw@fints.bank.de/")).not.toBeNull();
  });

  it("schlägt Name, BIC und Adresse aus der Bundesbank-Liste vor (offline)", async () => {
    const coba = await vorschlagFuer("73340046");
    expect(coba?.name).toBe("Commerzbank");
    expect(coba?.fints_url).toBe("https://fints.commerzbank.de/fints");
    expect(coba?.blz_muster).toBeTruthy();

    const vr = await vorschlagFuer("73369933");
    expect(vr?.bic).toBe("GENODEF1RHP");
    expect(vr?.fints_url).toContain("atruvia");

    const spk = await vorschlagFuer("73350000");
    expect(spk?.fints_url).toBe("https://banking-by1.s-fints-pt-by.de/fints30");

    const comdirect = await vorschlagFuer("20041111");
    expect(comdirect?.fints_url).toBe("");
    expect(comdirect?.url_sicher).toBe(false);

    expect(await vorschlagFuer("99999999")).toBeNull();
  });
});
