/**
 * SEPA-Überweisungen als Datei (pain.001.001.09) – so, wie sie das
 * Online-Banking von VR Bank und Sparkasse als Sammelauftrag annimmt.
 *
 * Eine Datei je Bank; darin ein Zahlungsblock (PmtInf) je Konto. Im
 * Online-Banking hochladen und mit EINER TAN freigeben.
 */

export interface SepaZahlung {
  empfaenger: string;
  iban: string;
  bic?: string | null;
  betrag: number;
  verwendungszweck: string;
  endToEndId: string;
}

export interface SepaBlock {
  kontoInhaber: string;
  kontoIban: string;
  ausfuehrungAm: string; // JJJJ-MM-TT
  zahlungen: SepaZahlung[];
}

/** IBAN nach ISO 13616 prüfen (Länge grob, Prüfsumme modulo 97). */
export function ibanGueltig(iban: string | null | undefined): boolean {
  const i = (iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
  if (i.startsWith("DE") && i.length !== 22) return false;
  const umgestellt = i.slice(4) + i.slice(0, 4);
  let rest = 0;
  for (const ch of umgestellt) {
    const wert = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
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

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cent = (n: number) => Math.round(n * 100);
const betrag = (n: number) => (cent(n) / 100).toFixed(2);
/** Summe in ganzen Cent, damit Kontrollsumme und Einzelbeträge exakt passen. */
const summeVon = (zs: SepaZahlung[]) => zs.reduce((s, z) => s + cent(z.betrag), 0) / 100;

export function sepaId(prefix: string): string {
  const zeit = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const zufall = Math.random().toString(36).slice(2, 8).toUpperCase();
  return sepaText(`${prefix}-${zeit}-${zufall}`, 35);
}

export function erzeugePain001(opts: { absender: string; bloecke: SepaBlock[]; msgId?: string }): string {
  const alle = opts.bloecke.flatMap((b) => b.zahlungen);
  const summe = summeVon(alle);
  const jetzt = new Date().toISOString().slice(0, 19);
  const msgId = opts.msgId ?? sepaId("RGI");

  const bloecke = opts.bloecke
    .map((b, bi) => {
      const s = summeVon(b.zahlungen);
      const tx = b.zahlungen
        .map(
          (z) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(sepaText(z.endToEndId, 35) || "NOTPROVIDED")}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betrag(z.betrag)}</InstdAmt></Amt>${
            z.bic ? `\n        <CdtrAgt><FinInstnId><BICFI>${xml(z.bic.replace(/\s/g, "").toUpperCase())}</BICFI></FinInstnId></CdtrAgt>` : ""
          }
        <Cdtr><Nm>${xml(sepaText(z.empfaenger, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${xml(z.iban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(z.verwendungszweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
        )
        .join("\n");
      return `    <PmtInf>
      <PmtInfId>${xml(sepaText(`${msgId}-${bi + 1}`, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${b.zahlungen.length}</NbOfTxs>
      <CtrlSum>${betrag(s)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${b.ausfuehrungAm}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${xml(sepaText(b.kontoInhaber, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${xml(b.kontoIban.replace(/\s/g, "").toUpperCase())}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${tx}
    </PmtInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xml(msgId)}</MsgId>
      <CreDtTm>${jetzt}</CreDtTm>
      <NbOfTxs>${alle.length}</NbOfTxs>
      <CtrlSum>${betrag(summe)}</CtrlSum>
      <InitgPty><Nm>${xml(sepaText(opts.absender, 70))}</Nm></InitgPty>
    </GrpHdr>
${bloecke}
  </CstmrCdtTrfInitn>
</Document>
`;
}

/** Nächster Bankarbeitstag (Mo–Fr, ohne Feiertage) ab heute. */
export function naechsterBankarbeitstag(ab = new Date()): string {
  const d = new Date(ab);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
