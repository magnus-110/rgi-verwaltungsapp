// Mietkontrolle und Mahnwesen (Phase 5, 15.10.2026)
//
// Aktionen (Body { aktion, ... }):
//  - "uebersicht"     { buildingId? }                 → Mieter mit Monaten, Rückstand, Ergebnis
//  - "mahnungen"      {}                              → geplante, ausgesetzte, versendete Mahnungen
//  - "info_speichern" { assignmentId, art, text }     → Info beim Mieter + neu prüfen
//  - "aussetzen"      { caseId, grund }               → Mahnung aussetzen (Grund wird Info)
//  - "einplanen"      { caseId }                      → wieder einplanen
//  - "senden"         { caseId }                      → jetzt senden (von Hand)
//  - "vorschau"       { caseId }                      → Standardschreiben
//  - "fallpaket"      { assignmentId }                → Paket für Claude (Mieterkonto, Infos, Schreiben)
//  - "einstellungen"  { auto_versand?, email_account_id? }
//  - "pruefen"        {}                              → Abgleich + Mahnungen planen (ohne Versand)
//  - "lauf"           { token }                       → täglich 8:00: pruefen + Versand, falls eingeschaltet
//
//  - "mieter_einstellungen" { assignmentId, zahltag?, startDatum?, startSaldo? }
//
// Die App kündigt nie selbst und verschickt nie per Post. Ab zwei
// Monatsmieten Rückstand entsteht eine Aufgabe „Kündigung prüfen".
//
// Mieterkonto: Alle Einheiten eines Mieters im selben Objekt (Wohnung,
// Garage, Stellplätze) werden zu einem Konto zusammengefasst, damit eine
// Sammelüberweisung zugeordnet werden kann. Ehemalige Mieter bleiben mit
// offenem Betrag sichtbar, werden aber nie automatisch gemahnt.

import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";
import { requireAdmin } from "../_shared/require-admin.ts";
import { abgleich, naechsteStufe, plusTage, schreiben, type Ergebnis, type Stufe, type Vortrag, type Zahlung } from "../_shared/miete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanIban = (i: string | null | undefined) => (i ?? "").replace(/\s+/g, "").toUpperCase();
const heute = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10); // Berlin (grob)
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const aktion = String(body.aktion ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (aktion === "lauf") {
      const { data: ok } = await admin.rpc("fints_cron_token_pruefen", { p_token: String(body.token ?? "") });
      if (!ok) return json({ error: "Nicht erlaubt" }, 403);
      const r = await pruefen(admin, null);
      const { data: e } = await admin.from("mietkontrolle_einstellungen").select("*").eq("id", 1).single();
      const versand = e?.auto_versand ? await faelligeSenden(admin) : { gesendet: 0, fehler: 0, aus: true };
      return json({ ok: true, ...r, versand });
    }

    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;
    const userId = auth.userId === "service" ? null : auth.userId;

    if (aktion === "uebersicht") return json(await uebersicht(admin, body.buildingId ?? null));
    if (aktion === "mahnungen") return json(await mahnungen(admin));
    if (aktion === "pruefen") return json(await pruefen(admin, body.buildingId ?? null));
    if (aktion === "vorschau") return json(await vorschau(admin, String(body.caseId)));
    if (aktion === "fallpaket") return json(await fallpaket(admin, String(body.assignmentId)));
    if (aktion === "info_speichern") {
      const text = String(body.text ?? "").trim();
      if (!text) return json({ error: "Text fehlt" }, 400);
      const { data: a } = await admin.from("contact_building_assignments").select("building_id").eq("id", body.assignmentId).single();
      if (!a) return json({ error: "Mieter nicht gefunden" }, 404);
      await admin.from("tenant_infos").insert({ building_id: a.building_id, assignment_id: body.assignmentId, art: body.art ?? "sonstiges", text, created_by: userId });
      await pruefen(admin, a.building_id, String(body.assignmentId), true);
      return json({ ok: true });
    }
    if (aktion === "aussetzen") {
      const grund = String(body.grund ?? "").trim() || "Von Hand ausgesetzt";
      const { data: f } = await admin
        .from("dunning_cases")
        .update({ status: "ausgesetzt", ausgesetzt_grund: grund, ausgesetzt_von: userId, updated_at: new Date().toISOString() })
        .eq("id", body.caseId)
        .in("status", ["geplant", "fehler"])
        .select("building_id, assignment_id")
        .maybeSingle();
      if (!f) return json({ error: "Mahnung nicht gefunden oder schon versendet" }, 404);
      await admin.from("tenant_infos").insert({ building_id: f.building_id, assignment_id: f.assignment_id, art: infoArt(grund), text: `Mahnung ausgesetzt: ${grund}`, created_by: userId });
      return json({ ok: true });
    }
    if (aktion === "einplanen") {
      await admin
        .from("dunning_cases")
        .update({ status: "geplant", ausgesetzt_grund: null, ausgesetzt_von: null, ki_pruefung: null, geplant_am: heute(), updated_at: new Date().toISOString() })
        .eq("id", body.caseId)
        .eq("status", "ausgesetzt");
      return json({ ok: true });
    }
    if (aktion === "senden") return json(await senden(admin, String(body.caseId)));
    if (aktion === "mieter_einstellungen") {
      const upd: any = {};
      if ("zahltag" in body) {
        const t = body.zahltag === null || body.zahltag === "" ? null : Math.round(Number(body.zahltag));
        if (t !== null && (!Number.isFinite(t) || t < 1 || t > 31)) return json({ error: "Zahltag muss zwischen 1 und 31 liegen" }, 400);
        upd.mk_zahltag = t;
      }
      if ("startDatum" in body || "startSaldo" in body) {
        const datum = body.startDatum ? String(body.startDatum).slice(0, 10) : null;
        const saldo = body.startSaldo === null || body.startSaldo === "" || body.startSaldo === undefined ? null : Number(body.startSaldo);
        if (saldo !== null && !Number.isFinite(saldo)) return json({ error: "Startsaldo ist keine Zahl" }, 400);
        if ((datum && saldo === null) || (!datum && saldo !== null)) return json({ error: "Startsaldo braucht Betrag und Stichtag" }, 400);
        upd.mk_start_datum = datum;
        upd.mk_start_saldo = saldo;
      }
      if (!Object.keys(upd).length) return json({ error: "Nichts zu speichern" }, 400);
      const { data: a, error } = await admin.from("contact_building_assignments").update(upd).eq("id", body.assignmentId).select("building_id").single();
      if (error || !a) return json({ error: error?.message ?? "Mieter nicht gefunden" }, 404);
      await pruefen(admin, a.building_id, String(body.assignmentId));
      return json({ ok: true });
    }
    if (aktion === "einstellungen") {
      const upd: any = { updated_at: new Date().toISOString() };
      if (typeof body.auto_versand === "boolean") upd.auto_versand = body.auto_versand;
      if ("email_account_id" in body) upd.email_account_id = body.email_account_id || null;
      const { error } = await admin.from("mietkontrolle_einstellungen").update(upd).eq("id", 1);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: `Unbekannte Aktion „${aktion}"` }, 400);
  } catch (e) {
    console.error("mietkontrolle:", e);
    return json({ error: (e as Error).message || "Unbekannter Fehler" }, 500);
  }
});

