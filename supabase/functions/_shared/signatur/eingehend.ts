// Elektronische Unterschrift – Fall B „Eingehende Dokumente selbst unterschreiben“.
//
// create_incoming:  Mail-Anhang (PDF) einem Mitarbeiter „zur Unterschrift“ zuweisen.
//                   Legt einen Vorgang typ „eingehend“ mit genau einem internen Unterzeichner an.
//                   Es werden KEINE Mails verschickt, nur eine Meldung an die zugewiesene Person.
// complete_incoming: Das im Browser gestempelte PDF (hinterlegte Unterschrift + Ort/Datum,
//                   src/lib/pdfSign.ts) übernehmen: final.pdf + SHA-256 (+ Zeitstempel),
//                   optional DMS-Ablage, optional Antwort-Mail an den Absender über das
//                   Postfach, auf dem die Original-Mail einging (mit In-Reply-To + Signatur).
import nodemailer from "npm:nodemailer@6.9.16";
import { applyRichSignature } from "../email-signature.ts";
import { textToHtmlWithLinks } from "../text-to-html.ts";
import {
  BUCKET,
  DMS_SLUG,
  Db,
  EMAIL_RE,
  Fehler,
  ZUSTIMMUNG_INTERN,
  addTage,
  base64ZuBytes,
  datum,
  ereignis,
  heuteIso,
  laden,
  melden,
  mehrzeilig,
  pfad,
  pfadSegment,
  sha256Bytes,
  sha256Hex,
  speichern,
  uuidOderNull,
  zeile,
} from "./basis.ts";
import { vorgangLaden } from "./ablauf.ts";
import { seitenZaehlen } from "./pdf.ts";
import { zeitstempelHolen } from "./zeitstempel.ts";

// deno-lint-ignore no-explicit-any
type Body = any;

const MAX_PDF = 25 * 1024 * 1024;

/** PDF-Kennung „%PDF“ in den ersten 1024 Bytes (manche Programme setzen Leerzeichen/BOM davor). */
function siehtWiePdfAus(b: Uint8Array): boolean {
  const n = Math.min(b.length - 4, 1024);
  for (let i = 0; i < n; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true;
  }
  return false;
}

/** Dokumentart aus dem Dateinamen raten (wie src/lib/signatur.ts dokumentartAusName). */
export function dokumentartAusName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("verwaltervertrag")) return "verwaltervertrag";
  if (n.includes("vollmacht")) return "vollmacht";
  if (n.includes("umlauf")) return "umlaufbeschluss";
  if (n.includes("abnahme")) return "abnahme";
  if (n.includes("angebot") || n.includes("auftrag")) return "angebot";
  if (n.includes("protokoll") || n.includes("niederschrift")) return "protokoll";
  if (n.includes("vertrag")) return "dienstleistervertrag";
  return "sonstiges";
}

const titelAusDateiname = (name: string) => name.replace(/\.pdf$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim() || "Dokument";

/** „Auftragsbestätigung Dachrinne.pdf“ → „Auftragsbestaetigung_Dachrinne_unterschrieben.pdf“ wie im Mockup. */
export function unterschriebenName(name: string): string {
  const basis = String(name || "Dokument").replace(/\.pdf$/i, "").replace(/_unterschrieben$/i, "");
  const sauber = basis.normalize("NFKD").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 90);
  return `${sauber || "Dokument"}_unterschrieben.pdf`;
}

