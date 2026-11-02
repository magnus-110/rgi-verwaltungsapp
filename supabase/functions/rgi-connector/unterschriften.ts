// Elektronische Unterschrift für den Konnektor: Dokument analysieren (Unterschriftsstellen erkennen),
// Vorgang zur Unterschrift vorbereiten (gleiche Logik wie sign-request „create“ über
// _shared/signatur/vorgang.ts), persönliche Links erstellen, Status abfragen, erinnern.
// Positionen: PDF-Punkte, Ursprung oben links der angezeigten Seite; Seiten hier 1-basiert
// (gespeichert wird in sign_request_signers.placements 0-basiert wie in der App).
import { APP_URL, DOKUMENTARTEN, EMAIL_RE, datum, laden, objektLabel, uuidOderNull, zeile } from "../_shared/signatur/basis.ts";
import { nurLink, vorgangLaden, vorlageLaden } from "../_shared/signatur/ablauf.ts";
import { ERLAUBTE_BUCKETS, anlegen, erinnern, neuerLink } from "../_shared/signatur/vorgang.ts";
import { einladungMail } from "../_shared/signatur/mail.ts";
import { istPdf } from "../_shared/signatur/pdf.ts";
import { FELD_BREITE, FELD_HOEHE, seitenGroessen, unterschriftsstellenErkennen } from "../_shared/signatur/felderkennung.ts";

type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });

const QUELLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["typ", "id"],
  description: "Das zu unterschreibende PDF",
  properties: {
    typ: { type: "string", enum: ["dms", "mail_anhang", "angebot", "vertrag"], description: "dms = building_files.id (dms_suchen), mail_anhang = email_attachments.id (mail_lesen/mail_anhaenge), angebot = offers.id (angebote_suchen, PDF muss erzeugt sein), vertrag = management_contracts.id (Verwaltervertrag mit PDF im DMS)" },
    id: uuid("ID passend zum typ"),
  },
};
const FELD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["seite", "x", "y"],
  properties: {
    seite: { type: "integer", minimum: 1, description: "1 = erste Seite" },
    x: { type: "number", description: "linke Kante in pt ab linkem Seitenrand" },
    y: { type: "number", description: "obere Kante in pt ab oberem Seitenrand" },
    w: { type: "number", description: `Breite in pt (Standard ${FELD_BREITE})` },
    h: { type: "number", description: `Höhe in pt (Standard ${FELD_HOEHE})` },
  },
};
const DOKUMENTART_SCHEMA = { type: "string", enum: DOKUMENTARTEN, description: "Bestimmt Mailvorlage, Standardfrist und DMS-Ordner der Endfassung" };

const SIGNER_STATUS: Record<string, string> = {
  wartet: "wartet (noch nicht an der Reihe)",
  offen: "offen",
  geoeffnet: "geöffnet, noch nicht unterschrieben",
  unterschrieben: "unterschrieben",
  papier_eingegangen: "Papier eingegangen – Prüfung im Büro nötig",
  papier_uebernommen: "unterschrieben (Papier übernommen)",
  abgelehnt: "Papier abgelehnt – neu angefordert",
  zurueckgezogen: "zurückgezogen",
};
const ART_TEXT = (s: any) => s.methode === "intern" ? "intern (in der App)" : s.methode === "papier" ? "Papier" : s.versand === "link" ? "Link (selbst verschickt)" : "E-Mail";
const vorgangUrl = (id: string) => `${APP_URL}/unterschriften?vorgang=${id}`;
const dokumentartAusName = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("verwaltervertrag")) return "verwaltervertrag";
  if (n.includes("vollmacht")) return "vollmacht";
  if (n.includes("umlauf")) return "umlaufbeschluss";
  if (n.includes("abnahme")) return "abnahme";
  if (n.includes("angebot")) return "angebot";
  if (n.includes("protokoll") || n.includes("niederschrift")) return "protokoll";
  if (n.includes("vertrag")) return "dienstleistervertrag";
  return "sonstiges";
};
const titelAusDateiname = (name: string) => name.replace(/\.pdf$/i, "").replace(/_/g, " ").trim() || name;
const istPdfName = (mime?: string | null, name?: string | null) => (mime || "").includes("pdf") || /\.pdf$/i.test(name || "");

type Quelle = {
  bucket: string; path: string; titel: string; building_id: string | null; objekt: string; quelle_typ: string; quelle_id: string;
  quelle_label: string; email_id: string | null; dokumentart: string; dateiname: string;
  vorschlag_unterzeichner?: { name: string; email: string | null; contact_id: string | null; rolle: string }[];
};