function infoArt(grund: string): string {
  if (/rate/i.test(grund)) return "ratenzahlung";
  if (/widerspruch|klärung/i.test(grund)) return "widerspruch";
  if (/minderung/i.test(grund)) return "minderung";
  if (/angekündigt/i.test(grund)) return "zahlung_angekuendigt";
  return "sonstiges";
}

// ── Daten laden ─────────────────────────────────────────────────────────────

interface Mieter {
  assignmentId: string; // Haupt-Zuordnung (Schlüssel für Mahnfälle und Infos)
  assignmentIds: string[]; // alle Einheiten dieses Mieters im Objekt
  ehemalig: boolean;
  zahltag: number | null;
  vortrag: Vortrag | null;
  buildingId: string;
  haus: string;
  contactId: string;
  userId: string | null;
  name: string;
  anrede: string;
  einheit: string;
  ibans: string[];
  nachname: string;
  emails: string[];
  beginn: string | null;
  kosten: any[];
  infos: any[];
}

async function ladeMieter(admin: any, buildingId: string | null): Promise<{ mieter: Mieter[]; haeuser: any[] }> {
  let hq = admin.from("buildings").select("id, name").eq("management_mode", "rent");
  if (buildingId) hq = hq.eq("id", buildingId);
  const { data: haeuser } = await hq;
  const ids = (haeuser ?? []).map((h: any) => h.id);
  if (!ids.length) return { mieter: [], haeuser: [] };

  const h = heute();
  const vor12 = plusTage(h, -366);
  const { data: alleZuordnungen } = await admin
    .from("contact_building_assignments")
    .select(
      "id, building_id, contact_id, unit_number, usage_since, valid_from, valid_to, is_active, mk_zahltag, mk_start_datum, mk_start_saldo, iban_override, emails_override, salutation_override, first_name_override, last_name_override, company_name_override, " +
        "contacts(id, user_id, salutation, first_name, last_name, company_name, short_name), contact_bank_accounts!contact_building_assignments_bank_account_id_fkey(iban)",
    )
    .in("building_id", ids)
    .eq("role_in_building", "mieter");
  // aktuell = aktiv und nicht ausgelaufen; ehemalige nur mit Startsaldo oder Auszug in den letzten 12 Monaten
  const aktuell = (a: any) => a.is_active && !(a.valid_to && a.valid_to < h);
  const zuordnungen = (alleZuordnungen ?? []).filter(
    (a: any) => aktuell(a) || a.mk_start_saldo != null || (a.valid_to && a.valid_to >= vor12),
  );
  const aIds = zuordnungen.map((a: any) => a.id);
  const cIds = [...new Set(zuordnungen.map((a: any) => a.contact_id))];
  if (!aIds.length) return { mieter: [], haeuser: haeuser ?? [] };

  const blocks = async (table: string, sel: string, col: string, werte: string[]) => {
    const out: any[] = [];
    for (let i = 0; i < werte.length; i += 150) {
      const { data } = await admin.from(table).select(sel).in(col, werte.slice(i, i + 150));
      out.push(...(data ?? []));
    }
    return out;
  };
  const [kosten, infos, emails, konten] = await Promise.all([
    blocks("contact_building_costs", "assignment_id, cost_type, amount, interval, valid_from, valid_to", "assignment_id", aIds),
    blocks("tenant_infos", "id, assignment_id, art, text, gueltig_bis, created_at", "assignment_id", aIds),
    blocks("contact_emails", "contact_id, email, is_primary", "contact_id", cIds as string[]),
    blocks("contact_bank_accounts", "contact_id, iban", "contact_id", cIds as string[]),
  ]);

  // Kosten einer Einheit enden spätestens mit deren Ende; eine beendete Einheit
  // ohne Enddatum trägt nur noch ihren Startsaldo
  const kostenVon = (a: any) => {
    if (!aktuell(a) && !a.valid_to) return [];
    return kosten
      .filter((k) => k.assignment_id === a.id)
      .map((k) => ({ ...k, einheit: a.unit_number ?? "", ...(a.valid_to && (!k.valid_to || k.valid_to > a.valid_to) ? { valid_to: a.valid_to } : {}) }));
  };

  // je Objekt und Kontakt ein Mieterkonto
  const gruppen = new Map<string, any[]>();
  for (const a of zuordnungen) {
    const key = `${a.building_id}|${a.contact_id}`;
    gruppen.set(key, [...(gruppen.get(key) ?? []), a]);
  }

  const mieter: Mieter[] = [];
  for (const liste of gruppen.values()) {
    // Haupt-Zuordnung: aktuell vor ehemalig, dann die älteste (meist die Wohnung) – stabil, damit Mahnfälle nicht springen
    liste.sort(
      (x: any, y: any) =>
        Number(aktuell(y)) - Number(aktuell(x)) ||
        String(x.usage_since || x.valid_from || "9999").localeCompare(String(y.usage_since || y.valid_from || "9999")) ||
        String(x.id).localeCompare(String(y.id)),
    );
    const a = liste[0];
    const c = a.contacts ?? {};
    const firma = a.company_name_override || c.company_name;
    const vor = a.first_name_override || c.first_name;
    const nach = a.last_name_override || c.last_name;
    const anredeWort = a.salutation_override || c.salutation;
    const name = (firma || [vor, nach].filter(Boolean).join(" ") || c.short_name || "Mieter").trim();
    const anrede = firma
      ? "Sehr geehrte Damen und Herren"
      : /frau/i.test(anredeWort ?? "")
        ? `Sehr geehrte Frau ${nach ?? name}`
        : /herr/i.test(anredeWort ?? "")
          ? `Sehr geehrter Herr ${nach ?? name}`
          : "Sehr geehrte Damen und Herren";
    const overrideMails = liste.flatMap((z: any) =>
      Array.isArray(z.emails_override) ? z.emails_override.map((e: any) => (typeof e === "string" ? e : e?.email)).filter(Boolean) : [],
    );
    const eigeneMails = overrideMails.length
      ? overrideMails
      : emails.filter((e) => e.contact_id === a.contact_id).sort((x, y) => Number(y.is_primary) - Number(x.is_primary)).map((e) => e.email);
    const ibans = [
      ...liste.flatMap((z: any) => [z.iban_override, z.contact_bank_accounts?.iban]),
      ...konten.filter((k) => k.contact_id === a.contact_id).map((k) => k.iban),
    ]
      .map(cleanIban)
      .filter((i) => i.length >= 15);
    const eigeneKosten = liste.flatMap(kostenVon);
    const ersterKosten = eigeneKosten.map((k) => k.valid_from).filter(Boolean).sort()[0] ?? null;
    const beginne = liste.map((z: any) => z.usage_since || z.valid_from).filter(Boolean).sort();
    const einheiten = [...new Set(liste.map((z: any) => z.unit_number).filter(Boolean))].sort((x: any, y: any) =>
      String(x).localeCompare(String(y), "de", { numeric: true }),
    );
    // Startsaldo und Zahltag: von der Haupt-Zuordnung, sonst von einer anderen Einheit
    const mitStart = liste.find((z: any) => z.mk_start_datum && z.mk_start_saldo != null);
    const zahltag = liste.map((z: any) => z.mk_zahltag).find((t: any) => t != null) ?? null;
    const gIds = liste.map((z: any) => z.id);
    mieter.push({
      assignmentId: a.id,
      assignmentIds: gIds,
      ehemalig: !liste.some(aktuell),
      zahltag: zahltag != null ? Number(zahltag) : null,
      vortrag: mitStart ? { stichtag: mitStart.mk_start_datum, betrag: Number(mitStart.mk_start_saldo) } : null,
      buildingId: a.building_id,
      haus: (haeuser ?? []).find((hh: any) => hh.id === a.building_id)?.name ?? "",
      contactId: a.contact_id,
      userId: c.user_id ?? null,
      name,
      anrede,
      einheit: einheiten.join(" + "),
      ibans: [...new Set(ibans)],
      nachname: norm(firma || nach || name),
      emails: [...new Set(eigeneMails as string[])],
      beginn: beginne[0] || ersterKosten,
      kosten: eigeneKosten,
      infos: infos.filter((i) => gIds.includes(i.assignment_id) && (!i.gueltig_bis || i.gueltig_bis >= h)),
    });
  }
  return { mieter, haeuser: haeuser ?? [] };
}

