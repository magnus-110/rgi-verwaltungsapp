// E-Mail-Benachrichtigungen an Eigentümer.
//
// Läuft alle 5 Minuten (pg_cron, Header x-cron-secret):
//   1. sammeln  – sucht neue Anlässe und legt je Empfänger eine Zeile in
//                 public.benachrichtigungen an (Nutzer, Art, Bezug sind
//                 eindeutig – nichts kommt doppelt)
//   2. senden   – verschickt offene Zeilen über das System-Postfach,
//                 beachtet die Einstellungen des Eigentümers und schickt
//                 zwischen 21 und 7 Uhr nichts
//
// Ohne Anmeldung erreichbar (Links in den Mails):
//   GET ?abmelden=<token>              → keine Angebote mehr per E-Mail
//   GET ?kalender=<versammlung>&t=<token> → Kalender-Eintrag (.ics)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import { sendSystemMail } from "../_shared/system-mail.ts";
import { esc } from "../_shared/mail-templates.ts";
import {
  absatz,
  fussEinstellungen,
  kasten,
  knopf,
  knopfZweit,
  liste,
  rahmen,
  zeilen,
  zwischen,
  type Mail,
} from "../_shared/benachrichtigung-mails.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const APP = "https://rgi-immobilien.app";
const FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/benachrichtigungen`;
const FOTO = "https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/makler-fotos/";
/** Nur Anlässe ab diesem Zeitpunkt (Start der Benachrichtigungen) – kein Nachsenden von Altem. */
const START = "2026-10-20T10:00:00Z";
const STD = 3600_000;

// deno-lint-ignore no-explicit-any
type Db = any;

// ───────────────────────── Zeit (Europe/Berlin) ─────────────────────────
function berlin(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { datum: `${p.year}-${p.month}-${p.day}`, stunde: Number(p.hour) % 24 };
}
/** UTC-Zeitpunkt für „Datum (Berlin) um Stunde“ */
function berlinZeit(datum: string, stunde: number): Date {
  const roh = new Date(`${datum}T${String(stunde).padStart(2, "0")}:00:00Z`);
  const b = berlin(roh);
  const versatz = (b.stunde - stunde + 24) % 24; // 1 oder 2 Stunden
  return new Date(roh.getTime() - versatz * STD);
}
const plusTage = (datum: string, n: number) => {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ab = (stunden: number) => new Date(Math.max(new Date(START).getTime(), Date.now() - stunden * STD)).toISOString();
const deDatum = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const deTag = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const deUhr = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
const ibanKurz = (i: string | null | undefined) => {
  const s = (i ?? "").replace(/\s/g, "");
  return s ? `${s.slice(0, 4)} •••• ${s.slice(-4)}` : "";
};
const einheitText = (u: string | null | undefined) => (u ? (/^\d+$/.test(u) ? u.padStart(4, "0") : u) : "");

// ───────────────────────── Empfänger ─────────────────────────
async function eigentuemerVon(db: Db, buildingId: string | null): Promise<string[]> {
  if (!buildingId) return [];
  const { data } = await db.from("weg_owner_buildings").select("user_id").eq("building_id", buildingId);
  return [...new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean))] as string[];
}

async function eintragen(db: Db, rows: { user_id: string; art: string; ref: string; daten: unknown; senden_ab?: string }[]) {
  if (!rows.length) return 0;
  const { error } = await db.from("benachrichtigungen").upsert(rows, { onConflict: "user_id,art,ref", ignoreDuplicates: true });
  if (error) console.error("[benachrichtigungen] eintragen", error.message);
  return rows.length;
}

// ───────────────────────── 1. Sammeln ─────────────────────────
async function sammleMeldungen(db: Db) {
  const { data } = await db
    .from("report_events")
    .select("id, kind, body, step_label, created_at, created_by, sent_by_email, reports!inner(id, title, report_number, reported_by, created_at)")
    .eq("visible_to_reporter", true)
    .in("kind", ["message", "step"])
    .gte("created_at", ab(48));
  const rows = [];
  for (const e of data ?? []) {
    const r = e.reports;
    if (!r?.reported_by || e.created_by === r.reported_by || e.sent_by_email) continue;
    const erledigt = e.kind === "step" && e.step_label === "Erledigt";
    rows.push({
      user_id: r.reported_by,
      art: erledigt ? "meldung_erledigt" : "meldung_antwort",
      ref: e.id,
      daten: { report_id: r.id, titel: r.title, gemeldet: r.created_at, text: e.body, schritt: e.step_label, am: e.created_at },
    });
  }
  return eintragen(db, rows);
}

async function versammlungDaten(db: Db, m: any) {
  const { data: tops } = await db.from("etv_agenda_items").select("title, sort_order").eq("meeting_id", m.id).order("sort_order");
  const { data: b } = await db.from("buildings").select("name").eq("id", m.building_id).maybeSingle();
  return { meeting_id: m.id, titel: m.title, datum: m.meeting_date, ort: m.location, gebaeude: b?.name ?? "", tops: (tops ?? []).map((t: any) => t.title) };
}

async function sammleVersammlungen(db: Db, jetzt: ReturnType<typeof berlin>) {
  let n = 0;
  // Einladung veröffentlicht
  const { data: neu } = await db.from("etv_meetings").select("id, building_id, title, meeting_date, location").gte("invitation_sent_at", ab(72));
  for (const m of neu ?? []) {
    const daten = await versammlungDaten(db, m);
    n += await eintragen(db, (await eigentuemerVon(db, m.building_id)).map((u) => ({ user_id: u, art: "einladung", ref: m.id, daten })));
  }
  // Erinnerung 3 Tage vorher (ab 7 Uhr)
  if (jetzt.stunde >= 7) {
    const tag = plusTage(jetzt.datum, 3);
    const { data: bald } = await db
      .from("etv_meetings")
      .select("id, building_id, title, meeting_date, location, status, invitation_sent_at")
      .not("invitation_sent_at", "is", null)
      .gte("meeting_date", berlinZeit(tag, 0).toISOString())
      .lt("meeting_date", berlinZeit(plusTage(tag, 1), 0).toISOString());
    for (const m of bald ?? []) {
      if (["completed", "cancelled", "abgesagt"].includes(String(m.status))) continue;
      const daten = await versammlungDaten(db, m);
      n += await eintragen(db, (await eigentuemerVon(db, m.building_id)).map((u) => ({ user_id: u, art: "erinnerung", ref: m.id, daten })));
    }
  }
  return n;
}

async function sammleTerminumfragen(db: Db) {
  let n = 0;
  const { data: polls } = await db.from("etv_date_polls").select("id, building_id, closes_at, created_at, status").eq("status", "open");
  for (const p of polls ?? []) {
    const { data: opts } = await db.from("etv_date_poll_options").select("proposed_date").eq("poll_id", p.id).order("sort_order");
    const { data: b } = await db.from("buildings").select("name").eq("id", p.building_id).maybeSingle();
    const daten = { poll_id: p.id, gebaeude: b?.name ?? "", termine: (opts ?? []).map((o: any) => o.proposed_date), frist: p.closes_at };
    const empfaenger = await eigentuemerVon(db, p.building_id);
    if (p.created_at >= ab(72)) n += await eintragen(db, empfaenger.map((u) => ({ user_id: u, art: "terminumfrage", ref: p.id, daten })));
    // Erinnerung 2 Tage vor Ende – nur wer noch nicht abgestimmt hat
    if (p.closes_at && new Date(p.closes_at).getTime() - Date.now() < 48 * STD && new Date(p.closes_at).getTime() > Date.now() && p.created_at < ab(24)) {
      const { data: antworten } = await db.from("etv_date_poll_responses").select("contact_id").eq("poll_id", p.id);
      const abgestimmt = new Set((antworten ?? []).map((a: any) => a.contact_id));
      const { data: kontakte } = await db.from("contacts").select("id, user_id").in("user_id", empfaenger.length ? empfaenger : ["00000000-0000-0000-0000-000000000000"]);
      const offen = empfaenger.filter((u) => !(kontakte ?? []).some((k: any) => k.user_id === u && abgestimmt.has(k.id)));
      n += await eintragen(db, offen.map((u) => ({ user_id: u, art: "terminumfrage_erinnerung", ref: p.id, daten })));
    }
  }
  return n;
}

async function sammleUmfragen(db: Db) {
  const { data } = await db.from("surveys").select("id, building_id, title, description, closes_at, opens_at, updated_at").eq("status", "open").eq("is_visible_to_owners", true);
  let n = 0;
  for (const s of data ?? []) {
    const seit = s.opens_at ?? s.updated_at;
    if (!seit || seit < ab(72) || new Date(seit).getTime() > Date.now()) continue;
    const daten = { survey_id: s.id, titel: s.title, text: s.description, frist: s.closes_at };
    n += await eintragen(db, (await eigentuemerVon(db, s.building_id)).map((u) => ({ user_id: u, art: "umfrage", ref: s.id, daten })));
  }
  return n;
}

async function sammleAushaenge(db: Db) {
  const { data } = await db.from("forum_posts").select("id, title, content, author_id, building_id, created_at").gte("created_at", ab(48));
  let n = 0;
  for (const p of data ?? []) {
    if (!p.building_id || !p.author_id) continue;
    const { data: autor } = await db.from("profiles").select("role").eq("user_id", p.author_id).maybeSingle();
    if (!["admin", "employee"].includes(String(autor?.role))) continue; // nur Aushänge von RGI
    const { data: b } = await db.from("buildings").select("name").eq("id", p.building_id).maybeSingle();
    const text = String(p.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const daten = { titel: p.title, text: text.length > 700 ? text.slice(0, 700) + " …" : text, gebaeude: b?.name ?? "" };
    n += await eintragen(db, (await eigentuemerVon(db, p.building_id)).filter((u) => u !== p.author_id).map((u) => ({ user_id: u, art: "aushang", ref: p.id, daten })));
  }
  return n;
}

async function sammleDokumente(db: Db, jetzt: ReturnType<typeof berlin>) {
  if (jetzt.stunde < 7) return 0;
  const bis = berlinZeit(jetzt.datum, 7);
  const von = new Date(Math.max(bis.getTime() - 24 * STD, new Date(START).getTime()));
  if (von >= bis) return 0;
  const { data: dateien } = await db
    .from("building_files")
    .select("id, display_name, building_id, visibility_role, assigned_user_id, is_current_version, archived_at, buildings(name)")
    .is("deleted_at", null)
    .gte("created_at", von.toISOString())
    .lt("created_at", bis.toISOString());
  const proNutzer = new Map<string, { persoenlich: any[]; haus: any[] }>();
  const add = (u: string, wo: "persoenlich" | "haus", f: any) => {
    const x = proNutzer.get(u) ?? { persoenlich: [], haus: [] };
    if (!x.persoenlich.some((y) => y.id === f.id) && !x.haus.some((y) => y.id === f.id)) x[wo].push({ id: f.id, name: f.display_name, gebaeude: f.buildings?.name ?? "" });
    proNutzer.set(u, x);
  };
  for (const f of dateien ?? []) {
    if (f.is_current_version === false || f.archived_at) continue;
    const eigentuemer = await eigentuemerVon(db, f.building_id);
    if (["alle", "eigentuemer"].includes(String(f.visibility_role))) eigentuemer.forEach((u) => add(u, "haus", f));
    if (f.assigned_user_id && eigentuemer.includes(f.assigned_user_id)) add(f.assigned_user_id, "persoenlich", f);
    const { data: frei } = await db.from("building_file_visibility").select("contacts(user_id)").eq("file_id", f.id);
    for (const r of frei ?? []) {
      const u = r.contacts?.user_id;
      if (u && eigentuemer.includes(u)) add(u, "persoenlich", f);
    }
  }
  const rows = [...proNutzer.entries()].map(([u, d]) => ({ user_id: u, art: "dokumente", ref: jetzt.datum, daten: d }));
  return eintragen(db, rows);
}

async function sammleLastschriften(db: Db) {
  const felder =
    "id, betrag, iban, mandatsreferenz, verwendungszweck, created_at, order_item_id, einzel_status, einzel_gesendet_am, " +
    "run:payment_runs!inner(id, art, status, gesendet_am, faellig_am, glaeubiger_id, konto_inhaber), " +
    "item:payment_order_items(assignment_id, order:payment_orders(art))";
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from("payment_run_items").select(felder).eq("run.art", "lastschrift").eq("run.status", "gesendet").gte("run.gesendet_am", ab(72)),
    db.from("payment_run_items").select(felder).eq("run.art", "lastschrift").eq("einzel_status", "gesendet").gte("einzel_gesendet_am", ab(72)),
  ]);
  const posten = [...new Map([...(a ?? []), ...(b ?? [])].map((p: any) => [p.id, p])).values()];
  const gruppen = new Map<string, { user_id: string; art: string; ref: string; daten: any }>();
  for (const p of posten) {
    const assignment = p.item?.assignment_id;
    if (!assignment) continue;
    const { data: z } = await db.from("contact_building_assignments").select("unit_number, floor_location, contacts(user_id)").eq("id", assignment).maybeSingle();
    const user = z?.contacts?.user_id;
    if (!user) continue;
    const dauer = p.item?.order?.art === "dauerlastschrift";
    let art = "lastschrift";
    let bisher: number | null = null;
    if (dauer) {
      const { data: frueher } = await db
        .from("payment_run_items")
        .select("betrag, created_at, einzel_status, run:payment_runs!inner(status)")
        .eq("order_item_id", p.order_item_id)
        .lt("created_at", p.created_at)
        .order("created_at", { ascending: false })
        .limit(5);
      const vorher = (frueher ?? []).find((f: any) => f.run?.status === "gesendet" || f.einzel_status === "gesendet");
      if (!vorher || Math.abs(Number(vorher.betrag) - Number(p.betrag)) < 0.005) continue; // nur bei geändertem Hausgeld
      art = "hausgeld";
      bisher = Number(vorher.betrag);
    }
    const key = `${user}|${art}|${p.run.id}`;
    const g = gruppen.get(key) ?? {
      user_id: user,
      art,
      ref: p.run.id,
      daten: { datum: p.run.faellig_am, empfaenger: p.run.konto_inhaber, glaeubiger: p.run.glaeubiger_id, posten: [] as any[] },
    };
    g.daten.posten.push({
      betrag: Number(p.betrag),
      bisher,
      zweck: p.verwendungszweck,
      iban: ibanKurz(p.iban),
      mandat: p.mandatsreferenz,
      einheit: [einheitText(z?.unit_number), z?.floor_location].filter(Boolean).join(" · "),
    });
    gruppen.set(key, g);
  }
  return eintragen(db, [...gruppen.values()]);
}

async function sammleAngebote(db: Db) {
  const { data: s } = await db.from("rgi_company_settings").select("portal_immobilien_aktiv").limit(1).maybeSingle();
  if (!s?.portal_immobilien_aktiv) return 0;
  const { data: liste } = await db.rpc("public_listings", { _channel: "portal" }).then((r: any) => r, () => ({ data: null }));
  const alle: any[] = Array.isArray(liste) ? liste : [];
  if (!alle.length) return 0;
  const ids = alle.map((x) => x.id);
  const { data: props } = await db.from("broker_properties").select("id, portal_zielgruppe, portal_orte, portal_gebaeude, portal_bis").in("id", ids);
  const heute = new Date().toISOString().slice(0, 10);
  const sichtbar = (props ?? []).filter((p: any) => !p.portal_bis || p.portal_bis >= heute);
  const { data: bekannt } = await db.from("benachrichtigung_angebote_bekannt").select("property_id");
  const bek = new Set((bekannt ?? []).map((b: any) => b.property_id));
  const neue = sichtbar.filter((p: any) => !bek.has(p.id));
  if (!neue.length) return 0;
  await db.from("benachrichtigung_angebote_bekannt").upsert(neue.map((p: any) => ({ property_id: p.id })), { ignoreDuplicates: true });
  if (!bek.size) return 0; // erster Lauf: Bestand übernehmen, keine Mails
  const { data: wollen } = await db.from("owner_portal_einstellungen").select("user_id").eq("angebote_hinweis", true);
  const rows = [];
  for (const p of neue) {
    const l = alle.find((x) => x.id === p.id);
    for (const w of wollen ?? []) {
      const { data: darf } = await db.rpc("portal_darf_sehen_fuer", { _uid: w.user_id, _zg: p.portal_zielgruppe, _orte: p.portal_orte, _geb: p.portal_gebaeude });
      if (!darf) continue;
      rows.push({
        user_id: w.user_id,
        art: "angebot",
        ref: p.id,
        daten: {
          id: p.id,
          titel: l.title,
          art: l.listing_type,
          preis: l.listing_type === "sale" ? l.price_eur : l.cold_rent_eur,
          ort: [l.postal_code, l.city].filter(Boolean).join(" "),
          zimmer: l.rooms,
          flaeche: l.living_space_sqm,
          bild: l.images?.[0]?.path ? FOTO + String(l.images[0].path).split("/").map(encodeURIComponent).join("/") : null,
        },
      });
    }
  }
  return eintragen(db, rows);
}

// ───────────────────────── 2. Mails bauen ─────────────────────────
const LINK_EINSTELLUNGEN = `${APP}/weg-owner/settings?bereich=benachrichtigungen`;
const KATEGORIE: Record<string, string | null> = {
  meldung_antwort: "mail_meldungen",
  meldung_erledigt: "mail_meldungen",
  einladung: "mail_versammlungen",
  erinnerung: "mail_versammlungen",
  terminumfrage: "mail_versammlungen",
  terminumfrage_erinnerung: "mail_versammlungen",
  umfrage: "mail_umfragen",
  dokumente: "mail_dokumente",
  aushang: "mail_aushaenge",
  angebot: "angebote_hinweis",
  lastschrift: null, // immer
  hausgeld: null, // immer
};

function baueMail(art: string, d: any, anrede: string, token: string): Mail | null {
  const fuss = fussEinstellungen(LINK_EINSTELLUNGEN);
  switch (art) {
    case "meldung_antwort":
      return {
        subject: `Neue Antwort zu Ihrer Meldung: ${d.titel}`,
        html: rahmen({
          schild: "Meldung",
          titel: "Neue Antwort zu Ihrer Meldung",
          vorschau: String(d.text ?? d.schritt ?? "").slice(0, 120),
          anrede,
          inhalt:
            absatz("wir haben auf Ihre Meldung geantwortet.", "margin-top:8px;") +
            kasten(
              `<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#2B2622;">${esc(d.titel)}</p>` +
                `<p style="margin:4px 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:#6B625A;">gemeldet am ${deDatum(d.gemeldet)}${d.schritt ? ` · ${esc(d.schritt)}` : ""}</p>` +
                (d.text ? `<p style="margin:12px 0 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#2B2622;white-space:pre-line;">${esc(d.text)}</p>` : ""),
              true,
            ) +
            knopf("In der App antworten", `${APP}/weg-owner/reports?meldung=${d.report_id}`),
          fuss,
        }),
      };
    case "meldung_erledigt":
      return {
        subject: `Ihre Meldung ist erledigt: ${d.titel}`,
        html: rahmen({
          schild: "Meldung",
          titel: "Ihre Meldung ist erledigt",
          vorschau: `${d.titel} – erledigt am ${deDatum(d.am)}`,
          anrede,
          inhalt:
            absatz("wir haben Ihre Meldung abgeschlossen. Danke, dass Sie uns Bescheid gegeben haben.", "margin-top:8px;") +
            zeilen([
              ["Meldung", d.titel],
              ["Gemeldet", deDatum(d.gemeldet)],
              ["Erledigt", deDatum(d.am)],
            ]) +
            (d.text ? absatz(esc(d.text), "white-space:pre-line;") : "") +
            absatz("Ist noch etwas nicht in Ordnung? Antworten Sie einfach in der App auf die Meldung.", "font-size:14px;") +
            knopf("Meldung in der App ansehen", `${APP}/weg-owner/reports?meldung=${d.report_id}`),
          fuss,
        }),
      };
    case "einladung":
    case "erinnerung": {
      const einladung = art === "einladung";
      const tops = (d.tops ?? []) as string[];
      return {
        subject: einladung ? `Einladung: Eigentümerversammlung am ${deDatum(d.datum)}` : `In 3 Tagen: Eigentümerversammlung am ${deDatum(d.datum)}`,
        html: rahmen({
          schild: "Versammlung",
          titel: einladung ? "Einladung zur Eigentümerversammlung" : "Bald ist Eigentümerversammlung",
          vorschau: `${deTag(d.datum)}, ${deUhr(d.datum)} Uhr`,
          anrede,
          inhalt:
            absatz(
              einladung
                ? `die Einladung zur Versammlung Ihrer Gemeinschaft ${esc(d.gebaeude)} steht jetzt in der App.`
                : `in drei Tagen ist die Versammlung Ihrer Gemeinschaft ${esc(d.gebaeude)}. Wir freuen uns auf Sie.`,
              "margin-top:8px;",
            ) +
            zeilen([
              ["Wann", `${deTag(d.datum)}, ${deUhr(d.datum)} Uhr`],
              ["Wo", d.ort],
              ["Gemeinschaft", d.gebaeude],
            ]) +
            (einladung && tops.length
              ? zwischen("Tagesordnung") +
                `<ol style="margin:10px 0 0 0;padding-left:22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#3F3832;">${tops
                  .slice(0, 5)
                  .map((t) => `<li>${esc(t)}</li>`)
                  .join("")}</ol>` +
                (tops.length > 5 ? absatz(`… und ${tops.length - 5} weitere Punkte in der App`, "font-size:14px;margin-top:4px;") : "")
              : "") +
            (einladung ? "" : absatz("Tagesordnung und Unterlagen finden Sie in der App. Sie können nicht kommen? Dort können Sie auch jemanden bevollmächtigen.", "font-size:15px;")) +
            knopf(einladung ? "Einladung in der App öffnen" : "Unterlagen in der App", `${APP}/weg-owner/meetings?versammlung=${d.meeting_id}`) +
            knopfZweit("In den Kalender", `${FN}?kalender=${d.meeting_id}&t=${token}`),
          fuss,
        }),
      };
    }
    case "terminumfrage":
    case "terminumfrage_erinnerung": {
      const erinnerung = art === "terminumfrage_erinnerung";
      const termine = ((d.termine ?? []) as string[])
        .map((t) => `<li>${esc(new Date(`${t}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }))}</li>`)
        .join("");
      return {
        subject: erinnerung ? "Erinnerung: Terminumfrage zur Versammlung" : "Terminumfrage: Wann passt Ihnen die Versammlung?",
        html: rahmen({
          schild: "Terminumfrage",
          titel: erinnerung ? "Noch abstimmen: Termin der Versammlung" : "Wann passt Ihnen die Versammlung?",
          vorschau: d.frist ? `Abstimmen bis ${deDatum(d.frist)}` : "Jetzt abstimmen",
          anrede,
          inhalt:
            absatz(
              erinnerung
                ? `die Terminumfrage für die Versammlung der Gemeinschaft ${esc(d.gebaeude)} endet bald. Sie haben noch nicht abgestimmt.`
                : `für die nächste Versammlung der Gemeinschaft ${esc(d.gebaeude)} suchen wir einen Termin, der möglichst vielen passt.`,
              "margin-top:8px;",
            ) +
            (termine ? kasten(`<ul style="margin:0;padding-left:20px;font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#2B2622;">${termine}</ul>`, true) : "") +
            (d.frist ? absatz(`Abstimmen bis ${deTag(d.frist)} – dauert eine Minute.`, "font-size:14px;") : "") +
            knopf("Jetzt abstimmen", `${APP}/weg-owner/terminabfrage`),
          fuss,
        }),
      };
    }
    case "umfrage":
      return {
        subject: `Neue Umfrage: ${d.titel}`,
        html: rahmen({
          schild: "Umfrage",
          titel: "Ihre Meinung ist gefragt",
          vorschau: d.titel,
          anrede,
          inhalt:
            absatz("in der App gibt es eine neue Umfrage für Ihre Gemeinschaft.", "margin-top:8px;") +
            kasten(
              `<p style="margin:0;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#2B2622;">${esc(d.titel)}</p>` +
                (d.text ? `<p style="margin:6px 0 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#5B534C;">${esc(String(d.text).slice(0, 400))}</p>` : ""),
              true,
            ) +
            (d.frist ? absatz(`Teilnehmen bis ${deTag(d.frist)}.`, "font-size:14px;") : "") +
            knopf("Zur Umfrage", `${APP}/weg-owner/umfrage/${d.survey_id}`),
          fuss,
        }),
      };
    case "dokumente": {
      const p = (d.persoenlich ?? []) as any[];
      const h = (d.haus ?? []) as any[];
      const anzahl = p.length + h.length;
      if (!anzahl) return null;
      const haeuser = [...new Set(h.map((x) => x.gebaeude).filter(Boolean))];
      return {
        subject: anzahl === 1 ? "1 neues Dokument in Ihrer RGI-App" : `${anzahl} neue Dokumente in Ihrer RGI-App`,
        html: rahmen({
          schild: "Dokumente",
          titel: anzahl === 1 ? "Ein neues Dokument für Sie" : `${anzahl} neue Dokumente für Sie`,
          vorschau: [...p, ...h].map((x) => x.name).slice(0, 3).join(", "),
          anrede,
          inhalt:
            absatz("seit gestern ist in Ihrer RGI-App Folgendes neu:", "margin-top:8px;") +
            (p.length ? zwischen("Für Sie persönlich") + liste(p.map((x) => ({ titel: x.name, info: x.gebaeude }))) : "") +
            (h.length ? zwischen(haeuser.length === 1 ? `Für das Haus ${haeuser[0]}` : "Für Ihre Häuser") + liste(h.map((x) => ({ titel: x.name, info: haeuser.length > 1 ? x.gebaeude : null }))) : "") +
            knopf("Dokumente in der App öffnen", `${APP}/weg-owner/files`) +
            absatz("Zum Schutz Ihrer Daten hängen wir keine Dateien an. Sie finden alles sicher in der App.", "font-size:13px;color:#6B625A;"),
          fuss: `Höchstens eine solche E-Mail pro Tag. <a href="${esc(LINK_EINSTELLUNGEN)}" style="color:#8A4100;">Benachrichtigungen ändern</a>`,
        }),
      };
    }
    case "aushang":
      return {
        subject: `Aushang: ${d.titel}`,
        html: rahmen({
          schild: "Aushang",
          titel: d.titel,
          vorschau: String(d.text ?? "").slice(0, 120),
          anrede,
          inhalt:
            absatz(`RGI hat einen neuen Aushang für ${esc(d.gebaeude || "Ihr Haus")} veröffentlicht:`, "margin-top:8px;") +
            kasten(`<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2B2622;">${esc(d.text)}</p>`) +
            knopf("Aushang in der App ansehen", `${APP}/weg-owner/forum`),
          fuss,
        }),
      };
    case "lastschrift": {
      const posten = (d.posten ?? []) as any[];
      const summe = posten.reduce((s, x) => s + (Number(x.betrag) || 0), 0);
      return {
        subject: `Ankündigung: Lastschrift über ${euro(summe)} am ${deDatum(d.datum)}`,
        html: rahmen({
          schild: "Lastschrift",
          titel: "Ankündigung einer Lastschrift",
          vorschau: `${euro(summe)} am ${deDatum(d.datum)}`,
          anrede,
          inhalt:
            absatz(`wir ziehen ${posten.length > 1 ? "die folgenden Beträge" : "den folgenden Betrag"} per SEPA-Lastschrift von Ihrem Konto ein.`, "margin-top:8px;") +
            kasten(
              `<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:#8A4100;">Betrag</p>` +
                `<p style="margin:2px 0 0 0;font-family:'Century Gothic',Arial,sans-serif;font-size:36px;font-weight:700;color:#2B2622;">${euro(summe)}</p>` +
                `<p style="margin:10px 0 0 0;"><span style="display:inline-block;padding:6px 12px;border-radius:10px;background-color:#FFFFFF;border:1px solid #F6D3AE;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#2B2622;">Einzug am ${esc(deTag(d.datum))}</span></p>`,
            ) +
            posten
              .map((x) =>
                zeilen([
                  ["Zahlungsempfänger", d.empfaenger],
                  ...(posten.length > 1 ? ([["Betrag", euro(x.betrag)]] as [string, unknown][]) : []),
                  ["Verwendungszweck", x.zweck],
                  ["Ihr Konto", x.iban],
                  ["Mandatsreferenz", x.mandat],
                  ["Gläubiger-ID", d.glaeubiger],
                ]),
              )
              .join("") +
            absatz("Bitte sorgen Sie bis zum Einzugstag für ausreichende Deckung. Fragen dazu? Schreiben Sie uns einfach in der App.", "font-size:14px;") +
            knopf("Meine Wohnung in der App", `${APP}/weg-owner/settings`),
          fuss: "Diese Ankündigung erhalten Sie zu jeder einmaligen Lastschrift von Ihrem Konto.",
        }),
      };
    }
    case "hausgeld": {
      const posten = (d.posten ?? []) as any[];
      return {
        subject: `Ihr Hausgeld ändert sich ab ${deDatum(d.datum)}`,
        html: rahmen({
          schild: "Hausgeld",
          titel: "Ihr Hausgeld ändert sich",
          vorschau: posten.map((x) => `neu ${euro(x.betrag)}`).join(", "),
          anrede,
          inhalt:
            absatz(`ab dem Einzug am ${deDatum(d.datum)} gilt ein neues Hausgeld.`, "margin-top:8px;") +
            posten
              .map(
                (x) =>
                  kasten(
                    (x.einheit ? `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:#8A4100;">${esc(x.einheit)}</p>` : "") +
                      `<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#6B625A;">bisher <span style="text-decoration:line-through;">${euro(x.bisher)}</span></p>` +
                      `<p style="margin:4px 0 0 0;font-family:'Century Gothic',Arial,sans-serif;font-size:28px;font-weight:700;color:#2B2622;">neu ${euro(x.betrag)}</p>`,
                  ) +
                  zeilen([
                    ["Nächster Einzug", `${deDatum(d.datum)} · ${euro(x.betrag)}`],
                    ["Ihr Konto", x.iban],
                    ["Mandatsreferenz", x.mandat],
                    ["Gläubiger-ID", d.glaeubiger],
                  ]),
              )
              .join("") +
            absatz("Sie müssen nichts tun – wir ziehen den neuen Betrag wie gewohnt ein.", "font-size:14px;") +
            knopf("Meine Wohnung in der App", `${APP}/weg-owner/settings`),
          fuss: "Diese Nachricht erhalten Sie bei jeder Änderung Ihres Hausgelds.",
        }),
      };
    }
    case "angebot": {
      const eck = [d.ort, d.zimmer ? `${String(d.zimmer).replace(".", ",").replace(/,0$/, "")} Zimmer` : null, d.flaeche ? `${Math.round(d.flaeche)} m²` : null].filter(Boolean).join(" · ");
      const preis = d.preis ? `${euro(Number(d.preis))}${d.art === "sale" ? "" : " Kaltmiete"}` : "Preis auf Anfrage";
      return {
        subject: `Neues Angebot: ${d.titel}`,
        html: rahmen({
          schild: "Immobilien von RGI",
          titel: "Neu für Sie: ein Angebot von RGI",
          vorschau: `${d.titel} · ${preis}`,
          anrede,
          inhalt:
            absatz("dieses Angebot zeigen wir zuerst unseren Eigentümern in der App.", "margin-top:8px;") +
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;border:1px solid #EFE8E1;border-radius:18px;overflow:hidden;">` +
            (d.bild ? `<tr><td><img src="${esc(d.bild)}" alt="" width="536" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : "") +
            `<tr><td style="padding:16px 18px 18px 18px;"><p style="margin:0;font-family:'Century Gothic',Arial,sans-serif;font-size:22px;font-weight:700;color:#8A4100;">${esc(preis)}</p>` +
            `<p style="margin:4px 0 0 0;font-family:Arial,sans-serif;font-size:17px;font-weight:700;line-height:1.35;color:#2B2622;">${esc(d.titel)}</p>` +
            (eck ? `<p style="margin:8px 0 0 0;font-family:Arial,sans-serif;font-size:14px;color:#5B534C;">${esc(eck)}</p>` : "") +
            `</td></tr></table>` +
            knopf("Angebot in der App ansehen", `${APP}/weg-owner/immobilien?angebot=${d.id}`) +
            absatz("Interesse? In der App auf „Ich bin interessiert“ tippen.", "font-size:14px;"),
          fuss: `Sie haben „E-Mail bei neuen Angeboten“ eingeschaltet. <a href="${esc(`${FN}?abmelden=${token}`)}" style="color:#8A4100;">Keine Angebote mehr per E-Mail</a>`,
        }),
      };
    }
  }
  return null;
}

// ───────────────────────── 3. Senden ─────────────────────────
/** Für schon versandte Mails ohne gespeicherten Inhalt den Inhalt nachtragen (zum Nachlesen). */
async function inhaltNachtragen(db: Db) {
  const { data } = await db.from("benachrichtigungen").select("*").eq("status", "gesendet").is("html", null).limit(50);
  for (const z of data ?? []) {
    const { data: p } = await db.from("profiles").select("email, first_name, last_name").eq("user_id", z.user_id).maybeSingle();
    const { data: k } = await db.from("contacts").select("salutation, first_name, last_name").eq("user_id", z.user_id).limit(1).maybeSingle();
    const { data: e } = await db.from("owner_portal_einstellungen").select("abmelde_token").eq("user_id", z.user_id).maybeSingle();
    const mail = baueMail(z.art, z.daten ?? {}, anredeText(k?.salutation, k?.last_name ?? p?.last_name, k?.first_name ?? p?.first_name), e?.abmelde_token ?? "");
    if (mail) await db.from("benachrichtigungen").update({ empfaenger: p?.email ?? null, betreff: mail.subject, html: mail.html }).eq("id", z.id);
  }
}

async function senden(db: Db) {
  await inhaltNachtragen(db);
  const jetzt = berlin();
  if (jetzt.stunde >= 21 || jetzt.stunde < 7) return { gesendet: 0, grund: "Nachtruhe" };
  const { data: offen } = await db
    .from("benachrichtigungen")
    .select("*")
    .eq("status", "offen")
    .lte("senden_ab", new Date().toISOString())
    .order("created_at")
    .limit(80);
  let gesendet = 0;
  for (const z of offen ?? []) {
    const fertig = (status: string, fehler: string | null = null) =>
      db.from("benachrichtigungen").update({ status, fehler, gesendet_am: status === "gesendet" ? new Date().toISOString() : null }).eq("id", z.id);
    try {
      await db.from("owner_portal_einstellungen").upsert({ user_id: z.user_id }, { onConflict: "user_id", ignoreDuplicates: true });
      const { data: e } = await db.from("owner_portal_einstellungen").select("*").eq("user_id", z.user_id).maybeSingle();
      const spalte = KATEGORIE[z.art];
      if (spalte && e && e[spalte] === false) {
        await fertig("uebersprungen", "abgeschaltet");
        continue;
      }
      if (spalte === "angebote_hinweis" && !e?.angebote_hinweis) {
        await fertig("uebersprungen", "abgeschaltet");
        continue;
      }
      // Angebote: höchstens eine Mail pro Tag
      if (z.art === "angebot") {
        const { data: zuletzt } = await db
          .from("benachrichtigungen")
          .select("gesendet_am")
          .eq("user_id", z.user_id)
          .eq("art", "angebot")
          .eq("status", "gesendet")
          .gte("gesendet_am", new Date(Date.now() - 20 * STD).toISOString())
          .limit(1);
        if (zuletzt?.length) {
          await db.from("benachrichtigungen").update({ senden_ab: new Date(new Date(zuletzt[0].gesendet_am).getTime() + 20 * STD).toISOString() }).eq("id", z.id);
          continue;
        }
      }
      const { data: p } = await db.from("profiles").select("email, first_name, last_name, auth_pseudo_email").eq("user_id", z.user_id).maybeSingle();
      const email = String(p?.email ?? "").trim();
      if (!email || !email.includes("@") || email.toLowerCase().endsWith("@users.rgi-immobilien.app") || p?.auth_pseudo_email) {
        await fertig("uebersprungen", "keine E-Mail-Adresse");
        continue;
      }
      const { data: k } = await db.from("contacts").select("salutation, first_name, last_name").eq("user_id", z.user_id).limit(1).maybeSingle();
      const anrede = anredeText(k?.salutation, k?.last_name ?? p?.last_name, k?.first_name ?? p?.first_name);
      const mail = baueMail(z.art, z.daten ?? {}, anrede, e?.abmelde_token ?? "");
      if (!mail) {
        await fertig("uebersprungen", "nichts zu melden");
        continue;
      }
      await db.from("benachrichtigungen").update({ empfaenger: email, betreff: mail.subject, html: mail.html }).eq("id", z.id);
      const r = await sendSystemMail(db, { kind: `benachrichtigung_${z.art}`, to: email, subject: mail.subject, html: mail.html, refType: "benachrichtigung", refId: z.id });
      if (r.ok) {
        await fertig("gesendet");
        gesendet++;
      } else await fertig("fehler", r.error ?? "Versand fehlgeschlagen");
    } catch (err) {
      await fertig("fehler", err instanceof Error ? err.message : String(err));
    }
  }
  return { gesendet };
}

function anredeText(sal: string | null | undefined, nach: string | null | undefined, vor: string | null | undefined) {
  const s = String(sal ?? "").trim().toLowerCase();
  if (nach && (s.startsWith("frau") || s === "f")) return `Guten Tag Frau ${nach},`;
  if (nach && (s.startsWith("herr") || s === "m")) return `Guten Tag Herr ${nach},`;
  const name = [vor, nach].filter(Boolean).join(" ").trim();
  return name ? `Guten Tag ${name},` : "Guten Tag,";
}

// ───────────────────────── Links ohne Anmeldung ─────────────────────────
const seite = (titel: string, text: string) =>
  new Response(
    `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titel)}</title></head>
<body style="margin:0;background:#F6F2ED;font-family:Arial,sans-serif;color:#2B2622;"><div style="max-width:480px;margin:60px auto;padding:32px;background:#fff;border-radius:20px;border-top:5px solid #EE7202;">
<h1 style="font-size:24px;margin:0 0 12px;">${esc(titel)}</h1><p style="font-size:16px;line-height:1.6;color:#5B534C;margin:0 0 20px;">${text}</p>
<a href="${APP}/weg-owner/settings?bereich=benachrichtigungen" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#BA5600;color:#fff;text-decoration:none;font-weight:600;">Zu den Einstellungen</a></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

async function abmelden(db: Db, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return seite("Link ungültig", "Dieser Link ist nicht gültig.");
  const { data } = await db.from("owner_portal_einstellungen").update({ angebote_hinweis: false, updated_at: new Date().toISOString() }).eq("abmelde_token", token).select("user_id");
  if (!data?.length) return seite("Link ungültig", "Dieser Link ist nicht gültig.");
  return seite("Abgemeldet", "Sie bekommen keine neuen Immobilien-Angebote mehr per E-Mail. Das können Sie jederzeit in den Einstellungen der App wieder einschalten.");
}

async function kalender(db: Db, meetingId: string, token: string) {
  const nein = new Response("Nicht gefunden", { status: 404, headers: cors });
  if (!/^[0-9a-f-]{36}$/i.test(token) || !/^[0-9a-f-]{36}$/i.test(meetingId)) return nein;
  const { data: e } = await db.from("owner_portal_einstellungen").select("user_id").eq("abmelde_token", token).maybeSingle();
  if (!e) return nein;
  const { data: m } = await db.from("etv_meetings").select("id, building_id, title, meeting_date, location").eq("id", meetingId).maybeSingle();
  if (!m?.meeting_date || !(await eigentuemerVon(db, m.building_id)).includes(e.user_id)) return nein;
  const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(m.meeting_date);
  const ende = new Date(start.getTime() + 2 * STD);
  const t = (s: string) => String(s ?? "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RGI Immobilien//App//DE",
    "BEGIN:VEVENT",
    `UID:${m.id}@rgi-immobilien.app`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(start)}`,
    `DTEND:${ics(ende)}`,
    `SUMMARY:${t(m.title || "Eigentümerversammlung")}`,
    m.location ? `LOCATION:${t(m.location)}` : "",
    `URL:${APP}/weg-owner/meetings?versammlung=${m.id}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="versammlung.ics"' } });
}

// ───────────────────────── Einstieg ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") ?? cors["Access-Control-Allow-Headers"], "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("abmelden")) return abmelden(db, url.searchParams.get("abmelden")!);
    if (url.searchParams.get("kalender")) return kalender(db, url.searchParams.get("kalender")!, url.searchParams.get("t") ?? "");
    return new Response("Nicht gefunden", { status: 404, headers: cors });
  }

  const auth = await requireStaffOrCron(req, cors);
  if (!auth.ok) return auth.response;

  const jetzt = berlin();
  const ergebnis: Record<string, unknown> = {};
  const schritt = async (name: string, f: () => Promise<unknown>) => {
    try {
      ergebnis[name] = await f();
    } catch (e) {
      console.error(`[benachrichtigungen] ${name}`, e);
      ergebnis[name] = `Fehler: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  await schritt("meldungen", () => sammleMeldungen(db));
  await schritt("versammlungen", () => sammleVersammlungen(db, jetzt));
  await schritt("terminumfragen", () => sammleTerminumfragen(db));
  await schritt("umfragen", () => sammleUmfragen(db));
  await schritt("aushaenge", () => sammleAushaenge(db));
  await schritt("dokumente", () => sammleDokumente(db, jetzt));
  await schritt("lastschriften", () => sammleLastschriften(db));
  await schritt("angebote", () => sammleAngebote(db));
  await schritt("senden", () => senden(db));
  return new Response(JSON.stringify(ergebnis), { headers: { ...cors, "Content-Type": "application/json" } });
});
