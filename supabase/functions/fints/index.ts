// FinTS: Kontoumsätze direkt bei der Bank abholen (Phase 2, 15.10.2026)
//
// Aktionen (Body { aktion, ... }):
//  - "anlegen"        { blz, anmeldename, kundenId?, pin }      → Zugang speichern, TAN-Verfahren laden
//  - "tan_waehlen"    { id, tanMethodId }                        → Verfahren wählen, Freigabe in der App,
//                                                                  danach sind die Konten bekannt
//  - "abrufen"        { id?, ab?, iban? }                                  → Umsätze holen (von Hand; wartet bei
//                                                                  Bedarf auf die Freigabe in der App)
//  - "salden"         { id }                                     → Kontostände aller sichtbaren Konten
//  - "konto_setzen"   { id, iban, ausgeblendet?, rgi? }           → Konto ausblenden / RGI intern
//  - "zahlung_senden" { runId, akzeptiert? }                   → Sammelüberweisung eines Zahllaufs per TAN
//  - "pin_aendern"    { id, pin }
//  - "entfernen"      { id }
//  - "zeitplan"       { token }                                  → pg_cron 06:00/13:00, ohne TAN
//
// Die PIN liegt im Supabase Vault (fints_pin_setzen / fints_pin_holen) und
// verlässt diese Funktion nie. Geld bewegt sie nur mit Freigabe in der
// Banking-App (zahlung_senden).
//
// Bibliothek: lib-fints (LGPL-2.1) – über jsDelivr eingebunden, weil die
// internen Klassen (Abfragen je Konto) im npm-Paket nicht exportiert sind.

import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
// @ts-ignore – reines JavaScript vom CDN
import { Dialog, FinTSClient, FinTSConfig } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/index.js";
// @ts-ignore
import { StatementInteractionCAMT } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/interactions/statementInteractionCAMT.js";
// @ts-ignore
import { BalanceInteraction } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/interactions/balanceInteraction.js";
// @ts-ignore
import { HICAZ } from "https://cdn.jsdelivr.net/npm/lib-fints@1.5.2/dist/segments/HICAZ.js";
import { requireAdmin } from "../_shared/require-admin.ts";
import { glaeubigerIdGueltig, pain001, pain008, sepaId, summeVon } from "../_shared/sepa.ts";
import { sammelueberweisung } from "./zahlung.ts";
import {
  addHashes,
  bestandAbziehen,
  camtBloecke,
  deduplicateTransactions,
  leseKopf,
  matchTransactions,
  parseEntries,
} from "../_shared/camt.ts";

// lib-fints erwartet Node-Buffer als globales Objekt
(globalThis as any).Buffer = Buffer;

const PRODUKT_ID = "7C97B8D6E011C6019EE08166C"; // FinTS-Registrierung RGI, erteilt 13.10.2026
const PRODUKT_VERSION = "1.0";
const TAN_WARTEZEIT_MS = 100_000; // so lange wartet ein Aufruf höchstens auf EINE Freigabe in der App
const GESAMT_MS = 135_000; // länger darf ein Aufruf insgesamt nicht auf Freigaben warten
// Umsätze der letzten 90 Tage gibt die Bank ohne neue TAN heraus (PSD2) –
// deshalb nie weiter als 85 Tage zurück.
const MAX_TAGE_ZURUECK = 85;
let START = Date.now(); // Beginn der aktuellen Anfrage

const BANKEN: Record<string, { name: string; url: string }> = {
  "72090000": { name: "VR Bank Augsburg-Ostallgäu", url: "https://fints1.atruvia.de/cgi-bin/hbciservlet" },
  "73350000": { name: "Sparkasse Allgäu", url: "https://banking-by1.s-fints-pt-by.de/fints30" },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cleanIban = (i: string | null | undefined) => (i ?? "").replace(/\s+/g, "").toUpperCase();
const heute = () => new Date().toISOString().slice(0, 10);

/** Umsätze im CAMT-Format holen und die XML-Dokumente unverändert behalten. */
class RohCamt extends StatementInteractionCAMT {
  dokumente: string[] = [];
  ziel: { iban: string; buildingId: string | null } | null = null;
  ab = ""; // abgefragt ab (JJJJ-MM-TT)
  override handleResponse(response: any, clientResponse: any) {
    const roh = response.findAllSegments(HICAZ.Id).flatMap((s: any) => s.bookedTransactions ?? []);
    this.dokumente = roh.map((xml: string) =>
      /<\?xml[^>]*encoding="UTF-8"[^>]*\?>/i.test(xml) ? Buffer.from(xml, "latin1").toString("utf8") : xml
    );
    clientResponse.statements = [];
  }
}

/** Kontostand holen und am Objekt merken (mehrere Konten in einem Dialog). */
class Saldo extends BalanceInteraction {
  ergebnis: { saldo: number; datum: string } | null = null;
  ziel: { iban: string; buildingId: string | null } | null = null;
  override handleResponse(response: any, clientResponse: any) {
    super.handleResponse(response, clientResponse);
    const b = clientResponse.balance;
    if (b && typeof b.balance === "number") {
      const d = b.date instanceof Date ? b.date.toISOString().slice(0, 10) : String(b.date ?? heute()).slice(0, 10);
      this.ergebnis = { saldo: b.balance, datum: d };
    }
  }
}

function bankText(antwort: any): string {
  const answers = (antwort?.bankAnswers ?? []) as { code: number; text: string }[];
  const fehler = answers.filter((a) => a.code >= 9000 && a.code !== 9050 && a.code !== 9800);
  const liste = fehler.length ? fehler : answers.filter((a) => a.code >= 3000);
  return liste.map((a) => a.text).join(" · ") || "Die Bank hat die Anfrage abgelehnt.";
}

function tanVerfahren(config: any) {
  return (config.availableTanMethods ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    appFreigabe: !!m.isDecoupled,
  }));
}