/** Zahlungseingänge je Mieter: zuerst über die IBAN, sonst eindeutig über den Namen. */
async function ladeZahlungen(admin: any, mieter: Mieter[], ab: string) {
  const jeHaus = new Map<string, Mieter[]>();
  mieter.forEach((m) => jeHaus.set(m.buildingId, [...(jeHaus.get(m.buildingId) ?? []), m]));
  const zahlungen = new Map<string, Zahlung[]>();
  const datenAb = new Map<string, string>(); // ab wann liegen Kontoauszüge vor?
  const datenBis = new Map<string, string>(); // bis wann liegen Kontoauszüge vor?

  for (const [hausId, liste] of jeHaus) {
    const { data: ersteAuszuege } = await admin
      .from("bank_statements")
      .select("statement_date_from")
      .eq("building_id", hausId)
      .not("statement_date_from", "is", null)
      .order("statement_date_from", { ascending: true })
      .limit(1);
    if (ersteAuszuege?.[0]?.statement_date_from) datenAb.set(hausId, ersteAuszuege[0].statement_date_from);
    const { data: letzteAuszuege } = await admin
      .from("bank_statements")
      .select("statement_date_to")
      .eq("building_id", hausId)
      .not("statement_date_to", "is", null)
      .order("statement_date_to", { ascending: false })
      .limit(1);
    if (letzteAuszuege?.[0]?.statement_date_to) datenBis.set(hausId, letzteAuszuege[0].statement_date_to);

    const alle: any[] = [];
    for (let seite = 0; seite < 20; seite++) {
      const { data } = await admin
        .from("bank_transactions")
        .select("id, booking_date, amount, debtor_iban, debtor_name, creditor_iban, creditor_name, purpose")
        .eq("building_id", hausId)
        .neq("amount", 0)
        .gte("booking_date", ab)
        .order("booking_date")
        .range(seite * 1000, seite * 1000 + 999);
      alle.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    for (const t of alle) {
      // Eingang: Zahler ist der Mieter. Ausgang (Rückzahlung, zurückgegebene
      // Lastschrift): Empfänger ist der Mieter – nur über die IBAN, nie über den Namen.
      const eingang = Number(t.amount) > 0;
      const iban = cleanIban(eingang ? t.debtor_iban : t.creditor_iban);
      let treffer = iban ? liste.filter((m) => m.ibans.includes(iban)) : [];
      if (treffer.length !== 1 && eingang) {
        const text = norm(`${t.debtor_name ?? ""} ${t.purpose ?? ""}`);
        treffer = liste.filter((m) => m.nachname.length >= 4 && text.includes(m.nachname));
        // mehrere gleichnamige? Einheit im Verwendungszweck entscheidet
        if (treffer.length > 1) {
          const zweck = norm(t.purpose);
          const mitEinheit = treffer.filter((m) => m.einheit && zweck.includes(norm(`whg${m.einheit}`)));
          treffer = mitEinheit.length === 1 ? mitEinheit : [];
        }
      }
      if (treffer.length === 1) {
        const id = treffer[0].assignmentId;
        zahlungen.set(id, [
          ...(zahlungen.get(id) ?? []),
          { id: t.id, datum: t.booking_date, betrag: Number(t.amount), text: t.purpose ?? (eingang ? t.debtor_name : t.creditor_name) ?? "" },
        ]);
      }
    }
  }
  return { zahlungen, datenAb, datenBis };
}

function zeitraum(m: Mieter, datenAb: string | undefined, h: string) {
  const vor12 = `${Number(h.slice(0, 4)) - 1}-${h.slice(5, 7)}`;
  // Mit Startsaldo beginnt die Kontrolle am Stichtag (auch wenn er länger zurückliegt)
  const kandidaten = [m.vortrag ? m.vortrag.stichtag.slice(0, 7) : vor12];
  if (m.beginn && !m.vortrag) kandidaten.push(m.beginn.slice(0, 7));
  if (datenAb) kandidaten.push(datenAb.slice(0, 7));
  // erster vollständiger Monat mit Kontodaten
  if (datenAb && datenAb.slice(8, 10) !== "01") {
    const [j, mo] = datenAb.slice(0, 7).split("-").map(Number);
    kandidaten.push(mo === 12 ? `${j + 1}-01` : `${j}-${String(mo + 1).padStart(2, "0")}`);
  }
  return { vonMonat: kandidaten.sort().at(-1)!, bisMonat: h.slice(0, 7) };
}

// ── Abgleich und Planung ────────────────────────────────────────────────────

async function rechne(admin: any, buildingId: string | null) {
  const { mieter, haeuser } = await ladeMieter(admin, buildingId);
  const h = heute();
  const starts = mieter.map((m) => m.vortrag?.stichtag).filter(Boolean).sort() as string[];
  const ab = [`${Number(h.slice(0, 4)) - 1}-${h.slice(5, 7)}-01`, starts[0] ? `${starts[0].slice(0, 7)}-01` : null].filter(Boolean).sort()[0] as string;
  const { zahlungen, datenAb, datenBis } = await ladeZahlungen(admin, mieter, ab);
  const { data: e } = await admin.from("mietkontrolle_einstellungen").select("*").eq("id", 1).single();
  const ergebnisse = mieter
    .filter((m) => m.kosten.length > 0 || m.vortrag)
    .map((m) => {
      // Ohne Kontoauszüge kein Abgleich (sonst wäre jeder Mieter „offen");
      // gerechnet wird nur bis zum letzten Tag mit Kontodaten.
      const bis = datenBis.get(m.buildingId);
      const ohneDaten = !datenAb.get(m.buildingId) || !bis;
      const stichtag = bis && bis < h ? plusTage(bis, 1) : h;
      const datenAlt = !!bis && bis < plusTage(h, -7);
      const z = zeitraum(m, datenAb.get(m.buildingId), stichtag);
      const ergebnis = abgleich({
        kosten: m.kosten,
        zahlungen: (zahlungen.get(m.assignmentId) ?? []).filter((x) => x.datum >= `${z.vonMonat}-01`),
        vonMonat: z.vonMonat,
        bisMonat: z.bisMonat,
        heute: stichtag,
        toleranz: Number(e?.toleranz_euro ?? 1),
        zahltag: m.zahltag,
        vortrag: m.vortrag,
      });
      return { m, ergebnis, zahlungen: zahlungen.get(m.assignmentId) ?? [], ohneDaten, datenAlt, datenBis: bis ?? null };
    });
  return { ergebnisse, haeuser, einstellungen: e };
}

/** KI-Prüfung: erklären die hinterlegten Infos die Abweichung? */
async function kiPruefung(m: Mieter, e: Ergebnis): Promise<{ mahnen: boolean; begruendung: string; am: string } | null> {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key || !m.infos.length) return null;
  const monate = [
    ...(e.vortragOffen > 0 && m.vortrag ? [`Rückstand aus der Zeit vor dem ${m.vortrag.stichtag}: ${e.vortragOffen.toFixed(2)} €`] : []),
    ...e.offeneMonate.map((x) => `${x.monat}: Soll ${x.soll.toFixed(2)} €, bezahlt ${x.bezahlt.toFixed(2)} €`),
  ].join("; ");
  const infos = m.infos.map((i) => `${i.created_at.slice(0, 10)} (${i.art}): ${i.text}`).join("\n");
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du prüfst für eine Hausverwaltung, ob eine automatische Mahnung an einen Mieter rausgehen soll. " +
              "Grundsatz: Mahnen, außer eine hinterlegte Info erklärt die Abweichung konkret (z. B. vereinbarte Ratenzahlung, die eingehalten wird; " +
              "laufender Widerspruch gegen genau diese Forderung; vereinbarter späterer Zahltag; angekündigte Zahlung mit Datum in der Zukunft). " +
              "Allgemeine oder abgelaufene Infos erklären nichts. Antworte nur als JSON: {\"mahnen\": true|false, \"begruendung\": \"ein bis zwei kurze Sätze auf Deutsch\"}.",
          },
          { role: "user", content: `Heute: ${heute()}\nMieter: ${m.name}, ${m.haus} ${m.einheit}${m.zahltag ? ` (vereinbarter Zahltag: ${m.zahltag}. des Monats)` : ""}\nOffen: ${e.rueckstand.toFixed(2)} € (${monate})\nHinterlegte Infos:\n${infos}` },
        ],
      }),
    });
    const d = await res.json();
    const out = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
    if (typeof out.mahnen !== "boolean") return null;
    return { mahnen: out.mahnen, begruendung: String(out.begruendung ?? "").slice(0, 400), am: new Date().toISOString() };
  } catch (err) {
    console.error("KI-Prüfung fehlgeschlagen:", err);
    return null;
  }
}

