// Elektronische Unterschrift – Vorgang anlegen, erinnern, neuer Link.
// Gemeinsam für sign-request (App/Zeitplan) und den Claude-Konnektor (rgi-connector),
// damit Prüfungen, Mails, Links und Protokoll überall gleich sind. Vertrag: /home/claude/esig/API.md
import {
  BUCKET,
  DOKUMENTARTEN,
  EMAIL_RE,
  Fehler,
  QUELLE_TEXT,
  QUELLE_TYPEN,
  ROLLE_KEYS,
  TYPEN,
  VERSAND,
  addTage,
  ereignis,
  heuteIso,
  laden,
  melden,
  mehrzeilig,
  pfad,
  signLink,
  speichern,
  uuidOderNull,
  zeile,
} from "./basis.ts";
import type { Db } from "./basis.ts";
import {
  Signer,
  einladen,
  etvQuelleVorbereiten,
  linkErstellen,
  nurLink,
  signerLaden,
  vorgangLaden,
  vorlageLaden,
} from "./ablauf.ts";
import { istPdf, seitenZaehlen } from "./pdf.ts";

// deno-lint-ignore no-explicit-any
type Body = any;

/** Erlaubte Speicherorte der Quelldatei (DMS-Dateien liegen je nach Herkunft auch in „invoices“). */
export const ERLAUBTE_BUCKETS = ["building-files", "email-attachments", "invoices"];

// ================================================================ create

/** Ist der handelnde Mitarbeiter Administrator (rgi_is_admin)? */
export async function istAdmin(db: Db, userId: string | null): Promise<boolean> {
  if (!uuidOderNull(userId)) return false;
  const { data } = await db.rpc("rgi_is_admin", { _user_id: userId });
  return data === true;
}

/** Stammt die Quelle aus dem Firmen-DMS von RGI (is_company bzw. Speicherpfad „rgi/…“)? */
export async function istFirmenQuelle(db: Db, quelleTyp: string | null, quelleId: unknown, sourcePath: string): Promise<boolean> {
  if (sourcePath.startsWith("rgi/")) return true;
  const id = uuidOderNull(quelleId);
  if (quelleTyp === "building_file" && id) {
    const { data } = await db.from("building_files").select("is_company").eq("id", id).maybeSingle();
    if (data?.is_company === true) return true;
  }
  // Angebote/Verwalterverträge haben eigene Freigaben (RGI intern) – nicht über den Pfad prüfen
  if (quelleTyp === "offer" || quelleTyp === "contract") return false;
  // Auch ohne quelle_id: liegt unter diesem Pfad eine Firmendatei (z. B. Rechnungen im Bucket „invoices“)?
  const { data: gleich } = await db.from("building_files").select("id").eq("file_path", sourcePath).eq("is_company", true).limit(1);
  return !!gleich?.length;
}

// deno-lint-ignore no-explicit-any
export function platzierungenPruefen(roh: any, seiten: number, name: string) {
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

export async function anlegen(db: Db, b: Body, userId: string | null, test: boolean) {
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
  // Firmen-DMS von RGI (building_files.is_company, Pfad „rgi/…“): nur für Administratoren
  if (await istFirmenQuelle(db, quelleTyp, b.quelle_id, sourcePath)) {
    if (!(await istAdmin(db, userId))) throw new Fehler(403, "Dokumente aus dem Firmen-DMS dürfen nur Administratoren verwenden.");
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

// ================================================================ remind

export async function erinnern(db: Db, b: Body, userId: string | null, test: boolean) {
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
export async function selbstErinnern(db: Db, v: Body, s: Signer, userId: string | null, automatisch = false) {
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

// ================================================================ neuer_link

/** Neuen persönlichen Link erzeugen (alter wird ungültig, wieder 14 Tage gültig) – ohne E-Mail. */
export async function neuerLink(db: Db, b: Body, userId: string | null) {
  const { req: v, signer: s } = await signerLaden(db, b.signer_id);
  if (v.status !== "offen") throw new Fehler(409, "Der Vorgang ist nicht mehr offen.");
  if (v.typ === "eingehend" || s.methode === "intern") throw new Fehler(400, "Für diesen Unterzeichner gibt es keinen Link.");
  if (s.status === "wartet") throw new Fehler(409, `${s.name} ist erst an der Reihe, wenn die vorherigen Unterzeichner unterschrieben haben.`);
  if (!["offen", "geoeffnet"].includes(s.status)) throw new Fehler(409, `Für ${s.name} kann derzeit kein neuer Link erstellt werden.`);
  const erster = !s.token_hash;
  const t = await linkErstellen(db, v, s, erster ? "link_erstellt" : "neuer_link", { userId });
  return { url: signLink(t), name: s.name, ersetzt: !erster };
}