function kontenAusUpd(config: any) {
  return (config.bankingInformation?.upd?.bankAccounts ?? []).map((a: any) => ({
    iban: cleanIban(a.iban),
    kontonummer: a.accountNumber,
    unterkonto: a.subAccountId ?? null,
    name: a.product ?? null,
    inhaber: [a.holder1, a.holder2].filter(Boolean).join(", ") || null,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  START = Date.now();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const aktion = String(body.aktion ?? "");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Zeitplan ──────────────────────────────────────────────────────────────
  if (aktion === "zeitplan") {
    const { data: ok } = await admin.rpc("fints_cron_token_pruefen", { p_token: String(body.token ?? "") });
    if (!ok) return json({ error: "Nicht erlaubt" }, 403);
    const { data: zugaenge } = await admin.from("bank_connections").select("id").eq("status", "aktiv");
    const ergebnisse: any[] = [];
    for (const z of zugaenge ?? []) {
      try {
        ergebnisse.push(await abrufen(admin, z.id, { interaktiv: false, ausloeser: "zeitplan", userId: null }));
      } catch (e) {
        ergebnisse.push({ id: z.id, ok: false, fehler: (e as Error).message });
      }
    }
    return json({ ok: true, zugaenge: ergebnisse.length, ergebnisse });
  }

  // ── alles andere nur für angemeldete Admins/Mitarbeiter ───────────────────
  const auth = await requireAdmin(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const nurAdmin = auth.role === "admin" || auth.role === "service";
  const userId = auth.userId === "service" ? null : auth.userId;

  try {
    if (aktion === "abrufen") {
      const ids: string[] = body.id
        ? [String(body.id)]
        : ((await admin.from("bank_connections").select("id").in("status", ["aktiv", "tan_noetig"])).data ?? []).map((z: any) => z.id);
      const ergebnisse = [];
      // Zeitraum und Konto wählbar: { ab?: "JJJJ-MM-TT", iban? }
      const ab = /^\d{4}-\d{2}-\d{2}$/.test(String(body.ab ?? "")) ? String(body.ab) : null;
      if (ab && ab > heute()) return json({ error: "Das Datum liegt in der Zukunft." }, 400);
      const nurIban = body.iban ? cleanIban(String(body.iban)) : null;
      for (const id of ids) {
        ergebnisse.push(await abrufen(admin, id, { interaktiv: true, ausloeser: "hand", userId, ab, nurIban }));
      }
      return json({ ok: ergebnisse.every((e: any) => e.ok), ergebnisse });
    }

    if (!nurAdmin) return json({ error: "Bankzugänge dürfen nur Admins ändern." }, 403);

    if (aktion === "anlegen") return json(await anlegen(admin, body, userId));
    if (aktion === "tan_waehlen") return json(await tanWaehlen(admin, String(body.id), Number(body.tanMethodId), userId));
    if (aktion === "salden") {
      return json(await abrufen(admin, String(body.id), { interaktiv: true, ausloeser: "hand", userId, nurSalden: true }));
    }
    if (aktion === "konto_setzen") return json(await kontoSetzen(admin, String(body.id), body));
    if (aktion === "zahlung_senden") return json(await zahlungSenden(admin, String(body.runId), body.akzeptiert ?? null, userId));
    if (aktion === "pin_aendern") {
      if (!body.pin) return json({ error: "PIN fehlt" }, 400);
      const { error } = await admin.rpc("fints_pin_setzen", { p_connection: body.id, p_pin: String(body.pin) });
      if (error) throw error;
      return json({ ok: true });
    }
    if (aktion === "entfernen") {
      await admin.from("building_bank_accounts").update({ bank_connection_id: null }).eq("bank_connection_id", body.id);
      const { error } = await admin.from("bank_connections").delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: `Unbekannte Aktion „${aktion}"` }, 400);
  } catch (e) {
    console.error("fints:", e);
    return json({ error: (e as Error).message || "Unbekannter Fehler" }, 500);
  }
});

// ── Einrichtung ─────────────────────────────────────────────────────────────

async function anlegen(admin: any, body: any, userId: string | null) {
  const blz = String(body.blz ?? "").replace(/\s/g, "");
  const bank = BANKEN[blz];
  if (!bank) return { error: "Diese Bank wird (noch) nicht unterstützt." };
  const anmeldename = String(body.anmeldename ?? "").trim();
  const pin = String(body.pin ?? "");
  const kundenId = body.kundenId ? String(body.kundenId).trim() : null;
  if (!anmeldename || !pin) return { error: "Anmeldename und PIN fehlen." };

  const config = FinTSConfig.forFirstTimeUse(PRODUKT_ID, PRODUKT_VERSION, bank.url, blz, anmeldename, pin, kundenId ?? undefined);
  const client = new FinTSClient(config);
  const antwort = await client.synchronize();
  if (!antwort.success) {
    // Falsche Zugangsdaten werden gar nicht erst gespeichert.
    return { error: bankText(antwort) };
  }

  const { data: zugang, error } = await admin
    .from("bank_connections")
    .insert({
      blz,
      bank_name: bank.name,
      fints_url: bank.url,
      anmeldename,
      kunden_id: kundenId,
      banking_information: config.bankingInformation,
      status: "neu",
      status_text: "TAN-Verfahren wählen",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: pinErr } = await admin.rpc("fints_pin_setzen", { p_connection: zugang.id, p_pin: pin });
  if (pinErr) {
    await admin.from("bank_connections").delete().eq("id", zugang.id);
    throw pinErr;
  }

  const verfahren = tanVerfahren(config);
  return {
    ok: true,
    id: zugang.id,
    tanVerfahren: verfahren,
    hinweis: verfahren.some((v: any) => v.appFreigabe) ? null : "Die Bank bietet für diesen Zugang kein Verfahren mit Freigabe in der App an.",
  };
}

async function ladeZugang(admin: any, id: string) {
  const { data: zugang, error } = await admin.from("bank_connections").select("*").eq("id", id).single();
  if (error || !zugang) throw new Error("Bankzugang nicht gefunden");
  const { data: pin, error: pinErr } = await admin.rpc("fints_pin_holen", { p_connection: id });
  if (pinErr || !pin) throw new Error("PIN des Bankzugangs nicht lesbar");
  const config = zugang.banking_information
    ? FinTSConfig.fromBankingInformation(
      PRODUKT_ID,
      PRODUKT_VERSION,
      zugang.banking_information,
      zugang.anmeldename,
      pin,
      zugang.tan_method_id ?? undefined,
      zugang.tan_media_name ?? undefined,
      zugang.kunden_id ?? undefined,
    )
    : FinTSConfig.forFirstTimeUse(PRODUKT_ID, PRODUKT_VERSION, zugang.fints_url, zugang.blz, zugang.anmeldename, pin, zugang.kunden_id ?? undefined);
  return { zugang, config };
}

/**
 * Wartet auf die Freigabe in der Banking-App (SecureGo plus, pushTAN 2.0).
 * `weiter` schickt die Statusabfrage an die Bank und liefert die neue Antwort.
 */
async function aufFreigabeWarten(config: any, antwort: any, weiter: (ref: string) => Promise<any>) {
  const tm = config.selectedTanMethod;
  if (!tm?.isDecoupled) {
    throw new Error("Für dieses TAN-Verfahren müsste eine TAN eingetippt werden. Bitte ein Verfahren mit Freigabe in der App wählen.");
  }
  // Fragt die Bank nach einer Freigabe gleich die nächste an (z. B. je
  // Konto), beginnt die Wartezeit für diese neu – insgesamt aber höchstens
  // GESAMT_MS, damit der Aufruf nicht abgebrochen wird.
  const gesamtEnde = START + GESAMT_MS;
  let ende = Math.min(Date.now() + TAN_WARTEZEIT_MS, gesamtEnde);
  let referenz = antwort?.tanReference;
  await sleep(Math.max(tm.decoupled?.waitingSecondsBeforeFirstStatusRequest ?? 0, 3) * 1000);
  while (antwort?.requiresTan && Date.now() < ende) {
    antwort = await weiter(antwort.tanReference);
    if (antwort?.requiresTan) {
      if (antwort.tanReference !== referenz) {
        referenz = antwort.tanReference;
        ende = Math.min(Date.now() + TAN_WARTEZEIT_MS, gesamtEnde);
      }
      await sleep(Math.max(tm.decoupled?.waitingSecondsBetweenStatusRequests ?? 0, 2) * 1000);
    }
  }
  if (antwort?.requiresTan) throw new Error("Die Freigabe in der App kam nicht rechtzeitig. Bitte noch einmal versuchen.");
  return antwort;
}

async function tanWaehlen(admin: any, id: string, tanMethodId: number, userId: string | null) {
  const { zugang, config } = await ladeZugang(admin, id);
  config.selectTanMethod(tanMethodId);
  const client = new FinTSClient(config);
  let antwort = await client.synchronize();
  if (antwort.success && antwort.requiresTan) {
    antwort = await aufFreigabeWarten(config, antwort, (ref) => client.synchronizeWithTan(ref, undefined));
  }
  if (!antwort.success) {
    await admin.from("bank_connections").update({ status: "fehler", status_text: bankText(antwort), updated_at: new Date().toISOString() }).eq("id", id);
    return { error: bankText(antwort) };
  }

  const konten = await kontenZuordnen(admin, id, kontenAusUpd(config));
  const tm = config.selectedTanMethod;
  await admin.from("bank_connections").update({
    tan_method_id: tanMethodId,
    tan_method_name: tm?.name ?? null,
    tan_media_name: config.tanMediaName ?? null,
    banking_information: config.bankingInformation,
    konten,
    status: "aktiv",
    status_text: null,
    sca_bis: new Date(Date.now() + 90 * 86400_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  await admin.from("bank_fetch_log").insert({
    connection_id: id,
    ausloeser: "einrichtung",
    beendet: new Date().toISOString(),
    ok: true,
    ergebnis: { konten: konten.length, zugeordnet: konten.filter((k: any) => k.buildingId).length },
    user_id: userId,
  });
  return { ok: true, bank: zugang.bank_name, konten };
}

/** Konten der Bank mit den Konten der Liegenschaften (building_bank_accounts) verbinden. */
async function kontenZuordnen(admin: any, connectionId: string, konten: any[]) {
  const ibans = konten.map((k) => k.iban).filter(Boolean);
  const { data: bba } = ibans.length
    ? await admin.from("building_bank_accounts").select("id, building_id, iban, display_name").in("iban", ibans)
    : { data: [] };
  const je = new Map<string, any[]>();
  (bba ?? []).forEach((b: any) => je.set(cleanIban(b.iban), [...(je.get(cleanIban(b.iban)) ?? []), b]));
  const ergebnis = konten.map((k) => {
    const treffer = je.get(k.iban) ?? [];
    return { ...k, buildingId: treffer.length === 1 ? treffer[0].building_id : null, kontoName: treffer[0]?.display_name ?? null };
  });
  const zugeordnet = (bba ?? []).filter((b: any) => (je.get(cleanIban(b.iban)) ?? []).length === 1).map((b: any) => b.id);
  if (zugeordnet.length) {
    await admin.from("building_bank_accounts").update({ bank_connection_id: connectionId }).in("id", zugeordnet);
  }
  return ergebnis;
}

// ── Abruf ───────────────────────────────────────────────────────────────────

/** Ab wann für ein Konto abgerufen wird: drei Tage vor der letzten Bewegung (Dubletten fallen raus). */
async function abrufBeginn(admin: any, buildingId: string | null, iban: string): Promise<Date> {
  let q = admin.from("bank_statements").select("id, account_iban");
  q = buildingId ? q.eq("building_id", buildingId) : q.is("building_id", null);
  const { data: auszuege } = await q;
  const ids = (auszuege ?? []).filter((s: any) => cleanIban(s.account_iban) === iban).map((s: any) => s.id);
  let letzte: string | null = null;
  for (let i = 0; i < ids.length && ids.length; i += 100) {
    const { data } = await admin
      .from("bank_transactions")
      .select("booking_date")
      .in("statement_id", ids.slice(i, i + 100))
      .order("booking_date", { ascending: false })
      .limit(1);
    const d = data?.[0]?.booking_date ?? null;
    if (d && (!letzte || d > letzte)) letzte = d;
  }
  const grenze = new Date(Date.now() - MAX_TAGE_ZURUECK * 86400_000);
  const basis = letzte ? new Date(letzte) : grenze;
  if (letzte) basis.setDate(basis.getDate() - 3);
  return basis < grenze ? grenze : basis;
}

async function abrufen(
  admin: any,
  id: string,
  opts: {
    interaktiv: boolean;
    ausloeser: "zeitplan" | "hand";
    userId: string | null;
    nurSalden?: boolean;
    ab?: string | null; // fester Beginn statt „seit dem letzten Abruf"
    nurIban?: string | null; // nur dieses Konto
  },
) {
  const { data: log } = await admin
    .from("bank_fetch_log")
    .insert({ connection_id: id, ausloeser: opts.ausloeser, user_id: opts.userId })
    .select("id")
    .single();
  const protokoll = async (ok: boolean, ergebnis: any, fehler?: string) => {
    if (log?.id) {
      await admin.from("bank_fetch_log").update({ beendet: new Date().toISOString(), ok, ergebnis, fehler: fehler ?? null }).eq("id", log.id);
    }
  };

  let zugang: any;
  try {
    const geladen = await ladeZugang(admin, id);
    zugang = geladen.zugang;
    const config = geladen.config;
    if (!zugang.tan_method_id) throw new Error("Für diesen Bankzugang ist noch kein TAN-Verfahren gewählt.");

    // Welche Konten gehören zu einer Liegenschaft?
    const konten = (config.bankingInformation?.upd?.bankAccounts ?? []).filter((a: any) => a.iban);
    const { data: bba } = await admin
      .from("building_bank_accounts")
      .select("building_id, iban")
      .in("iban", konten.map((a: any) => cleanIban(a.iban)));
    const zuLiegenschaft = new Map<string, string>();
    const zaehler = new Map<string, number>();
    (bba ?? []).forEach((b: any) => {
      const i = cleanIban(b.iban);
      zaehler.set(i, (zaehler.get(i) ?? 0) + 1);
      zuLiegenschaft.set(i, b.building_id);
    });

    // Einstellungen je Konto (ausgeblendet / RGI intern) aus dem Zugang
    const flags = new Map<string, any>();
    (zugang.konten ?? []).forEach((k: any) => k.iban && flags.set(cleanIban(k.iban), k));

    const dialog = new Dialog(config, false);
    const camts: RohCamt[] = [];
    const salden: Saldo[] = [];
    for (const konto of konten) {
      const iban = cleanIban(konto.iban);
      const f = flags.get(iban) ?? {};
      if (f.ausgeblendet) continue;
      if (opts.nurIban && iban !== opts.nurIban) continue;
      const buildingId = zaehler.get(iban) === 1 ? zuLiegenschaft.get(iban)! : null;
      const istRgi = !!f.rgi;
      const ziel = { iban, buildingId: istRgi ? null : buildingId };
      if (opts.nurSalden) {
        if (config.isAccountTransactionSupported(konto, "HKSAL")) {
          const s = new Saldo(konto);
          s.ziel = ziel;
          dialog.addCustomerInteraction(s);
          salden.push(s);
        }
        continue;
      }
      if (!buildingId && !istRgi) continue;
      if (config.isAccountTransactionSupported(konto, "HKCAZ")) {
        const beginn = opts.ab ? new Date(`${opts.ab}T00:00:00Z`) : await abrufBeginn(admin, ziel.buildingId, iban);
        const c = new RohCamt(konto, beginn, new Date());
        c.ziel = ziel;
        c.ab = beginn.toISOString().slice(0, 10);
        dialog.addCustomerInteraction(c);
        camts.push(c);
      }
      if (config.isAccountTransactionSupported(konto, "HKSAL")) {
        const s = new Saldo(konto);
        s.ziel = ziel;
        dialog.addCustomerInteraction(s);
        salden.push(s);
      }
    }
    if (camts.length === 0 && salden.length === 0) {
      if (opts.nurIban) throw new Error("Dieses Konto gehört nicht zu diesem Zugang oder ist nicht zugeordnet.");
      throw new Error(opts.nurSalden ? "Keine Konten zum Abfragen." : "Keines der Konten dieses Zugangs ist einer Liegenschaft oder RGI intern zugeordnet.");
    }

    // Dialog führen; die Antwort der gerade laufenden Abfrage entscheidet
    let antworten = await dialog.start();
    const aktuelle = () => antworten.get(dialog.currentInteraction?.segId) ?? [...antworten.values()].at(-1);
    let antwort = aktuelle();
    let mitTan = false;
    let teilweise: string | null = null;
    if (antwort?.success && antwort?.requiresTan) {
      if (!opts.interaktiv) {
        await tanNoetig(admin, zugang);
        await protokoll(false, null, "Freigabe per TAN nötig");
        return { id, ok: false, tanNoetig: true, bank: zugang.bank_name };
      }
      mitTan = true;
      try {
        antwort = await aufFreigabeWarten(config, antwort, async (ref) => {
          antworten = await dialog.continue(ref);
          return aktuelle();
        });
      } catch (e) {
        // Was bis hierher kam, wird trotzdem eingelesen.
        teilweise = (e as Error).message;
        antwort = null;
      }
    }
    if (antwort && !antwort.success) {
      if (!camts.some((c) => c.dokumente.length) && !salden.some((s) => s.ergebnis)) throw new Error(bankText(antwort));
      teilweise = bankText(antwort);
    }

    // Einlesen
    const titel = `Abruf ${zugang.bank_name} ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`;
    const jeKonto: any[] = [];
    for (const c of camts) {
      if (!c.ziel || (teilweise && c.dokumente.length === 0)) continue;
      const r = await camtEinlesen(admin, { ...c.ziel, xmls: c.dokumente, titel, userId: opts.userId ?? zugang.created_by });
      jeKonto.push({ iban: c.ziel.iban, ab: c.ab, ...r });
    }
    const saldoJe = new Map<string, { saldo: number; datum: string }>();
    for (const s of salden) {
      if (!s.ziel || !s.ergebnis) continue;
      saldoJe.set(s.ziel.iban, s.ergebnis);
      if (s.ziel.buildingId) {
        await admin
          .from("building_bank_accounts")
          .update({ saldo_bank: s.ergebnis.saldo, saldo_bank_am: new Date().toISOString() })
          .eq("building_id", s.ziel.buildingId)
          .eq("iban", s.ziel.iban);
      }
    }
    // Kontostand auch in der Kontenliste des Zugangs merken (zum Zuordnen)
    const kontenNeu = (zugang.konten ?? []).map((k: any) => {
      const e = saldoJe.get(cleanIban(k.iban));
      return e ? { ...k, saldo: e.saldo, saldoAm: e.datum } : k;
    });

    const jetzt = new Date().toISOString();
    const update: any = {
      letzter_abruf: jetzt,
      letzter_abruf_ok: true,
      status: "aktiv",
      status_text: null,
      banking_information: config.bankingInformation,
      konten: kontenNeu,
      updated_at: jetzt,
    };
    if (opts.nurSalden) {
      delete update.letzter_abruf;
      delete update.letzter_abruf_ok;
    }
    if (mitTan) update.sca_bis = new Date(Date.now() + 90 * 86400_000).toISOString();
    await admin.from("bank_connections").update(update).eq("id", id);
    if (mitTan) await tanAufgabenErledigen(admin, id);

    const ergebnis = {
      teilweise,
      offen: teilweise ? camts.filter((c) => c.dokumente.length === 0).length : 0,
      konten: jeKonto.length,
      neu: jeKonto.reduce((s, k) => s + (k.neu ?? 0), 0),
      zugeordnet: jeKonto.reduce((s, k) => s + (k.zugeordnet ?? 0), 0),
      jeKonto,
    };
    await protokoll(!teilweise, ergebnis, teilweise ?? undefined);
    return { id, ok: !teilweise, bank: zugang.bank_name, ...ergebnis, fehler: teilweise ?? undefined };
  } catch (e) {
    const text = (e as Error).message || "Unbekannter Fehler";
    console.error(`fints abrufen ${id}:`, text);
    await admin
      .from("bank_connections")
      .update({ letzter_abruf: new Date().toISOString(), letzter_abruf_ok: false, status_text: text, updated_at: new Date().toISOString() })
      .eq("id", id);
    await protokoll(false, null, text);
    return { id, ok: false, bank: zugang?.bank_name ?? null, fehler: text };
  }
}

/**
 * Alle CAMT-Dokumente eines Kontos aus einem Abruf als EIN Auszug
 * (Quelle „fints") einlesen. Bewegungen, die es schon gibt, fallen über die
 * Prüfsumme heraus – genau wie beim Datei-Import.
 */
async function camtEinlesen(
  admin: any,
  opts: { buildingId: string | null; iban: string; xmls: string[]; titel: string; userId: string | null },
) {
  const bloecke = opts.xmls.flatMap(camtBloecke).filter((b) => {
    const i = cleanIban(leseKopf(b).iban);
    return !i || i === opts.iban;
  });
  if (bloecke.length === 0) return { neu: 0, schonDa: 0, zugeordnet: 0 };

  const koepfe = bloecke.map(leseKopf);
  const von = koepfe.map((k) => k.von).filter(Boolean).sort()[0] ?? heute();
  const bis = koepfe.map((k) => k.bis).filter(Boolean).sort().at(-1) ?? heute();
  const erster = koepfe.find((k) => k.von === von);
  const letzter = [...koepfe].reverse().find((k) => k.bis === bis);

  const { data: auszug, error } = await admin
    .from("bank_statements")
    .insert({
      building_id: opts.buildingId,
      file_name: opts.titel,
      account_iban: opts.iban,
      account_name: koepfe.find((k) => k.name)?.name ?? null,
      statement_date_from: von,
      statement_date_to: bis,
      opening_balance: erster?.anfangssaldo ?? null,
      closing_balance: letzter?.endsaldo ?? null,
      source_format: "fints",
      fiscal_year: Number(bis.slice(0, 4)),
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  let txns = bloecke.flatMap((b) => parseEntries(b, opts.buildingId, auszug.id));
  txns = await addHashes(txns);
  const { unique: nachHash } = await deduplicateTransactions(admin, txns, opts.buildingId);
  const unique = await bestandAbziehen(admin, opts.iban, txns, nachHash, von, bis);
  const duplicateCount = txns.length - unique.length;
  if (unique.length === 0) {
    await admin.from("bank_statements").delete().eq("id", auszug.id);
    return { neu: 0, schonDa: duplicateCount, zugeordnet: 0 };
  }
  const { error: insErr } = await admin.from("bank_transactions").insert(unique);
  if (insErr) {
    await admin.from("bank_statements").delete().eq("id", auszug.id);
    throw insErr;
  }
  const match = await matchTransactions(admin, auszug.id, opts.buildingId);
  return { neu: unique.length, schonDa: duplicateCount, zugeordnet: match.matched };
}

/** Status „TAN nötig" setzen und (einmal) eine Aufgabe anlegen. */
async function tanNoetig(admin: any, zugang: any) {
  await admin
    .from("bank_connections")
    .update({ status: "tan_noetig", status_text: "Die Bank möchte eine neue Freigabe per TAN.", updated_at: new Date().toISOString() })
    .eq("id", zugang.id);
  const { data: offen } = await admin
    .from("todos")
    .select("id")
    .eq("source_type", "bank")
    .eq("source_id", zugang.id)
    .neq("status", "done")
    .is("deleted_at", null)
    .limit(1);
  if (offen && offen.length) return;
  await admin.from("todos").insert({
    title: `Bankzugang ${zugang.bank_name} mit TAN bestätigen`,
    description:
      "Die Bank möchte eine neue Freigabe (alle 90 Tage üblich). Einstellungen › Bankzugänge öffnen, „Jetzt abrufen“ drücken und in der Banking-App freigeben.",
    status: "open",
    priority: "high",
    source_type: "bank",
    source_id: zugang.id,
    created_by: zugang.created_by,
    assigned_to: zugang.created_by,
    due_date: heute(),
    is_internal: true,
  });
}

async function tanAufgabenErledigen(admin: any, connectionId: string) {
  await admin
    .from("todos")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("source_type", "bank")
    .eq("source_id", connectionId)
    .neq("status", "done");
}

/** Ein Konto des Zugangs ausblenden (wird nie abgerufen) oder RGI intern zuordnen. */
async function kontoSetzen(admin: any, id: string, body: any) {
  const iban = cleanIban(body.iban);
  const { data: zugang, error } = await admin.from("bank_connections").select("konten").eq("id", id).single();
  if (error || !zugang) throw new Error("Bankzugang nicht gefunden");
  let gefunden = false;
  const konten = (zugang.konten ?? []).map((k: any) => {
    if (cleanIban(k.iban) !== iban) return k;
    gefunden = true;
    const neu = { ...k };
    if (typeof body.ausgeblendet === "boolean") neu.ausgeblendet = body.ausgeblendet;
    if (typeof body.rgi === "boolean") neu.rgi = body.rgi;
    if (neu.ausgeblendet) neu.rgi = false;
    return neu;
  });
  if (!gefunden) return { error: "Konto gehört nicht zu diesem Bankzugang." };
  const { error: e2 } = await admin.from("bank_connections").update({ konten, updated_at: new Date().toISOString() }).eq("id", id);
  if (e2) throw e2;
  return { ok: true };
}

// ── Überweisung ─────────────────────────────────────────────────────────────

/**
 * Einen Zahllauf (alle Zahlungen EINES Kontos) als Sammelüberweisung per
 * FinTS senden. Die Bank prüft die Empfängernamen; weicht einer ab, kommt
 * das Ergebnis zurück (Status „pruefung") und der Mensch entscheidet. Erst
 * mit der Freigabe in der Banking-App geht das Geld raus.
 */
async function zahlungSenden(admin: any, runId: string, akzeptiert: Record<string, string> | null, userId: string | null) {
  // Sperre gegen doppelten Versand: nur aus „pruefung" oder „fehler" heraus
  const { data: lauf } = await admin
    .from("payment_runs")
    .update({ status: "laeuft", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["pruefung", "fehler"])
    .select("*")
    .maybeSingle();
  if (!lauf) return { error: "Dieser Zahllauf wird gerade gesendet oder ist schon erledigt." };

  const ende = async (status: string, felder: Record<string, unknown> = {}) => {
    await admin.from("payment_runs").update({ status, updated_at: new Date().toISOString(), ...felder }).eq("id", runId);
  };

  try {
    const { data: posten } = await admin.from("payment_run_items").select("*").eq("run_id", runId).order("created_at");
    if (!posten?.length) {
      await ende("abgebrochen", { fehler: "Keine Zahlungen im Lauf." });
      return { error: "Keine Zahlungen im Lauf." };
    }
    const iban = cleanIban(lauf.konto_iban);

    // Bankzugang mit diesem Konto
    const { data: zugaenge } = await admin.from("bank_connections").select("id, konten, status").in("status", ["aktiv", "tan_noetig"]);
    const zugang = (zugaenge ?? []).find((z: any) => (z.konten ?? []).some((k: any) => cleanIban(k.iban) === iban && !k.ausgeblendet));
    if (!zugang) {
      await ende("fehler", { fehler: "Für dieses Konto ist kein Bankzugang eingerichtet." });
      return { error: "Für dieses Konto ist kein Bankzugang eingerichtet." };
    }
    const { config } = await ladeZugang(admin, zugang.id);
    const konto = (config.bankingInformation?.upd?.bankAccounts ?? []).find((a: any) => cleanIban(a.iban) === iban);
    if (!konto) throw new Error("Die Bank kennt dieses Konto unter diesem Zugang nicht.");
    const lastschrift = lauf.art === "lastschrift";
    if (!config.isAccountTransactionSupported(konto, lastschrift ? "HKDME" : "HKCCM")) {
      throw new Error(
        lastschrift
          ? "Für dieses Konto ist der Lastschrift-Einzug bei der Bank nicht freigeschaltet (Inkasso-Vereinbarung nötig)."
          : "Für dieses Konto sind Sammelüberweisungen über FinTS nicht freigeschaltet.",
      );
    }

    const eintrag = (zugang.konten ?? []).find((k: any) => cleanIban(k.iban) === iban);
    const inhaber = eintrag?.inhaber || lauf.konto_inhaber || "WEG";
    let pain: string;
    let summe: number;
    if (lastschrift) {
      const { data: haus } = await admin.from("buildings").select("name, creditor_id").eq("id", lauf.building_id).single();
      const gid = (lauf.glaeubiger_id || haus?.creditor_id || "").replace(/\s/g, "");
      if (!glaeubigerIdGueltig(gid)) throw new Error("Für diese Liegenschaft ist keine gültige Gläubiger-ID hinterlegt.");
      const fehlt = posten.filter((p: any) => !p.mandatsreferenz || !p.mandat_datum);
      if (fehlt.length) throw new Error(`Mandat unvollständig bei: ${fehlt.map((p: any) => p.empfaenger).join(", ")}`);
      const einzugAm = lauf.faellig_am ?? lauf.ausfuehrung_am;
      if (!einzugAm || einzugAm < frueheserEinzug()) {
        throw new Error(`Der Einzugstag muss mindestens zwei Bankarbeitstage in der Zukunft liegen (frühestens ${frueheserEinzug()}).`);
      }
      const einzuege = posten.map((p: any) => ({
        name: p.empfaenger,
        iban: p.iban,
        bic: p.bic,
        betrag: Number(p.betrag),
        verwendungszweck: p.verwendungszweck ?? "",
        endToEndId: p.end_to_end_id,
        mandatsreferenz: p.mandatsreferenz,
        mandatDatum: p.mandat_datum,
      }));
      summe = summeVon(einzuege);
      pain = pain008({
        absender: "RGI Immobilien GmbH & Co. KG",
        glaeubigerName: inhaber || `WEG ${haus?.name ?? ""}`,
        glaeubigerIban: iban,
        glaeubigerId: gid,
        einzugAm,
        einzuege,
        msgId: sepaId("RGI"),
      });
    } else {
      const zahlungen = posten.map((p: any) => ({
        empfaenger: p.empfaenger,
        iban: p.iban,
        bic: p.bic,
        betrag: Number(p.betrag),
        verwendungszweck: p.verwendungszweck ?? "",
        endToEndId: p.end_to_end_id,
      }));
      summe = summeVon(zahlungen);
      pain = pain001({ absender: "RGI Immobilien GmbH & Co. KG", kontoInhaber: inhaber, kontoIban: iban, zahlungen, msgId: sepaId("RGI") });
    }

    const r = await sammelueberweisung({
      config,
      art: lastschrift ? "lastschrift" : "ueberweisung",
      konto,
      pain,
      summe,
      akzeptiert,
      bis: START + GESAMT_MS,
      warteAufFreigabeMs: TAN_WARTEZEIT_MS,
    });

    const felder: Record<string, unknown> = {
      connection_id: zugang.id,
      pain_xml: pain,
      bank_antwort: r.antworten,
      empfaengerpruefung: r.vop ?? null,
      fehler: r.fehler ?? null,
    };
    if (r.status === "gesendet") {
      felder.gesendet_am = new Date().toISOString();
      felder.gesendet_von = userId;
    }
    await ende(r.status, felder);
    return { ok: r.status === "gesendet", status: r.status, fehler: r.fehler, vop: r.vop ?? null };
  } catch (e) {
    const text = (e as Error).message || "Unbekannter Fehler";
    console.error("fints zahlung:", text);
    await ende("fehler", { fehler: text });
    return { ok: false, status: "fehler", fehler: text };
  }
}

/** Frühester Einzugstag einer Basislastschrift: zwei Bankarbeitstage ab heute. */
function frueheserEinzug(): string {
  const d = new Date();
  let n = 0;
  while (n < 2) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}