/**
 * Abgleich für alle (oder einen) Mieter und Mahnungen planen: je Mieter
 * höchstens ein offener Fall. Ist der Rückstand weg, wird der Fall erledigt.
 */
async function pruefen(admin: any, buildingId: string | null, nurAssignment?: string, kiNeu = false) {
  const { ergebnisse, einstellungen } = await rechne(admin, buildingId);
  const h = heute();
  let geplant = 0;
  let erledigt = 0;
  const ohneAktuelleDaten: string[] = [];
  for (const { m, ergebnis, ohneDaten, datenAlt } of ergebnisse) {
    if (nurAssignment && !m.assignmentIds.includes(nurAssignment)) continue;
    // ohne aktuelle Kontodaten wird nichts geplant und nichts erledigt
    if (ohneDaten || datenAlt) {
      ohneAktuelleDaten.push(m.assignmentId);
      continue;
    }
    const { data: faelle } = await admin
      .from("dunning_cases")
      .select("*")
      .in("assignment_id", m.assignmentIds)
      .order("created_at", { ascending: false })
      .limit(20);
    const offen = (faelle ?? []).find((f: any) => ["geplant", "ausgesetzt", "fehler"].includes(f.status));
    const versendet = (faelle ?? []).filter((f: any) => f.status === "versendet");
    // eine Mahnserie endet mit dem Ausgleich: danach beginnt sie wieder bei der Erinnerung
    const letzteErledigt = (faelle ?? []).find((f: any) => f.status === "erledigt");
    const letzte = versendet.find((f: any) => !letzteErledigt || f.versendet_am > letzteErledigt.updated_at);

    // ehemalige Mieter: nie automatisch mahnen, offene Planung zurücknehmen
    if (m.ehemalig) {
      if (offen && offen.status !== "ausgesetzt")
        await admin.from("dunning_cases").update({ status: "ausgesetzt", ausgesetzt_grund: "Ehemaliger Mieter – keine automatische Mahnung", updated_at: new Date().toISOString() }).eq("id", offen.id);
      continue;
    }

    if (ergebnis.rueckstand <= 0) {
      if (offen) {
        await admin.from("dunning_cases").update({ status: "erledigt", updated_at: new Date().toISOString() }).eq("id", offen.id);
        erledigt++;
      }
      if (letzte && !offen) {
        await admin.from("dunning_cases").update({ status: "erledigt", updated_at: new Date().toISOString() }).eq("id", letzte.id);
      }
      continue;
    }

    const plan = naechsteStufe({
      ergebnis,
      heute: h,
      letzteVersendet: letzte ? { stufe: letzte.stufe as Stufe, am: String(letzte.versendet_am).slice(0, 10) } : null,
      erinnerungNach: einstellungen?.erinnerung_nach_tagen ?? 5,
      abstand: einstellungen?.mahnung_abstand_tagen ?? 14,
    });
    if (!plan) continue;

    const posten = [
      ...(ergebnis.vortragOffen > 0 ? [{ monat: "vortrag", soll: ergebnis.vortragOffen, bezahlt: 0, offen: ergebnis.vortragOffen }] : []),
      ...ergebnis.offeneMonate.map((x) => ({ monat: x.monat, soll: x.soll, bezahlt: x.bezahlt, offen: Math.round((x.soll - x.bezahlt) * 100) / 100 })),
    ];
    const betragGeaendert = !offen || Math.abs(Number(offen.betrag) - ergebnis.rueckstand) > 0.01;
    let ki = offen?.ki_pruefung ?? null;
    if (m.infos.length && (kiNeu || betragGeaendert || !ki)) ki = await kiPruefung(m, ergebnis);
    if (!m.infos.length) ki = null;

    const werte: any = {
      building_id: m.buildingId,
      assignment_id: m.assignmentId,
      stufe: plan.stufe,
      betrag: ergebnis.rueckstand,
      posten,
      geplant_am: plan.geplantAm,
      frist_bis: plusTage(plan.geplantAm, einstellungen?.zahlungsfrist_tagen ?? 10),
      kuendigung_pruefen: plan.kuendigungPruefen,
      ki_pruefung: ki,
      updated_at: new Date().toISOString(),
    };
    // von Hand ausgesetzt bleibt ausgesetzt; die KI kann aussetzen oder wieder einplanen
    if (!offen || offen.status !== "ausgesetzt" || !offen.ausgesetzt_von) {
      werte.status = ki && ki.mahnen === false ? "ausgesetzt" : "geplant";
      werte.ausgesetzt_grund = ki && ki.mahnen === false ? `Laut hinterlegter Info: ${ki.begruendung}` : null;
    }
    let fallId = offen?.id;
    if (offen) await admin.from("dunning_cases").update(werte).eq("id", offen.id);
    else {
      const { data } = await admin.from("dunning_cases").insert(werte).select("id").single();
      fallId = data?.id;
    }
    geplant++;

    if (plan.kuendigungPruefen && fallId) await aufgabe(admin, m, fallId, `Kündigung prüfen: ${m.name} (${m.haus} ${m.einheit})`,
      `Rückstand ${ergebnis.rueckstand.toFixed(2).replace(".", ",")} € – mindestens zwei Monatsmieten (§ 543 Abs. 2 Nr. 3 BGB). Die App kündigt nicht selbst. Zahlt der Mieter bis zwei Monate nach Zustellung einer Räumungsklage, wird eine fristlose Kündigung unwirksam (§ 569 Abs. 3 Nr. 2 BGB).`);
  }
  return { mieter: ergebnisse.length, geplant, erledigt, ohneAktuelleDaten };
}

