// sign-request – Büro-Funktion der elektronischen Unterschrift (requireStaffOrCron).
// Alle zustandsändernden Aktionen laufen hierüber, damit Mails, PDFs und Protokoll
// (sign_request_events) immer zusammenpassen. Vertrag: /home/claude/esig/API.md
//
// Aktionen: create · preview_mail · sign_internal · remind · withdraw · accept_paper ·
//           reject_paper · assign_paper_email · urls · nachweis · neuer_link · cron ·
//           create_incoming · complete_incoming (Fall B, eingehende Dokumente selbst unterschreiben)
//
// Testmodus (nur mit x-cron-secret): body.test_user_id handelt als dieser Mitarbeiter,
// body.test = true liefert bei create/remind/reject_paper die Klartext-Links zurück.
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import {
  ABSENDER_ADRESSE,
  BUCKET,
  DOKUMENTARTEN,
  EMAIL_RE,
  ERLEDIGT,
  Fehler,
  QUELLE_TEXT,
  QUELLE_TYPEN,
  ROLLE_KEYS,
  TYPEN,
  UNTERSCHREIBBAR,
  VERSAND,
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
  etvQuelleVorbereiten,
  istEtv,
  linkErstellen,
  nachUnterschrift,
  nurLink,
  papierSpeichern,
  signerLaden,
  vorgangLaden,
  vorlageLaden,
} from "../_shared/signatur/ablauf.ts";
import { absenderKontoId, einladungMail } from "../_shared/signatur/mail.ts";
import { eingehendAbschliessen, eingehendAnlegen } from "../_shared/signatur/eingehend.ts";
import { istHeic, istJpg, istPdf, istPng, nachweisPdf, seitenZaehlen } from "../_shared/signatur/pdf.ts";

type Db = ReturnType<typeof adminClient>;
// deno-lint-ignore no-explicit-any
type Body = any;

const ERLAUBTE_BUCKETS = ["building-files", "email-attachments"];

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

// ================================================================ create

// deno-lint-ignore no-explicit-any
function platzierungenPruefen(roh: any, seiten: number, name: string) {
  if (roh == null) return null;
  if (!Array.isArray(roh)) throw new Fehler(400, `Unterschriftsfelder von ${name} sind ungültig.`);
  if (roh.length > 20) throw new Fehler(400, `Zu viele Unterschriftsfelder für ${name}.`);
  return roh.map((p) => {
    const z = {
      page: Number(p?.page),
      x: Number(p?.x),
      y: Number(p?.y),
      w: Number(p?.w),
      h: Number(p?.h),
    };
    if (!Number.isInteger(z.page) || z.page < 0 || z.page >= seiten) {
      throw new Fehler(400, `Unterschriftsfeld von ${name} liegt auf einer Seite, die es nicht gibt.`);
    }
    if (![z.x, z.y, z.w, z.h].every(Number.isFinite) || z.w <= 0 || z.h <= 0 || z.w > 3000 || z.h > 3000 || z.x < -50 || z.y < -50) {
      throw new Fehler(400, `Unterschriftsfeld von ${name} hat ungültige Maße.`);
    }
    return z;
  });
}

