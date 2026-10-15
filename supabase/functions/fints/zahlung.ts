// FinTS: Sammelüberweisung (HKCCM) mit Empfängerüberprüfung (VoP) und
// Freigabe in der Banking-App. Phase 3, 15.10.2026.
//
// lib-fints kennt weder HKCCM noch die Empfängerüberprüfung. Die fehlenden
// Segmente werden hier beschrieben und in die Segmentliste der Bibliothek
// eingetragen. Der Ablauf folgt aufgezeichneten Nachrichten des
// VR-Rechenzentrums (Atruvia) aus phpFinTS (MIT) und der Spezifikation
// „FinTS 3.0 Messages Geschäftsvorfälle VOP 1.01":
//
//   1. HKCCM + HKTAN(4) + HKVPP          → Bank prüft die Empfängernamen
//   2. HKVPP mit Polling-ID (wiederholt)  → Ergebnis als pain.002
//   3a. alles passt, Bank will keine Bestätigung (3091) → gleich HITAN
//   3b. Bank will Bestätigung (3090/3945) → HKCCM + HKVPA + HKTAN(4)
//   4. HKTAN(S) wiederholt, bis die Freigabe in der App erfolgt ist
//
// Alles läuft in EINEM Dialog. Weicht ein Name ab, wird der Dialog beendet
// und das Ergebnis gezeigt; bestätigt der Mensch, beginnt ein neuer Dialog,
// der nur dann weiterläuft, wenn das neue Ergebnis dem bestätigten gleicht.

// @ts-ignore
import { CustomerMessage, Dialog } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/index.js";
// @ts-ignore
import { getSegmentDefinition } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/segments/registry.js";
// @ts-ignore
import { SegmentDefinition } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/segmentDefinition.js";
// @ts-ignore
import { AlphaNumeric } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/AlphaNumeric.js";
// @ts-ignore
import { Binary } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/Binary.js";
// @ts-ignore
import { Numeric } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/Numeric.js";
// @ts-ignore
import { YesNo } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/YesNo.js";
// @ts-ignore
import { Dat } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/Dat.js";
// @ts-ignore
import { Time } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataElements/Time.js";
// @ts-ignore
import { DataGroup } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataGroups/DataGroup.js";
// @ts-ignore
import { InternationalAccountGroup } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataGroups/InternationalAccount.js";
// @ts-ignore
import { MoneyGroup } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/dataGroups/Money.js";
// @ts-ignore
import { internationalAccount } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/accountDescriptor.js";
import { leseVopBericht, type VopZeile } from "../_shared/sepa.ts";

const PAIN001 = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09";
const PAIN008 = "urn:iso:std:iso:20022:tech:xsd:pain.008.001.08";
const PAIN002 = "urn:iso:std:iso:20022:tech:xsd:pain.002.001.10";

// ── Segmente ────────────────────────────────────────────────────────────────

/** SEPA-Sammelüberweisung */
class HKCCM extends SegmentDefinition {
  static Id = "HKCCM";
  version = 1;
  constructor() {
    super("HKCCM");
  }
  elements = [
    new InternationalAccountGroup("account", 1, 1),
    new MoneyGroup("sum", 0, 1),
    new YesNo("singleBooking", 0, 1),
    new AlphaNumeric("sepaDescriptor", 1, 1, 256),
    new Binary("painMessage", 1, 1),
  ];
}

/** SEPA-Sammellastschrift (terminiert) – gleicher Aufbau wie HKCCM */
class HKDME extends SegmentDefinition {
  version = 2;
  constructor() {
    super("HKDME");
  }
  elements = [
    new InternationalAccountGroup("account", 1, 1),
    new MoneyGroup("sum", 0, 1),
    new YesNo("singleBooking", 0, 1),
    new AlphaNumeric("sepaDescriptor", 1, 1, 256),
    new Binary("painMessage", 1, 1),
  ];
}

/** Namensabgleich Prüfauftrag */
class HKVPP extends SegmentDefinition {
  version = 1;
  constructor() {
    super("HKVPP");
  }
  elements = [
    new DataGroup("reports", [new AlphaNumeric("psrd", 1, 99, 256)], 1, 1),
    new Binary("pollingId", 0, 1),
    new Numeric("maxEntries", 0, 1, 4),
    new AlphaNumeric("aufsetzpunkt", 0, 1, 35),
  ];
}