async function aufgabe(admin: any, m: Mieter, fallId: string, titel: string, text: string) {
  const { data: schon } = await admin.from("todos").select("id").eq("source_type", "dunning").eq("source_id", fallId).neq("status", "done").limit(1);
  if (schon?.length) return;
  const { data: chef } = await admin.from("profiles").select("user_id").eq("role", "admin").limit(1);
  const wer = chef?.[0]?.user_id ?? null;
  await admin.from("todos").insert({
    title: titel,
    description: text,
    status: "open",
    priority: "high",
    source_type: "dunning",
    source_id: fallId,
    building_id: m.buildingId,
    created_by: wer,
    assigned_to: wer,
    due_date: heute(),
    is_internal: true,
  });
}

// ── Versand ─────────────────────────────────────────────────────────────────

async function faelligeSenden(admin: any) {
  const { data: faelle } = await admin.from("dunning_cases").select("id").eq("status", "geplant").lte("geplant_am", heute());
  let gesendet = 0;
  let fehler = 0;
  for (const f of faelle ?? []) {
    const r = await senden(admin, f.id);
    if (r.ok) gesendet++;
    else fehler++;
  }
  return { gesendet, fehler };
}

async function vorschau(admin: any, caseId: string) {
  const { data: f } = await admin.from("dunning_cases").select("*").eq("id", caseId).single();
  if (!f) throw new Error("Mahnung nicht gefunden");
  const { mieter } = await ladeMieter(admin, f.building_id);
  const m = mieter.find((x) => x.assignmentIds.includes(f.assignment_id));
  if (!m) throw new Error("Mieter nicht gefunden");
  const offen = (f.posten ?? []).map((p: any) => ({ monat: p.monat, faellig: "", soll: p.soll, bezahlt: p.bezahlt, bezahltAm: null, status: "offen" as const }));
  const s = schreiben({ stufe: f.stufe, anrede: m.anrede, offen, frist: f.frist_bis ?? plusTage(heute(), 10), objekt: `${m.haus}${m.einheit ? `, ${m.einheit}` : ""}` });
  return { ...s, an: m.name, email: m.emails[0] ?? null, app: !!m.userId, adresse: `${m.name}, ${m.haus}${m.einheit ? `, ${m.einheit}` : ""}` };
}