async function anlegen(db: Db, b: Body, userId: string | null, test: boolean) {
  // ---- Eingaben prüfen
  const typ = String(b.typ || "ausgehend");
  if (!TYPEN.includes(typ)) throw new Fehler(400, "Ungültiger Typ.");
  const dokumentart = String(b.dokumentart || (typ === "etv_protokoll" ? "protokoll" : "sonstiges"));
  if (!DOKUMENTARTEN.includes(dokumentart)) throw new Fehler(400, "Ungültige Dokumentart.");
  const titel = zeile(b.titel, 200);
  if (!titel) throw new Fehler(400, "Bitte einen Titel angeben.");
  const buildingId = b.building_id ? uuidOderNull(b.building_id) : null;
  if (b.building_id && !buildingId) throw new Fehler(400, "Ungültiges Objekt.");
  const quelleTyp = b.quelle_typ ? String(b.quelle_typ) : null;
  if (quelleTyp && !QUELLE_TYPEN.includes(quelleTyp)) throw new Fehler(400, "Ungültige Quelle.");
  if (typ === "etv_protokoll" && quelleTyp !== "etv_meeting") {
    // ohne Versammlung funktioniert es, aber Protokoll-Tabellen werden dann nicht befüllt
    console.warn("[sign-request] ETV-Protokoll ohne quelle_typ etv_meeting");
  }
  const bucket = String(b.source_bucket || BUCKET);
  if (!ERLAUBTE_BUCKETS.includes(bucket)) throw new Fehler(400, "Ungültiger Speicherort der Quelle.");
  const sourcePath = String(b.source_path || "");
  if (!sourcePath || sourcePath.includes("..") || sourcePath.startsWith("/") || sourcePath.length > 500) {
    throw new Fehler(400, "Ungültiger Pfad der Quelldatei.");
  }
  const reihenfolge = b.reihenfolge === "nacheinander" ? "nacheinander" : "gleichzeitig";
  const vorlage = await vorlageLaden(db, dokumentart);
  let frist: string | null = b.frist ? String(b.frist) : addTage(heuteIso(), vorlage.frist_tage ?? 14);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(frist) || isNaN(Date.parse(frist))) throw new Fehler(400, "Ungültige Frist (JJJJ-MM-TT).");
  if (frist < heuteIso()) throw new Fehler(400, "Die Frist liegt in der Vergangenheit.");
  const betreff = zeile(b.mail_betreff, 230) || vorlage.betreff;
  const text = mehrzeilig(b.mail_text, 5000) || vorlage.text;

  const rohSigner = Array.isArray(b.signers) ? b.signers : [];
  if (!rohSigner.length) throw new Fehler(400, "Bitte mindestens einen Unterzeichner angeben.");
  if (rohSigner.length > 40) throw new Fehler(400, "Höchstens 40 Unterzeichner je Vorgang.");

  // ---- Quelle laden und prüfen
  const quelleRoh = await laden(db, bucket, sourcePath);
  if (!istPdf(quelleRoh)) throw new Fehler(400, "Die Quelldatei ist kein PDF.");
  await seitenZaehlen(quelleRoh);

  const signerZeilen = rohSigner.map((s: Body, i: number) => {
    const name = zeile(s?.name, 120);
    if (!name) throw new Fehler(400, `Unterzeichner ${i + 1}: Name fehlt.`);
    const methode = s?.methode === "intern" ? "intern" : "online";
    // „Nur Link erstellen“: keine Einladungsmail, E-Mail-Adresse optional (Erinnerungen/Kopie)
    const versand = methode === "online" && s?.versand === "link" ? "link" : "mail";
    if (!VERSAND.includes(versand)) throw new Fehler(400, `${name}: ungültiger Versandweg.`);
    const email = zeile(s?.email, 200).toLowerCase() || null;
    if (methode === "online" && versand === "mail" && (!email || !EMAIL_RE.test(email))) {
      throw new Fehler(400, `${name}: gültige E-Mail-Adresse erforderlich.`);
    }
    if (email && !EMAIL_RE.test(email)) throw new Fehler(400, `${name}: ungültige E-Mail-Adresse.`);
    // Freier Schlüssel (z. B. „verwaltung“); bei ETV-Protokollen zählen nur leiter/protokollant/eigentuemer/beirat
    const rolleKey = s?.rolle_key ? zeile(s.rolle_key, 40) : null;
    if (typ === "etv_protokoll" && rolleKey && !ROLLE_KEYS.includes(rolleKey) && methode !== "intern") {
      throw new Fehler(400, `${name}: ungültige Protokoll-Rolle.`);
    }
    return {
      position: i + 1,
      name,
      email,
      methode,
      versand,
      contact_id: uuidOderNull(s?.contact_id),
      user_id: uuidOderNull(s?.user_id),
      rolle: zeile(s?.rolle, 80) || null,
      rolle_key: rolleKey ?? (typ === "etv_protokoll" ? "eigentuemer" : null),
      anrede: zeile(s?.anrede, 120) || null,
      ort_datum: s?.ort_datum === false ? false : true,
      _placements: s?.placements,
    };
  });

  // ---- Vorgang anlegen
  const { data: neu, error: insErr } = await db.from("sign_requests").insert({
    typ,
    dokumentart,
    titel,
    building_id: buildingId,
    quelle_typ: quelleTyp,
    quelle_id: uuidOderNull(b.quelle_id),
    quelle_label: zeile(b.quelle_label, 200) || null,
    source_bucket: bucket,
    source_path: sourcePath,
    status: "offen",
    frist,
    reihenfolge,
    mail_betreff: betreff,
    mail_text: text,
    erinnerung: b.erinnerung === false ? false : true,
    kopie_dms: b.kopie_dms === false ? false : true,
    email_id: uuidOderNull(b.email_id),
    created_by: userId,
  }).select("id, nummer").single();
  if (insErr) throw new Fehler(500, `Vorgang konnte nicht angelegt werden: ${insErr.message}`);
  const id = neu.id as string;

  try {
    // Quelle kopieren (ETV: leere Unterschriftsseite anhängen) und Seiten zählen
    let quelle = quelleRoh;
    if (typ === "etv_protokoll") {
      const { req: v } = await vorgangLaden(db, id);
      quelle = await etvQuelleVorbereiten(db, v, quelleRoh);
    }
    const seiten = await seitenZaehlen(quelle);
    await speichern(db, pfad.quelle(id), quelle);
    await db.from("sign_requests").update({ seitenzahl: seiten }).eq("id", id);

    const zeilen = signerZeilen.map((s: Body, i: number) => {
      const { _placements, ...rest } = s;
      return {
        ...rest,
        request_id: id,
        placements: platzierungenPruefen(_placements, seiten, s.name),
        status: reihenfolge === "nacheinander" && i > 0 ? "wartet" : "offen",
        eingeladen_at: s.methode === "intern" && (reihenfolge === "gleichzeitig" || i === 0) ? new Date().toISOString() : null,
      };
    });
    const { error: sErr } = await db.from("sign_request_signers").insert(zeilen);
    if (sErr) throw new Fehler(500, `Unterzeichner konnten nicht gespeichert werden: ${sErr.message}`);
  } catch (e) {
    // Halb angelegten Vorgang wieder entfernen
    await db.from("sign_requests").delete().eq("id", id);
    await db.storage.from(BUCKET).remove([pfad.quelle(id)]);
    throw e;
  }

  const { req: v, signers } = await vorgangLaden(db, id);
  await ereignis(db, id, "angelegt", `Vorgang angelegt ${QUELLE_TEXT[quelleTyp ?? "upload"] ?? ""}`.trim(), {
    userId,
    details: { quelle_typ: quelleTyp, quelle_label: v.quelle_label, unterzeichner: signers.length },
  });

  // ---- Einladungen (bzw. bei „Nur Link“: Link erzeugen und nur in der Antwort zurückgeben)
  const links: Record<string, string> = {};
  const linkListe: { signer_id: string; name: string; url: string }[] = [];
  const fehler: string[] = [];
  for (const s of signers.filter((x: Signer) => x.status === "offen")) {
    if (s.methode === "intern") {
      if (s.user_id) await melden(db, s.user_id, "review_due", `Bitte unterschreiben: ${v.titel}`, `${v.nummer} · Unterschrift in der App`, id);
      continue;
    }
    if (nurLink(s)) {
      try {
        const t = await linkErstellen(db, v, s, "link_erstellt", { userId });
        linkListe.push({ signer_id: s.id, name: s.name, url: signLink(t) });
        if (test) links[s.id] = signLink(t);
      } catch (e) {
        fehler.push(e instanceof Error ? e.message : String(e));
      }
      continue;
    }
    try {
      const t = await einladen(db, v, s, "einladung", { userId });
      if (test) links[s.id] = signLink(t);
    } catch (e) {
      fehler.push(e instanceof Error ? e.message : String(e));
    }
  }
  return {
    id,
    nummer: neu.nummer,
    links: linkListe,
    ...(fehler.length ? { versand_fehler: fehler } : {}),
    ...(test ? { test_links: links } : {}),
  };
}

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

