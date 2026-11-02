import { describe, expect, it } from "vitest";
import { type BillableEvent, isMemoRow, rowFromEvent, rowNeedsAmount } from "../rgiBilling";

const base: BillableEvent = {
  id: "e1",
  building_id: "b1",
  contract_id: null,
  fee_id: null,
  status: "approved",
  occurred_on: "2026-11-02",
  label: "Versicherungsfall Wasserschaden",
  quantity: 1,
  unit: "pauschal",
  amount_net: null,
  amount_gross: null,
  vat_rate: 19,
  debtor: "community",
  debtor_contact_id: null,
  source_kind: "manual",
  source_id: null,
  period_key: null,
  settled_via: null,
  rgi_invoice_id: null,
  rgi_invoice_item_id: null,
  settled_on: null,
  dismissed_reason: null,
  notes: "mind. 250 €",
  created_at: "2026-11-02T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
};

describe("Merkposten", () => {
  it("ohne Betrag: bleibt offen und ist nicht abrechenbar", () => {
    const row = rowFromEvent(base);
    expect(row.amountOpen).toBe(true);
    expect(row.unitPriceNet).toBeNull();
    expect(rowNeedsAmount(row)).toBe(true);
    expect(isMemoRow(row)).toBe(true);
    expect(row.hint).toBe("mind. 250 €");
  });

  it("mit Betrag: abrechenbar", () => {
    const row = rowFromEvent({ ...base, amount_net: 250 });
    expect(row.amountOpen).toBe(false);
    expect(row.unitPriceNet).toBe(250);
    expect(rowNeedsAmount(row)).toBe(false);
  });

  it("Betrag nachgetragen (lokal) macht ihn abrechenbar", () => {
    const row = { ...rowFromEvent(base), unitPriceNet: 300 };
    expect(rowNeedsAmount(row)).toBe(false);
  });

  it("abgerechnet: kein Merkposten mehr", () => {
    const row = rowFromEvent({ ...base, amount_net: 250, status: "invoiced" });
    expect(isMemoRow(row)).toBe(false);
  });

  it("Vertragsposten zählt nicht als Merkposten", () => {
    const row = rowFromEvent({ ...base, amount_net: 100, source_kind: "contract_fee", fee_id: "f1" });
    expect(isMemoRow(row)).toBe(false);
  });
});