/** Eine Mahnung senden: vorher neu abgleichen; E-Mail und App-Nachricht, nie Post. */
async function senden(admin: any, caseId: string): Promise<{ ok: boolean; fehler?: string }> {
  const { data: f0 } = await admin.from("dunning_cases").select("*").eq("id", caseId).single();
  if (!f0 || !["geplant", "fehler"].includes(f0.status)) return { ok: false, fehler: "Mahnung ist nicht (mehr) geplant." };
  // unmittelbar vorher neu abgleichen
  const p = await pruefen(admin, f0.building_id, f0.assignment_id);
  if (p.ohneAktuelleDaten.includes(f0.assignment_id)) return { ok: false, fehler: "Kontoauszüge sind nicht aktuell – bitte erst abrufen, dann senden." };
  const { data: f } = await admin.from("dunning_cases").select("*").eq("id", caseId).single();
  if (!f || f.status !== "geplant") return { ok: false, fehler: f?.status === "erledigt" ? "Inzwischen bezahlt – nichts gesendet." : "Nach neuer Prüfung ausgesetzt." };

  const v = await vorschau(admin, caseId);
  const { mieter } = await ladeMieter(admin, f.building_id);
  const m = mieter.find((x) => x.assignmentIds.includes(f.assignment_id))!;
  const kanaele: string[] = [];
  let fehlerText: string | null = null;

  // E-Mail
  const { data: e } = await admin.from("mietkontrolle_einstellungen").select("email_account_id").eq("id", 1).single();
  if (m.emails.length && e?.email_account_id) {
    try {
      await emailSenden(admin, e.email_account_id, m.emails[0], v.betreff, v.text);
      kanaele.push("email");
    } catch (err) {
      fehlerText = `E-Mail fehlgeschlagen: ${(err as Error).message}`;
    }
  } else if (!e?.email_account_id) {
    fehlerText = "Kein Absender-Postfach in den Einstellungen der Mietkontrolle gewählt.";
  }
  // App-Nachricht (nur wenn der Mieter ein Konto in der App hat)
  if (m.userId) {
    const { error } = await admin.from("notifications").insert({
      user_id: m.userId,
      type: "mahnung",
      title: v.betreff,
      body: v.text.slice(0, 1500),
      ref_type: "dunning_case",
      ref_id: f.id,
    });
    if (!error) kanaele.push("app");
  }

  if (!kanaele.length) {
    const grund = fehlerText ?? "Keine E-Mail-Adresse und kein App-Zugang hinterlegt.";
    await admin.from("dunning_cases").update({ status: "fehler", fehler: grund, updated_at: new Date().toISOString() }).eq("id", f.id);
    await aufgabe(admin, m, f.id, `Mahnung nicht zugestellt: ${m.name}`, `${grund} Bitte Kontakt ergänzen oder den Mieter anders erreichen (keine Post vorgesehen).`);
    return { ok: false, fehler: grund };
  }
  await admin
    .from("dunning_cases")
    .update({ status: "versendet", versendet_am: new Date().toISOString(), kanaele, email_an: kanaele.includes("email") ? m.emails[0] : null, fehler: fehlerText, updated_at: new Date().toISOString() })
    .eq("id", f.id);
  return { ok: true };
}