async function mitarbeiterName(db: Db, userId: string): Promise<string> {
  const { data: p } = await db.from("profiles").select("first_name, last_name, email, role").eq("user_id", userId).maybeSingle();
  if (!p || !["admin", "employee"].includes(String(p.role))) throw new Fehler(400, "Die ausgewählte Person ist kein Büro-Mitarbeiter.");
  return [p.first_name, p.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || p.email || "Mitarbeiter";
}

// ================================================================ create_incoming

export async function eingehendAnlegen(db: Db, b: Body, userId: string | null) {
  if (!userId) throw new Fehler(400, "Kein angemeldeter Mitarbeiter.");
  const emailId = uuidOderNull(b.email_id);
  const attId = uuidOderNull(b.attachment_id);
  if (!emailId || !attId) throw new Fehler(400, "E-Mail oder Anhang fehlt.");
  const zugewiesen = uuidOderNull(b.zugewiesen_an) ?? userId;
  const name = await mitarbeiterName(db, zugewiesen);

  const { data: mail } = await db.from("emails")
    .select("id, account_id, subject, from_address, from_name, building_id, message_id, message_id_header")
    .eq("id", emailId).maybeSingle();
  if (!mail) throw new Fehler(404, "E-Mail nicht gefunden.");
  const { data: att } = await db.from("email_attachments").select("id, email_id, file_name, file_path, mime_type")
    .eq("id", attId).maybeSingle();
  if (!att || att.email_id !== emailId) throw new Fehler(404, "Anhang nicht gefunden.");
  if (!att.file_path) throw new Fehler(400, "Der Anhang ist nicht gespeichert.");
  const istPdfName = /pdf/i.test(String(att.mime_type || "")) || /\.pdf$/i.test(String(att.file_name || ""));
  if (!istPdfName) throw new Fehler(400, "Nur PDF-Anhänge können unterschrieben werden.");

  // Doppelt anlegen verhindern
  const { data: schon } = await db.from("sign_requests").select("nummer").eq("typ", "eingehend").eq("status", "offen")
    .eq("quelle_typ", "email_attachment").eq("quelle_id", attId).limit(1);
  if (schon?.length) throw new Fehler(409, `Dieser Anhang liegt bereits zur Unterschrift vor (${schon[0].nummer}).`);

  const quelle = await laden(db, "email-attachments", att.file_path);
  if (!siehtWiePdfAus(quelle)) throw new Fehler(400, "Der Anhang ist kein PDF.");
  if (quelle.byteLength > MAX_PDF) throw new Fehler(413, "Das PDF ist größer als 25 MB.");
  const seiten = await seitenZaehlen(quelle);

  let frist: string = b.frist ? String(b.frist) : addTage(heuteIso(), 3);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(frist) || isNaN(Date.parse(frist))) throw new Fehler(400, "Ungültige Frist (JJJJ-MM-TT).");
  if (frist < heuteIso()) throw new Fehler(400, "Die Frist liegt in der Vergangenheit.");
  const buildingId = b.building_id === null ? null : uuidOderNull(b.building_id) ?? uuidOderNull(mail.building_id);
  if (b.building_id && !uuidOderNull(b.building_id)) throw new Fehler(400, "Ungültiges Objekt.");
  const titel = zeile(b.titel, 200) || titelAusDateiname(att.file_name || "Dokument");
  const dokumentart = typeof b.dokumentart === "string" && DMS_SLUG[b.dokumentart] ? b.dokumentart : dokumentartAusName(att.file_name || "");
  const absender = zeile(mail.from_name || mail.from_address, 120);
  const antwortAn = zeile(mail.from_address, 200).toLowerCase() || null;

  const { data: neu, error } = await db.from("sign_requests").insert({
    typ: "eingehend",
    dokumentart,
    titel,
    building_id: buildingId,
    quelle_typ: "email_attachment",
    quelle_id: attId,
    quelle_label: absender || null,
    source_bucket: "email-attachments",
    source_path: att.file_path,
    seitenzahl: seiten,
    status: "offen",
    frist,
    reihenfolge: "gleichzeitig",
    mail_betreff: zeile(mail.subject, 230) || null,
    mail_text: null,
    erinnerung: false,
    kopie_dms: true,
    email_id: emailId,
    zugewiesen_an: zugewiesen,
    antwort_an: antwortAn && EMAIL_RE.test(antwortAn) ? antwortAn : null,
    created_by: userId,
  }).select("id, nummer").single();
  if (error) throw new Fehler(500, `Vorgang konnte nicht angelegt werden: ${error.message}`);
  const id = neu.id as string;

  try {
    await speichern(db, pfad.quelle(id), quelle);
    const { error: sErr } = await db.from("sign_request_signers").insert({
      request_id: id,
      position: 1,
      name,
      email: null,
      methode: "intern",
      user_id: zugewiesen,
      rolle: "RGI Immobilien",
      rolle_key: "verwaltung",
      status: "offen",
      ort_datum: true,
      eingeladen_at: new Date().toISOString(),
    });
    if (sErr) throw new Fehler(500, `Unterzeichner konnte nicht gespeichert werden: ${sErr.message}`);
  } catch (e) {
    await db.from("sign_requests").delete().eq("id", id);
    await db.storage.from(BUCKET).remove([pfad.quelle(id)]);
    throw e;
  }

  await ereignis(db, id, "angelegt", `Vorgang angelegt aus E-Mail von ${absender || "unbekannt"} – zur Unterschrift an ${name}`, {
    userId,
    details: { email_id: emailId, attachment_id: attId, zugewiesen_an: zugewiesen, von: mail.from_address },
  });
  await melden(
    db,
    zugewiesen,
    "review_due",
    `Bitte unterschreiben: ${titel}`,
    `${neu.nummer}${absender ? ` · von ${absender}` : ""} · bis ${datum(frist)}`,
    id,
  );
  return { id, nummer: neu.nummer };
}

