/** Eine Zeile aus der View v_konten_uebersicht. */
export interface KontoZeile {
  building_id: string;
  iban: string;
  bank_account_id: string | null;
  display_name: string | null;
  bank_name: string | null;
  coa_account_id: string | null;
  saldo: number | string | null;
  saldo_stand: string | null;
  letzter_import: string | null;
  letzte_quelle: string | null;
  offen: number;
  bewegungen: number;
  letzte_bewegung: string | null;
  bank_connection_id?: string | null;
  saldo_bank_am?: string | null;
}

/** Spalten, die die Konten-Seite je Kontobewegung lädt. */
export const BEWEGUNG_SELECT =
  "*, bookings!bank_transactions_booking_id_fkey(id, description, needs_review, ai_confidence_unsicher), " +
  "invoices!bank_transactions_matched_invoice_id_fkey(id, invoice_number, vendor_name), " +
  "booking_templates!bank_transactions_matched_template_id_fkey(id, name)";

export const ZUGEORDNET = ["matched_invoice", "matched_template", "manually_matched"];

/** Name der Gegenseite: bei Ausgängen der Empfänger, bei Eingängen der Zahler. */
export function gegenseite(t: any): string {
  const name = Number(t.amount) < 0 ? t.creditor_name : t.debtor_name;
  if (name) return name;
  // Ohne Namen sind es meist Buchungen der Bank selbst (Abschluss, Entgelte).
  const zweck = String(t.purpose ?? "");
  if (/abschluss|entgelt|gebühr|zinsen|kontof[üu]hrung/i.test(zweck)) return "Bank";
  return zweck ? kuerzen(zweck, 40) : "Ohne Namen";
}

/**
 * Kennzeichen einer Bewegung für die Liste. Es gibt bewusst keine Status
 * wie „prüfen" oder „unklar": entweder ist die Bewegung gebucht (dann steht
 * da, womit), oder sie ist noch nicht gebucht.
 */
export function kennzeichen(t: any): { text: string; art: "rechnung" | "gebucht" | "offen" | "ignoriert" } {
  if (t.match_status === "ignored") return { text: "Ignoriert", art: "ignoriert" };
  if (!t.booked_at) return { text: "noch nicht gebucht", art: "offen" };
  if (t.matched_invoice_id) return { text: "Rechnung verknüpft", art: "rechnung" };
  const vorlage = t.booking_templates?.name;
  if (vorlage) return { text: vorlage, art: "gebucht" };
  const text = t.bookings?.description;
  if (text) return { text: kuerzen(text, 42), art: "gebucht" };
  return { text: "Gebucht", art: "gebucht" };
}

function kuerzen(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Bester Vorschlag der KI mit Begründung (nur wenn einigermaßen sicher). */
export function kiVorschlag(t: any): { grund: string; sicherheit: number } | null {
  const m = t.ai_suggestion?.matches?.[0];
  if (m?.reason && Number(m.score) >= 0.5) return { grund: m.reason, sicherheit: Number(m.score) };
  const hint = t.ai_suggestion?.booking_hint?.explanation;
  if (hint) return { grund: hint, sicherheit: 0 };
  return null;
}

/**
 * Reihenfolge wie im Online-Banking: neuester Buchungstag oben, innerhalb
 * eines Tages so, wie die Bank die Umsätze geliefert hat (Neuestes oben).
 * Ältere Bewegungen ohne gespeicherte Bank-Reihenfolge nach Eingang.
 */
const rang = (t: any) => (t.bank_reihenfolge != null ? Number(t.bank_reihenfolge) : t.created_at ? new Date(t.created_at).getTime() * 1000 : 0);
export function wieBank(a: any, b: any): number {
  if (a.booking_date !== b.booking_date) return a.booking_date < b.booking_date ? 1 : -1;
  const d = rang(b) - rang(a);
  if (d) return d;
  return String(b.id).localeCompare(String(a.id));
}
