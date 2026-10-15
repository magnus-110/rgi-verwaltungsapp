// Mietkontrolle: Soll je Monat, Zuordnung der Zahlungen, Rückstand und
// Mahnstufe – reine Rechenregeln ohne Datenbank (getestet in miete.test.ts).
//
// Rechtlicher Rahmen (Grundlage der Regeln, keine Rechtsberatung):
// - Miete fällig bis zum 3. Werktag (§ 556b Abs. 1 BGB); Samstag zählt dabei
//   nicht als Werktag (BGH, Urteil vom 13.07.2010, VIII ZR 129/09).
// - Verzug ohne Mahnung, weil der Termin feststeht (§ 286 Abs. 2 Nr. 1 BGB).
// - Zwei Monatsmieten Rückstand können eine fristlose Kündigung tragen
//   (§ 543 Abs. 2 Nr. 3 BGB) – die App legt dann nur eine Aufgabe an.

export interface Kostenzeile {
  cost_type: string;
  amount: number;
  interval: string | null; // monatlich | quartal | jaehrlich | einmalig
  valid_from: string | null;
  valid_to: string | null;
}

export interface Zahlung {
  id: string;
  datum: string; // JJJJ-MM-TT
  betrag: number;
  text?: string;
}

export type MonatsStatus = "puenktlich" | "verspaetet" | "zu_wenig" | "offen" | "kein_soll";

export interface Monat {
  monat: string; // JJJJ-MM
  faellig: string; // JJJJ-MM-TT
  soll: number;
  bezahlt: number;
  bezahltAm: string | null; // Tag, an dem der Monat voll bezahlt war
  status: MonatsStatus;
}

