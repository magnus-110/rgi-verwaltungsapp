// SEPA-Überweisungen (pain.001.001.09) für den Versand per FinTS
// (HKCCM = Sammelüberweisung). Ein Auftrag je Konto, ein Zahlungsblock.
// Gegenstück zu src/lib/sepa.ts (Datei für das Online-Banking).

export interface SepaZahlung {
  empfaenger: string;
  iban: string;
  bic?: string | null;
  betrag: number;
  verwendungszweck: string;
  endToEndId: string;
}

/** Nur Zeichen, die jede deutsche Bank in SEPA-Dateien annimmt. */
export function sepaText(s: string | null | undefined, max: number): string {
  const t = (s ?? "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss").replace(/&/g, "+")
    .replace(/[^A-Za-z0-9/?:().,'+\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max);
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cent = (n: number) => Math.round(n * 100);
export const betragText = (n: number) => (cent(n) / 100).toFixed(2);
export const summeVon = (zs: { betrag: number }[]) => zs.reduce((s, z) => s + cent(z.betrag), 0) / 100;

export function sepaId(prefix: string): string {
  const zeit = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const zufall = Math.random().toString(36).slice(2, 8).toUpperCase();
  return sepaText(`${prefix}-${zeit}-${zufall}`, 35);
}

/**
 * Sammelüberweisung für EIN Konto. Ausführung „sofort" (1999-01-01 ist die
 * im deutschen Zahlungsverkehr übliche Angabe dafür). Einzelbuchung, damit
 * jede Zahlung als eigene Kontobewegung erscheint und ihrer Rechnung
 * zugeordnet werden kann.
 */
export function pain001(opts: { absender: string; kontoInhaber: string; kontoIban: string; zahlungen: SepaZahlung[]; msgId: string; ausfuehrungAm?: string | null }) {
  const summe = summeVon(opts.zahlungen);
  const jetzt = new Date().toISOString().slice(0, 19);
  const tx = opts.zahlungen
    .map(
      (z) =>
        `<CdtTrfTxInf><PmtId><EndToEndId>${xml(sepaText(z.endToEndId, 35) || "NOTPROVIDED")}</EndToEndId></PmtId>` +
        `<Amt><InstdAmt Ccy="EUR">${betragText(z.betrag)}</InstdAmt></Amt>` +
        (z.bic ? `<CdtrAgt><FinInstnId><BICFI>${xml(z.bic.replace(/\s/g, "").toUpperCase())}</BICFI></FinInstnId></CdtrAgt>` : "") +
        `<Cdtr><Nm>${xml(sepaText(z.empfaenger, 70))}</Nm></Cdtr>` +
        `<CdtrAcct><Id><IBAN>${xml(z.iban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></CdtrAcct>` +
        `<RmtInf><Ustrd>${xml(sepaText(z.verwendungszweck, 140))}</Ustrd></RmtInf></CdtTrfTxInf>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09 pain.001.001.09.xsd">` +
    `<CstmrCdtTrfInitn><GrpHdr><MsgId>${xml(opts.msgId)}</MsgId><CreDtTm>${jetzt}</CreDtTm>` +
    `<NbOfTxs>${opts.zahlungen.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum>` +
    `<InitgPty><Nm>${xml(sepaText(opts.absender, 70))}</Nm></InitgPty></GrpHdr>` +
    `<PmtInf><PmtInfId>${xml(sepaText(`${opts.msgId}-1`, 35))}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg>` +
    `<NbOfTxs>${opts.zahlungen.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum>` +
    `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt><Dt>${opts.ausfuehrungAm || "1999-01-01"}</Dt></ReqdExctnDt>` +
    `<Dbtr><Nm>${xml(sepaText(opts.kontoInhaber, 70))}</Nm></Dbtr>` +
    `<DbtrAcct><Id><IBAN>${xml(opts.kontoIban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></DbtrAcct>` +
    `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>` +
    tx +
    `</PmtInf></CstmrCdtTrfInitn></Document>`
  );
}

export type VopErgebnis = "RCVC" | "RVMC" | "RVNM" | "RVNA" | "PDNG";

export interface VopZeile {
  endToEndId: string;
  ergebnis: string;
  name: string | null; // Name, wie wir ihn geschickt haben
  iban: string | null;
  vorschlag: string | null; // Name laut Empfängerbank (bei „nahezu")
}

const tag = (x: string, t: string) => x.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`))?.[1]?.trim() ?? null;
const alle = (x: string, t: string) => x.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>[\\s\\S]*?</(?:\\w+:)?${t}>`, "g")) ?? [];
const ent = (s: string | null) =>
  s == null ? null : s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Ergebnis der Empfängerüberprüfung aus dem pain.002 der Bank. */
export function leseVopBericht(pain002: string): { gesamt: string | null; zeilen: VopZeile[] } {
  const gesamt = tag(pain002, "GrpSts");
  const zeilen = alle(pain002, "TxInfAndSts").map((t) => {
    const ref = tag(t, "OrgnlTxRef") ?? "";
    const cdtr = tag(ref, "Cdtr") ?? "";
    const zusatz = alle(t, "AddtlInf").map((a) => ent(tag(a, "AddtlInf"))).filter(Boolean).join(" ");
    return {
      endToEndId: ent(tag(t, "OrgnlEndToEndId")) ?? "",
      ergebnis: tag(t, "TxSts") ?? "",
      name: ent(tag(cdtr, "Nm")),
      iban: tag(tag(ref, "CdtrAcct") ?? "", "IBAN"),
      vorschlag: zusatz || null,
    };
  });
  return { gesamt, zeilen };
}

export interface SepaEinzug {
  name: string; // Zahlungspflichtiger (Kontoinhaber)
  iban: string;
  bic?: string | null;
  betrag: number;
  verwendungszweck: string;
  endToEndId: string;
  mandatsreferenz: string;
  mandatDatum: string; // JJJJ-MM-TT
}

/**
 * SEPA-Basislastschrift (CORE) als pain.008.001.08 für EIN Konto der WEG.
 * Zahlungsempfänger ist die WEG mit ihrer Gläubiger-ID. Sequenz „RCUR":
 * seit 2016 auch für den ersten Einzug zulässig.
 */
export function pain008(opts: {
  absender: string;
  glaeubigerName: string;
  glaeubigerIban: string;
  glaeubigerId: string;
  einzugAm: string; // JJJJ-MM-TT
  einzuege: SepaEinzug[];
  msgId: string;
}) {
  const summe = summeVon(opts.einzuege);
  const jetzt = new Date().toISOString().slice(0, 19);
  const tx = opts.einzuege
    .map(
      (e) =>
        `<DrctDbtTxInf><PmtId><EndToEndId>${xml(sepaText(e.endToEndId, 35) || "NOTPROVIDED")}</EndToEndId></PmtId>` +
        `<InstdAmt Ccy="EUR">${betragText(e.betrag)}</InstdAmt>` +
        `<DrctDbtTx><MndtRltdInf><MndtId>${xml(sepaText(e.mandatsreferenz, 35))}</MndtId><DtOfSgntr>${e.mandatDatum}</DtOfSgntr></MndtRltdInf></DrctDbtTx>` +
        (e.bic ? `<DbtrAgt><FinInstnId><BICFI>${xml(e.bic.replace(/\s/g, "").toUpperCase())}</BICFI></FinInstnId></DbtrAgt>` : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`) +
        `<Dbtr><Nm>${xml(sepaText(e.name, 70))}</Nm></Dbtr>` +
        `<DbtrAcct><Id><IBAN>${xml(e.iban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></DbtrAcct>` +
        `<RmtInf><Ustrd>${xml(sepaText(e.verwendungszweck, 140))}</Ustrd></RmtInf></DrctDbtTxInf>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08 pain.008.001.08.xsd">` +
    `<CstmrDrctDbtInitn><GrpHdr><MsgId>${xml(opts.msgId)}</MsgId><CreDtTm>${jetzt}</CreDtTm>` +
    `<NbOfTxs>${opts.einzuege.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum>` +
    `<InitgPty><Nm>${xml(sepaText(opts.absender, 70))}</Nm></InitgPty></GrpHdr>` +
    `<PmtInf><PmtInfId>${xml(sepaText(`${opts.msgId}-1`, 35))}</PmtInfId><PmtMtd>DD</PmtMtd><BtchBookg>false</BtchBookg>` +
    `<NbOfTxs>${opts.einzuege.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum>` +
    `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>` +
    `<ReqdColltnDt>${opts.einzugAm}</ReqdColltnDt>` +
    `<Cdtr><Nm>${xml(sepaText(opts.glaeubigerName, 70))}</Nm></Cdtr>` +
    `<CdtrAcct><Id><IBAN>${xml(opts.glaeubigerIban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></CdtrAcct>` +
    `<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt><ChrgBr>SLEV</ChrgBr>` +
    `<CdtrSchmeId><Id><PrvtId><Othr><Id>${xml(opts.glaeubigerId.replace(/\s/g, "").toUpperCase())}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>` +
    tx +
    `</PmtInf></CstmrDrctDbtInitn></Document>`
  );
}

/** Gläubiger-ID prüfen (Aufbau DEkkZZZ + 11 Stellen, Prüfziffer modulo 97). */
export function glaeubigerIdGueltig(id: string | null | undefined): boolean {
  const i = (id ?? "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(i)) return false;
  const kern = i.slice(7) + i.slice(0, 2) + "00";
  let rest = 0;
  for (const ch of kern) {
    const w = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const z of w) rest = (rest * 10 + Number(z)) % 97;
  }
  return String(98 - rest).padStart(2, "0") === i.slice(2, 4);
}