// ================================================================ complete_incoming

// deno-lint-ignore no-explicit-any
async function antwortSenden(db: Db, o: { accountId: string | null; mail: any; an: string; betreff: string; text: string; anhang: { name: string; bytes: Uint8Array }; buildingId: string | null }) {
  let { data: acc } = o.accountId
    ? await db.from("email_accounts").select("*").eq("id", o.accountId).maybeSingle()
    : { data: null };
  if (!acc?.smtp_host) {
    // Ausweichen auf das Büro-Postfach (sollte nicht vorkommen)
    const r = await db.from("email_accounts").select("*").eq("email_address", "info@rgi-immobilien.de").maybeSingle();
    acc = r.data;
  }
  if (!acc?.smtp_host) throw new Fehler(500, "Kein E-Mail-Konto zum Versand eingerichtet.");

  // Text + Signatur des Kontos wie im Verfassen-Fenster: Text, Leerzeile, Signatur;
  // gibt es eine HTML-Signatur, ersetzt sie dort die Textsignatur.
  const sigText = String(acc.signature_text || acc.signature_html || "").trim();
  const sigHtml = String(acc.signature_rich_html || "").trim();
  const eigen = o.text.replace(/\s+$/, "");
  const textMitSig = sigText && !eigen.includes(sigText) ? `${eigen}\n\n${sigText}` : eigen;
  let html = sigHtml
    ? applyRichSignature(textToHtmlWithLinks(textMitSig), [sigText, acc.signature_html], sigHtml)
    : textToHtmlWithLinks(textMitSig);
  html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4">${html}</div>`;

  const ref = String(o.mail.message_id || "").trim();
  const inReplyTo = /^<[^<>\s]+>$/.test(ref) ? ref : (String(o.mail.message_id_header || "").trim() || null);

  const transporter = nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port,
    secure: acc.smtp_port === 465,
    auth: { user: acc.smtp_user, pass: acc.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
  });
  const info = await transporter.sendMail({
    from: `"${String(acc.display_name || acc.email_address).replace(/["<>]/g, "")}" <${acc.email_address}>`,
    to: o.an,
    subject: o.betreff,
    text: textMitSig,
    html,
    ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
    attachments: [{ filename: o.anhang.name, content: o.anhang.bytes, contentType: "application/pdf" }],
  });

  // Ablage im App-Postfach „Gesendet“ (wie send-email)
  let emailId: string | null = null;
  try {
    const { data: ordner } = await db.from("email_folders").select("id").eq("name", "Gesendet").maybeSingle();
    const { data: row, error } = await db.from("emails").insert({
      account_id: acc.id,
      folder_id: ordner?.id ?? null,
      subject: o.betreff,
      from_address: acc.email_address,
      from_name: acc.display_name,
      to_addresses: [o.an],
      body_text: textMitSig,
      body_html: html,
      date: new Date().toISOString(),
      is_read: true,
      has_attachments: true,
      message_id: `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message_id_header: info?.messageId ?? null,
      in_reply_to: inReplyTo,
      thread_id: o.mail.thread_id ?? null,
      building_id: o.buildingId,
    }).select("id").single();
    if (error) throw error;
    emailId = row.id;
    const p = `${emailId}/0_${pfadSegment(o.anhang.name)}`;
    const { error: upErr } = await db.storage.from("email-attachments").upload(p, o.anhang.bytes, { contentType: "application/pdf", upsert: true });
    if (!upErr) {
      await db.from("email_attachments").insert({
        email_id: emailId,
        file_name: o.anhang.name,
        file_path: p,
        file_size: o.anhang.bytes.byteLength,
        mime_type: "application/pdf",
        is_inline: false,
      });
    }
  } catch (e) {
    console.error("[signatur] Antwort nicht im Postfach gespeichert:", e);
  }
  return { emailId, von: acc.email_address as string };
}

export async function eingehendAbschliessen(db: Db, b: Body, userId: string | null) {
  if (!userId) throw new Fehler(400, "Kein angemeldeter Mitarbeiter.");
  const { req: v, signers } = await vorgangLaden(db, String(b.request_id || ""));
  if (v.typ !== "eingehend") throw new Fehler(400, "Dieser Vorgang ist kein eingehendes Dokument.");
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  const s = signers.find((x: { methode: string; status: string }) => x.methode === "intern" && ["offen", "geoeffnet"].includes(x.status));
  if (!s) throw new Fehler(409, "Bereits unterschrieben.");
  if (s.user_id && s.user_id !== userId) throw new Fehler(403, `Dieses Dokument ist ${s.name} zur Unterschrift zugewiesen.`);

  // ---- PDF aus dem Browser prüfen
  if (typeof b.pdf_base64 !== "string" || b.pdf_base64.length < 100) throw new Fehler(400, "Das unterschriebene PDF fehlt.");
  let bytes: Uint8Array;
  try {
    bytes = base64ZuBytes(b.pdf_base64);
  } catch {
    throw new Fehler(400, "Das unterschriebene PDF ist beschädigt.");
  }
  if (bytes.byteLength > MAX_PDF) throw new Fehler(413, "Das PDF ist größer als 25 MB.");
  if (!siehtWiePdfAus(bytes)) throw new Fehler(400, "Das unterschriebene PDF ist kein PDF.");
  const seiten = await seitenZaehlen(bytes);
  if (v.seitenzahl && seiten !== v.seitenzahl) {
    throw new Fehler(400, `Das unterschriebene PDF hat ${seiten} statt ${v.seitenzahl} Seiten.`);
  }
  const placements = Array.isArray(b.placements)
    ? b.placements.slice(0, 20).map((p: Body) => ({
      page: Number(p?.page) || 0,
      x: Math.round(Number(p?.x) || 0),
      y: Math.round(Number(p?.y) || 0),
      w: Math.round(Number(p?.w) || 0),
      h: Math.round(Number(p?.h) || 0),
      ...(typeof p?.kind === "string" ? { kind: zeile(p.kind, 10) } : {}),
      ...(typeof p?.text === "string" ? { text: zeile(p.text, 120) } : {}),
    }))
    : [];
  if (!placements.length) throw new Fehler(400, "Bitte die Unterschrift im Dokument platzieren.");
  const ortDatum = zeile(b.ort_datum, 120) || null;

  // ---- Antwort prüfen
  const a = b.antwort || {};
  const senden = a.senden === true;
  const an = zeile(a.an, 200).toLowerCase();
  const betreff = zeile(a.betreff, 230);
  const text = mehrzeilig(a.text, 10000);
  if (senden) {
    if (!an || !EMAIL_RE.test(an)) throw new Fehler(400, "Bitte eine gültige Empfänger-Adresse angeben.");
    if (!betreff) throw new Fehler(400, "Bitte einen Betreff angeben.");
    if (!text) throw new Fehler(400, "Bitte einen Text für die Antwort eingeben.");
  }
  const dms = b.dms === true;
  if (dms && !v.building_id) throw new Fehler(400, "Für die Ablage im DMS ist kein Objekt hinterlegt.");

  const { data: us } = await db.from("user_signatures").select("signature_png").eq("user_id", userId).maybeSingle();
  if (!us?.signature_png) throw new Fehler(400, "Für Sie ist keine Unterschrift hinterlegt. Bitte zuerst in den Einstellungen hinterlegen.");

  // Original-Mail (Konto, Message-ID, Anhangsname)
  // deno-lint-ignore no-explicit-any
  let mail: any = null;
  if (v.email_id) {
    const { data } = await db.from("emails").select("id, account_id, subject, from_address, message_id, message_id_header, thread_id")
      .eq("id", v.email_id).maybeSingle();
    mail = data;
  }
  let quellName = `${v.titel}.pdf`;
  if (v.quelle_id) {
    const { data: att } = await db.from("email_attachments").select("file_name").eq("id", v.quelle_id).maybeSingle();
    if (att?.file_name) quellName = att.file_name;
  }
  const ergebnisName = unterschriebenName(quellName);

  // ---- Sperre gegen doppeltes Abschließen
  const jetzt = new Date().toISOString();
  const { data: sperre } = await db.from("sign_requests").update({ completed_at: jetzt })
    .eq("id", v.id).eq("status", "offen").is("completed_at", null).select("id");
  if (!sperre?.length) throw new Fehler(409, "Der Vorgang wird gerade abgeschlossen.");

  try {
    const hash = await sha256Bytes(bytes);
    const hashHex = await sha256Hex(bytes);
    await speichern(db, pfad.final(v.id), bytes);

    // ---- Antwort-Mail zuerst: schlägt sie fehl, bleibt der Vorgang offen
    let antwort: { emailId: string | null; von: string } | null = null;
    if (senden) {
      try {
        antwort = await antwortSenden(db, {
          accountId: mail?.account_id ?? null,
          mail: mail ?? {},
          an,
          betreff,
          text,
          anhang: { name: ergebnisName, bytes },
          buildingId: v.building_id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ereignis(db, v.id, "mail_fehler", `Antwort an ${an} konnte nicht gesendet werden`, {
          userId,
          details: { an, fehler: msg.slice(0, 300) },
        });
        throw new Fehler(502, `Die Antwort an ${an} konnte nicht gesendet werden: ${msg}`);
      }
    }

    const zs = await zeitstempelHolen(hash);
    const zsOk = "token" in zs ? zs : null;

    // ---- Unterzeichner
    await db.from("sign_request_signers").update({
      status: "unterschrieben",
      typed_name: s.name,
      signature_png: us.signature_png,
      consent_text: ZUSTIMMUNG_INTERN,
      signed_by: userId,
      signed_at: jetzt,
      ort: ortDatum ? zeile(ortDatum.split(",")[0], 80) : null,
      ort_datum: !!ortDatum,
      placements,
      ip: null,
      user_agent: "VerwaltungsApp",
    }).eq("id", s.id);
    await ereignis(db, v.id, "unterschrieben", `${s.name} hat in der App unterschrieben`, {
      signerId: s.id,
      userId,
      details: { methode: "intern", ort_datum: ortDatum },
    });
    // ---- DMS
    let fileId: string | null = null;
    let dmsPfad: string | null = null;
    if (dms) {
      try {
        await db.rpc("ensure_stammakte_categories", { p_building_id: v.building_id });
        let catId: string | null = null;
        const gewaehlt = uuidOderNull(b.dms_kategorie_id);
        if (gewaehlt) {
          const { data: c } = await db.from("building_file_categories").select("id").eq("id", gewaehlt).eq("building_id", v.building_id).maybeSingle();
          catId = c?.id ?? null;
        }
        if (!catId) {
          const slug = DMS_SLUG[v.dokumentart] || "schriftverkehr";
          const { data: c } = await db.from("building_file_categories").select("id").eq("building_id", v.building_id).eq("slug", slug).maybeSingle();
          catId = c?.id ?? null;
        }
        dmsPfad = `${v.building_id}/unterschriften/${v.nummer}/${pfadSegment(ergebnisName)}`;
        const { error: upErr } = await db.storage.from(BUCKET).upload(dmsPfad, bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        const { data: bld } = await db.from("buildings").select("management_mode").eq("id", v.building_id).maybeSingle();
        const { data: bf, error } = await db.from("building_files").insert({
          building_id: v.building_id,
          uploaded_by: userId,
          category_id: catId,
          display_name: ergebnisName,
          description: `Unterschrieben in der App von ${s.name} am ${datum(jetzt)} (Textform § 126b BGB) · ${v.nummer} · SHA-256 ${hashHex}`,
          file_path: dmsPfad,
          file_size: bytes.byteLength,
          mime_type: "application/pdf",
          fiscal_year: new Date().getFullYear(),
          management_mode: bld?.management_mode || "weg",
          source: "manual",
          rag_enabled: true,
          visibility_role: "intern",
          visible_to_users: false,
          tags: ["unterschrieben", "e-signatur", v.dokumentart],
        }).select("id").single();
        if (error) throw error;
        fileId = bf.id;
        await ereignis(db, v.id, "dms_abgelegt", "Unterschriebene Fassung im DMS abgelegt", { userId, details: { file_id: fileId } });
      } catch (e) {
        await ereignis(db, v.id, "dms_fehler", "DMS-Ablage fehlgeschlagen", {
          userId,
          details: { fehler: String(e instanceof Error ? e.message : (e as { message?: string })?.message ?? e).slice(0, 300) },
        });
      }
    }

    if (antwort) {
      await ereignis(db, v.id, "antwort_versendet", `Unterschrieben an ${an} zurückgesendet`, {
        userId,
        details: { an, von: antwort.von, mail_id: antwort.emailId },
      });
    }
    await db.from("sign_requests").update({
      status: "abgeschlossen",
      final_bucket: BUCKET,
      final_path: pfad.final(v.id),
      final_file_id: fileId,
      final_sha256: hashHex,
      zeitstempel_token: zsOk?.token ?? null,
      zeitstempel_dienst: zsOk?.dienst ?? null,
      zeitstempel_zeit: zsOk?.zeit.toISOString() ?? null,
      completed_at: jetzt,
    }).eq("id", v.id);
    await ereignis(db, v.id, "abgeschlossen", antwort
      ? "Vorgang abgeschlossen – unterschrieben und zurückgesendet"
      : "Vorgang abgeschlossen – unterschrieben und gespeichert", {
      userId,
      details: { sha256: hashHex, zeitstempel: zsOk ? { dienst: zsOk.dienst, zeit: zsOk.zeit.toISOString() } : null },
    });

    // ---- Nachweis „Selbst unterschreiben“ (wie bisher)
    const { data: prof } = await db.from("profiles").select("first_name, last_name, email").eq("user_id", userId).maybeSingle();
    const signerName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || prof?.email || s.name;
    const { error: logErr } = await db.from("document_signature_log").insert({
      signed_by: userId,
      signer_name: signerName,
      context: "email_attachment",
      source_bucket: v.source_bucket,
      source_path: v.source_path,
      source_name: quellName,
      result_bucket: BUCKET,
      result_path: dmsPfad ?? pfad.final(v.id),
      result_name: ergebnisName,
      result_file_id: fileId,
      email_id: v.email_id,
      building_id: v.building_id,
      placements,
    });
    if (logErr) console.error("[signatur] Nachweis nicht gespeichert:", logErr.message);

    if (v.created_by && v.created_by !== userId) {
      await melden(db, v.created_by, "subtask_done", `Unterschrieben: ${v.titel}`, `${v.nummer} · von ${s.name}${antwort ? ` · an ${an} zurückgesendet` : ""}`, v.id);
    }
    return { ok: true, nummer: v.nummer, datei: ergebnisName, file_id: fileId, gesendet: !!antwort, mail_id: antwort?.emailId ?? null };
  } catch (e) {
    await db.from("sign_requests").update({ completed_at: null }).eq("id", v.id).eq("status", "offen");
    throw e;
  }
}