async function erinnern(db: Db, b: Body, userId: string | null, test: boolean) {
  const { req: v, signers } = await vorgangLaden(db, String(b.request_id || ""));
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  const kandidaten = signers.filter((s: Signer) =>
    s.methode !== "intern" && (s.email || nurLink(s)) && ["offen", "geoeffnet", "abgelehnt"].includes(s.status)
  );
  let ziel = kandidaten;
  if (b.signer_id) {
    ziel = kandidaten.filter((s: Signer) => s.id === b.signer_id);
    if (!ziel.length) throw new Fehler(400, "Dieser Unterzeichner kann derzeit nicht erinnert werden.");
  }
  const links: Record<string, string> = {};
  const fehler: string[] = [];
  const selbst: string[] = [];
  let n = 0;
  for (const s of ziel) {
    if (!s.email) {
      // „Nur Link“ ohne E-Mail-Adresse: keine Mail möglich → Meldung an den Ersteller
      await selbstErinnern(db, v, s, userId);
      selbst.push(s.name);
      continue;
    }
    try {
      const t = await einladen(db, v, s, "erinnerung", { userId });
      if (test) links[s.id] = signLink(t);
      n++;
    } catch (e) {
      fehler.push(e instanceof Error ? e.message : String(e));
    }
  }
  return {
    ok: true,
    erinnert: n,
    ...(selbst.length ? { selbst_erinnern: selbst } : {}),
    ...(fehler.length ? { fehler } : {}),
    ...(test ? { test_links: links } : {}),
  };
}