/** Namensabgleich Prüfergebnis */
class HIVPP extends SegmentDefinition {
  version = 1;
  constructor() {
    super("HIVPP");
  }
  elements = [
    new Binary("vopId", 0, 1),
    new DataGroup("vopIdValidUntil", [new Dat("date", 1, 1), new Time("time", 1, 1)], 0, 1),
    new Binary("pollingId", 0, 1),
    new AlphaNumeric("reportDescriptor", 0, 1, 256),
    new Binary("report", 0, 1),
    new DataGroup(
      "single",
      [
        new AlphaNumeric("iban", 0, 1, 34),
        new AlphaNumeric("ibanInfo", 0, 1, 140),
        new AlphaNumeric("closeMatchName", 0, 1, 140),
        new AlphaNumeric("otherId", 0, 1, 256),
        new AlphaNumeric("result", 0, 1, 4),
        new AlphaNumeric("naReason", 0, 1, 256),
      ],
      0,
      1,
    ),
    new AlphaNumeric("notice", 0, 1, 65535),
    new Numeric("waitSeconds", 0, 1, 1),
  ];
}

/** Namensabgleich Ausführungsauftrag */
class HKVPA extends SegmentDefinition {
  version = 1;
  constructor() {
    super("HKVPA");
  }
  elements = [new Binary("vopId", 1, 1)];
}

let registriert = false;
/** Die Segmente in die (nicht exportierte) Segmentliste von lib-fints eintragen. */
function segmenteEintragen() {
  if (registriert) return;
  let liste: Map<string, unknown> | null = null;
  const original = Map.prototype.get;
  Map.prototype.get = function (k: unknown) {
    if (k === "__rgi_probe__") liste = this as Map<string, unknown>;
    return original.call(this, k);
  };
  try {
    getSegmentDefinition("__rgi_probe__");
  } finally {
    Map.prototype.get = original;
  }
  if (!liste) throw new Error("Segmentliste von lib-fints nicht gefunden");
  for (const d of [new HKCCM(), new HKDME(), new HKVPP(), new HIVPP(), new HKVPA()]) (liste as Map<string, unknown>).set((d as any).id, d);
  registriert = true;
}

// ── Ablauf ──────────────────────────────────────────────────────────────────

export interface ZahlungErgebnis {
  status: "gesendet" | "pruefung" | "fehler" | "unklar";
  fehler?: string;
  vop?: { gesamt: string | null; zeilen: VopZeile[]; hinweis: string | null };
  antworten: { code: number; text: string }[];
}

