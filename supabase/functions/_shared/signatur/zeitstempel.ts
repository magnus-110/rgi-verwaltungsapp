// RFC 3161 – qualifizierter Zeitpunkt über den SHA-256-Fingerabdruck des Gesamt-PDFs.
// Übertragen wird nur der Hash. Die Anfrage (TimeStampReq) wird hier selbst als DER gebaut:
//   TimeStampReq ::= SEQUENCE { version INTEGER (1), messageImprint MessageImprint,
//                               nonce INTEGER, certReq BOOLEAN TRUE }
//   MessageImprint ::= SEQUENCE { hashAlgorithm AlgorithmIdentifier (SHA-256), hashedMessage OCTET STRING }
// Aus der Antwort (TimeStampResp) werden Status, das Token (ContentInfo, base64) und
// genTime (TSTInfo) gelesen; zusätzlich wird geprüft, dass das Token unseren Hash enthält.
import { bytesZuBase64 } from "./basis.ts";

export const DIENSTE = ["http://timestamp.digicert.com", "http://timestamp.sectigo.com"];

// ---------------------------------------------------------------- DER bauen

function laenge(n: number): number[] {
  if (n < 0x80) return [n];
  const b: number[] = [];
  while (n > 0) {
    b.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | b.length, ...b];
}
const tlv = (tag: number, inhalt: number[]) => [tag, ...laenge(inhalt.length), ...inhalt];
const seq = (...teile: number[][]) => tlv(0x30, teile.flat());

function intPositiv(bytes: Uint8Array): number[] {
  const b = Array.from(bytes);
  while (b.length > 1 && b[0] === 0) b.shift();
  if (b[0] & 0x80) b.unshift(0); // als positive Zahl kennzeichnen
  return tlv(0x02, b);
}

// 2.16.840.1.101.3.4.2.1 (SHA-256)
const OID_SHA256 = [0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01];

export function timeStampReq(hash: Uint8Array, nonce: Uint8Array): Uint8Array {
  const req = seq(
    tlv(0x02, [0x01]), // version 1
    seq(seq(OID_SHA256, [0x05, 0x00]), tlv(0x04, Array.from(hash))), // messageImprint
    intPositiv(nonce), // nonce
    [0x01, 0x01, 0xff], // certReq TRUE
  );
  return new Uint8Array(req);
}

// ---------------------------------------------------------------- DER lesen

interface Knoten {
  tag: number;
  start: number; // Beginn des Inhalts
  ende: number; // Ende des Inhalts
  kopf: number; // Beginn des TLV
}

function lies(b: Uint8Array, pos: number): Knoten {
  const kopf = pos;
  const tag = b[pos++];
  if ((tag & 0x1f) === 0x1f) throw new Error("Mehrbyte-Tags nicht unterstützt");
  let len = b[pos++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("Ungültige DER-Länge");
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | b[pos++];
  }
  if (pos + len > b.length) throw new Error("DER-Struktur abgeschnitten");
  return { tag, start: pos, ende: pos + len, kopf };
}

function kinder(b: Uint8Array, k: Knoten): Knoten[] {
  const out: Knoten[] = [];
  let p = k.start;
  while (p < k.ende) {
    const c = lies(b, p);
    out.push(c);
    p = c.ende;
  }
  return out;
}

function generalizedTime(b: Uint8Array, k: Knoten): Date {
  const s = new TextDecoder().decode(b.subarray(k.start, k.ende)); // z. B. 20261103174207Z oder 20261103174207.123Z
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:[.,](\d+))?Z$/);
  if (!m) throw new Error(`Unbekanntes Zeitformat: ${s}`);
  const ms = m[7] ? Number((m[7] + "000").slice(0, 3)) : 0;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms));
}

/** Liest Status, Token und genTime aus einer TimeStampResp. */
export function antwortLesen(b: Uint8Array, erwarteterHash: Uint8Array) {
  const resp = lies(b, 0);
  const [statusInfo, token] = kinder(b, resp);
  const statusInt = kinder(b, statusInfo)[0];
  const status = b[statusInt.ende - 1];
  if (status !== 0 && status !== 1) throw new Error(`Zeitstempeldienst lehnt ab (Status ${status})`);
  if (!token) throw new Error("Antwort ohne Zeitstempel-Token");

  // ContentInfo { contentType OID, [0] SignedData }
  const ci = kinder(b, token);
  const signedData = kinder(b, kinder(b, ci[1])[0]);
  // SignedData { version, digestAlgorithms SET, encapContentInfo SEQUENCE, … }
  const encap = kinder(b, signedData[2]);
  const eContent = kinder(b, encap[1])[0]; // [0] EXPLICIT OCTET STRING
  const tst = lies(b, eContent.start); // TSTInfo SEQUENCE
  const f = kinder(b, tst);
  // TSTInfo { version, policy, messageImprint, serialNumber, genTime, … }
  const imprint = kinder(b, f[2]);
  const hashImToken = b.subarray(imprint[1].start, imprint[1].ende);
  if (hashImToken.length !== erwarteterHash.length || hashImToken.some((x, i) => x !== erwarteterHash[i])) {
    throw new Error("Zeitstempel passt nicht zum Fingerabdruck");
  }
  const genTime = generalizedTime(b, f[4]);
  const tokenBytes = b.subarray(token.kopf, token.ende);
  return { genTime, token: bytesZuBase64(tokenBytes) };
}

/**
 * Holt einen Zeitstempel (DigiCert, Ausweichdienst Sectigo).
 * Gibt null zurück, wenn kein Dienst erreichbar war – der Abschluss läuft trotzdem weiter.
 */
export async function zeitstempelHolen(
  hash: Uint8Array,
): Promise<{ dienst: string; token: string; zeit: Date } | { fehler: string }> {
  const fehler: string[] = [];
  for (const dienst of DIENSTE) {
    try {
      const nonce = crypto.getRandomValues(new Uint8Array(8));
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(dienst, {
        method: "POST",
        headers: { "Content-Type": "application/timestamp-query", Accept: "application/timestamp-reply" },
        body: timeStampReq(hash, nonce),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const r = antwortLesen(bytes, hash);
      return { dienst, token: r.token, zeit: r.genTime };
    } catch (e) {
      fehler.push(`${dienst}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { fehler: fehler.join("; ") };
}