export function unterschriftTools({ db, log, uploaderId }: Deps) {
  async function dmsDatei(id: string) {
    const { data: f } = await db.from("building_files")
      .select("id, display_name, file_path, storage_bucket, source, mime_type, building_id, deleted_at, buildings(id, name, postal_code, city)")
      .eq("id", id).maybeSingle();
    if (!f || f.deleted_at) throw new Error("DMS-Dokument nicht gefunden (oder im Papierkorb)");
    if (!istPdfName(f.mime_type, f.display_name || f.file_path)) throw new Error(`„${f.display_name}“ ist kein PDF – unterschrieben werden können nur PDFs`);
    return { ...f, bucket: f.storage_bucket || (f.source === "invoice" ? "invoices" : "building-files") };
  }

  async function quelleLaden(q: { typ: string; id: string }): Promise<Quelle> {
    const id = uuidOderNull(q?.id);
    if (!id) throw new Error("quelle.id fehlt oder ist keine gültige ID");
    switch (q.typ) {
      case "dms": {
        const f = await dmsDatei(id);
        const name = f.display_name || f.file_path.split("/").pop() || "Dokument";
        return {
          bucket: f.bucket, path: f.file_path, titel: titelAusDateiname(name), building_id: f.building_id, objekt: objektLabel(f.buildings),
          quelle_typ: "building_file", quelle_id: f.id, quelle_label: f.buildings?.name ? `${f.buildings.name} · DMS` : "DMS",
          email_id: null, dokumentart: dokumentartAusName(name), dateiname: name,
        };
      }
      case "mail_anhang": {
        const { data: a } = await db.from("email_attachments").select("id, email_id, file_name, file_path, mime_type").eq("id", id).maybeSingle();
        if (!a?.file_path) throw new Error("E-Mail-Anhang nicht gefunden");
        if (!istPdfName(a.mime_type, a.file_name)) throw new Error(`„${a.file_name}“ ist kein PDF`);
        const { data: m } = await db.from("emails").select("id, subject, building_id, buildings(id, name, postal_code, city)").eq("id", a.email_id).maybeSingle();
        return {
          bucket: "email-attachments", path: a.file_path, titel: titelAusDateiname(a.file_name), building_id: m?.building_id ?? null,
          objekt: objektLabel(m?.buildings), quelle_typ: "email_attachment", quelle_id: a.id,
          quelle_label: [m?.buildings?.name, `E-Mail${m?.subject ? ` „${m.subject}“` : ""}`].filter(Boolean).join(" · ").slice(0, 200),
          email_id: a.email_id, dokumentart: dokumentartAusName(a.file_name), dateiname: a.file_name,
        };
      }
      case "angebot": {
        const { data: o } = await db.from("offers")
          .select("id, offer_no, prospect_name, pdf_storage_path, contact_person, contact_email, prospect_contact_id, object_representative")
          .eq("id", id).maybeSingle();
        if (!o) throw new Error("Angebot nicht gefunden");
        if (!o.pdf_storage_path) throw new Error("Zu diesem Angebot gibt es noch kein PDF – zuerst das Angebots-PDF erzeugen (dokument_erstellen bzw. in der App)");
        return {
          bucket: "invoices", path: o.pdf_storage_path, titel: `Angebot ${o.offer_no ? o.offer_no + " – " : ""}${o.prospect_name}`,
          building_id: null, objekt: "", quelle_typ: "offer", quelle_id: o.id, quelle_label: `Angebot · ${o.prospect_name}`, email_id: null,
          dokumentart: "angebot", dateiname: o.pdf_storage_path.split("/").pop(),
          vorschlag_unterzeichner: o.contact_person || o.contact_email
            ? [{ name: o.contact_person || o.prospect_name, email: o.contact_email ?? null, contact_id: o.prospect_contact_id ?? null, rolle: o.object_representative ? "Vertretung der WEG" : "Auftraggeber" }]
            : undefined,
        };
      }
      case "vertrag": {
        const { data: c } = await db.from("management_contracts").select("id, building_id, dms_file_id, buildings(id, name, postal_code, city)").eq("id", id).maybeSingle();
        if (!c) throw new Error("Verwaltervertrag nicht gefunden");
        if (!c.dms_file_id) throw new Error("Zu diesem Verwaltervertrag liegt noch kein PDF im DMS – zuerst den Vertrag als PDF erzeugen");
        const f = await dmsDatei(c.dms_file_id);
        const objekt = c.buildings?.name ?? "Ohne Objekt";
        return {
          bucket: f.bucket, path: f.file_path, titel: `Verwaltervertrag ${objekt}`, building_id: c.building_id, objekt: objektLabel(c.buildings),
          quelle_typ: "contract", quelle_id: c.id, quelle_label: `${objekt} · Verwaltervertrag`, email_id: null,
          dokumentart: "verwaltervertrag", dateiname: f.display_name,
        };
      }
      default:
        throw new Error("quelle.typ muss dms, mail_anhang, angebot oder vertrag sein");
    }
  }

  async function pdfLaden(q: Quelle): Promise<Uint8Array> {
    if (!ERLAUBTE_BUCKETS.includes(q.bucket)) throw new Error(`Speicherort „${q.bucket}“ wird für Unterschriften nicht unterstützt`);
    const bytes = await laden(db, q.bucket, q.path);
    if (!istPdf(bytes)) throw new Error("Die Datei ist kein PDF");
    return bytes;
  }

  async function vorgangFinden(v: string) {
    const s = String(v ?? "").trim();
    const id = uuidOderNull(s);
    const { data } = id
      ? await db.from("sign_requests").select("id").eq("id", id).maybeSingle()
      : await db.from("sign_requests").select("id").ilike("nummer", s).maybeSingle();
    if (!data) throw new Error(`Vorgang „${s}“ nicht gefunden (Nummer wie SIG-2026-0012 oder ID angeben)`);
    return await vorgangLaden(db, data.id);
  }

  function unterzeichnerFinden(signers: any[], u: string) {
    const s = String(u ?? "").trim();
    const id = uuidOderNull(s);
    if (id) {
      const x = signers.find((y) => y.id === id);
      if (!x) throw new Error("Unterzeichner gehört nicht zu diesem Vorgang");
      return x;
    }
    const n = s.toLowerCase();
    const genau = signers.filter((y) => y.name.toLowerCase() === n || (y.email ?? "").toLowerCase() === n);
    const treffer = genau.length ? genau : signers.filter((y) => y.name.toLowerCase().includes(n));
    if (!treffer.length) throw new Error(`Kein Unterzeichner „${s}“ in diesem Vorgang (vorhanden: ${signers.map((y) => y.name).join(", ")})`);
    if (treffer.length > 1) throw new Error(`„${s}“ ist nicht eindeutig: ${treffer.map((y) => `${y.name} (${y.id})`).join(", ")} – bitte die ID angeben`);
    return treffer[0];
  }

  async function mitarbeiterFinden(m: string) {
    const s = String(m ?? "").trim();
    if (!s) throw new Error("Für art 'intern' bitte mitarbeiter angeben (Name oder E-Mail eines RGI-Mitarbeiters)");
    const { data } = await db.from("profiles").select("user_id, email, first_name, last_name, role").in("role", ["admin", "employee"]);
    const alle = (data ?? []).filter((p: any) => p.user_id);
    const n = s.toLowerCase();
    const voll = (p: any) => [p.first_name, p.last_name].filter(Boolean).join(" ");
    const treffer = alle.filter((p: any) => (p.email ?? "").toLowerCase() === n || voll(p).toLowerCase() === n);
    const t = treffer.length ? treffer : alle.filter((p: any) => voll(p).toLowerCase().includes(n) || (p.email ?? "").toLowerCase().includes(n));
    if (t.length !== 1) throw new Error(t.length ? `Mitarbeiter „${s}“ nicht eindeutig: ${t.map(voll).join(", ")}` : `Kein RGI-Mitarbeiter „${s}“ gefunden`);
    return { user_id: t[0].user_id as string, name: voll(t[0]) || t[0].email, email: t[0].email as string };
  }

  async function kontaktDaten(contactId: string) {
    const { data: c } = await db.from("contacts").select("id, salutation, first_name, last_name, company_name, contact_emails(email, is_primary)").eq("id", contactId).maybeSingle();
    if (!c) throw new Error(`Kontakt ${contactId} nicht gefunden`);
    const name = c.company_name && !c.last_name ? c.company_name : [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "";
    const sal = String(c.salutation || "").trim().toLowerCase();
    const anrede = c.last_name && /^(herr|hr\.?)$/.test(sal) ? `Guten Tag Herr ${c.last_name}` : c.last_name && /^(frau|fr\.?)$/.test(sal) ? `Guten Tag Frau ${c.last_name}` : null;
    const mails = (c.contact_emails ?? []) as { email: string; is_primary: boolean | null }[];
    return { name, anrede, email: (mails.find((m) => m.is_primary) ?? mails[0])?.email ?? null };
  }

  // Felder (1-basiert, Ansicht) prüfen und in placements (0-basiert) umwandeln
  function felderUmwandeln(felder: any[] | undefined, groessen: { seite: number; breite: number; hoehe: number }[], name: string) {
    if (!felder?.length) return undefined;
    if (felder.length > 20) throw new Error(`Zu viele Felder für ${name} (max. 20)`);
    return felder.map((f, i) => {
      const seite = Number(f?.seite);
      const g = groessen.find((x) => x.seite === seite);
      if (!g) throw new Error(`${name}, Feld ${i + 1}: Seite ${f?.seite} gibt es nicht (Dokument hat ${groessen.length} Seiten)`);
      const w = f.w == null ? FELD_BREITE : Number(f.w);
      const h = f.h == null ? FELD_HOEHE : Number(f.h);
      const x = Number(f.x), y = Number(f.y);
      if (![x, y, w, h].every(Number.isFinite)) throw new Error(`${name}, Feld ${i + 1}: x, y, w, h müssen Zahlen sein`);
      if (w < 40 || h < 15 || w > 400 || h > 200) throw new Error(`${name}, Feld ${i + 1}: Größe ${w}×${h} pt ist unplausibel (sinnvoll ca. 160×40)`);
      if (x < 0 || y < 0 || x + w > g.breite + 0.5 || y + h > g.hoehe + 0.5) {
        throw new Error(`${name}, Feld ${i + 1}: liegt nicht vollständig auf Seite ${seite} (Seite ${g.breite}×${g.hoehe} pt, Feld x ${x}…${x + w}, y ${y}…${y + h})`);
      }
      return { page: seite - 1, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 };
    });
  }

  function vorgangKurz(v: any, signers: any[], events?: any[]) {
    const fertig = signers.filter((s) => ["unterschrieben", "papier_uebernommen"].includes(s.status)).length;
    return {
      nummer: v.nummer, id: v.id, titel: v.titel, typ: v.typ, dokumentart: v.dokumentart, status: v.status,
      objekt: v.buildings?.name ?? null, quelle: v.quelle_label, frist: v.frist ? datum(v.frist) : null,
      ueberfaellig: v.status === "offen" && !!v.frist && v.frist < new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
      reihenfolge: v.reihenfolge, unterschriften: `${fertig} von ${signers.length}`, seitenzahl: v.seitenzahl,
      app_link: vorgangUrl(v.id),
      unterzeichner: signers.map((s) => ({
        id: s.id, name: s.name, rolle: s.rolle, art: ART_TEXT(s), email: s.email, status: SIGNER_STATUS[s.status] ?? s.status,
        unterschrieben_am: s.signed_at ? new Date(s.signed_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : null,
        felder: Array.isArray(s.placements) ? s.placements.map((p: any) => ({ seite: p.page + 1, x: p.x, y: p.y, w: p.w, h: p.h })) : [],
        link_gueltig_bis: s.methode !== "intern" && s.expires_at ? datum(s.expires_at) : null,
        erinnerungen: s.reminder_count ?? 0,
      })),
      ...(v.status === "abgeschlossen" ? { endfassung_dms_file_id: v.final_file_id, abgeschlossen_am: v.completed_at ? datum(v.completed_at) : null } : {}),
      ...(events ? {
        protokoll: events.map((e) => `${new Date(e.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} – ${e.details?.text ?? e.ereignis}`),
      } : {}),
    };
  }

  return [
    {
      name: "unterschrift_dokument_analysieren",
      description: "Schritt 1 vor unterschrift_vorbereiten: liest das PDF (DMS-Dokument, Mail-Anhang, Angebot oder Verwaltervertrag) und liefert Seitenzahl, Seitengrößen, Textauszüge je Seite (letzte Seite ausführlich) und VORSCHLÄGE für Unterschriftsfelder (seite 1-basiert, x/y/w/h in PDF-Punkten, Ursprung oben links). Erkannt werden u. a. „Unterschrift …“, „(Unterschrift)“, Unterstrich-/Linien mit Beschriftung darunter (Auftraggeber, Verwalter, Eigentümer, Beiratsvorsitz, Versammlungsleiter, Protokollführer). „Ort, Datum“-Stellen werden getrennt gemeldet (kein Unterschriftsfeld). Ordne die Vorschläge anhand von beschriftung/kontext den Unterzeichnern zu und zeige dem Nutzer die Zuordnung, bevor du unterschrift_vorbereiten aufrufst. Ändert nichts.",
      inputSchema: S({ quelle: QUELLE_SCHEMA }, ["quelle"]),
      annotations: { readOnlyHint: true },
      run: async ({ quelle }: any) => {
        const q = await quelleLaden(quelle);
        const bytes = await pdfLaden(q);
        const a = await unterschriftsstellenErkennen(bytes);
        const { data: laufend } = await db.from("sign_requests").select("nummer, titel, status").eq("quelle_typ", q.quelle_typ).eq("quelle_id", q.quelle_id).in("status", ["offen", "abgeschlossen"]);
        return {
          dokument: q.dateiname, titel_vorschlag: q.titel, dokumentart_vorschlag: q.dokumentart, building_id: q.building_id, objekt: q.objekt || null,
          seitenzahl: a.seitenzahl,
          koordinaten: "PDF-Punkte (1 pt = 1/72 Zoll), Ursprung oben links der Seite; seite 1 = erste Seite. Feld = Rechteck, in das die Unterschrift gesetzt wird (Standard 160×40 pt, Unterkante auf der Linie).",
          vorschlaege: a.vorschlaege,
          ort_datum_stellen: a.ort_datum_stellen,
          ...(a.hinweis ? { hinweis: a.hinweis } : {}),
          ...(q.vorschlag_unterzeichner ? { unterzeichner_vorschlag: q.vorschlag_unterzeichner } : {}),
          ...(laufend?.length ? { vorhandene_vorgaenge: laufend } : {}),
          seiten: a.seiten,
        };
      },
    },
    {
      name: "unterschrift_vorbereiten",
      description: "Legt einen Unterschriften-Vorgang an (wie „Unterschrift anfordern“ in der App): Quelle, Unterzeichner mit Unterschriftsfeldern, Frist, Reihenfolge, Mailtext (Standard aus der Vorlage der Dokumentart). Unterzeichner-art: 'link' = es wird KEINE Mail verschickt, du bekommst einen persönlichen Link (14 Tage gültig), den der Nutzer selbst weitergibt bzw. in eine eigene E-Mail einfügt (z. B. mit mail_entwurf_anlegen) – der Link wird nur JETZT im Klartext angezeigt; 'email' = die App schickt SOFORT eine Einladungsmail an diese externe Person; 'intern' = RGI-Mitarbeiter unterschreibt in der App mit seiner hinterlegten Unterschrift. Felder am besten aus unterschrift_dokument_analysieren übernehmen (ohne Felder wird an das Endergebnis ein Prüfblatt angehängt). WICHTIG: Ist ein Unterzeichner mit art 'email' dabei, zuerst ohne bestaetigt aufrufen – das liefert nur eine Vorschau (Empfänger, Betreff, Mailtext, Felder). Diese dem Nutzer zeigen und erst nach seiner ausdrücklichen Zustimmung mit bestaetigt=true erneut aufrufen. testlauf=true prüft nur und legt nie etwas an.",
      inputSchema: S({
        quelle: QUELLE_SCHEMA,
        titel: str("Titel des Vorgangs (Standard: aus Dateiname/Angebot/Vertrag)"),
        dokumentart: DOKUMENTART_SCHEMA,
        building_id: uuid("Objekt (Standard: Objekt der Quelle) – bestimmt die DMS-Ablage der Endfassung"),
        frist: str("JJJJ-MM-TT (Standard: Frist der Vorlage, meist 14 Tage)"),
        reihenfolge: { type: "string", enum: ["gleichzeitig", "nacheinander"], description: "Standard gleichzeitig; nacheinander = in der angegebenen Reihenfolge" },
        mail_betreff: str("optional, Platzhalter {Dokument} {Objekt} {Frist} {Anrede}; Standard aus Vorlage"),
        mail_text: str("optional, Text ohne Button/Link (wird automatisch angefügt); Standard aus Vorlage"),
        erinnerung: { type: "boolean", description: "Automatische Erinnerungen (Standard true)" },
        kopie_dms: { type: "boolean", description: "Endfassung ins DMS des Objekts (Standard true)" },
        unterzeichner: {
          type: "array", minItems: 1, maxItems: 40,
          items: {
            type: "object", additionalProperties: false, required: ["art"],
            properties: {
              name: str("Name (bei contact_id/mitarbeiter optional)"),
              email: str("E-Mail (Pflicht bei art 'email'; bei 'link' optional für Kopie/Endfassung)"),
              contact_id: uuid("Kontakt aus der App (füllt Name, Anrede, E-Mail)"),
              rolle: str("z. B. 'Auftraggeber', 'Beiratsvorsitz', 'Verwalter'"),
              anrede: str("optional, z. B. 'Sehr geehrte Frau Muster'"),
              art: { type: "string", enum: ["email", "link", "intern"] },
              mitarbeiter: str("bei art 'intern': Name oder E-Mail des RGI-Mitarbeiters"),
              felder: { type: "array", maxItems: 20, items: FELD_SCHEMA, description: "Unterschriftsfelder dieses Unterzeichners" },
            },
          },
        },
        bestaetigt: { type: "boolean", description: "Nur nötig bei art 'email': erst true nach ausdrücklicher Zustimmung des Nutzers" },
        testlauf: { type: "boolean", description: "true = nur prüfen und Vorschau, nichts anlegen" },
        mitarbeiter_email: str("E-Mail des Mitarbeiters, der den Vorgang veranlasst (Ersteller, bekommt Meldungen)"),
      }, ["quelle", "unterzeichner"]),
      annotations: { destructiveHint: true, openWorldHint: true },
      run: async (a: any) => {
        const q = await quelleLaden(a.quelle);
        const bytes = await pdfLaden(q);
        const groessen = await seitenGroessen(bytes);
        const dokumentart = a.dokumentart ?? q.dokumentart;
        if (!DOKUMENTARTEN.includes(dokumentart)) throw new Error("Ungültige Dokumentart");
        const buildingId = a.building_id ?? q.building_id;
        let objekt = q.objekt;
        if (a.building_id) {
          const { data: b } = await db.from("buildings").select("id, name, postal_code, city").eq("id", a.building_id).maybeSingle();
          if (!b) throw new Error("Objekt (building_id) nicht gefunden");
          objekt = objektLabel(b);
        }
        const vorlage = await vorlageLaden(db, dokumentart);
        const titel = zeile(a.titel, 200) || q.titel;

        const signers: any[] = [];
        for (const [i, u] of (a.unterzeichner as any[]).entries()) {
          const art = u.art;
          if (art === "intern") {
            const m = await mitarbeiterFinden(u.mitarbeiter || u.email || u.name);
            const { data: us } = await db.from("user_signatures").select("user_id").eq("user_id", m.user_id).maybeSingle();
            signers.push({
              name: zeile(u.name, 120) || m.name, user_id: m.user_id, methode: "intern", rolle: u.rolle || "RGI Immobilien", rolle_key: "verwaltung",
              _hinweis: us ? null : `${m.name} hat noch keine Unterschrift hinterlegt (Einstellungen) – vor dem Unterschreiben nötig`,
              _email: m.email, placements: felderUmwandeln(u.felder, groessen, m.name),
            });
            continue;
          }
          const k = u.contact_id ? await kontaktDaten(u.contact_id) : null;
          const name = zeile(u.name, 120) || k?.name || "";
          if (!name) throw new Error(`Unterzeichner ${i + 1}: Name fehlt`);
          const email = (zeile(u.email, 200) || (art === "email" ? k?.email ?? "" : "")).toLowerCase() || null;
          if (art === "email" && (!email || !EMAIL_RE.test(email))) throw new Error(`${name}: für art 'email' ist eine gültige E-Mail-Adresse nötig${k && !k.email ? " (beim Kontakt ist keine hinterlegt)" : ""}`);
          if (email && !EMAIL_RE.test(email)) throw new Error(`${name}: ungültige E-Mail-Adresse`);
          signers.push({
            name, email, methode: "online", versand: art === "link" ? "link" : "mail", contact_id: u.contact_id ?? null,
            rolle: zeile(u.rolle, 80) || null, anrede: zeile(u.anrede, 120) || k?.anrede || null,
            placements: felderUmwandeln(u.felder, groessen, name),
          });
        }

        const mitMail = signers.filter((s) => s.methode === "online" && s.versand === "mail");
        const body = {
          typ: "ausgehend", dokumentart, titel, building_id: buildingId ?? undefined, quelle_typ: q.quelle_typ, quelle_id: q.quelle_id,
          quelle_label: q.quelle_label, source_bucket: q.bucket, source_path: q.path, email_id: q.email_id ?? undefined,
          frist: a.frist, reihenfolge: a.reihenfolge === "nacheinander" ? "nacheinander" : "gleichzeitig",
          mail_betreff: a.mail_betreff, mail_text: a.mail_text, erinnerung: a.erinnerung !== false, kopie_dms: a.kopie_dms !== false,
          signers: signers.map(({ _hinweis, _email, ...s }) => s),
        };
        const hinweise = signers.map((s) => s._hinweis).filter(Boolean);
        if (!buildingId && body.kopie_dms) hinweise.push("Kein Objekt angegeben – die Endfassung wird nicht im DMS abgelegt (building_id angeben, falls gewünscht).");
        if (!signers.some((s) => s.placements?.length)) hinweise.push("Keine Unterschriftsfelder angegeben – an die Endfassung wird ein Prüfblatt angehängt.");

        if (a.testlauf === true || (mitMail.length && a.bestaetigt !== true)) {
          const fristIso = a.frist || new Date(Date.now() + (vorlage.frist_tage ?? 14) * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
          const beispiel = mitMail[0] ?? signers.find((s) => s.methode !== "intern");
          const m = beispiel ? einladungMail(
            { titel, objekt, frist: fristIso, seitenzahl: groessen.length, nummer: `SIG-${new Date().getFullYear()}-####`, mitKopie: true },
            { name: beispiel.name, anrede: beispiel.anrede },
            { betreff: zeile(a.mail_betreff, 230) || vorlage.betreff, text: String(a.mail_text ?? "").trim() || vorlage.text },
            `${APP_URL}/unterschreiben/…`, `${APP_URL}/unterschreiben/…?papier=1`,
          ) : null;
          return {
            status: a.testlauf ? "TESTLAUF – nichts angelegt" : "VORSCHAU – noch NICHTS angelegt oder gesendet",
            hinweis: mitMail.length
              ? `Beim Anlegen gehen SOFORT Einladungsmails an: ${mitMail.map((s) => `${s.name} <${s.email}>`).join(", ")}. Dem Nutzer zeigen und nur nach ausdrücklicher Zustimmung mit bestaetigt=true erneut aufrufen.`
              : "Prüfung erfolgreich – ohne testlauf erneut aufrufen, um den Vorgang anzulegen.",
            titel, dokumentart, objekt: objekt || null, quelle: q.quelle_label, seitenzahl: groessen.length, frist: datum(fristIso), reihenfolge: body.reihenfolge,
            unterzeichner: signers.map((s) => ({
              name: s.name, art: s.methode === "intern" ? `intern (${s._email})` : s.versand === "link" ? "Link (keine Mail)" : "E-Mail", email: s.email ?? null,
              rolle: s.rolle, felder: (s.placements ?? []).map((p: any) => ({ seite: p.page + 1, x: p.x, y: p.y, w: p.w, h: p.h })),
            })),
            ...(m ? { einladungsmail: { betreff: m.subject, text: m.text } } : {}),
            ...(hinweise.length ? { hinweise } : {}),
          };
        }

        const userId = await uploaderId(a.mitarbeiter_email);
        const r: any = await anlegen(db, body, userId, false);
        await log("unterschrift_vorbereiten", {
          request_id: r.id, nummer: r.nummer, titel, quelle: q.quelle_typ, quelle_id: q.quelle_id, mitarbeiter: a.mitarbeiter_email ?? null,
          unterzeichner: signers.map((s) => ({ name: s.name, art: s.methode === "intern" ? "intern" : s.versand, email: s.email ?? null })),
        });
        const { req: v, signers: gespeichert } = await vorgangLaden(db, r.id);
        return {
          status: mitMail.length ? "ANGELEGT – Einladungen versendet" : "ANGELEGT – keine Mail versendet",
          nummer: r.nummer, id: r.id, app_link: vorgangUrl(r.id), frist: datum(v.frist),
          ...(r.links?.length ? {
            links: r.links.map((l: any) => ({ name: l.name, signer_id: l.signer_id, url: l.url })),
            links_hinweis: "Diese Links werden NUR JETZT im Klartext angezeigt (gespeichert ist nur ein Hash), 14 Tage gültig. Dem Nutzer ausgeben bzw. in seine E-Mail einfügen. Neuer Link später mit unterschrift_link_erstellen (der alte wird dann ungültig).",
          } : {}),
          ...(r.versand_fehler?.length ? { versand_fehler: r.versand_fehler } : {}),
          unterzeichner: gespeichert.map((s: any) => ({ id: s.id, name: s.name, art: ART_TEXT(s), status: SIGNER_STATUS[s.status] ?? s.status, felder: (s.placements ?? []).length })),
          ...(hinweise.length ? { hinweise } : {}),
        };
      },
    },
    {
      name: "unterschrift_link_erstellen",
      description: "Erstellt für einen externen Unterzeichner eines offenen Vorgangs einen NEUEN persönlichen Unterschriftslink (14 Tage gültig) – es wird KEINE Mail verschickt. Der bisherige Link dieses Unterzeichners wird sofort ungültig. Der Link wird nur in dieser Antwort im Klartext angezeigt; zum Weitergeben z. B. in eine E-Mail (mail_entwurf_anlegen) einfügen.",
      inputSchema: S({
        vorgang: str("Vorgangsnummer (z. B. SIG-2026-0012) oder ID"),
        unterzeichner: str("Name, E-Mail oder ID des Unterzeichners"),
        mitarbeiter_email: str("optional, für Protokoll"),
      }, ["vorgang", "unterzeichner"]),
      run: async (a: any) => {
        const { req: v, signers } = await vorgangFinden(a.vorgang);
        const s = unterzeichnerFinden(signers, a.unterzeichner);
        const userId = await uploaderId(a.mitarbeiter_email);
        const r: any = await neuerLink(db, { signer_id: s.id }, userId);
        await log("unterschrift_link_erstellen", { request_id: v.id, nummer: v.nummer, signer_id: s.id, name: s.name, ersetzt: r.ersetzt, mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          nummer: v.nummer, titel: v.titel, name: r.name, url: r.url, gueltig_tage: 14,
          hinweis: `${r.ersetzt ? "Der bisherige Link ist ab sofort ungültig. " : ""}Der Link wird nur jetzt angezeigt. Es wurde keine E-Mail versendet.`,
        };
      },
    },
    {
      name: "unterschriften_status",
      description: "Status von Unterschriften-Vorgängen. Mit vorgang (Nummer oder ID): Details mit allen Unterzeichnern, Feldern und Protokoll. Sonst Liste (Filter building_id, nur_offen, text im Titel) mit Fortschritt „x von y“, Frist und Status je Unterzeichner.",
      inputSchema: S({
        vorgang: str("Vorgangsnummer oder ID (Details)"),
        building_id: uuid("nur Vorgänge dieses Objekts"),
        nur_offen: { type: "boolean", description: "nur offene Vorgänge (Standard false)" },
        text: str("Teil des Titels oder der Nummer"),
        limit: { type: "integer", description: "Standard 20, max. 100" },
      }),
      annotations: { readOnlyHint: true },
      run: async (a: any) => {
        if (a.vorgang) {
          const { req: v, signers } = await vorgangFinden(a.vorgang);
          const { data: ev } = await db.from("sign_request_events").select("ereignis, details, created_at").eq("request_id", v.id).order("created_at", { ascending: true }).limit(200);
          return vorgangKurz(v, signers, ev ?? []);
        }
        let q = db.from("sign_requests").select("*, buildings(id, name, postal_code, city), signers:sign_request_signers(*)").order("created_at", { ascending: false }).limit(Math.min(a.limit ?? 20, 100));
        if (a.building_id) q = q.eq("building_id", a.building_id);
        if (a.nur_offen) q = q.eq("status", "offen");
        if (a.text) q = q.or(`titel.ilike.%${String(a.text).replace(/[,()]/g, " ")}%,nummer.ilike.%${String(a.text).replace(/[,()]/g, " ")}%`);
        const { data, error } = await q;
        if (error) throw error;
        // Protokoll-Kurzfassung: letztes Ereignis je Vorgang
        const ids = (data ?? []).map((v: any) => v.id);
        const letztes = new Map<string, string>();
        if (ids.length) {
          const { data: ev } = await db.from("sign_request_events").select("request_id, ereignis, details, created_at").in("request_id", ids).order("created_at", { ascending: false }).limit(1000);
          for (const e of ev ?? []) {
            if (!letztes.has(e.request_id)) letztes.set(e.request_id, `${datum(e.created_at)}: ${e.details?.text ?? e.ereignis}`);
          }
        }
        return (data ?? []).map((v: any) => {
          const k = vorgangKurz(v, [...(v.signers ?? [])].sort((x: any, y: any) => x.position - y.position));
          return {
            ...k, letztes_ereignis: letztes.get(v.id) ?? null,
            unterzeichner: k.unterzeichner.map(({ id, name, art, status, unterschrieben_am }) => ({ id, name, art, status, unterschrieben_am })),
          };
        });
      },
    },
    {
      name: "unterschrift_erinnern",
      description: "Erinnert offene externe Unterzeichner eines Vorgangs (alle oder einen): Unterzeichner mit E-Mail bekommen SOFORT eine Erinnerungsmail mit neuem Link (der alte wird ungültig); bei „Link“-Unterzeichnern ohne E-Mail geht stattdessen eine Meldung an den Ersteller (dann mit unterschrift_link_erstellen einen neuen Link erzeugen). WICHTIG: Zuerst ohne bestaetigt aufrufen – das zeigt nur, wer erinnert würde. Erst nach ausdrücklicher Zustimmung des Nutzers mit bestaetigt=true erneut aufrufen.",
      inputSchema: S({
        vorgang: str("Vorgangsnummer oder ID"),
        unterzeichner: str("optional: Name, E-Mail oder ID – sonst alle offenen"),
        bestaetigt: { type: "boolean", description: "false/fehlend = nur Vorschau; true = Mails senden (nur nach Zustimmung)" },
        mitarbeiter_email: str("optional, für Protokoll"),
      }, ["vorgang"]),
      annotations: { destructiveHint: true, openWorldHint: true },
      run: async (a: any) => {
        const { req: v, signers } = await vorgangFinden(a.vorgang);
        if (v.status !== "offen") throw new Error(`Vorgang ${v.nummer} ist nicht mehr offen (${v.status})`);
        const kandidaten = signers.filter((s: any) => s.methode !== "intern" && (s.email || nurLink(s)) && ["offen", "geoeffnet", "abgelehnt"].includes(s.status));
        const ziel = a.unterzeichner ? [unterzeichnerFinden(signers, a.unterzeichner)] : kandidaten;
        if (a.unterzeichner && !kandidaten.some((s: any) => s.id === ziel[0].id)) throw new Error(`${ziel[0].name} kann derzeit nicht erinnert werden (Status: ${SIGNER_STATUS[ziel[0].status] ?? ziel[0].status})`);
        if (!ziel.length) return { status: "Niemand zu erinnern", nummer: v.nummer };
        if (a.bestaetigt !== true) {
          return {
            status: "VORSCHAU – nichts gesendet", nummer: v.nummer, titel: v.titel,
            erinnerungsmail_an: ziel.filter((s: any) => s.email).map((s: any) => `${s.name} <${s.email}>`),
            nur_meldung_ans_buero: ziel.filter((s: any) => !s.email).map((s: any) => s.name),
            hinweis: "Dem Nutzer zeigen und nur nach ausdrücklicher Zustimmung mit bestaetigt=true erneut aufrufen. Der bisherige Link der Empfänger wird dabei ersetzt.",
          };
        }
        const userId = await uploaderId(a.mitarbeiter_email);
        const r: any = await erinnern(db, { request_id: v.id, signer_id: a.unterzeichner ? ziel[0].id : undefined }, userId, false);
        await log("unterschrift_erinnern", { request_id: v.id, nummer: v.nummer, erinnert: r.erinnert, selbst: r.selbst_erinnern ?? [], fehler: r.fehler ?? [], mitarbeiter: a.mitarbeiter_email ?? null });
        return { status: "ERINNERT", nummer: v.nummer, erinnerungsmails: r.erinnert, ...(r.selbst_erinnern ? { selbst_erinnern: r.selbst_erinnern } : {}), ...(r.fehler ? { fehler: r.fehler } : {}) };
      },
    },
  ];
}
