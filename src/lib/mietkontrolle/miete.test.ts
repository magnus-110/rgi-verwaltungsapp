import { describe, expect, it } from "vitest";
import { abgleich, faelligkeit, naechsteStufe, schreiben } from "../../../supabase/functions/_shared/miete";

const miete = (amount: number, valid_from: string | null = null, valid_to: string | null = null) => ({
  cost_type: "Miete",
  amount,
  interval: "monatlich",
  valid_from,
  valid_to,
});

describe("faelligkeit", () => {
  it("nimmt ohne Zahltag den 3. Werktag", () => {
    expect(faelligkeit("2026-10")).toBe("2026-10-05"); // 1.10. Do, 2.10. Fr, 5.10. Mo
  });
  it("nimmt den vereinbarten Zahltag und kürzt auf das Monatsende", () => {
    expect(faelligkeit("2026-10", 16)).toBe("2026-10-16");
    expect(faelligkeit("2026-02", 31)).toBe("2026-02-28");
  });
});

describe("abgleich", () => {
  it("Mieterkonto: eine Sammelzahlung deckt Wohnung und Garage", () => {
    const e = abgleich({
      kosten: [miete(700), { ...miete(50), cost_type: "Garage" }],
      zahlungen: [{ id: "1", datum: "2026-09-02", betrag: 750 }],
      vonMonat: "2026-09",
      bisMonat: "2026-09",
      heute: "2026-09-20",
    });
    expect(e.rueckstand).toBe(0);
    expect(e.monate[0].status).toBe("puenktlich");
  });

  it("späterer Zahltag: Zahlung am 16. ist pünktlich und nichts offen", () => {
    const e = abgleich({
      kosten: [miete(730)],
      zahlungen: [{ id: "1", datum: "2026-09-16", betrag: 730 }],
      vonMonat: "2026-09",
      bisMonat: "2026-09",
      heute: "2026-09-12",
      zahltag: 16,
    });
    expect(e.monate[0].faellig).toBe("2026-09-16");
    expect(e.rueckstand).toBe(0);
    expect(e.monate[0].status).toBe("puenktlich");
  });

  it("Startsaldo: alter Rückstand bleibt offen und wird zuerst getilgt", () => {
    const e = abgleich({
      kosten: [miete(500)],
      zahlungen: [
        { id: "1", datum: "2026-10-02", betrag: 500 },
        { id: "2", datum: "2026-10-20", betrag: 100 },
      ],
      vonMonat: "2026-10",
      bisMonat: "2026-10",
      heute: "2026-10-25",
      vortrag: { stichtag: "2026-10-01", betrag: 300 },
    });
    // 600 eingegangen: 300 Startsaldo, 300 Oktober → 200 offen im Oktober
    expect(e.vortragOffen).toBe(0);
    expect(e.rueckstand).toBe(200);
    expect(e.monate[0].status).toBe("zu_wenig");
  });

  it("Startsaldo ohne Zahlung: Mahnung beginnt beim Stichtag", () => {
    const e = abgleich({
      kosten: [],
      zahlungen: [],
      vonMonat: "2026-10",
      bisMonat: "2026-10",
      heute: "2026-10-20",
      vortrag: { stichtag: "2026-10-01", betrag: 1122.1 },
    });
    expect(e.rueckstand).toBe(1122.1);
    expect(e.vortragOffen).toBe(1122.1);
    expect(e.aeltesteFaelligkeit).toBe("2026-10-01");
  });

  it("Startsaldo als Guthaben deckt die erste Miete", () => {
    const e = abgleich({
      kosten: [miete(500)],
      zahlungen: [],
      vonMonat: "2026-10",
      bisMonat: "2026-10",
      heute: "2026-10-20",
      vortrag: { stichtag: "2026-10-01", betrag: -600 },
    });
    expect(e.rueckstand).toBe(0);
    expect(e.guthaben).toBe(100);
  });

  it("Rückzahlung verbraucht zuerst das Guthaben", () => {
    const e = abgleich({
      kosten: [miete(500)],
      zahlungen: [
        { id: "1", datum: "2026-06-01", betrag: 550 }, // 50 zu viel (Garage versehentlich)
        { id: "2", datum: "2026-06-18", betrag: -50 }, // Rückzahlung
      ],
      vonMonat: "2026-06",
      bisMonat: "2026-06",
      heute: "2026-06-30",
    });
    expect(e.guthaben).toBe(0);
    expect(e.rueckstand).toBe(0);
  });

  it("Rückzahlung ohne Guthaben öffnet den letzten Monat wieder", () => {
    const e = abgleich({
      kosten: [miete(500)],
      zahlungen: [
        { id: "1", datum: "2026-05-04", betrag: 500 },
        { id: "2", datum: "2026-06-01", betrag: 500 },
        { id: "3", datum: "2026-06-10", betrag: -500 }, // zurückgegebene Lastschrift
      ],
      vonMonat: "2026-05",
      bisMonat: "2026-06",
      heute: "2026-06-30",
    });
    expect(e.monate[0].status).toBe("puenktlich");
    expect(e.monate[1].status).toBe("offen");
    expect(e.rueckstand).toBe(500);
  });

  it("Kündigung prüfen nur bei Rückständen aus laufenden Monaten", () => {
    const e = abgleich({
      kosten: [miete(500)],
      zahlungen: [{ id: "1", datum: "2026-10-02", betrag: 500 }],
      vonMonat: "2026-10",
      bisMonat: "2026-10",
      heute: "2026-10-20",
      vortrag: { stichtag: "2026-10-01", betrag: 5000 },
    });
    const plan = naechsteStufe({ ergebnis: e, heute: "2026-10-20" });
    expect(plan?.kuendigungPruefen).toBe(false);
  });
});

describe("schreiben", () => {
  it("nennt den Startsaldo als eigenen Posten", () => {
    const s = schreiben({
      stufe: "erinnerung",
      anrede: "Sehr geehrte Frau Muster",
      offen: [{ monat: "vortrag", faellig: "", soll: 300, bezahlt: 0, bezahltAm: null, status: "offen" }],
      frist: "2026-10-30",
      objekt: "Birkenweg 7",
    });
    expect(s.text).toContain("Rückstand aus der Zeit vor der laufenden Kontrolle: 300,00 €");
    expect(s.betreff).toContain("Mietrückstand");
  });
});
