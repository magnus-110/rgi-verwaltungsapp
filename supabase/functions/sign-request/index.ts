// sign-request – Büro-Funktion der elektronischen Unterschrift (requireStaffOrCron).
// create/remind/neuer_link liegen in _shared/signatur/vorgang.ts (gemeinsam mit dem Claude-Konnektor).
// Alle zustandsändernden Aktionen laufen hierüber, damit Mails, PDFs und Protokoll
// (sign_request_events) immer zusammenpassen. Vertrag: /home/claude/esig/API.md
//
// Aktionen: create · preview_mail · sign_internal · remind · withdraw · accept_paper ·
//           reject_paper · assign_paper_email · urls · nachweis · neuer_link · cron ·
//           create_incoming · complete_incoming (Fall B, eingehende Dokumente selbst unterschreiben) ·
//           dms_ablegen (Endfassung eines ausgehenden Vorgangs von Hand im DMS ablegen, _shared/signatur/ablage.ts) ·
//           felder_erkennen (Ausfüllfelder: Vorlagen-Anker bzw. Vorschläge in fremden PDFs, _shared/signatur/felderkennung.ts) ·
//           ergaenzungen_geprueft (Hinweis „Ergänzt – prüfen“ zurücksetzen, Ereignis ergaenzungen_geprueft) ·
//           vorlage_eigentuemer · vorlage_vorschau · aus_vorlage (fertige Vorlagen SEPA-Mandat/Stammdatenblatt) ·
//           stammdaten_vorschau · stammdaten_uebernehmen · stammdaten_rueckgaengig (Stammdaten aus Vorlagen; SEPA geht automatisch, _shared/signatur/vorlagen.ts)
//
// Testmodus (nur mit x-cron-secret): body.test_user_id handelt als dieser Mitarbeiter,
// body.test = true liefert bei create/remind/reject_paper die Klartext-Links zurück.
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import {
  ABSENDER_ADRESSE,
  BUCKET,
  DOKUMENTARTEN,
  ERLEDIGT,
  Fehler,
  UNTERSCHREIBBAR,
  ZUSTIMMUNG_INTERN,
  addTage,
  adminClient,
  corsHeaders,
  dateiname,
  ereignis,
  heuteIso,
  json,
  laden,
  melden,
  mehrzeilig,
  objektLabel,
  pfad,
  signLink,
  signierteUrl,
  speichern,
  uuidOderNull,
  zeile,
} from "../_shared/signatur/basis.ts";
import {
  Signer,
  abschliessen,
  alleFertig,
  einladen,
  istEtv,
  linkErstellen,
  nachUnterschrift,
  nurLink,
  papierSpeichern,
  signerLaden,
  vorgangLaden,
} from "../_shared/signatur/ablauf.ts";
import { absenderKontoId, einladungMail } from "../_shared/signatur/mail.ts";
import { anlegen, erinnern, mitarbeiterName, neuerLink, selbstErinnern } from "../_shared/signatur/vorgang.ts";
import { eingehendAbschliessen, eingehendAnlegen } from "../_shared/signatur/eingehend.ts";
import { dmsAblegen } from "../_shared/signatur/ablage.ts";
import { istHeic, istJpg, istPdf, istPng, nachweisPdf } from "../_shared/signatur/pdf.ts";
import { felderLaden } from "../_shared/signatur/felder.ts";
import { ergaenzungenLaden } from "../_shared/signatur/ergaenzungen.ts";
import { ausfuellfelderErkennen } from "../_shared/signatur/felderkennung.ts";
import { ERLAUBTE_BUCKETS } from "../_shared/signatur/vorgang.ts";
import {
  ausVorlageAnlegen, stammdatenUebernehmen,
  stammdatenRueckgaengig, stammdatenVorschau, vorlageEigentuemer, vorlageVorschau,
} from "../_shared/signatur/vorlagen.ts";

