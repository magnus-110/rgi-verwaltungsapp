import { describe, it, expect } from "vitest";
import {
  contractEndDate, termYearsShort, termYearsWord, toIsoDate,
} from "@/types/rgiContracts";

describe("Bestellungszeitraum", () => {
  it("rechnet das Ende als Beginn + Laufzeit - 1 Tag", () => {
    expect(contractEndDate("2027-01-01", 3)).toBe("2029-12-31");
    expect(contractEndDate("2026-10-01", 3)).toBe("2029-09-30");
    expect(contractEndDate("2026-09-15", 1)).toBe("2027-09-14");
    expect(contractEndDate("2026-10-01", 5)).toBe("2031-09-30");
  });

  it("kommt mit Schaltjahren und Monatsenden klar", () => {
    expect(contractEndDate("2028-02-29", 1)).toBe("2029-02-28");
    expect(contractEndDate("2027-03-01", 1)).toBe("2028-02-29");
    expect(contractEndDate("2026-12-31", 3)).toBe("2029-12-30");
  });

  it("bleibt leer, solange Beginn oder Laufzeit fehlt", () => {
    expect(contractEndDate(null, 3)).toBe("");
    expect(contractEndDate("2027-01-01", null)).toBe("");
    expect(contractEndDate("2027-01-01", 0)).toBe("");
    expect(contractEndDate("kein Datum", 3)).toBe("");
  });

  it("versteht ISO und das deutsche Datumsformat", () => {
    expect(toIsoDate("31.12.2029")).toBe("2029-12-31");
    expect(toIsoDate("1.1.2027")).toBe("2027-01-01");
    expect(toIsoDate("2029-12-31")).toBe("2029-12-31");
    expect(toIsoDate("Ende 2029")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });

  it("formuliert die Laufzeit für Vertrag und Übersichtsblatt", () => {
    expect(termYearsWord(1)).toBe("einem Jahr");
    expect(termYearsWord(3)).toBe("drei Jahren");
    expect(termYearsShort(1)).toBe("1 Jahr");
    expect(termYearsShort(3)).toBe("3 Jahre");
  });
});

describe("Laufzeit einlesen", () => {
  it("nimmt Zahlen und die alte Textform", async () => {
    const { parseTermYears } = await import("@/types/rgiContracts");
    expect(parseTermYears("3")).toBe(3);
    expect(parseTermYears(5)).toBe(5);
    expect(parseTermYears("drei Jahren")).toBe(3);
    expect(parseTermYears("einem Jahr")).toBe(1);
    expect(parseTermYears("fünf Jahren")).toBe(5);
    expect(parseTermYears("")).toBeNull();
    expect(parseTermYears(undefined)).toBeNull();
    expect(parseTermYears("unbefristet")).toBeNull();
  });
});