/** Erinnerung für einen „Nur Link“-Unterzeichner ohne E-Mail: Meldung an den Ersteller statt Mail. */
async function selbstErinnern(db: Db, v: Body, s: Signer, userId: string | null, automatisch = false) {
  await db.from("sign_request_signers").update({
    reminder_count: (s.reminder_count ?? 0) + 1,
    last_reminder_at: new Date().toISOString(),
  }).eq("id", s.id);
  await ereignis(db, v.id, "erinnerung_selbst", `${automatisch ? "Automatische " : ""}Erinnerung fällig: ${s.name} hat keine E-Mail-Adresse – bitte selbst erinnern`, {
    signerId: s.id,
    userId,
  });
  await melden(db, v.created_by, "review_due", `Bitte selbst erinnern: ${s.name}`, `${v.nummer} · ${v.titel} · ${s.name} hat noch nicht unterschrieben (keine E-Mail-Adresse hinterlegt). Bei Bedarf neuen Link erstellen.`, v.id);
}

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

// ================================================================ neuer_link

/** Neuen persönlichen Link erzeugen (alter wird ungültig, wieder 14 Tage gültig) – ohne E-Mail. */
async function neuerLink(db: Db, b: Body, userId: string | null) {
  const { req: v, signer: s } = await signerLaden(db, b.signer_id);
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  if (v.typ === "eingehend" || s.methode === "intern") throw new Fehler(400, "Für diesen Unterzeichner gibt es keinen Link.");
  if (s.status === "wartet") throw new Fehler(409, `${s.name} ist erst an der Reihe, wenn die vorherigen Unterzeichner unterschrieben haben.`);
  if (!["offen", "geoeffnet"].includes(s.status)) throw new Fehler(409, `Für ${s.name} kann derzeit kein neuer Link erstellt werden.`);
  const erster = !s.token_hash;
  const t = await linkErstellen(db, v, s, erster ? "link_erstellt" : "neuer_link", { userId });
  return { url: signLink(t), name: s.name, ersetzt: !erster };
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