type Db = ReturnType<typeof adminClient>;
// deno-lint-ignore no-explicit-any
type Body = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireStaffOrCron(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const db = adminClient();
  try {
    const body: Body = await req.json().catch(() => ({}));
    const istCron = auth.userId === "cron" || auth.userId === "service";
    // Handelnder Mitarbeiter: angemeldeter Nutzer; im Zeitplan-/Testaufruf optional test_user_id
    const userId: string | null = uuidOderNull(auth.userId) ?? (istCron ? uuidOderNull(body?.test_user_id) : null);
    const test = istCron && body?.test === true;

    switch (String(body?.action || "")) {
      case "create":
        return json(await anlegen(db, body, userId, test));
      case "preview_mail":
        return json(vorschau(body));
      case "sign_internal":
        return json(await internUnterschreiben(db, body, userId));
      case "remind":
        return json(await erinnern(db, body, userId, test));
      case "withdraw":
        return json(await zurueckziehen(db, body, userId));
      case "accept_paper":
        return json(await papierUebernehmen(db, body, userId));
      case "reject_paper":
        return json(await papierAblehnen(db, body, userId, test));
      case "assign_paper_email":
        return json(await papierMailZuordnen(db, body, userId));
      case "urls":
        return json(await urls(db, body));
      case "nachweis":
        return json(await nachweis(db, body, userId));
      case "neuer_link":
        return json(await neuerLink(db, body, userId));
      case "create_incoming":
        return json(await eingehendAnlegen(db, body, userId));
      case "complete_incoming":
        return json(await eingehendAbschliessen(db, body, userId));
      case "dms_ablegen":
        return json(await dmsAblegen(db, body, userId));
      case "felder_erkennen":
        return json(await felderErkennen(db, body));
      case "ergaenzungen_geprueft":
        return json(await ergaenzungenGeprueft(db, body, userId));
      case "vorlage_eigentuemer":
        return json(await vorlageEigentuemer(db, body));
      case "vorlage_vorschau":
        return json(await vorlageVorschau(db, body));
      case "aus_vorlage":
        return json(await ausVorlageAnlegen(db, body, userId, test));
      case "stammdaten_vorschau":
        return json(await stammdatenVorschau(db, body));
      case "stammdaten_uebernehmen":
        return json(await stammdatenUebernehmen(db, body, userId));
      case "stammdaten_rueckgaengig":
        return json(await stammdatenRueckgaengig(db, body, userId));
      case "cron":
        if (!istCron) return json({ error: "Nur für den Zeitplan." }, 403);
        return json(await zeitplan(db));
      default:
        return json({ error: "Unbekannte Aktion." }, 400);
    }
  } catch (e) {
    if (e instanceof Fehler) return json({ error: e.message }, e.status);
    console.error("[sign-request] Fehler:", e);
    return json({ error: `Interner Fehler: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});

// ================================================================ preview_mail

function vorschau(b: Body) {
  const dokumentart = DOKUMENTARTEN.includes(b.dokumentart) ? b.dokumentart : "sonstiges";
  const titel = zeile(b.titel, 200) || "Dokument";
  const frist = typeof b.frist === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.frist) ? b.frist : null;
  const etv = b.typ === "etv_protokoll" || dokumentart === "protokoll";
  const betreff = zeile(b.mail_betreff, 230) || "Bitte unterschreiben: {Dokument} – {Objekt}";
  const text = mehrzeilig(b.mail_text, 5000) || "{Anrede},\n\nanbei das Dokument „{Dokument}“. Bitte prüfen und unterschreiben Sie bis zum {Frist}.";
  const name = zeile(b.signer?.name, 120) || "Max Mustermann";
  const jahr = new Date().getFullYear();
  const m = einladungMail(
    {
      titel,
      objekt: zeile(b.objekt, 200),
      frist,
      seitenzahl: Number.isInteger(b.seitenzahl) ? b.seitenzahl : null,
      nummer: `SIG-${jahr}-####`,
      mitKopie: !etv,
    },
    { name, anrede: b.signer?.anrede },
    { betreff, text },
    "https://rgi-immobilien.app/unterschreiben/vorschau",
    "https://rgi-immobilien.app/unterschreiben/vorschau?papier=1",
  );
  return { subject: m.subject, html: m.html };
}

// ================================================================ sign_internal

async function internUnterschreiben(db: Db, b: Body, userId: string | null) {
  {
    if (!userId) throw new Fehler(400, "Kein angemeldeter Mitarbeiter.");
    const { req: v, signer: s } = await signerLaden(db, b.signer_id);
    if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
    if (s.methode !== "intern") throw new Fehler(400, "Dieser Unterzeichner unterschreibt nicht in der App.");
    if (v.typ === "eingehend") throw new Fehler(400, "Eingehende Dokumente bitte unter „Von uns zu unterschreiben“ unterschreiben.");
    // Nur die zugewiesene Person darf mit ihrer hinterlegten Unterschrift unterschreiben.
    if (s.user_id && s.user_id !== userId) throw new Fehler(403, `Diese Unterschrift ist ${s.name} zugewiesen.`);
    if (s.status === "wartet") throw new Fehler(409, "Die Unterschrift ist erst an der Reihe, wenn die vorherigen Unterzeichner unterschrieben haben.");
    if (!["offen", "geoeffnet"].includes(s.status)) throw new Fehler(409, "Bereits unterschrieben.");
    const { data: us } = await db.from("user_signatures").select("signature_png").eq("user_id", userId).maybeSingle();
    if (!us?.signature_png) throw new Fehler(400, "Für Sie ist keine Unterschrift hinterlegt. Bitte zuerst in den Einstellungen hinterlegen.");
    const ort = zeile(b.ort, 80) || v.buildings?.city || "Pfronten";
    const jetzt = new Date().toISOString();
    const { data: upd } = await db.from("sign_request_signers").update({
      status: "unterschrieben",
      typed_name: s.name,
      signature_png: us.signature_png,
      consent_text: ZUSTIMMUNG_INTERN,
      signed_by: userId,
      signed_at: jetzt,
      ort,
      ip: null,
      user_agent: "VerwaltungsApp",
    }).eq("id", s.id).in("status", ["offen", "geoeffnet"]).select("id");
    if (!upd?.length) throw new Fehler(409, "Bereits unterschrieben.");
    await ereignis(db, v.id, "unterschrieben", `${s.name} hat in der App unterschrieben`, {
      signerId: s.id,
      userId,
      details: { methode: "intern", ort },
    });
    const r = await nachUnterschrift(db, v.id, userId);
    return { ok: true, abgeschlossen: r.abgeschlossen };
  }
}

// ================================================================ remind / withdraw

async function zurueckziehen(db: Db, b: Body, userId: string | null) {
  const { req: v, signers } = await vorgangLaden(db, String(b.request_id || ""));
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  const { data: upd } = await db.from("sign_requests").update({ status: "zurueckgezogen" })
    .eq("id", v.id).eq("status", "offen").is("completed_at", null).select("id");
  if (!upd?.length) throw new Fehler(409, "Der Vorgang wird gerade abgeschlossen und kann nicht mehr zurückgezogen werden.");
  const offen = signers.filter((s: Signer) => !ERLEDIGT.includes(s.status)).map((s: Signer) => s.id);
  if (offen.length) await db.from("sign_request_signers").update({ status: "zurueckgezogen" }).in("id", offen);
  await ereignis(db, v.id, "zurueckgezogen", "Vorgang zurückgezogen – offene Links gesperrt", { userId, details: { gesperrt: offen.length } });
  return { ok: true };
}

// ================================================================ Papier

async function papierUebernehmen(db: Db, b: Body, userId: string | null) {
  const p = b.pruefung || {};
  if (p.feld !== true || p.seiten !== true || p.keine_aenderungen !== true) {
    throw new Fehler(400, "Bitte alle Prüfpunkte bestätigen (Unterschrift am richtigen Feld, alle Seiten vorhanden und lesbar, keine handschriftlichen Änderungen).");
  }
  const { req: v, signer: s } = await signerLaden(db, b.signer_id);
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  if (s.status !== "papier_eingegangen") throw new Fehler(409, "Es liegt keine ungeprüfte Papier-Unterschrift vor.");
  const jetzt = new Date().toISOString();
  const { data: upd } = await db.from("sign_request_signers").update({
    status: "papier_uebernommen",
    signed_at: s.paper_eingang_at || jetzt,
    signed_by: userId,
    paper_pruefung: { feld: true, seiten: true, keine_aenderungen: true, geprueft_von: userId, geprueft_am: jetzt },
  }).eq("id", s.id).eq("status", "papier_eingegangen").select("id");
  if (!upd?.length) throw new Fehler(409, "Die Papier-Unterschrift wurde bereits bearbeitet.");
  await ereignis(db, v.id, "uebernommen", `Papier-Unterschrift von ${s.name} übernommen`, { signerId: s.id, userId });
  const r = await nachUnterschrift(db, v.id, userId);
  return { ok: true, abgeschlossen: r.abgeschlossen };
}

async function papierAblehnen(db: Db, b: Body, userId: string | null, test: boolean) {
  const { req: v, signer: s } = await signerLaden(db, b.signer_id);
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  if (s.status !== "papier_eingegangen") throw new Fehler(409, "Es liegt keine ungeprüfte Papier-Unterschrift vor.");
  const grund = zeile(b.grund, 300) || null;
  if (nurLink(s) && !s.email) {
    // Keine E-Mail-Adresse: Papier zurücksetzen, neuen Link erzeugen und dem Büro zum Verschicken zurückgeben
    const { error } = await db.from("sign_request_signers").update({
      methode: "online",
      status: "offen",
      paper_bucket: null,
      paper_path: null,
      paper_page_count: null,
      paper_eingang: null,
      paper_email_id: null,
      paper_eingang_at: null,
      paper_pruefung: null,
    }).eq("id", s.id).eq("status", "papier_eingegangen");
    if (error) throw new Fehler(500, `Unterzeichner konnte nicht aktualisiert werden: ${error.message}`);
    const t = await linkErstellen(db, v, { ...s, status: "offen" }, "neuer_link", {
      userId,
      text: `Papier-Unterschrift von ${s.name} abgelehnt – neuer Link erstellt (wird selbst verschickt)${grund ? ` · Grund: ${grund}` : ""}`,
    });
    return { ok: true, url: signLink(t), name: s.name };
  }
  const t = await einladen(db, v, s, "abgelehnt", { userId, grund });
  return { ok: true, ...(test ? { test_link: signLink(t) } : {}) };
}

/** Anhänge einer Mail als Papier-Dateien laden (JPG/PNG/PDF; kleine Inline-Bilder wie Logos werden übergangen). */
async function mailAnhaenge(db: Db, emailId: string) {
  const { data: att } = await db.from("email_attachments").select("id, file_name, file_path, file_size, mime_type, is_inline")
    .eq("email_id", emailId).order("created_at", { ascending: true });
  const dateien: { name: string; bytes: Uint8Array }[] = [];
  const uebergangen: string[] = [];
  let heic = false;
  for (const a of att ?? []) {
    const mime = String(a.mime_type || "").toLowerCase();
    const name = zeile(a.file_name || "Anhang", 120);
    if (/heic|heif/.test(mime) || /\.(heic|heif)$/i.test(name)) {
      heic = true;
      uebergangen.push(name);
      continue;
    }
    const bild = /^image\/(jpe?g|png)$/.test(mime);
    const pdf = mime === "application/pdf" || /\.pdf$/i.test(name);
    if (!bild && !pdf && !/\.(jpe?g|png)$/i.test(name)) continue;
    if (a.is_inline && bild && (a.file_size ?? 0) < 30_000) continue; // Logos/Signaturbilder
    try {
      const bytes = await laden(db, "email-attachments", a.file_path);
      if (istHeic(bytes)) {
        heic = true;
        uebergangen.push(name);
        continue;
      }
      if (istPdf(bytes) || istJpg(bytes) || istPng(bytes)) dateien.push({ name, bytes });
      else uebergangen.push(name);
    } catch {
      uebergangen.push(name);
    }
  }
  return { dateien, uebergangen, heic };
}

async function papierMailZuordnen(db: Db, b: Body, userId: string | null) {
  const emailId = uuidOderNull(b.email_id);
  if (!emailId) throw new Fehler(400, "email_id fehlt oder ist ungültig.");
  const { req: v, signer: s } = await signerLaden(db, b.signer_id);
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  if (![...UNTERSCHREIBBAR, "papier_eingegangen"].includes(s.status)) throw new Fehler(409, "Für diesen Unterzeichner ist keine Papier-Rücksendung möglich.");
  const { data: mail } = await db.from("emails").select("id").eq("id", emailId).maybeSingle();
  if (!mail) throw new Fehler(404, "E-Mail nicht gefunden.");
  const a = await mailAnhaenge(db, emailId);
  if (!a.dateien.length) {
    throw new Fehler(400, a.heic ? "Die Anhänge sind HEIC-Fotos. Bitte als JPG oder PDF anfordern." : "Die E-Mail enthält keine verwertbaren Anhänge (JPG, PNG oder PDF).");
  }
  const r = await papierSpeichern(db, v, s, a.dateien, { eingang: "email", emailId, streng: false, userId });
  return { ok: true, seiten: r.seiten, warnung: r.warnung, ...(a.uebergangen.length ? { uebergangen: a.uebergangen } : {}) };
}

// ================================================================ felder_erkennen

/** Ausfüllfelder im Quell-PDF erkennen (vor dem Anlegen, für den Dialog „Unterschrift anfordern“). */
async function felderErkennen(db: Db, b: Body) {
  const bucket = String(b.source_bucket || BUCKET);
  if (!ERLAUBTE_BUCKETS.includes(bucket)) throw new Fehler(400, "Ungültiger Speicherort der Quelle.");
  const path = String(b.source_path || "");
  if (!path || path.includes("..") || path.startsWith("/") || path.length > 500) throw new Fehler(400, "Ungültiger Pfad der Quelldatei.");
  const bytes = await laden(db, bucket, path);
  if (!istPdf(bytes)) throw new Fehler(400, "Die Quelldatei ist kein PDF.");
  if (bytes.byteLength > 40 * 1024 * 1024) return { vorlage: false, seitenzahl: null, felder: [], vorschlaege: [] };
  try {
    return await ausfuellfelderErkennen(bytes);
  } catch (e) {
    console.warn("[sign-request] Felderkennung fehlgeschlagen:", e);
    return { vorlage: false, seitenzahl: null, felder: [], vorschlaege: [], hinweis: "Felder konnten nicht erkannt werden." };
  }
}

// ================================================================ ergaenzungen_geprueft

/** RGI hat die Ergänzungen/Korrekturen der Unterzeichner geprüft → Hinweis in der Übersicht ausblenden. */
async function ergaenzungenGeprueft(db: Db, b: Body, userId: string | null) {
  const { req: v } = await vorgangLaden(db, String(b.request_id || ""));
  const { data: upd } = await db.from("sign_requests").update({ ergaenzungen_pruefen: false })
    .eq("id", v.id).eq("ergaenzungen_pruefen", true).select("id");
  if (!upd?.length) return { ok: true, schon_geprueft: true };
  const wer = await mitarbeiterName(db, userId);
  await ereignis(db, v.id, "ergaenzungen_geprueft", `Ergänzungen der Unterzeichner geprüft${wer ? ` von ${wer.replace(/ \(RGI Immobilien\)$/, "")}` : ""}`, { userId });
  return { ok: true };
}

// ================================================================ urls / nachweis

async function vorhanden(db: Db, path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  const { data } = await db.storage.from(BUCKET).list(path.slice(0, i), { search: path.slice(i + 1), limit: 5 });
  return !!data?.some((f: { name: string }) => f.name === path.slice(i + 1));
}

async function urls(db: Db, b: Body) {
  const { req: v, signers } = await vorgangLaden(db, String(b.request_id || ""));
  const s = b.signer_id ? signers.find((x: Signer) => x.id === b.signer_id) : null;
  if (b.signer_id && !s) throw new Fehler(404, "Unterzeichner nicht gefunden.");
  return {
    quelle: await signierteUrl(db, pfad.quelle(v.id), 600),
    final: v.final_path ? await signierteUrl(db, v.final_path, 600, dateiname(`${v.titel} (unterschrieben)`)) : null,
    // zum Ansehen im Browser (ohne Download-Namen, z. B. mit #page=… an eine Seite springen)
    final_ansicht: v.final_path ? await signierteUrl(db, v.final_path, 600) : null,
    papier: s?.paper_path ? await signierteUrl(db, s.paper_path, 600) : null,
    kopie: s && (await vorhanden(db, pfad.kopie(v.id, s.id))) ? await signierteUrl(db, pfad.kopie(v.id, s.id), 600) : null,
    nachweis: (await vorhanden(db, pfad.nachweis(v.id))) ? await signierteUrl(db, pfad.nachweis(v.id), 600) : null,
  };
}

async function nachweis(db: Db, b: Body, userId: string | null) {
  const { req: v, signers } = await vorgangLaden(db, String(b.request_id || ""));
  const bytes = await nachweisPdf({
    modus: "nachweis",
    titel: v.titel,
    objekt: objektLabel(v.buildings),
    nummer: v.nummer,
    abgeschlossenAm: v.status === "abgeschlossen" ? v.completed_at : null,
    signers,
    sha256: v.final_sha256,
    zeitstempel: v.zeitstempel_zeit ? { zeit: v.zeitstempel_zeit, dienst: v.zeitstempel_dienst || "" } : null,
    ohneKopie: istEtv(v),
    felder: await felderLaden(db, v.id),
    ergaenzungen: await ergaenzungenLaden(db, v.id),
  });
  await speichern(db, pfad.nachweis(v.id), bytes);
  await ereignis(db, v.id, "nachweis", "Nachweis als PDF erstellt", { userId });
  return { url: await signierteUrl(db, pfad.nachweis(v.id), 600, `Nachweis_${v.nummer}.pdf`) };
}

// ================================================================ cron

async function zeitplan(db: Db) {
  const ergebnis = { abgeschlossen: 0, erinnert: 0, aufgaben: 0, mails: 0, fehler: [] as string[] };
  const heute = heuteIso();
  const { data: offen } = await db.from("sign_requests").select("id, completed_at, updated_at").eq("status", "offen").limit(500);
  const { data: vorlagen } = await db.from("sign_mail_templates").select("dokumentart, erinnerung_nach_tagen");
  const nachTagen = new Map<string, number>((vorlagen ?? []).map((t: { dokumentart: string; erinnerung_nach_tagen: number }) => [t.dokumentart, t.erinnerung_nach_tagen]));

  for (const o of offen ?? []) {
    try {
      // Hängengebliebene Abschluss-Sperre nach 10 Minuten lösen
      if (o.completed_at && Date.now() - new Date(o.updated_at).getTime() > 10 * 60_000) {
        await db.from("sign_requests").update({ completed_at: null }).eq("id", o.id).eq("status", "offen");
        o.completed_at = null;
      }
      const { req: v, signers } = await vorgangLaden(db, o.id);
      // Abschluss nachholen (z. B. nach Fehler)
      if (alleFertig(signers)) {
        if (!o.completed_at && (await abschliessen(db, v.id, null))) ergebnis.abgeschlossen++;
        continue;
      }

      // ---- Erinnerungen
      if (v.erinnerung) {
        const tage = istEtv(v) ? 3 : nachTagen.get(v.dokumentart) ?? 5;
        const vorFrist = v.frist ? addTage(v.frist, -2) : null;
        for (const s of signers) {
          if (s.methode === "intern" || !(s.email || nurLink(s)) || !["offen", "geoeffnet", "abgelehnt"].includes(s.status)) continue;
          if (!s.eingeladen_at) continue;
          const ersteFaellig = (s.reminder_count ?? 0) === 0 &&
            Date.now() - new Date(s.eingeladen_at).getTime() >= tage * 86400_000;
          const letzte = s.last_reminder_at ? new Date(s.last_reminder_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) : null;
          const zweiteFaellig = !!vorFrist && heute >= vorFrist && heute <= v.frist && !(letzte && letzte >= vorFrist) &&
            // nicht am Einladungstag selbst erinnern
            new Date(s.eingeladen_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) < heute;
          if (!ersteFaellig && !zweiteFaellig) continue;
          try {
            if (!s.email) await selbstErinnern(db, v, s, null, true);
            else await einladen(db, v, s, "erinnerung", { automatisch: true });
            ergebnis.erinnert++;
          } catch (e) {
            ergebnis.fehler.push(`${v.nummer}: ${e instanceof Error ? e.message : e}`);
          }
        }
      }

      // ---- Frist abgelaufen → einmalig Aufgabe „anrufen“ je fehlendem externem Unterzeichner
      if (v.frist && v.frist < heute && uuidOderNull(v.created_by)) {
        const { data: schon } = await db.from("sign_request_events").select("signer_id").eq("request_id", v.id).eq("ereignis", "frist_abgelaufen");
        const erledigt = new Set((schon ?? []).map((e: { signer_id: string }) => e.signer_id));
        for (const s of signers) {
          if (s.methode === "intern" || !["offen", "geoeffnet", "abgelehnt"].includes(s.status) || erledigt.has(s.id)) continue;
          const titel = `Unterschrift fehlt: ${v.titel} – ${s.name} anrufen`.slice(0, 250);
          const { data: todo, error } = await db.from("todos").insert({
            title: titel,
            description: `Vorgang ${v.nummer}: Die Frist (${v.frist.split("-").reverse().join(".")}) ist abgelaufen. ${s.name}${s.email ? ` (${s.email})` : ""} hat noch nicht unterschrieben. Der Vorgang bleibt offen.`,
            due_date: heute,
            assigned_to: v.created_by,
            created_by: v.created_by,
            building_id: v.building_id,
            source_type: "manual",
            priority: "high",
          }).select("id").single();
          if (error) {
            ergebnis.fehler.push(`${v.nummer}: Aufgabe nicht angelegt (${error.message})`);
            continue;
          }
          await ereignis(db, v.id, "frist_abgelaufen", `Frist abgelaufen – Aufgabe „${s.name} anrufen“ angelegt`, {
            signerId: s.id,
            details: { todo_id: todo.id },
          });
          ergebnis.aufgaben++;
        }
      }
    } catch (e) {
      ergebnis.fehler.push(`${o.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- Papier per E-Mail: Antworten mit [SIG-…] im Betreff im Postfach info@
  try {
    ergebnis.mails = await mailsZuordnen(db);
  } catch (e) {
    ergebnis.fehler.push(`Mail-Zuordnung: ${e instanceof Error ? e.message : e}`);
  }
  return ergebnis;
}

async function mailsZuordnen(db: Db): Promise<number> {
  const konto = await absenderKontoId(db);
  const seit = new Date(Date.now() - 2 * 86400_000).toISOString();
  const { data: mails } = await db.from("emails")
    .select("id, subject, from_address, from_name, attachments_incomplete, has_attachments")
    .eq("account_id", konto).gte("date", seit).ilike("subject", "%[SIG-%").is("deleted_at", null)
    .neq("from_address", ABSENDER_ADRESSE).order("date", { ascending: true }).limit(50);
  let n = 0;
  for (const m of mails ?? []) {
    if (m.attachments_incomplete) continue; // Anhänge noch nicht vollständig geladen
    const { data: schon } = await db.from("sign_request_events").select("id").eq("details->>email_id", m.id).limit(1);
    if (schon?.length) continue;
    const nummer = String(m.subject || "").match(/\[(SIG-\d{4}-\d{3,})\]/)?.[1];
    if (!nummer) continue;
    const { data: r } = await db.from("sign_requests").select("id").eq("nummer", nummer).maybeSingle();
    if (!r) continue;
    const { req: v, signers } = await vorgangLaden(db, r.id);
    const von = String(m.from_address || "").toLowerCase().trim();
    const vonName = zeile(m.from_name || von, 120);
    if (v.status !== "offen") {
      await ereignis(db, v.id, "mail_eingegangen", `Antwort von ${vonName} eingegangen (Vorgang nicht mehr offen)`, { details: { email_id: m.id } });
      continue;
    }
    const moeglich = signers.filter((s: Signer) => s.methode !== "intern" && [...UNTERSCHREIBBAR, "papier_eingegangen"].includes(s.status));
    let signer: Signer | undefined = moeglich.find((s: Signer) => (s.email || "").toLowerCase() === von);
    if (!signer) {
      const offenExtern = signers.filter((s: Signer) => s.methode !== "intern" && UNTERSCHREIBBAR.includes(s.status));
      if (offenExtern.length === 1) signer = offenExtern[0];
    }
    if (!signer) {
      await ereignis(db, v.id, "mail_eingegangen", `Antwort von ${vonName} eingegangen – bitte manuell zuordnen`, { details: { email_id: m.id, von } });
      await melden(db, v.created_by, "review_due", `Antwort zuordnen: ${v.titel}`, `${v.nummer} · Antwort von ${vonName} konnte keinem Unterzeichner zugeordnet werden`, v.id);
      continue;
    }
    const a = await mailAnhaenge(db, m.id);
    if (!a.dateien.length) {
      await ereignis(db, v.id, "mail_eingegangen", a.heic
        ? `Antwort von ${signer.name} mit HEIC-Fotos – bitte als JPG oder PDF anfordern`
        : `Antwort von ${signer.name} ohne verwertbare Anhänge`, { signerId: signer.id, details: { email_id: m.id } });
      if (a.heic) await melden(db, v.created_by, "review_due", `Papier-Rücksendung unlesbar: ${v.titel}`, `${signer.name} hat HEIC-Fotos geschickt · ${v.nummer}`, v.id);
      continue;
    }
    try {
      await papierSpeichern(db, v, signer, a.dateien, { eingang: "email", emailId: m.id, streng: false });
      n++;
    } catch (e) {
      await ereignis(db, v.id, "mail_eingegangen", `Antwort von ${signer.name} konnte nicht verarbeitet werden`, {
        signerId: signer.id,
        details: { email_id: m.id, fehler: String(e instanceof Error ? e.message : e).slice(0, 300) },
      });
      await melden(db, v.created_by, "review_due", `Papier-Rücksendung prüfen: ${v.titel}`, `${signer.name} · Anhänge nicht lesbar · ${v.nummer}`, v.id);
    }
  }
  return n;
}
