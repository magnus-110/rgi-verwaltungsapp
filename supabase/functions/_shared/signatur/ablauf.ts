// Elektronische Unterschrift – fachlicher Ablauf, gemeinsam für sign-request (Büro/Zeitplan)
// und sign-public (Unterzeichner): Einladen, Kopie, Reihenfolge, Abschluss.
import { ortAus, unterschriftenSeiteAnhaengen, UNTERSCHRIFT_ROLLEN } from "../protokoll-unterschriften.ts";
import {
  BUCKET,
  DMS_SLUG,
  Db,
  ERLEDIGT,
  Fehler,
  datum,
  dateiname,
  ereignis,
  laden,
  melden,
  neuerToken,
  objektLabel,
  papierLink,
  pfad,
  pfadSegment,
  sha256Bytes,
  sha256Hex,
  signLink,
  speichern,
  uuidOderNull,
} from "./basis.ts";
import {
  Kontext,
  einladungMail,
  endfassungMail,
  erinnerungMail,
  kopieMail,
  papierAbgelehntMail,
  sendeMail,
} from "./mail.ts";
import {
  LEERES_PNG,
  PDFDocument,
  PapierDatei,
  papierZusammenfuegen,
  SignerPdf,
  elektronisch,
  etvNamenErgaenzen,
  fusszeile,
  kopfzeile,
  pruefblattAnhaengen,
  stempeln,
} from "./pdf.ts";
import { zeitstempelHolen } from "./zeitstempel.ts";
import { felderLaden } from "./felder.ts";
import { StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// deno-lint-ignore no-explicit-any
export type Vorgang = any;
// deno-lint-ignore no-explicit-any
export type Signer = any;

const MAX_ANHANG = 20 * 1024 * 1024;

// ---------------------------------------------------------------- Laden

export async function vorgangLaden(db: Db, id: string): Promise<{ req: Vorgang; signers: Signer[] }> {
  const { data: req } = await db
    .from("sign_requests")
    .select("*, buildings(id, name, address, postal_code, city, management_mode)")
    .eq("id", id)
    .maybeSingle();
  if (!req) throw new Fehler(404, "Vorgang nicht gefunden.");
  const { data: signers } = await db.from("sign_request_signers").select("*").eq("request_id", id)
    .order("position", { ascending: true }).order("created_at", { ascending: true });
  return { req, signers: signers ?? [] };
}

export async function signerLaden(db: Db, signerId: string): Promise<{ req: Vorgang; signers: Signer[]; signer: Signer }> {
  if (!uuidOderNull(signerId)) throw new Fehler(400, "signer_id fehlt oder ist ungültig.");
  const { data: s } = await db.from("sign_request_signers").select("request_id").eq("id", signerId).maybeSingle();
  if (!s) throw new Fehler(404, "Unterzeichner nicht gefunden.");
  const v = await vorgangLaden(db, s.request_id);
  return { ...v, signer: v.signers.find((x: Signer) => x.id === signerId) };
}

export const istEtv = (req: Vorgang) => req.typ === "etv_protokoll";

export function kontext(req: Vorgang): Kontext {
  return {
    titel: req.titel,
    objekt: objektLabel(req.buildings),
    frist: req.frist,
    seitenzahl: req.seitenzahl,
    nummer: req.nummer,
    mitKopie: !istEtv(req),
  };
}

export async function vorlageLaden(db: Db, dokumentart: string) {
  const { data } = await db.from("sign_mail_templates").select("*").eq("dokumentart", dokumentart).maybeSingle();
  return data ?? {
    betreff: "Bitte unterschreiben: {Dokument} – {Objekt}",
    text: "{Anrede},\n\nanbei das Dokument „{Dokument}“. Bitte prüfen und unterschreiben Sie bis zum {Frist}.",
    frist_tage: 14,
    erinnerung_nach_tagen: 5,
  };
}

// ---------------------------------------------------------------- Einladen / Erinnern

export type MailArt = "einladung" | "erinnerung" | "abgelehnt";

/**
 * Erzeugt einen neuen persönlichen Link (alter wird ungültig), setzt den Status auf offen
 * und schickt die passende Mail. Gibt den Klartext-Token zurück (nur für den Testmodus).
 */
export async function einladen(
  db: Db,
  req: Vorgang,
  signer: Signer,
  art: MailArt,
  o: { userId?: string | null; grund?: string | null; automatisch?: boolean } = {},
): Promise<string> {
  if (!signer.email) throw new Fehler(400, `Für ${signer.name} ist keine E-Mail-Adresse hinterlegt.`);
  const t = await neuerToken();
  const jetzt = new Date().toISOString();
  const upd: Record<string, unknown> = { token_hash: t.hash, expires_at: t.expires_at, status: "offen" };
  if (art === "einladung") upd.eingeladen_at = jetzt;
  if (art === "erinnerung") {
    upd.reminder_count = (signer.reminder_count ?? 0) + 1;
    upd.last_reminder_at = jetzt;
    // Status (offen/geöffnet) bei der Erinnerung beibehalten
    upd.status = signer.status === "geoeffnet" ? "geoeffnet" : "offen";
  }
  if (art === "abgelehnt") {
    Object.assign(upd, {
      methode: "online",
      paper_bucket: null,
      paper_path: null,
      paper_page_count: null,
      paper_eingang: null,
      paper_email_id: null,
      paper_eingang_at: null,
      paper_pruefung: null,
    });
  }
  const { error } = await db.from("sign_request_signers").update(upd).eq("id", signer.id);
  if (error) throw new Fehler(500, `Unterzeichner konnte nicht aktualisiert werden: ${error.message}`);

  const k = kontext(req);
  const s = { name: signer.name, anrede: signer.anrede };
  const link = signLink(t.token);
  const papier = papierLink(t.token);
  const mail = art === "einladung"
    ? einladungMail(k, s, { betreff: req.mail_betreff, text: req.mail_text }, link, papier)
    : art === "erinnerung"
    ? erinnerungMail(k, s, req.mail_betreff, link, papier)
    : papierAbgelehntMail(k, s, o.grund ?? null, link, papier);

  try {
    const emailId = await sendeMail(db, {
      to: signer.email,
      toName: signer.name,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      buildingId: req.building_id,
    });
    const texte: Record<MailArt, [string, string]> = {
      einladung: ["versendet", `Einladung an ${signer.name} versendet`],
      erinnerung: ["erinnert", `${o.automatisch ? "Automatische " : ""}Erinnerung an ${signer.name} versendet`],
      abgelehnt: ["abgelehnt", `Papier-Unterschrift von ${signer.name} abgelehnt – neu angefordert`],
    };
    const [ev, text] = texte[art];
    await ereignis(db, req.id, ev, text, {
      signerId: signer.id,
      userId: o.userId,
      details: { an: signer.email, mail_id: emailId, ...(o.grund ? { grund: o.grund } : {}) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ereignis(db, req.id, "mail_fehler", `E-Mail an ${signer.name} konnte nicht gesendet werden`, {
      signerId: signer.id,
      userId: o.userId,
      details: { an: signer.email, fehler: msg.slice(0, 300) },
    });
    throw new Fehler(502, `E-Mail an ${signer.email} konnte nicht gesendet werden: ${msg}`);
  }
  return t.token;
}

/** Unterzeichner, dessen Link das Büro selbst verschickt (versand = 'link'). */
export const nurLink = (s: Signer) => s.methode !== "intern" && s.versand === "link";

/**
 * „Nur Link erstellen“: neuer persönlicher Link OHNE E-Mail (alter Link wird ungültig, 14 Tage gültig).
 * Der Klartext-Token wird nur an den Aufrufer zurückgegeben und nirgends gespeichert.
 * art „link_erstellt“ = erster Link (setzt eingeladen_at), „neuer_link“ = Ersatz für einen vorhandenen Link.
 */
export async function linkErstellen(
  db: Db,
  req: Vorgang,
  signer: Signer,
  art: "link_erstellt" | "neuer_link",
  o: { userId?: string | null; text?: string } = {},
): Promise<string> {
  const t = await neuerToken();
  const upd: Record<string, unknown> = {
    token_hash: t.hash,
    expires_at: t.expires_at,
    status: signer.status === "geoeffnet" ? "geoeffnet" : "offen",
  };
  if (art === "link_erstellt" || !signer.eingeladen_at) upd.eingeladen_at = new Date().toISOString();
  const { error } = await db.from("sign_request_signers").update(upd).eq("id", signer.id);
  if (error) throw new Fehler(500, `Link konnte nicht erstellt werden: ${error.message}`);
  await ereignis(
    db,
    req.id,
    art,
    o.text ?? (art === "link_erstellt"
      ? `Link für ${signer.name} erstellt (wird selbst verschickt)`
      : `Neuer Link für ${signer.name} erstellt – der alte Link ist ungültig`),
    { signerId: signer.id, userId: o.userId, details: { gueltig_bis: t.expires_at } },
  );
  return t.token;
}

/**
 * Reihenfolge „nacheinander“: Ist niemand mehr aktiv (offen/geöffnet/abgelehnt/Papier eingegangen),
 * wird der nächste wartende Unterzeichner aktiviert – externe per Mail, interne bleiben in der App offen,
 * „Nur Link“-Unterzeichner: Meldung an den Ersteller, den Link jetzt zu erstellen und zu verschicken.
 */
export async function weiterschalten(db: Db, requestId: string, userId?: string | null): Promise<Record<string, string>> {
  const tokens: Record<string, string> = {};
  const { req, signers } = await vorgangLaden(db, requestId);
  if (req.status !== "offen" || req.reihenfolge !== "nacheinander") return tokens;
  const aktiv = signers.some((s: Signer) => ["offen", "geoeffnet", "abgelehnt", "papier_eingegangen"].includes(s.status));
  if (aktiv) return tokens;
  const naechster = signers.find((s: Signer) => s.status === "wartet");
  if (!naechster) return tokens;
  if (naechster.methode === "intern") {
    await db.from("sign_request_signers").update({ status: "offen", eingeladen_at: new Date().toISOString() }).eq("id", naechster.id);
    await ereignis(db, req.id, "an_der_reihe", `${naechster.name} ist an der Reihe (Unterschrift in der App)`, {
      signerId: naechster.id,
      userId,
    });
    if (naechster.user_id) {
      await melden(db, naechster.user_id, "review_due", `Bitte unterschreiben: ${req.titel}`, `${req.nummer} · Sie sind an der Reihe.`, req.id);
    }
  } else if (nurLink(naechster)) {
    // Kein Token erzeugen: Der Klartext-Link würde sonst nirgends angezeigt. Das Büro erstellt ihn
    // über „Neuen Link erstellen“ (neuer_link) und verschickt ihn selbst.
    await db.from("sign_request_signers").update({ status: "offen", eingeladen_at: new Date().toISOString(), token_hash: null })
      .eq("id", naechster.id);
    await ereignis(db, req.id, "an_der_reihe", `${naechster.name} ist an der Reihe – Link bitte selbst erstellen und verschicken`, {
      signerId: naechster.id,
      userId,
    });
    await melden(db, req.created_by, "review_due", `Jetzt Link für ${naechster.name} erstellen`, `${req.nummer} · ${req.titel} · ${naechster.name} ist an der Reihe.`, req.id);
  } else {
    tokens[naechster.id] = await einladen(db, req, naechster, "einladung", { userId });
  }
  return tokens;
}

// ---------------------------------------------------------------- Dokument bauen

function alsPdfSigner(s: Signer): SignerPdf {
  return {
    id: s.id,
    name: s.name,
    rolle: s.rolle,
    rolle_key: s.rolle_key,
    email: s.email,
    methode: s.methode,
    status: s.status,
    typed_name: s.typed_name,
    signature_png: s.signature_png,
    signed_at: s.signed_at,
    placements: Array.isArray(s.placements) ? s.placements : null,
    ort_datum: s.ort_datum,
    ort: s.ort,
    ip: s.ip,
    user_agent: s.user_agent,
    copy_sent_at: s.copy_sent_at,
    paper_eingang: s.paper_eingang,
    paper_eingang_at: s.paper_eingang_at,
    paper_page_count: s.paper_page_count,
    paper_pruefung: s.paper_pruefung,
  };
}

async function etvDaten(db: Db, req: Vorgang) {
  // deno-lint-ignore no-explicit-any
  let meeting: any = null;
  if (req.quelle_typ === "etv_meeting" && req.quelle_id) {
    const { data } = await db.from("etv_meetings").select("id, title, meeting_date, location, created_by").eq("id", req.quelle_id).maybeSingle();
    meeting = data;
  }
  const b = req.buildings;
  return {
    meeting,
    titel: meeting?.title || req.titel,
    liegenschaft: b?.name || "",
    datum: meeting?.meeting_date ? datum(meeting.meeting_date) : "",
    ort: ortAus(meeting?.location, b?.city || "Pfronten"),
  };
}

/** Leere ETV-Unterschriftsseite an die Quelle hängen (damit auch Papier-Unterzeichner Linien haben). */
export async function etvQuelleVorbereiten(db: Db, req: Vorgang, bytes: Uint8Array): Promise<Uint8Array> {
  const e = await etvDaten(db, req);
  return await unterschriftenSeiteAnhaengen(bytes, { signatures: [], titel: e.titel, liegenschaft: e.liegenschaft, datum: e.datum, ort: e.ort });
}

/** Braucht das Dokument ein Prüfblatt? (Regel 4, erweitert: auch wenn eine elektronische Unterschrift kein Feld hat) */
export function brauchtPruefblatt(req: Vorgang, signers: Signer[]): boolean {
  if (istEtv(req)) return false;
  const mitFeld = (s: Signer) => Array.isArray(s.placements) && s.placements.length > 0;
  if (!signers.some(mitFeld)) return true;
  return signers.some((s: Signer) => s.status === "unterschrieben" && !mitFeld(s));
}

/**
 * Baut das Dokument mit allen bisher vorhandenen Unterschriften:
 * Quelle + Stempel (bzw. ETV-Unterschriftsseite) + übernommene Papier-Scans + ggf. Prüfblatt.
 */
export async function dokumentBauen(db: Db, req: Vorgang, signers: Signer[], o: { abgeschlossenAm?: string | null } = {}): Promise<Uint8Array> {
  const quelle = await laden(db, BUCKET, pfad.quelle(req.id));
  const ps = signers.map(alsPdfSigner);
  const felder = await felderLaden(db, req.id);
  let doc;

  if (istEtv(req)) {
    // Leere Unterschriftsseite aus der Quelle entfernen und mit allen Unterschriften neu anhängen
    const q = await PDFDocument.load(quelle, { ignoreEncryption: true, updateMetadata: false });
    q.removePage(q.getPageCount() - 1);
    const ohne = await q.save();
    const e = await etvDaten(db, req);
    const proRolle = new Map<string, SignerPdf>();
    for (const s of ps.filter(elektronisch)) {
      const key = s.rolle_key || "eigentuemer";
      if (!proRolle.has(key)) proRolle.set(key, s);
    }
    const sigs = [...proRolle.entries()].map(([role, s]) => ({
      role,
      signer_name: s.typed_name || s.name,
      signature_png: s.signature_png || LEERES_PNG,
      signed_at: s.signed_at,
    }));
    const mitSeite = await unterschriftenSeiteAnhaengen(ohne, { signatures: sigs, titel: e.titel, liegenschaft: e.liegenschaft, datum: e.datum, ort: e.ort });
    doc = await PDFDocument.load(mitSeite, { updateMetadata: false });
    const seite = doc.getPage(doc.getPageCount() - 1);
    const getippt = [...proRolle.entries()].filter(([, s]) => !s.signature_png)
      .map(([role, s]) => ({ index: UNTERSCHRIFT_ROLLEN.findIndex((r) => r.key === role), name: s.typed_name || s.name }))
      .filter((x) => x.index >= 0);
    if (getippt.length) await etvNamenErgaenzen(doc, seite, getippt);
    if (proRolle.size) {
      const spaet = [...proRolle.values()].map((s) => s.signed_at!).sort().pop()!;
      fusszeile(doc, seite, await doc.embedFont(StandardFonts.Helvetica), req.nummer, spaet);
    }
  } else {
    doc = await PDFDocument.load(quelle, { ignoreEncryption: true, updateMetadata: false });
    // RGI-Vorab-Werte und Anker sind seit dem Anlegen fest in quelle.pdf (vorgang.ts) – hier nur die übrigen
    await stempeln(doc, ps, {
      nummer: req.nummer,
      standardOrt: req.buildings?.city || "Pfronten",
      felder: felder.filter((f) => f.ausfueller !== "rgi").map((f) => ({ ...f, anker: null })),
    });
  }

  // Papier-Scans (übernommen) – je Unterzeichner seine Seiten am Ende, mit Kopfzeile
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  for (const s of signers.filter((x: Signer) => x.status === "papier_uebernommen" && x.paper_path)) {
    const scan = await PDFDocument.load(await laden(db, s.paper_bucket || BUCKET, s.paper_path), { ignoreEncryption: true });
    const seiten = await doc.copyPages(scan, scan.getPageIndices());
    const kopf = `Papier-Unterschrift ${s.name}, eingegangen per ${s.paper_eingang === "email" ? "E-Mail" : "Upload"} am ${datum(s.paper_eingang_at)}`;
    for (const p of seiten) {
      doc.addPage(p);
      kopfzeile(p, helv, kopf);
    }
  }

  if (brauchtPruefblatt(req, signers)) {
    await pruefblattAnhaengen(doc, {
      modus: "anlage",
      titel: req.titel,
      objekt: objektLabel(req.buildings),
      nummer: req.nummer,
      abgeschlossenAm: o.abgeschlossenAm ?? null,
      signers: ps,
      sha256: null,
      zeitstempel: null,
      ohneKopie: istEtv(req),
      felder,
    });
  }
  doc.setTitle(req.titel);
  doc.setProducer("RGI Immobilien – Elektronische Unterschrift");
  return await doc.save({ useObjectStreams: false });
}

// ---------------------------------------------------------------- Kopie

/** Erzeugt die persönliche Kopie (alle bisherigen Unterschriften) und mailt sie – außer bei ETV-Protokollen. */
export async function kopieErstellen(db: Db, requestId: string, signerId: string, userId?: string | null): Promise<string | null> {
  const { req, signers } = await vorgangLaden(db, requestId);
  const s = signers.find((x: Signer) => x.id === signerId);
  const bytes = await dokumentBauen(db, req, signers);
  await speichern(db, pfad.kopie(req.id, signerId), bytes);
  if (istEtv(req) || !s?.email) return null;
  // Letzte Unterschrift: Keine Zwischen-Kopie („Sobald alle … unterschrieben haben …“) –
  // gleich danach geht die Endfassung an alle Beteiligten.
  if (alleFertig(signers)) return s.email;
  const m = kopieMail(kontext(req), { name: s.name, anrede: s.anrede }, s.signed_at);
  try {
    await sendeMail(db, {
      to: s.email,
      toName: s.name,
      subject: m.subject,
      html: m.html,
      text: m.text,
      buildingId: req.building_id,
      attachments: bytes.byteLength <= MAX_ANHANG
        ? [{ filename: dateiname(`${req.titel} – unterschrieben`), content: bytes }]
        : [],
    });
    await db.from("sign_request_signers").update({ copy_sent_at: new Date().toISOString() }).eq("id", signerId);
    await ereignis(db, req.id, "kopie_versendet", `Kopie per E-Mail an ${s.name} versendet`, {
      signerId,
      userId,
      details: { an: s.email },
    });
    return s.email;
  } catch (e) {
    await ereignis(db, req.id, "mail_fehler", `Kopie an ${s.name} konnte nicht gesendet werden`, {
      signerId,
      userId,
      details: { fehler: String(e instanceof Error ? e.message : e).slice(0, 300) },
    });
    return null;
  }
}

// ---------------------------------------------------------------- Abschluss

export const alleFertig = (signers: Signer[]) => signers.length > 0 && signers.every((s: Signer) => ERLEDIGT.includes(s.status));

/** Nach jeder Unterschrift/Übernahme: ggf. nächsten einladen, ggf. abschließen. */
export async function nachUnterschrift(db: Db, requestId: string, userId?: string | null): Promise<{ abgeschlossen: boolean; tokens: Record<string, string> }> {
  const { signers } = await vorgangLaden(db, requestId);
  if (alleFertig(signers)) {
    const ok = await abschliessen(db, requestId, userId);
    return { abgeschlossen: ok, tokens: {} };
  }
  const tokens = await weiterschalten(db, requestId, userId);
  return { abgeschlossen: false, tokens };
}

/**
 * Abschluss: Gesamt-PDF → SHA-256 → RFC-3161-Zeitstempel → final.pdf → (nur ETV: DMS + Protokoll-Tabellen)
 * → Endfassung an externe Unterzeichner (nicht bei ETV) → Meldung an Ersteller → Status abgeschlossen.
 * Gegen doppelten Abschluss gesperrt über completed_at (bedingtes Update).
 */
export async function abschliessen(db: Db, requestId: string, userId?: string | null): Promise<boolean> {
  const jetzt = new Date().toISOString();
  const { data: sperre } = await db.from("sign_requests").update({ completed_at: jetzt })
    .eq("id", requestId).eq("status", "offen").is("completed_at", null).select("id");
  if (!sperre?.length) return false;

  try {
    const { req, signers } = await vorgangLaden(db, requestId);
    if (!alleFertig(signers)) {
      await db.from("sign_requests").update({ completed_at: null }).eq("id", requestId);
      return false;
    }
    const bytes = await dokumentBauen(db, req, signers, { abgeschlossenAm: jetzt });
    const hash = await sha256Bytes(bytes);
    const hashHex = await sha256Hex(bytes);
    const zs = await zeitstempelHolen(hash);
    const finalPfad = pfad.final(req.id);
    await speichern(db, finalPfad, bytes);
    if ("fehler" in zs) {
      await ereignis(db, req.id, "zeitstempel_fehler", "Zeitstempel nicht verfügbar – Abschluss ohne Zeitstempel", {
        userId,
        details: { fehler: zs.fehler.slice(0, 500) },
      });
    }
    const zsOk = "token" in zs ? zs : null;

    // DMS-Ablage nur noch bei ETV-Protokollen automatisch (mit den Protokoll-Tabellen).
    // Ausgehende Vorgänge legt das Büro selbst ab: /unterschriften → „Im DMS ablegen“
    // (sign-request dms_ablegen, Vorschlag über dms-vorschlag). final.pdf bleibt im Vorgang.
    const finalName = dateiname(`${req.titel} (unterschrieben)`);
    let finalFileId: string | null = null;
    const etv = istEtv(req);
    const e = etv ? await etvDaten(db, req) : null;
    if (etv && req.building_id && req.kopie_dms) {
      const uploader = uuidOderNull(req.created_by) ||
        signers.map((s: Signer) => uuidOderNull(s.signed_by)).find(Boolean) || uuidOderNull(userId) ||
        uuidOderNull(e?.meeting?.created_by);
      if (!uploader) {
        await ereignis(db, req.id, "dms_fehler", "DMS-Ablage übersprungen (kein Mitarbeiter als Ablegender bekannt)", { userId });
      } else {
        try {
          finalFileId = await imDmsAblegen(db, req, bytes, finalName, uploader, hashHex, e?.meeting?.id ?? null);
          await ereignis(db, req.id, "dms_abgelegt", "Endfassung im DMS abgelegt", { userId, details: { file_id: finalFileId } });
        } catch (err) {
          await ereignis(db, req.id, "dms_fehler", "DMS-Ablage fehlgeschlagen", {
            userId,
            details: { fehler: String(err instanceof Error ? err.message : err).slice(0, 300) },
          });
        }
      }
    }
    if (etv && e?.meeting?.id) {
      try {
        await etvTabellen(db, req, signers, e.meeting.id, finalPfad, finalFileId, userId);
      } catch (err) {
        await ereignis(db, req.id, "fehler", "ETV-Protokoll-Daten konnten nicht vollständig geschrieben werden", {
          userId,
          details: { fehler: String(err instanceof Error ? err.message : err).slice(0, 300) },
        });
      }
    }

    await db.from("sign_requests").update({
      status: "abgeschlossen",
      final_bucket: BUCKET,
      final_path: finalPfad,
      final_file_id: finalFileId,
      final_sha256: hashHex,
      zeitstempel_token: zsOk?.token ?? null,
      zeitstempel_dienst: zsOk?.dienst ?? null,
      zeitstempel_zeit: zsOk?.zeit.toISOString() ?? null,
      completed_at: jetzt,
    }).eq("id", req.id);
    // Persönliche Links sperren (Status bleibt sichtbar, Token zeigt „unterschrieben“)
    await ereignis(db, req.id, "abgeschlossen", zsOk
      ? "Vorgang abgeschlossen – Fingerabdruck und Zeitstempel gesetzt"
      : "Vorgang abgeschlossen – Fingerabdruck gesetzt", {
      userId,
      details: { sha256: hashHex, zeitstempel: zsOk ? { dienst: zsOk.dienst, zeit: zsOk.zeit.toISOString() } : null },
    });

    // Endfassung an alle externen Unterzeichner (nicht bei ETV-Protokollen)
    if (!etv) {
      const empfaenger = signers.filter((s: Signer) => s.methode !== "intern" && s.email);
      const zuGross = bytes.byteLength > MAX_ANHANG;
      let n = 0;
      for (const s of empfaenger) {
        try {
          const m = endfassungMail(kontext(req), { name: s.name, anrede: s.anrede }, jetzt, zuGross);
          await sendeMail(db, {
            to: s.email,
            toName: s.name,
            subject: m.subject,
            html: m.html,
            text: m.text,
            buildingId: req.building_id,
            attachments: zuGross ? [] : [{ filename: finalName, content: bytes }],
          });
          n++;
        } catch (err) {
          await ereignis(db, req.id, "mail_fehler", `Endfassung an ${s.name} konnte nicht gesendet werden`, {
            signerId: s.id,
            userId,
            details: { fehler: String(err instanceof Error ? err.message : err).slice(0, 300) },
          });
        }
      }
      if (n) {
        await ereignis(db, req.id, "endfassung_versendet", `Endfassung an ${n} Unterzeichner versendet`, {
          userId,
          details: { anzahl: n },
        });
      }
    }

    await melden(
      db,
      req.created_by,
      "subtask_done",
      `Unterschriften vollständig: ${req.titel}`,
      `${req.nummer} · alle ${signers.length} Unterschriften liegen vor${req.buildings?.name ? ` · ${req.buildings.name}` : ""}`,
      req.id,
    );
    return true;
  } catch (err) {
    console.error("[signatur] Abschluss fehlgeschlagen:", err);
    await db.from("sign_requests").update({ completed_at: null }).eq("id", requestId).eq("status", "offen");
    await ereignis(db, requestId, "fehler", "Abschluss fehlgeschlagen – wird automatisch erneut versucht", {
      userId,
      details: { fehler: String(err instanceof Error ? err.message : err).slice(0, 500) },
    });
    return false;
  }
}

async function imDmsAblegen(
  db: Db,
  req: Vorgang,
  bytes: Uint8Array,
  finalName: string,
  uploader: string,
  hashHex: string,
  meetingId: string | null,
): Promise<string> {
  const b = req.buildings;
  await db.rpc("ensure_stammakte_categories", { p_building_id: req.building_id });
  // Seit der manuellen Ablage nur noch für ETV-Protokolle (DMS_SLUG als Rückfall)
  const slug = istEtv(req) ? "versammlung-protokolle" : DMS_SLUG[req.dokumentart] || "schriftverkehr";
  const { data: cat } = await db.from("building_file_categories").select("id")
    .eq("building_id", req.building_id).eq("slug", slug).maybeSingle();
  const dmsPfad = istEtv(req) && meetingId
    ? `versammlung-protokolle/${req.building_id}/${meetingId}/${pfadSegment(finalName)}`
    : `${req.building_id}/unterschriften/${req.nummer}/${pfadSegment(finalName)}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(dmsPfad, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;
  const etv = istEtv(req);
  const { data: bf, error } = await db.from("building_files").insert({
    building_id: req.building_id,
    uploaded_by: uploader,
    category_id: cat?.id ?? null,
    display_name: finalName,
    description: `Elektronisch unterschrieben (Textform § 126b BGB) · ${req.nummer} · SHA-256 ${hashHex}`,
    file_path: dmsPfad,
    file_size: bytes.byteLength,
    mime_type: "application/pdf",
    fiscal_year: new Date().getFullYear(),
    management_mode: b?.management_mode || "weg",
    source: "manual",
    rag_enabled: true,
    // ETV-Protokolle wie bisher für alle sichtbar, alles andere zunächst intern
    visibility_role: etv ? "alle" : "intern",
    visible_to_users: etv,
    tags: ["unterschrieben", "e-signatur", req.dokumentart],
  }).select("id").single();
  if (error) throw error;
  return bf.id;
}

/** ETV: etv_protocol_signatures je Rolle, etv_protocol_renders, protocol_filed_at (wie etv-finalize-signed-protocol). */
async function etvTabellen(
  db: Db,
  req: Vorgang,
  signers: Signer[],
  meetingId: string,
  finalPfad: string,
  finalFileId: string | null,
  userId?: string | null,
) {
  const gesehen = new Set<string>();
  for (const s of signers.filter((x: Signer) => x.status === "unterschrieben" && x.rolle_key)) {
    if (gesehen.has(s.rolle_key)) continue;
    gesehen.add(s.rolle_key);
    const zeile = {
      meeting_id: meetingId,
      role: s.rolle_key,
      signer_name: s.typed_name || s.name,
      signer_contact_id: s.contact_id ?? null,
      signature_png: s.signature_png || LEERES_PNG,
      signed_at: s.signed_at,
      signed_by: uuidOderNull(s.signed_by),
    };
    const { data: alt } = await db.from("etv_protocol_signatures").select("id").eq("meeting_id", meetingId).eq("role", s.rolle_key).limit(1);
    if (alt?.length) await db.from("etv_protocol_signatures").update(zeile).eq("id", alt[0].id);
    else await db.from("etv_protocol_signatures").insert(zeile);
  }
  await db.from("etv_protocol_renders").insert({
    meeting_id: meetingId,
    format: "pdf_signed",
    storage_path: finalPfad,
    is_signed: true,
    dms_file_id: finalFileId,
    created_by: uuidOderNull(userId) || uuidOderNull(req.created_by),
  });
  await db.from("etv_meetings").update({ protocol_filed_at: new Date().toISOString() }).eq("id", meetingId);
}

// ---------------------------------------------------------------- Papier-Eingang

export const MAX_PAPIER = 40 * 1024 * 1024;

/**
 * Papier-Rücksendung (Upload oder E-Mail) zusammenfügen, prüfen, speichern und melden.
 * `streng`: Seitenzahl muss exakt stimmen (Upload). Bei E-Mail wird eine Abweichung nur vermerkt –
 * der Mitarbeiter prüft ohnehin Seite für Seite.
 */
export async function papierSpeichern(
  db: Db,
  req: Vorgang,
  signer: Signer,
  dateien: PapierDatei[],
  o: { eingang: "upload" | "email"; emailId?: string | null; streng: boolean; userId?: string | null },
): Promise<{ seiten: number; warnung: string | null }> {
  const summe = dateien.reduce((a, d) => a + d.bytes.byteLength, 0);
  if (!dateien.length) throw new Fehler(400, "Keine Dateien übermittelt.");
  if (summe > MAX_PAPIER) throw new Fehler(413, "Die Dateien sind zusammen größer als 40 MB. Bitte kleinere Fotos oder ein PDF senden.");
  const p = await papierZusammenfuegen(dateien);
  const soll = req.seitenzahl ?? p.seiten;
  let warnung: string | null = null;
  if (p.seiten !== soll) {
    const diff = Math.abs(soll - p.seiten);
    const seitenTxt = (n: number) => `${n} ${n === 1 ? "Seite" : "Seiten"}`;
    const msg = (p.seiten < soll
      ? (diff === 1 ? "Es fehlt noch 1 Seite." : `Es fehlen noch ${diff} Seiten.`)
      : (diff === 1 ? "Es ist 1 Seite zu viel." : `Es sind ${diff} Seiten zu viel.`)) +
      ` Das Dokument hat ${seitenTxt(soll)}, übermittelt wurden ${p.seiten}.`;
    if (o.streng) throw new Fehler(400, msg);
    warnung = msg;
  }
  const ziel = pfad.papier(req.id, signer.id);
  await speichern(db, ziel, p.bytes);
  const jetzt = new Date().toISOString();
  const { error } = await db.from("sign_request_signers").update({
    methode: "papier",
    status: "papier_eingegangen",
    paper_bucket: BUCKET,
    paper_path: ziel,
    paper_page_count: p.seiten,
    paper_eingang: o.eingang,
    paper_email_id: o.emailId ?? null,
    paper_eingang_at: jetzt,
    paper_pruefung: null,
  }).eq("id", signer.id);
  if (error) throw new Fehler(500, `Papier-Unterschrift konnte nicht gespeichert werden: ${error.message}`);
  const weg = o.eingang === "email" ? "E-Mail" : "Upload";
  await ereignis(db, req.id, "scan_eingegangen", `Papier-Unterschrift von ${signer.name} eingegangen (per ${weg}, ${p.seiten} ${p.seiten === 1 ? "Seite" : "Seiten"})`, {
    signerId: signer.id,
    userId: o.userId,
    details: {
      eingang: o.eingang,
      seiten: p.seiten,
      soll,
      fotos: p.fotos,
      dateien: dateien.length,
      ...(o.emailId ? { email_id: o.emailId } : {}),
      ...(warnung ? { warnung } : {}),
    },
  });
  await melden(db, req.created_by, "review_due", `Papier-Unterschrift prüfen: ${req.titel}`, `${signer.name} · ${p.seiten} von ${soll} Seiten per ${weg} · ${req.nummer}`, req.id);
  return { seiten: p.seiten, warnung };
}