export interface Ergebnis {
  monate: Monat[];
  sollMonat: number; // aktuelles monatliches Soll
  summeSoll: number;
  summeIst: number;
  rueckstand: number; // > 0: offen
  guthaben: number; // Überzahlung
  offeneMonate: Monat[];
  aeltesteFaelligkeit: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Monatlicher Betrag einer Kostenzeile in einem bestimmten Monat. */
export function sollImMonat(k: Kostenzeile, monat: string): number {
  const erster = `${monat}-01`;
  const letzter = letzterTag(monat);
  const betrag = Number(k.amount) || 0;
  if (k.interval === "einmalig") {
    // einmalige Forderung (z. B. Nachzahlung) im Monat ihres Beginns
    return k.valid_from && k.valid_from >= erster && k.valid_from <= letzter ? betrag : 0;
  }
  if ((k.valid_from && k.valid_from > erster) || (k.valid_to && k.valid_to < erster)) return 0;
  if (k.interval === "quartal") return betrag / 3;
  if (k.interval === "jaehrlich") return betrag / 12;
  return betrag;
}

export function letzterTag(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
}

/** 3. Werktag eines Monats (Mo–Fr; Samstag zählt für die Mietzahlung nicht). */
export function dritterWerktag(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, 1));
  let n = 0;
  for (;;) {
    const wt = d.getUTCDay();
    if (wt !== 0 && wt !== 6) n++;
    if (n === 3) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function monateZwischen(vonMonat: string, bisMonat: string): string[] {
  const out: string[] = [];
  let [j, m] = vonMonat.split("-").map(Number);
  const [bj, bm] = bisMonat.split("-").map(Number);
  while (j < bj || (j === bj && m <= bm)) {
    out.push(`${j}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      j++;
    }
  }
  return out;
}

/**
 * Abgleich nach festen Regeln: Zahlungen werden dem ältesten offenen Monat
 * zugeordnet (eine Überzahlung gleicht also frühere Rückstände aus).
 */
export function abgleich(opts: { kosten: Kostenzeile[]; zahlungen: Zahlung[]; vonMonat: string; bisMonat: string; heute: string; toleranz?: number }): Ergebnis {
  const tol = opts.toleranz ?? 1;
  const monate: Monat[] = monateZwischen(opts.vonMonat, opts.bisMonat).map((monat) => {
    const soll = r2(opts.kosten.reduce((s, k) => s + sollImMonat(k, monat), 0));
    return { monat, faellig: dritterWerktag(monat), soll, bezahlt: 0, bezahltAm: null, status: soll > 0 ? "offen" : "kein_soll" };
  });
  const zahlungen = [...opts.zahlungen].sort((a, b) => a.datum.localeCompare(b.datum));
  let rest = 0;
  for (const z of zahlungen) {
    rest = r2(rest + z.betrag);
    for (const mo of monate) {
      if (rest <= 0) break;
      const fehlt = r2(mo.soll - mo.bezahlt);
      if (fehlt <= 0) continue;
      const teil = Math.min(fehlt, rest);
      mo.bezahlt = r2(mo.bezahlt + teil);
      rest = r2(rest - teil);
      if (mo.soll - mo.bezahlt <= tol && !mo.bezahltAm) mo.bezahltAm = z.datum;
    }
  }
  for (const mo of monate) {
    if (mo.soll <= 0) continue;
    if (mo.soll - mo.bezahlt <= tol) mo.status = mo.bezahltAm && mo.bezahltAm <= mo.faellig ? "puenktlich" : "verspaetet";
    else mo.status = mo.bezahlt > 0 ? "zu_wenig" : "offen";
  }
  // Monate, deren Fälligkeit noch nicht erreicht ist, zählen nicht als offen
  const faellige = monate.filter((m) => m.faellig < opts.heute || m.status === "puenktlich" || m.status === "verspaetet");
  const summeSoll = r2(faellige.reduce((s, m) => s + m.soll, 0));
  const summeIst = r2(zahlungen.reduce((s, z) => s + z.betrag, 0));
  const offen = faellige.filter((m) => m.status === "offen" || m.status === "zu_wenig");
  const rueckstand = r2(offen.reduce((s, m) => s + (m.soll - m.bezahlt), 0));
  const aktuell = monate.at(-1);
  return {
    monate,
    sollMonat: aktuell ? aktuell.soll : 0,
    summeSoll,
    summeIst,
    rueckstand: rueckstand > tol ? rueckstand : 0,
    guthaben: rest > tol ? rest : 0,
    offeneMonate: offen,
    aeltesteFaelligkeit: offen[0]?.faellig ?? null,
  };
}

export type Stufe = "erinnerung" | "mahnung1" | "mahnung2";

/**
 * Nächste Mahnstufe nach den Mahnregeln:
 * - Erinnerung {erinnerungNach} Tage nach Fälligkeit des ältesten offenen Monats
 * - 1. Mahnung {abstand} Tage nach der Erinnerung, 2. Mahnung {abstand} Tage später
 * - ab zwei Monatsmieten Rückstand sofort mindestens 1. Mahnung + „Kündigung prüfen"
 * Gibt null zurück, wenn nichts zu tun ist (oder die 2. Mahnung schon raus ist).
 */
export function naechsteStufe(opts: {
  ergebnis: Ergebnis;
  heute: string;
  letzteVersendet?: { stufe: Stufe; am: string } | null;
  erinnerungNach?: number;
  abstand?: number;
}): { stufe: Stufe; geplantAm: string; kuendigungPruefen: boolean } | null {
  const e = opts.ergebnis;
  if (e.rueckstand <= 0 || !e.aeltesteFaelligkeit) return null;
  const erinnerungNach = opts.erinnerungNach ?? 5;
  const abstand = opts.abstand ?? 14;
  const zweiMieten = e.sollMonat > 0 && e.rueckstand >= 2 * e.sollMonat - 0.01;
  const l = opts.letzteVersendet;

  let stufe: Stufe;
  let geplantAm: string;
  if (!l) {
    stufe = zweiMieten ? "mahnung1" : "erinnerung";
    geplantAm = zweiMieten ? opts.heute : plusTage(e.aeltesteFaelligkeit, erinnerungNach);
  } else if (l.stufe === "erinnerung") {
    stufe = "mahnung1";
    geplantAm = zweiMieten ? opts.heute : plusTage(l.am, abstand);
  } else if (l.stufe === "mahnung1") {
    stufe = "mahnung2";
    geplantAm = plusTage(l.am, abstand);
  } else {
    return null; // nach der 2. Mahnung entscheidet ein Mensch
  }
  if (geplantAm < opts.heute) geplantAm = opts.heute;
  return { stufe, geplantAm, kuendigungPruefen: zweiMieten };
}

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const monatsName = (monat: string) => `${MONATSNAMEN[Number(monat.slice(5, 7)) - 1]} ${monat.slice(0, 4)}`;
const euro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const datumDe = (iso: string) => iso.split("-").reverse().join(".");

/** Standardschreiben je Stufe (Betreff, Text, Posten). */
export function schreiben(opts: { stufe: Stufe; anrede: string; offen: Monat[]; frist: string; objekt: string }) {
  const posten = opts.offen.map((m) => ({
    text: m.bezahlt > 0 ? `Miete ${monatsName(m.monat)} (Differenz)` : `Miete ${monatsName(m.monat)}`,
    betrag: r2(m.soll - m.bezahlt),
  }));
  const summe = r2(posten.reduce((s, p) => s + p.betrag, 0));
  const zeitraum = opts.offen.length > 1 ? `${monatsName(opts.offen[0].monat)} bis ${monatsName(opts.offen.at(-1)!.monat)}` : monatsName(opts.offen[0]?.monat ?? "");
  const titel = { erinnerung: "Zahlungserinnerung", mahnung1: "1. Mahnung", mahnung2: "2. Mahnung" }[opts.stufe];
  const einleitung =
    opts.stufe === "erinnerung"
      ? "bei der Durchsicht unserer Unterlagen haben wir festgestellt, dass folgende Beträge noch offen sind:"
      : opts.stufe === "mahnung1"
        ? "trotz Fälligkeit konnten wir für folgende Beträge keinen vollständigen Zahlungseingang feststellen. Wir weisen darauf hin, dass Sie sich in Verzug befinden und Verzugszinsen in Höhe von 5 Prozentpunkten über dem Basiszinssatz anfallen können (§ 288 Abs. 1 BGB):"
        : "leider sind folgende Beträge trotz unserer Mahnung weiterhin offen. Bitte gleichen Sie den Rückstand umgehend aus. Sie befinden sich in Verzug; es können Verzugszinsen in Höhe von 5 Prozentpunkten über dem Basiszinssatz anfallen (§ 288 Abs. 1 BGB):";
  const betreff = `${titel} – ${opts.objekt} – ${zeitraum}`;
  const zeilen = posten.map((p) => `${p.text}: ${euro(p.betrag)}`).join("\n");
  const text =
    `${opts.anrede},\n\n${einleitung}\n\n${zeilen}\n\nOffen: ${euro(summe)}\n\n` +
    `Bitte überweisen Sie den Betrag bis zum ${datumDe(opts.frist)}. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.\n\n` +
    `Bei Fragen erreichen Sie uns gerne.\n\nMit freundlichen Grüßen\nRGI Immobilien GmbH & Co. KG`;
  return { betreff, text, posten, summe, titel };
}