async function emailSenden(admin: any, accountId: string, an: string, betreff: string, text: string) {
  const { data: account } = await admin.from("email_accounts").select("*").eq("id", accountId).single();
  if (!account) throw new Error("Postfach nicht gefunden");
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth: { user: account.smtp_user, pass: account.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
  });
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;white-space:pre-line">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>${account.signature_html ?? ""}`;
  await transporter.sendMail({ from: `${account.display_name} <${account.email_address}>`, to: an, subject: betreff, text, html });
  const { data: gesendet } = await admin.from("email_folders").select("id").eq("name", "Gesendet").single();
  await admin.from("emails").insert({
    account_id: account.id,
    folder_id: gesendet?.id,
    subject: betreff,
    from_address: account.email_address,
    from_name: account.display_name,
    to_addresses: [an],
    body_text: text,
    body_html: html,
    date: new Date().toISOString(),
    is_read: true,
    has_attachments: false,
    message_id: `mahnung-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
}

// ── Ansichten ───────────────────────────────────────────────────────────────

async function uebersicht(admin: any, buildingId: string | null) {
  const { ergebnisse, haeuser, einstellungen } = await rechne(admin, buildingId);
  const ids = ergebnisse.flatMap((x) => x.m.assignmentIds);
  const faelle: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from("dunning_cases").select("*").in("assignment_id", ids.slice(i, i + 150)).in("status", ["geplant", "ausgesetzt", "fehler"]);
    faelle.push(...(data ?? []));
  }
  const mieter = ergebnisse
    // ehemalige nur, solange noch etwas offen ist (oder ein Guthaben besteht)
    .filter(({ m, ergebnis, ohneDaten }) => !m.ehemalig || (!ohneDaten && (ergebnis.rueckstand > 0 || ergebnis.guthaben > 0)) || (ohneDaten && !!m.vortrag))
    .map(({ m, ergebnis, zahlungen, ohneDaten, datenAlt, datenBis }) => {
      const fall = faelle.find((f) => m.assignmentIds.includes(f.assignment_id)) ?? null;
      return {
        assignmentId: m.assignmentId,
        buildingId: m.buildingId,
        haus: m.haus,
        name: m.name,
        einheit: m.einheit,
        email: m.emails[0] ?? null,
        app: !!m.userId,
        assignmentIds: m.assignmentIds,
        ehemalig: m.ehemalig,
        zahltag: m.zahltag,
        vortrag: m.vortrag,
        vortragOffen: ohneDaten ? 0 : ergebnis.vortragOffen,
        sollMonat: ergebnis.sollMonat,
        // alle Beträge, die der Mieter zahlen muss (je Einheit und Art, mit Zeitraum)
        sollPosten: [...m.kosten].sort(
          (x: any, y: any) =>
            String(x.einheit).localeCompare(String(y.einheit), "de", { numeric: true }) ||
            String(x.cost_type).localeCompare(String(y.cost_type), "de") ||
            String(x.valid_from ?? "").localeCompare(String(y.valid_from ?? "")),
        ),
        rueckstand: ohneDaten ? 0 : ergebnis.rueckstand,
        guthaben: ergebnis.guthaben,
        monate: ergebnis.monate.slice(-12),
        infos: m.infos,
        fall,
        letzteZahlungen: [...zahlungen].sort((x, y) => x.datum.localeCompare(y.datum)).slice(-8).reverse(),
        ohneDaten,
        datenAlt,
        datenBis,
      };
    })
    .sort((a, b) => a.haus.localeCompare(b.haus, "de") || a.einheit.localeCompare(b.einheit, "de", { numeric: true }) || a.name.localeCompare(b.name, "de"));
  const monat = heute().slice(0, 7);
  const imMonat = (x: any) => x.monate.find((mo: any) => mo.monat === monat);
  return {
    haeuser,
    einstellungen,
    mieter,
    summen: {
      soll: mieter.reduce((s, x) => s + (imMonat(x)?.soll ?? 0), 0),
      ist: mieter.reduce((s, x) => s + (imMonat(x)?.bezahlt ?? 0), 0),
      rueckstand: mieter.reduce((s, x) => s + x.rueckstand, 0),
    },
  };
}

async function mahnungen(admin: any) {
  const { data: faelle } = await admin
    .from("dunning_cases")
    .select("*, contact_building_assignments(unit_number, contacts(first_name, last_name, company_name)), buildings(name)")
    .or(`status.in.(geplant,ausgesetzt,fehler),versendet_am.gte.${plusTage(heute(), -183)}`)
    .order("geplant_am", { ascending: true });
  const { data: e } = await admin.from("mietkontrolle_einstellungen").select("*").eq("id", 1).single();
  const { data: postfaecher } = await admin.from("email_accounts").select("id, display_name, email_address").eq("is_active", true);
  return {
    einstellungen: e,
    postfaecher: postfaecher ?? [],
    faelle: (faelle ?? []).map((f: any) => {
      const c = f.contact_building_assignments?.contacts ?? {};
      return { ...f, name: c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Mieter", einheit: f.contact_building_assignments?.unit_number ?? "", haus: f.buildings?.name ?? "" };
    }),
  };
}

async function fallpaket(admin: any, assignmentId: string) {
  const { data: a } = await admin.from("contact_building_assignments").select("building_id").eq("id", assignmentId).single();
  if (!a) throw new Error("Mieter nicht gefunden");
  const { ergebnisse } = await rechne(admin, a.building_id);
  const x = ergebnisse.find((r) => r.m.assignmentIds.includes(assignmentId));
  if (!x) throw new Error("Für diesen Mieter ist keine Soll-Miete hinterlegt");
  const { data: faelle } = await admin.from("dunning_cases").select("stufe, status, betrag, geplant_am, versendet_am, ausgesetzt_grund, ki_pruefung").in("assignment_id", x.m.assignmentIds).order("created_at");
  return {
    erstellt: new Date().toISOString(),
    hinweis: "Fallpaket aus der RGI-Verwaltungsapp für den Claude-Skill „Mieterkonto“. Enthält nur Daten dieses Mieters.",
    mieter: { name: x.m.name, objekt: x.m.haus, einheit: x.m.einheit, mietbeginn: x.m.beginn, ehemalig: x.m.ehemalig, zahltag: x.m.zahltag ?? "3. Werktag", startsaldo: x.m.vortrag },
    soll: x.m.kosten,
    abgleich: { rueckstand: x.ergebnis.rueckstand, davonStartsaldo: x.ergebnis.vortragOffen, guthaben: x.ergebnis.guthaben, monate: x.ergebnis.monate },
    zahlungen: x.zahlungen,
    infos: x.m.infos,
    mahnungen: faelle ?? [],
  };
}