interface Optionen {
  config: any;
  /** Überweisung (HKCCM, mit Empfängerüberprüfung) oder Lastschrift (HKDME) */
  art?: "ueberweisung" | "lastschrift";
  konto: any; // Eintrag aus upd.bankAccounts
  pain: string;
  summe: number;
  /** vom Menschen bestätigtes Prüfergebnis je End-to-End-ID */
  akzeptiert?: Record<string, string> | null;
  /** spätester Zeitpunkt (ms) für das Warten auf die Freigabe */
  bis: number;
  warteAufFreigabeMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sammelueberweisung(o: Optionen): Promise<ZahlungErgebnis> {
  segmenteEintragen();
  const config = o.config;
  const lastschrift = o.art === "lastschrift";
  const AUFTRAG = lastschrift ? "HKDME" : "HKCCM";
  const tm = config.selectedTanMethod;
  if (!tm?.isDecoupled) throw new Error("Für Zahlungen wird ein TAN-Verfahren mit Freigabe in der App benötigt.");

  const dialog: any = new Dialog(config, false);
  const antworten: { code: number; text: string; bezug?: string }[] = [];
  type Antwort = { code: number; text: string; params?: string[] };
  const fehlerText = (a: Antwort[]) =>
    a.filter((x) => x.code >= 9000 && x.code !== 9050 && x.code !== 9800).map((x) => x.text).join(" · ");

  // 1) Dialog eröffnen (wie lib-fints selbst)
  {
    const nachricht = dialog.createCurrentCustomerMessage();
    const antwort = await dialog.httpClient.sendMessage(nachricht);
    const r = dialog.currentInteraction.handleClientResponse(antwort);
    dialog.dialogId = r.dialogId;
    const a: Antwort[] = antwort.getBankAnswers();
    antworten.push(...a.map((x) => ({ code: x.code, text: x.text, bezug: "Anmeldung" })));
    if (!r.success) return { status: "fehler", fehler: fehlerText(a) || "Die Bank hat die Anmeldung abgelehnt.", antworten };
    if (r.requiresTan) {
      return { status: "fehler", fehler: "Die Bank verlangt schon für die Anmeldung eine Freigabe. Bitte zuerst „Jetzt abrufen“ ausführen.", antworten };
    }
    dialog.currentInteractionIndex++;
    dialog.isInitialized = true;
  }

  let beendet = false;
  /**
   * Eine Nachricht senden. Die Rückmeldungen der Bank (HIRMS) beziehen sich
   * jeweils auf ein Segment der Anfrage – `fuer("HKCCM")` liefert nur die zum
   * Auftrag, `alle` auch die zur Nachricht insgesamt (HIRMG).
   */
  const senden = async (segmente: any[]) => {
    dialog.lastMessageNumber++;
    const m = new CustomerMessage(dialog.dialogId, dialog.lastMessageNumber);
    m.sign(config.countryCode, config.bankId, config.userId, config.pin, config.bankingInformation.systemId, config.tanMethodId);
    segmente.forEach((x) => m.addSegment(x));
    const antwort = await dialog.httpClient.sendMessage(m); // vergibt dabei die Segmentnummern
    const nr = new Map<string, number>();
    for (const x of m.segments) if (!nr.has(x.header.segId)) nr.set(x.header.segId, x.header.segNr);
    const name = new Map([...nr.entries()].map(([k, v]) => [v, k]));
    const alle: Antwort[] = [];
    const je = new Map<string, Antwort[]>();
    for (const g of antwort.findAllSegments("HIRMG")) {
      for (const x of g.answers ?? []) alle.push({ code: x.code, text: x.text, params: x.params });
    }
    for (const r of antwort.findAllSegments("HIRMS")) {
      const bezug = name.get(r.header.refSegNr) ?? "?";
      for (const x of r.answers ?? []) {
        const e = { code: x.code, text: x.text, params: x.params };
        alle.push(e);
        je.set(bezug, [...(je.get(bezug) ?? []), e]);
      }
    }
    alle.forEach((x) => antworten.push({ code: x.code, text: x.text }));
    const fuer = (segId: string) => je.get(segId) ?? [];
    return {
      antwort,
      alle,
      fuer,
      hat: (c: number) => alle.some((x) => x.code === c),
      hatFuer: (segId: string, c: number) => fuer(segId).some((x) => x.code === c),
    };
  };
  const beenden = async () => {
    if (beendet) return;
    beendet = true;
    try {
      await senden([{ header: { segId: "HKEND", segNr: 0, version: 1 }, dialogId: dialog.dialogId }]);
    } catch {
      /* egal */
    }
  };

  const version = lastschrift ? Math.min(2, config.getMaxSupportedTransactionVersion("HKDME") ?? 1) : 1;
  const hkccm = {
    header: { segId: AUFTRAG, segNr: 0, version },
    account: internationalAccount(config, config.getBankAccount(o.konto)),
    sum: { value: o.summe, currency: "EUR" },
    singleBooking: true,
    sepaDescriptor: lastschrift ? PAIN008 : PAIN001,
    painMessage: o.pain,
  };
  const hktan = (prozess: "4" | "S", ref?: string) => ({
    header: { segId: "HKTAN", segNr: 0, version: tm.version },
    tanProcess: prozess,
    segId: AUFTRAG,
    orderRef: ref,
    nextTan: prozess === "S" ? false : undefined,
    tanMedia: tanMedium(config),
  });
  const hkvpp = (pollingId?: string, aufsetzpunkt?: string) => ({
    header: { segId: "HKVPP", segNr: 0, version: 1 },
    reports: [PAIN002],
    pollingId,
    aufsetzpunkt,
  });
  /** Auftrag erledigt: 0020 zum Auftrag (bzw. zur Freigabe) und keine offene Freigabe. */
  const offeneFreigabe = (antwort: any) => {
    const h = antwort.findSegment("HITAN");
    return h?.orderReference && h.orderReference !== "noref" ? String(h.orderReference) : null;
  };

  try {
    // 2) Auftrag – Überweisungen mit Empfängerüberprüfung, Lastschriften ohne
    let s = await senden(lastschrift ? [hkccm, hktan("4")] : [hkccm, hktan("4"), hkvpp()]);
    if (fehlerText(s.alle)) return { status: "fehler", fehler: fehlerText(s.alle), antworten };
    let bestaetigung = s.hat(3945) || s.hat(3090);
    if (s.hat(3091)) bestaetigung = false;
    if (s.hatFuer(AUFTRAG, 20) && !offeneFreigabe(s.antwort)) {
      const h = s.antwort.findSegment("HIVPP");
      return { status: "gesendet", vop: h?.report ? { ...leseVopBericht(String(h.report)), hinweis: null } : undefined, antworten };
    }

    // 3) auf das Prüfergebnis warten
    let hivpp = s.antwort.findSegment("HIVPP");
    let freigabeRef = offeneFreigabe(s.antwort);
    for (let i = 0; i < 15 && !freigabeRef && hivpp?.pollingId && !hivpp.report && !hivpp.single?.result; i++) {
      await sleep(Math.max(Number(hivpp.waitSeconds) || 2, 1) * 1000);
      const auf = s.alle.find((x) => x.code === 3040)?.params?.[0];
      s = await senden([hkvpp(hivpp.pollingId, auf)]);
      if (fehlerText(s.alle)) return { status: "fehler", fehler: fehlerText(s.alle), antworten };
      if (s.hat(3945) || s.hat(3090)) bestaetigung = true;
      if (s.hat(3091)) bestaetigung = false;
      hivpp = s.antwort.findSegment("HIVPP") ?? hivpp;
      freigabeRef = offeneFreigabe(s.antwort);
    }

    // Ergebnis lesen (Bericht als pain.002 oder Einzelergebnis)
    let vop: ZahlungErgebnis["vop"] | undefined;
    if (hivpp?.report) {
      vop = { ...leseVopBericht(String(hivpp.report)), hinweis: hivpp.notice ?? null };
    } else if (hivpp?.single?.result) {
      vop = {
        gesamt: hivpp.single.result,
        zeilen: [{
          endToEndId: "*",
          ergebnis: hivpp.single.result,
          name: null,
          iban: hivpp.single.iban ?? null,
          vorschlag: hivpp.single.closeMatchName ?? hivpp.single.naReason ?? null,
        }],
        hinweis: hivpp.notice ?? null,
      };
    }

    // 4) Bestätigung der Empfängerüberprüfung, falls die Bank sie will
    if (!freigabeRef) {
      if (!bestaetigung || !vop) {
        return {
          status: "fehler",
          fehler: vop ? "Die Bank hat weder eine Freigabe angefordert noch die Überweisung bestätigt." : "Die Empfängerüberprüfung hat kein Ergebnis geliefert. Bitte später noch einmal versuchen.",
          vop,
          antworten,
        };
      }
      const alleOk = vop.zeilen.length > 0 && vop.zeilen.every((z) => z.ergebnis === "RCVC");
      const wieBestaetigt = !!o.akzeptiert && vop.zeilen.length > 0 && vop.zeilen.every((z) => o.akzeptiert![z.endToEndId] === z.ergebnis);
      if (!alleOk && !wieBestaetigt) {
        await beenden();
        return { status: "pruefung", vop, antworten };
      }
      if (!hivpp?.vopId) return { status: "fehler", fehler: "Die Bank hat keine Prüf-Kennung (VOP-ID) geliefert.", vop, antworten };
      s = await senden([hkccm, { header: { segId: "HKVPA", segNr: 0, version: 1 }, vopId: hivpp.vopId }, hktan("4")]);
      if (fehlerText(s.alle)) return { status: "fehler", fehler: fehlerText(s.alle), vop, antworten };
      freigabeRef = offeneFreigabe(s.antwort);
      if (!freigabeRef && s.hatFuer(AUFTRAG, 20)) return { status: "gesendet", vop, antworten };
      if (!freigabeRef) return { status: "unklar", fehler: "Die Bank hat keine Freigabe angefordert. Bitte im Online-Banking nachsehen.", vop, antworten };
    }

    // 5) Freigabe in der App abwarten
    const ende = Math.min(Date.now() + o.warteAufFreigabeMs, o.bis);
    await sleep(Math.max(tm.decoupled?.waitingSecondsBeforeFirstStatusRequest ?? 0, 3) * 1000);
    while (Date.now() < ende) {
      s = await senden([hktan("S", freigabeRef)]);
      if (fehlerText(s.alle)) return { status: "fehler", fehler: fehlerText(s.alle), vop, antworten };
      if (!s.hat(3956) && (s.hatFuer("HKTAN", 20) || s.hatFuer(AUFTRAG, 20) || s.hat(900))) {
        return { status: "gesendet", vop, antworten };
      }
      await sleep(Math.max(tm.decoupled?.waitingSecondsBetweenStatusRequests ?? 0, 2) * 1000);
    }
    return {
      status: "unklar",
      fehler: "Die Freigabe in der App kam nicht rechtzeitig. Falls Sie sie danach noch bestätigt haben: bitte im Online-Banking nachsehen, ob die Überweisung ausgeführt wurde.",
      vop,
      antworten,
    };
  } finally {
    await beenden();
  }
}

function tanMedium(config: any): string | undefined {
  const anf = config.selectedTanMethod?.tanMediaRequirement ?? 0;
  if (anf === 0) return undefined; // nicht erlaubt
  if (anf === 2) return config.tanMediaName ?? "default"; // erforderlich
  return config.tanMediaName;
}
