// Elektronische Unterschrift – fertige Vorlagen „SEPA-Lastschriftmandat“ und „Eigentümer-Stammdatenblatt“.
//
// Das PDF wird hier direkt mit pdf-lib gezeichnet (RGI-Design wie die Rechnung: oranger Balken, Logo oben
// rechts, Helvetica). Jedes Ausfüllfeld und jedes Unterschriftsfeld entsteht dabei MIT seinen exakten
// Koordinaten (PDF-Punkte, Ursprung oben links, y nach unten – wie placements), also ohne Anker-Raten.
// Vorhandene Angaben aus der App stehen als „änderbare Angabe“ (typ vorbelegt) im Dokument.
//
// Aktionen (sign-request, auch vom Claude-Konnektor genutzt):
//   vorlage_eigentuemer  → Eigentümer eines Objekts (je Kontakt, mit Einheiten, E-Mail ja/nein, laufenden Vorgängen)
//   vorlage_vorschau     → PDF eines Eigentümers als Base64 (nichts wird gespeichert)
//   aus_vorlage          → je Eigentümer ein eigener Vorgang (anlegen() aus vorgang.ts)
//   stammdaten_vorschau  → Vorher/Nachher nach Abschluss (Trockenlauf, ändert nichts)
//   stammdaten_uebernehmen → ausgewählte Angaben in die Stammdaten schreiben (nur von Hand, mit Protokoll)
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import {
  BUCKET, DATENSCHUTZ_URL, EMAIL_RE, FIRMA, Fehler, LOGO_URL, TZ, datum, ereignis, heuteIso, laden, melden, objektLabel, speichern,
  uuidOderNull, zeile,
} from "./basis.ts";
import type { Db } from "./basis.ts";
import { anlegen } from "./vorgang.ts";
import { felderLaden, type Feld } from "./felder.ts";
import { ibanFehler, ibanGruppiert, ibanRoh, type Frei, type TextZeile } from "./ersetzung.ts";

// deno-lint-ignore no-explicit-any
type Body = any;
// deno-lint-ignore no-explicit-any
type Font = any;
// deno-lint-ignore no-explicit-any
type Page = any;

export const VORLAGE_ARTEN = ["sepa_mandat", "stammdatenblatt"] as const;
export type VorlageArt = typeof VORLAGE_ARTEN[number];
export const VORLAGE_NAME: Record<VorlageArt, string> = {
  sepa_mandat: "SEPA-Lastschriftmandat",
  stammdatenblatt: "Eigentümer-Stammdatenblatt",
};
/** Kurzname im Titel des Vorgangs */
const TITEL_KURZ: Record<VorlageArt, string> = { sepa_mandat: "SEPA-Mandat", stammdatenblatt: "Stammdatenblatt" };

const istArt = (a: unknown): a is VorlageArt => typeof a === "string" && (VORLAGE_ARTEN as readonly string[]).includes(a);

// ================================================================ Daten aus der App

export interface Einheit {
  assignment_id: string;
  nr: string;
  art: string;
  lage: string;
  mea: string;
  usage_type: string | null;
  zustellweg: string | null;
}

export interface Person {
  id: string;
  name: string;
  email: string | null;
  telefon: string | null;
}

export interface Eigentuemer {
  contact_id: string;
  name: string;
  anrede: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
  /** Herkunft: Abweichende Angaben am Objekt (Overrides der ersten Einheit) oder Kontakt */
  override: { adresse: boolean; telefon: boolean; email: boolean; iban: boolean };
  personen: Person[];
  einheiten: Einheit[];
  bank: { kontoinhaber: string | null; iban: string | null; bic: string | null; bank: string | null; konto_id: string | null };
  mandat: { id: string; mandatsreferenz: string; status: string; iban: string | null; assignment_id: string | null } | null;
}

export interface Objekt {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  creditor_id: string | null;
  management_mode: string | null;
}

const ART_TEXT: Record<string, string> = {
  apartment: "Wohnung", parking_garage: "Garage / TG-Stellplatz", parking_outdoor: "Stellplatz", cellar: "Keller",
  hobby_room: "Hobbyraum", garden: "Garten", other: "Sonstiges", commercial: "Gewerbe",
};

const zahlDe = (n: number, max = 4) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: max });

const istMobil = (label: string | null | undefined, nummer: string) =>
  /mobil|handy/i.test(label ?? "") || /^(\+49\s*\(?0?\)?\s*1[5-7]|01[5-7])/.test(nummer.replace(/[\s/()-]/g, ""));

/** Name wie in der App: Overrides der Zuordnung vor Kontakt. */
function anzeigeName(a: Body): string {
  const c = a.contacts ?? {};
  const firma = a.company_name_override || c.company_name;
  const vor = a.first_name_override || c.first_name;
  const nach = a.last_name_override || c.last_name;
  return String(firma || [vor, nach].filter(Boolean).join(" ") || c.short_name || "Eigentümer").trim();
}

function anredeVon(a: Body, name: string): string {
  const c = a.contacts ?? {};
  const s = String(a.salutation_override || c.salutation || "").trim().toLowerCase();
  const nach = a.last_name_override || c.last_name;
  if (nach && /^(herr|hr\.?)$/.test(s)) return `Guten Tag Herr ${nach}`;
  if (nach && /^(frau|fr\.?)$/.test(s)) return `Guten Tag Frau ${nach}`;
  return `Guten Tag ${name}`;
}

/** Objekt + alle aktiven Eigentümer (je Kontakt zusammengefasst, Einheiten sortiert). */
export async function eigentuemerLaden(db: Db, buildingId: string): Promise<{ objekt: Objekt; eigentuemer: Eigentuemer[] }> {
  const id = uuidOderNull(buildingId);
  if (!id) throw new Fehler(400, "Bitte ein Objekt wählen.");
  const { data: objekt } = await db.from("buildings").select("id, name, address, postal_code, city, creditor_id, management_mode").eq("id", id).maybeSingle();
  if (!objekt) throw new Fehler(404, "Objekt nicht gefunden.");
  const { data: zu, error } = await db.from("contact_building_assignments")
    .select(
      "id, contact_id, unit_number, floor_location, unit_kind, usage_type, zustellweg, is_active, valid_to, " +
        "first_name_override, last_name_override, company_name_override, salutation_override, " +
        "address_street_override, address_zip_override, address_city_override, phones_override, emails_override, " +
        "iban_override, iban_holder_override, bank_account_id, " +
        "contacts(id, salutation, first_name, last_name, company_name, short_name, address_street, address_zip, address_city)",
    )
    .eq("building_id", id).eq("role_in_building", "eigentuemer");
  if (error) throw new Fehler(500, `Eigentümer konnten nicht geladen werden: ${error.message}`);
  const heute = heuteIso();
  const aktiv = (zu ?? []).filter((a: Body) => a.is_active !== false && (!a.valid_to || a.valid_to >= heute) && a.contacts);
  const ids = aktiv.map((a: Body) => a.id);
  const kontakte = [...new Set(aktiv.map((a: Body) => a.contact_id))] as string[];
  if (!kontakte.length) return { objekt, eigentuemer: [] };

  const [mails, tel, pers, konten, anteile, mandate] = await Promise.all([
    db.from("contact_emails").select("contact_id, person_id, email, is_primary, label").in("contact_id", kontakte),
    db.from("contact_phones").select("contact_id, person_id, phone_number, label").in("contact_id", kontakte),
    db.from("contact_persons").select("id, contact_id, first_name, last_name, email, phone, is_primary, sort_order").in("contact_id", kontakte),
    db.from("contact_bank_accounts").select("id, contact_id, account_holder, iban, bic, bank_name, is_default").in("contact_id", kontakte),
    db.from("contact_building_shares").select("assignment_id, share_type, share_value").in("assignment_id", ids),
    db.from("sepa_mandates").select("id, assignment_id, contact_id, mandatsreferenz, status, iban").eq("building_id", id).in("status", ["aktiv", "pruefen"]),
  ]);

  // MEA: Anteilsart mit „mea“ (bevorzugt genau „mea“), Summe im Objekt als Nenner
  const meaZeilen = (anteile.data ?? []).filter((s: Body) => /mea/i.test(s.share_type ?? ""));
  const meaArt = meaZeilen.some((s: Body) => String(s.share_type).toLowerCase() === "mea") ? "mea" : meaZeilen[0]?.share_type?.toLowerCase();
  const meaVon = new Map<string, number>();
  for (const s of meaZeilen) if (String(s.share_type).toLowerCase() === meaArt) meaVon.set(s.assignment_id, Number(s.share_value) || 0);
  const summe = [...meaVon.values()].reduce((x, y) => x + y, 0);
  const nenner = summe > 0 && Math.abs(summe - Math.round(summe)) < 0.001 ? ` / ${zahlDe(Math.round(summe))}` : "";

  const gruppen = new Map<string, Body[]>();
  for (const a of aktiv) gruppen.set(a.contact_id, [...(gruppen.get(a.contact_id) ?? []), a]);
  const out: Eigentuemer[] = [];
  for (const [cid, liste] of gruppen) {
    liste.sort((x: Body, y: Body) => String(x.unit_number ?? "").localeCompare(String(y.unit_number ?? ""), "de", { numeric: true }));
    const a = liste[0];
    const c = a.contacts;
    const name = anzeigeName(a);
    // Telefon/E-Mail: Abweichende Angaben am Objekt (erste Einheit mit Override) vor Kontakt
    const telOv = liste.find((x: Body) => Array.isArray(x.phones_override) && x.phones_override.length)?.phones_override as Body[] | undefined;
    const mailOv = liste.find((x: Body) => Array.isArray(x.emails_override) && x.emails_override.length)?.emails_override as Body[] | undefined;
    const telefone: { nummer: string; label: string | null }[] = telOv
      ? telOv.map((p) => ({ nummer: String(p?.number ?? "").trim(), label: String(p?.note ?? "") })).filter((p) => p.nummer)
      : (tel.data ?? []).filter((p: Body) => p.contact_id === cid && !p.person_id && !/fax/i.test(p.label ?? ""))
        .map((p: Body) => ({ nummer: String(p.phone_number ?? "").trim(), label: p.label })).filter((p: Body) => p.nummer);
    const mobil = telefone.find((p) => istMobil(p.label, p.nummer))?.nummer ?? null;
    const festnetz = telefone.find((p) => !istMobil(p.label, p.nummer))?.nummer ?? null;
    const eigeneMails = (mails.data ?? []).filter((m: Body) => m.contact_id === cid && !m.person_id);
    const email = (mailOv?.map((m) => String(m?.address ?? m?.email ?? "").trim()).find((m) => EMAIL_RE.test(m)))
      ?? (eigeneMails.find((m: Body) => m.is_primary) ?? eigeneMails[0])?.email
      ?? (mails.data ?? []).find((m: Body) => m.contact_id === cid)?.email ?? null;
    const adresseOv = liste.find((x: Body) => x.address_street_override || x.address_zip_override || x.address_city_override);
    const personen: Person[] = (pers.data ?? []).filter((p: Body) => p.contact_id === cid)
      .sort((x: Body, y: Body) => (y.is_primary ? 1 : 0) - (x.is_primary ? 1 : 0) || (x.sort_order ?? 0) - (y.sort_order ?? 0))
      .map((p: Body) => {
        const pm = (mails.data ?? []).find((m: Body) => m.person_id === p.id)?.email;
        const pt = (tel.data ?? []).find((t: Body) => t.person_id === p.id && !/fax/i.test(t.label ?? ""))?.phone_number;
        return {
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || name,
          email: (String(p.email ?? "").trim() || pm || null),
          telefon: (String(p.phone ?? "").trim() || pt || null),
        };
      });
    const kontoZu = liste.find((x: Body) => x.bank_account_id)?.bank_account_id;
    const eigeneKonten = (konten.data ?? []).filter((k: Body) => k.contact_id === cid);
    const konto = eigeneKonten.find((k: Body) => k.id === kontoZu) ?? eigeneKonten.find((k: Body) => k.is_default) ?? eigeneKonten[0] ?? null;
    const ibanOv = liste.find((x: Body) => x.iban_override);
    const mandat = (mandate.data ?? []).filter((m: Body) => liste.some((x: Body) => x.id === m.assignment_id))
      .sort((x: Body, y: Body) => (x.status === "aktiv" ? 0 : 1) - (y.status === "aktiv" ? 0 : 1))[0] ?? null;
    out.push({
      contact_id: cid,
      name,
      anrede: anredeVon(a, name),
      strasse: String((adresseOv?.address_street_override) || c.address_street || "").trim(),
      plz: String((adresseOv?.address_zip_override) || c.address_zip || "").trim(),
      ort: String((adresseOv?.address_city_override) || c.address_city || "").trim(),
      telefon: festnetz,
      mobil,
      email: email ? String(email).trim().toLowerCase() : null,
      override: { adresse: !!adresseOv, telefon: !!telOv, email: !!mailOv, iban: !!ibanOv },
      personen,
      einheiten: liste.map((x: Body) => ({
        assignment_id: x.id,
        nr: String(x.unit_number ?? "").trim() || "–",
        art: ART_TEXT[x.unit_kind] ?? "Einheit",
        lage: String(x.floor_location ?? "").trim(),
        mea: meaVon.has(x.id) ? `${zahlDe(meaVon.get(x.id)!)}${nenner}` : "",
        usage_type: x.usage_type ?? null,
        zustellweg: x.zustellweg ?? null,
      })),
      bank: {
        kontoinhaber: ibanOv?.iban_holder_override || konto?.account_holder || null,
        iban: ibanOv?.iban_override ? ibanRoh(ibanOv.iban_override) : konto?.iban ? ibanRoh(konto.iban) : null,
        bic: ibanOv ? null : konto?.bic ?? null,
        bank: ibanOv ? null : konto?.bank_name ?? null,
        konto_id: konto?.id ?? null,
      },
      mandat: mandat ? { id: mandat.id, mandatsreferenz: mandat.mandatsreferenz, status: mandat.status, iban: mandat.iban, assignment_id: mandat.assignment_id } : null,
    });
  }
  out.sort((x, y) => x.einheiten[0].nr.localeCompare(y.einheiten[0].nr, "de", { numeric: true }) || x.name.localeCompare(y.name, "de"));
  return { objekt, eigentuemer: out };
}

/** „WEG Musterstraße 12, 87459 Pfronten“ bzw. „Eigentümer des Objekts …“ (wie sepaAuditLog.ts in der App). */
function glaeubigerName(o: Objekt): string {
  const ort = [o.postal_code, o.city].filter(Boolean).join(" ");
  const kern = `${String(o.name).replace(/^WEG\s+/i, "")}${ort && !String(o.name).includes(ort) ? `, ${ort}` : ""}`;
  return o.management_mode === "rent" ? `Eigentümer des Objekts ${kern}` : `Wohnungseigentümergemeinschaft ${kern}`;
}
const glaeubigerKurz = (o: Objekt) => (o.management_mode === "rent" ? "Eigentümer des Objekts" : `WEG ${String(o.name).replace(/^WEG\s+/i, "")}`);

// ================================================================ PDF-Bau

const MM = 72 / 25.4;
const W = 595.28;
const H = 841.89;
const LEFT = 20 * MM;
const RIGHT = W - 18 * MM;
const COL = LEFT + 128; // Werte-Spalte
const UNTEN = H - 58; // darunter: Hinweiszeile, Firmenzeile, Fußzeile „Elektronisch unterschrieben …“

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  linie: hex("#F08C1F"),
  akzent: hex("#ee7202"),
  dunkel: hex("#B35300"),
  ink: hex("#2B2B2B"),
  text: hex("#595959"),
  grau: hex("#6B6B6B"),
  rand: hex("#CFCFCF"),
  hell: hex("#E5E5E5"),
  box: hex("#FAFAFA"),
  creme: hex("#FFF7ED"),
};

/** Feld im Format von sign-request create (felderPlanen). */
export interface VorlageFeld {
  feld_key: string;
  typ: "ankreuz" | "auswahl" | "datum" | "text" | "vorbelegt";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  ausfueller: string;
  pflicht: boolean;
  gruppe?: string;
  option?: string;
  abhaengig_von?: { feld_key: string } | { gruppe: string; option: string };
  max_laenge?: number;
  format?: "iban";
  heute_vorbelegen?: boolean;
  ausgangswert?: string;
  text_zeilen?: TextZeile[];
  frei?: Frei;
  reihenfolge: number;
  quelle: "vorlage";
}

export interface Unterschriftsfeld {
  signer: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

let logoCache: Uint8Array | null | undefined;
async function logoLaden(): Promise<Uint8Array | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const r = await fetch(LOGO_URL);
    logoCache = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Kleine Zeichenhilfe: Koordinaten oben links (y nach unten), automatischer Seitenumbruch, Felder mit Lage. */
class Blatt {
  pdf!: PDFDocument;
  seiten: Page[] = [];
  page!: Page;
  y = 0;
  normal!: Font;
  fett!: Font;
  felder: VorlageFeld[] = [];
  unterschriften: Unterschriftsfeld[] = [];
  private nr = 0;
  /** Zeilenhöhen: Angabe, Eingabe, Abstand vor Abschnitten (kompakt fürs einseitige Stammdatenblatt) */
  zeileH = 20;
  eingabeH = 22;
  kopfAbstand = 22;
  constructor(public titel: string, public untertitel: string, public hinweis: string) {}

  async start() {
    this.pdf = await PDFDocument.create();
    this.pdf.setTitle(this.titel);
    this.pdf.setAuthor(FIRMA.name);
    this.pdf.setCreator("RGI-VerwaltungsApp");
    this.pdf.setLanguage("de-DE");
    this.normal = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.fett = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    await this.neueSeite();
  }

  get seite() {
    return this.seiten.length - 1;
  }

  sicher(t: string): string {
    let out = "";
    for (const ch of String(t ?? "").replace(/[\r\n\t]+/g, " ")) {
      try {
        this.normal.encodeText(ch);
        out += ch;
      } catch {
        out += /\s/.test(ch) ? " " : "?";
      }
    }
    return out;
  }

  breite(t: string, size: number, fett = false) {
    return (fett ? this.fett : this.normal).widthOfTextAtSize(this.sicher(t), size);
  }

  /** Text mit Grundlinie `basis` (von oben). */
  text(t: string, x: number, basis: number, o: { size?: number; fett?: boolean; farbe?: ReturnType<typeof rgb>; rechts?: boolean } = {}) {
    const size = o.size ?? 10;
    const s = this.sicher(t);
    const w = this.breite(s, size, o.fett);
    this.page.drawText(s, { x: o.rechts ? x - w : x, y: H - basis, size, font: o.fett ? this.fett : this.normal, color: o.farbe ?? C.ink });
    return w;
  }

  /** Umbruch auf Breite */
  umbrechen(t: string, size: number, breite: number, fett = false): string[] {
    const out: string[] = [];
    for (const absatz of String(t).split(/\n/)) {
      let z = "";
      for (const w of absatz.split(/\s+/).filter(Boolean)) {
        const probe = z ? `${z} ${w}` : w;
        if (this.breite(probe, size, fett) <= breite) z = probe;
        else {
          if (z) out.push(z);
          z = w;
        }
      }
      out.push(z);
    }
    return out;
  }

  absatz(t: string, o: { size?: number; farbe?: ReturnType<typeof rgb>; x?: number; breite?: number; zeile?: number } = {}) {
    const size = o.size ?? 9.5;
    const zeile = o.zeile ?? size * 1.38;
    const x = o.x ?? LEFT;
    for (const z of this.umbrechen(t, size, o.breite ?? RIGHT - x)) {
      this.platz(zeile);
      this.y += zeile;
      this.text(z, x, this.y - zeile * 0.25, { size, farbe: o.farbe ?? C.text });
    }
  }

  rechteck(x: number, yTop: number, w: number, h: number, o: { fuellung?: ReturnType<typeof rgb>; rand?: ReturnType<typeof rgb>; dicke?: number; strich?: number[] } = {}) {
    this.page.drawRectangle({
      x, y: H - yTop - h, width: w, height: h,
      ...(o.fuellung ? { color: o.fuellung } : {}),
      ...(o.rand ? { borderColor: o.rand, borderWidth: o.dicke ?? 0.6 } : {}),
      ...(o.strich ? { borderDashArray: o.strich } : {}),
    });
  }

  linie(x1: number, x2: number, yy: number, dicke = 0.6, farbe = C.hell) {
    this.page.drawLine({ start: { x: x1, y: H - yy }, end: { x: x2, y: H - yy }, thickness: dicke, color: farbe });
  }

  async neueSeite() {
    this.page = this.pdf.addPage([W, H]);
    this.seiten.push(this.page);
    const erste = this.seiten.length === 1;
    // oranger Balken oben
    this.rechteck(LEFT, 12 * MM, RIGHT - LEFT, 2.4, { fuellung: C.linie });
    if (erste) {
      const bytes = await logoLaden();
      let logoW = 0;
      if (bytes) {
        try {
          const img = bytes[0] === 0x89 ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
          const h = 16 * MM;
          logoW = (img.width / img.height) * h;
          this.page.drawImage(img, { x: RIGHT - logoW, y: H - (12 * MM + 2.4 + 6 * MM) - h, width: logoW, height: h });
        } catch {
          logoW = 0;
        }
      }
      if (!logoW) this.text(FIRMA.kurz, RIGHT, 12 * MM + 30, { size: 14, fett: true, farbe: C.dunkel, rechts: true });
      const titelBasis = 12 * MM + 2.4 + 6 * MM + 22;
      this.text(this.titel, LEFT, titelBasis, { size: 20, fett: true });
      // Untertitel neben dem Logo umbrechen (nie unter das Logo)
      const zeilen = this.umbrechen(this.untertitel, 9.5, RIGHT - LEFT - (logoW || 120) - 14);
      zeilen.forEach((z, i) => this.text(z, LEFT, titelBasis + 17 + i * 12.5, { size: 9.5, farbe: C.text }));
      this.y = titelBasis + 34 + (zeilen.length - 1) * 12.5;
    } else {
      this.text(`${this.titel} – Fortsetzung`, LEFT, 12 * MM + 22, { size: 10, fett: true, farbe: C.text });
      this.y = 12 * MM + 34;
    }
  }

  /** Neue Seite, falls weniger als `h` Punkte Platz sind (synchron: Folgeseiten haben kein Logo). */
  platz(h: number) {
    if (this.y + h <= UNTEN) return;
    this.page = this.pdf.addPage([W, H]);
    this.seiten.push(this.page);
    this.rechteck(LEFT, 12 * MM, RIGHT - LEFT, 2.4, { fuellung: C.linie });
    this.text(`${this.titel} – Fortsetzung`, LEFT, 12 * MM + 22, { size: 10, fett: true, farbe: C.text });
    this.y = 12 * MM + 34;
  }

  abschnitt(nr: number, titel: string, untertitel?: string) {
    this.platz(36 + this.kopfAbstand);
    this.y += this.kopfAbstand;
    this.text(`${nr}.`, LEFT, this.y, { size: 10.5, fett: true, farbe: C.dunkel });
    this.text(titel, LEFT + 16, this.y, { size: 10.5, fett: true });
    if (untertitel) this.text(untertitel, LEFT + 16 + this.breite(titel, 10.5, true) + 8, this.y, { size: 8.5, farbe: C.grau });
    this.y += 5;
    this.linie(LEFT, RIGHT, this.y, 0.6, C.hell);
    this.y += 6;
  }

  private naechste() {
    return ++this.nr;
  }

  /** Beschriftung links + fester Wert (nur lesend). */
  info(label: string, wert: string, o: { fett?: boolean } = {}) {
    this.platz(18);
    this.y += 16;
    this.text(label, LEFT, this.y - 3, { size: 9, farbe: C.grau });
    const zeilen = this.umbrechen(wert || "–", 10, RIGHT - COL, o.fett);
    zeilen.forEach((z, i) => {
      if (i) {
        this.platz(13);
        this.y += 13;
      }
      this.text(z, COL, this.y - 3, { size: 10, fett: o.fett });
    });
  }

  /**
   * Änderbare Angabe: der Wert steht im PDF, der Unterzeichner darf ihn im Formular ändern.
   * Ist kein Wert vorhanden, entsteht stattdessen ein Textfeld (Ausfüllfeld).
   */
  angabe(key: string, label: string, wert: string | null | undefined, o: { x?: number; bis?: number; labelX?: number; pflicht?: boolean; max?: number; format?: "iban"; neueZeile?: boolean; ausfueller?: string } = {}) {
    const v = this.sicher(String(wert ?? "").trim());
    const x = o.x ?? COL;
    const bis = o.bis ?? RIGHT;
    if (o.neueZeile !== false) {
      this.platz(this.zeileH);
      this.y += this.zeileH;
    }
    const basis = this.y - 4;
    this.text(label, o.labelX ?? LEFT, basis, { size: 9, farbe: C.grau });
    const ausfueller = o.ausfueller ?? "signer:0";
    if (!v) {
      this.textfeld(key, label, x, basis - 12, bis - x, { pflicht: o.pflicht, max: o.max, format: o.format, ausfueller });
      return;
    }
    let size = 10;
    while (size > 7 && this.breite(v, size) > bis - x - 2) size -= 0.25;
    const w = this.breite(v, size);
    this.text(v, x, basis, { size });
    // gestrichelte Linie unter dem Wert: „hier steht eine änderbare Angabe“
    this.page.drawLine({ start: { x, y: H - (basis + 3) }, end: { x: bis, y: H - (basis + 3) }, thickness: 0.5, color: C.rand, dashArray: [1.5, 1.5] });
    const zeile: TextZeile = { x: r2(x), y: r2(basis - 0.8 * size), w: r2(w), h: r2(size), basis: r2(basis), groesse: r2(size) };
    this.felder.push({
      feld_key: key, typ: "vorbelegt", page: this.seite, x: r1(zeile.x), y: r1(zeile.y), w: r1(Math.max(1, zeile.w)), h: r1(zeile.h),
      beschriftung: label, ausfueller, pflicht: false, ausgangswert: v, text_zeilen: [zeile],
      frei: { bis: r2(bis), oben: r2(basis - size - 6) }, reihenfolge: this.naechste(), quelle: "vorlage",
      ...(o.format ? { format: o.format } : {}),
    });
  }

  /** Eingabekasten (Textfeld) mit Lage oben links. */
  textfeld(key: string, label: string, x: number, yTop: number, w: number, o: { pflicht?: boolean; max?: number; format?: "iban"; ausfueller?: string; abhaengig?: VorlageFeld["abhaengig_von"] } = {}) {
    const h = 16;
    this.rechteck(x, yTop, w, h, { fuellung: C.box, rand: C.rand, dicke: 0.6 });
    this.felder.push({
      feld_key: key, typ: "text", page: this.seite, x: r1(x), y: r1(yTop), w: r1(w), h,
      beschriftung: label, ausfueller: o.ausfueller ?? "signer:0", pflicht: !!o.pflicht, max_laenge: o.format === "iban" ? 42 : o.max ?? 120,
      reihenfolge: this.naechste(), quelle: "vorlage",
      ...(o.format ? { format: o.format } : {}),
      ...(o.abhaengig ? { abhaengig_von: o.abhaengig } : {}),
    });
  }

  /** Zeile mit Beschriftung und Eingabekasten. */
  eingabe(key: string, label: string, o: { pflicht?: boolean; max?: number; format?: "iban"; x?: number; bis?: number; labelX?: number; neueZeile?: boolean; abhaengig?: VorlageFeld["abhaengig_von"] } = {}) {
    if (o.neueZeile !== false) {
      this.platz(this.eingabeH);
      this.y += this.eingabeH;
    }
    const basis = this.y - 5;
    this.text(label + (o.pflicht ? " *" : ""), o.labelX ?? LEFT, basis, { size: 9, farbe: C.grau });
    const x = o.x ?? COL;
    this.textfeld(key, label, x, basis - 12, (o.bis ?? RIGHT) - x, o);
  }

  datumfeld(key: string, label: string, x: number, yTop: number, w: number, o: { pflicht?: boolean; heute?: boolean } = {}) {
    const h = 16;
    this.rechteck(x, yTop, w, h, { fuellung: C.box, rand: C.rand, dicke: 0.6 });
    this.felder.push({
      feld_key: key, typ: "datum", page: this.seite, x: r1(x), y: r1(yTop), w: r1(w), h,
      beschriftung: label, ausfueller: "signer:0", pflicht: !!o.pflicht, heute_vorbelegen: o.heute ?? true,
      reihenfolge: this.naechste(), quelle: "vorlage",
    });
  }

  /** Auswahl „genau eins“ als Reihe von Kästchen mit Text dahinter. */
  auswahl(gruppe: string, optionen: { option: string; text: string }[], o: { pflicht?: boolean; x?: number; spalte?: number } = {}) {
    this.platz(this.zeileH);
    this.y += this.zeileH;
    const basis = this.y - 5;
    let x = o.x ?? COL;
    const s = 10;
    const r = this.naechste();
    for (const opt of optionen) {
      const yTop = basis - 8.6;
      this.rechteck(x, yTop, s, s, { fuellung: rgb(1, 1, 1), rand: C.ink, dicke: 0.7 });
      this.felder.push({
        feld_key: `${gruppe}_${opt.option}`, typ: "auswahl", page: this.seite, x: r1(x), y: r1(yTop), w: s, h: s,
        beschriftung: opt.text, gruppe, option: opt.option, ausfueller: "signer:0", pflicht: !!o.pflicht,
        reihenfolge: r, quelle: "vorlage",
      });
      const tw = this.text(opt.text, x + s + 5, basis, { size: 9.5 });
      x += o.spalte ? Math.max(o.spalte, s + 5 + tw + 14) : s + 5 + tw + 16;
    }
  }

  ankreuz(key: string, text: string, o: { pflicht?: boolean } = {}) {
    const s = 10;
    const zeilen = this.umbrechen(text, 9.5, RIGHT - LEFT - s - 8);
    this.platz(14 + zeilen.length * 13);
    this.y += 16;
    const basis = this.y - 4;
    const yTop = basis - 8.6;
    this.rechteck(LEFT, yTop, s, s, { fuellung: rgb(1, 1, 1), rand: C.ink, dicke: 0.7 });
    this.felder.push({
      feld_key: key, typ: "ankreuz", page: this.seite, x: r1(LEFT), y: r1(yTop), w: s, h: s, beschriftung: text.length > 150 ? `${text.slice(0, 147)}…` : text,
      ausfueller: "signer:0", pflicht: !!o.pflicht, reihenfolge: this.naechste(), quelle: "vorlage",
    });
    zeilen.forEach((z, i) => {
      if (i) this.y += 13;
      this.text(z, LEFT + s + 8, this.y - 4, { size: 9.5 });
    });
  }

  /** Ort, Datum und Unterschriftsfelder (je Unterzeichner ein Feld nebeneinander). */
  unterschreiben(namen: string[], beschriftung: string) {
    const felder = Math.max(1, Math.min(2, namen.length));
    this.platz(26 + 86);
    // Ort und Datum
    this.y += 24;
    const basis = this.y - 5;
    this.text("Ort *", LEFT, basis, { size: 9, farbe: C.grau });
    this.textfeld("ort", "Ort", LEFT + 34, basis - 12, 170, { pflicht: true, max: 60 });
    this.text("Datum *", LEFT + 222, basis, { size: 9, farbe: C.grau });
    this.datumfeld("datum", "Datum", LEFT + 262, basis - 12, 96, { pflicht: true, heute: true });
    // Unterschriften
    this.y += 18;
    const breite = felder === 1 ? 230 : (RIGHT - LEFT - 24) / 2;
    for (let i = 0; i < felder; i++) {
      const x = LEFT + i * (breite + 24);
      const top = this.y;
      const h = 46;
      this.rechteck(x, top, breite, h, { fuellung: C.creme });
      this.linie(x, x + breite, top + h, 0.8, C.ink);
      this.text(`${beschriftung}${felder > 1 ? ` ${i + 1}` : ""}: ${namen[i] ?? ""}`, x, top + h + 19, { size: 8.5, farbe: C.grau });
      this.unterschriften.push({ signer: i, page: this.seite, x: r1(x), y: r1(top), w: r1(breite), h });
    }
    this.y += 46 + 22;
  }

  async fertig(): Promise<Uint8Array> {
    // Hinweiszeile und Firmenzeile unten auf jeder Seite (über der Fußzeile „Elektronisch unterschrieben …“)
    const n = this.seiten.length;
    this.seiten.forEach((p, i) => {
      this.page = p;
      const hinweis = this.umbrechen(this.hinweis, 7.5, RIGHT - LEFT);
      let b = H - 48 - (hinweis.length - 1) * 9.5;
      for (const z of hinweis) {
        this.text(z, LEFT, b, { size: 7.5, farbe: C.grau });
        b += 9.5;
      }
      this.linie(LEFT, RIGHT, H - 34, 0.5, C.hell);
      this.text(`${FIRMA.name} · ${FIRMA.strasse} · ${FIRMA.ort} · Tel. ${FIRMA.telefon} · ${FIRMA.email}`, LEFT, H - 25, { size: 7, farbe: C.grau });
      if (n > 1) this.text(`Seite ${i + 1} von ${n}`, RIGHT, H - 25, { size: 7, farbe: C.grau, rechts: true });
    });
    return await this.pdf.save({ useObjectStreams: false });
  }
}

export interface VorlageErgebnis {
  bytes: Uint8Array;
  felder: VorlageFeld[];
  unterschriften: Unterschriftsfeld[];
  titel: string;
  mandatsreferenz: string | null;
}

/** Wer unterschreibt? Standard: der Eigentümer; mit `beide` jede hinterlegte Person (höchstens 2). */
export function unterzeichnerVon(e: Eigentuemer, beide: boolean): { name: string; email: string | null; anrede: string; person_id: string | null }[] {
  if (beide && e.personen.length >= 2) {
    return e.personen.slice(0, 2).map((p) => ({
      name: p.name, email: (p.email || e.email || null)?.toLowerCase() ?? null, anrede: `Guten Tag ${p.name}`, person_id: p.id,
    }));
  }
  return [{ name: e.name, email: e.email, anrede: e.anrede, person_id: null }];
}

const einheitenText = (e: Eigentuemer) =>
  e.einheiten.map((x) => `Nr. ${x.nr}${x.lage ? ` (${x.lage})` : ""}`).join(", ");

/** SEPA-Lastschriftmandat für einen Eigentümer. */
async function sepaPdf(o: Objekt, e: Eigentuemer, referenz: string, namen: string[]): Promise<Omit<VorlageErgebnis, "titel">> {
  const b = new Blatt("SEPA-Lastschriftmandat", "für wiederkehrende Zahlungen · SEPA-Basislastschrift",
    "Unterschreiben muss die Kontoinhaberin bzw. der Kontoinhaber. Ist das eine andere Person, rufen Sie uns bitte an: " +
      `${FIRMA.telefon}. Das Mandat gilt, bis Sie es schriftlich widerrufen. Bitte nicht per Post senden.`);
  await b.start();
  b.abschnitt(1, "Zahlungsempfänger");
  b.info("Gemeinschaft", glaeubigerName(o), { fett: true });
  b.info("vertreten durch", `${FIRMA.name}, ${FIRMA.strasse}, ${FIRMA.ort} (Verwalterin)`);
  b.info("Gläubiger-ID", o.creditor_id ?? "–", { fett: true });
  b.info("Mandatsreferenz", referenz, { fett: true });
  b.info("Für", `Hausgeld und sonstige Zahlungen an die Gemeinschaft – ${e.einheiten.length === 1 ? "Einheit" : "Einheiten"} ${einheitenText(e)}`);

  b.abschnitt(2, "Ermächtigung", "SEPA-Basislastschrift · wiederkehrende Zahlung");
  b.y += 4;
  const kurz = glaeubigerKurz(o);
  b.absatz(
    `Ich ermächtige die ${glaeubigerName(o)}, vertreten durch die ${FIRMA.name}, Zahlungen von meinem Konto mittels ` +
      `SEPA-Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die von der ${kurz} auf mein Konto gezogenen ` +
      "Lastschriften einzulösen.",
  );
  b.y += 3;
  b.absatz(
    "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages " +
      "verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.",
  );

  b.abschnitt(3, "Kontoinhaber", "Zahlungspflichtiger – bitte prüfen und ergänzen");
  b.angabe("kontoinhaber", "Name", e.bank.kontoinhaber || e.name, { pflicht: true });
  b.angabe("strasse", "Straße, Hausnummer", e.strasse, { pflicht: true });
  b.angabe("plz_ort", "PLZ, Ort", [e.plz, e.ort].filter(Boolean).join(" "), { pflicht: true });
  b.angabe("land", "Land", "Deutschland");
  b.eingabe("iban", "IBAN", { pflicht: true, format: "iban" });
  b.eingabe("bic", "BIC", { max: 11, bis: COL + 150 });
  b.eingabe("kreditinstitut", "Kreditinstitut", { max: 80 });
  b.y += 4;
  b.unterschreiben(namen, "Unterschrift Kontoinhaber");
  const bytes = await b.fertig();
  return { bytes, felder: b.felder, unterschriften: b.unterschriften, mandatsreferenz: referenz };
}

/** Eigentümer-Stammdatenblatt. */
async function stammdatenPdf(o: Objekt, e: Eigentuemer, namen: string[]): Promise<Omit<VorlageErgebnis, "titel">> {
  const b = new Blatt("Eigentümer-Stammdatenblatt", glaeubigerName(o),
    "Vorausgefüllte Angaben stammen aus unseren Unterlagen und können beim Unterschreiben geändert werden. Fragen zu Einheiten oder " +
      `Miteigentumsanteilen bitte an ${FIRMA.email} oder ${FIRMA.telefon}. Datenschutzhinweise: ${DATENSCHUTZ_URL.replace(/^https:\/\//, "")}`);
  b.zeileH = 18;
  b.eingabeH = 20;
  b.kopfAbstand = 17;
  await b.start();
  const halb = COL + (RIGHT - COL) / 2;

  b.abschnitt(1, "Eigentümer");
  b.angabe("name", "Name", e.name, { pflicht: true });
  b.angabe("strasse", "Straße, Hausnummer", e.strasse, { max: 100 });
  b.angabe("plz_ort", "PLZ, Ort", [e.plz, e.ort].filter(Boolean).join(" "), { max: 100 });
  b.angabe("telefon", "Telefon", e.telefon, { bis: halb - 10, max: 40 });
  b.angabe("mobil", "Mobil", e.mobil, { x: halb + 34, labelX: halb, bis: RIGHT, max: 40, neueZeile: false });
  b.angabe("email", "E-Mail", e.email, { max: 120 });

  // Weitere Personen (z. B. Ehepaar): hinterlegte zweite Person, sonst leere, freiwillige Felder
  const zweite = e.personen.length >= 2 ? e.personen[1] : null;
  b.abschnitt(2, "Weitere Eigentümerin / weiterer Eigentümer", "falls vorhanden");
  b.angabe("person2_name", "Name", zweite?.name ?? null, { max: 100 });
  b.angabe("person2_telefon", "Telefon", zweite?.telefon ?? null, { bis: halb - 10, max: 40 });
  b.angabe("person2_email", "E-Mail", zweite?.email ?? null, { x: halb + 34, labelX: halb, bis: RIGHT, max: 120, neueZeile: false });

  b.abschnitt(3, e.einheiten.length === 1 ? "Ihre Einheit" : "Ihre Einheiten", "nur zur Information");
  const sp = [LEFT, LEFT + 60, LEFT + 200, LEFT + 360];
  b.platz(18);
  b.y += 14;
  ["Nr.", "Art", "Lage", "Miteigentumsanteil"].forEach((t, i) => b.text(t, sp[i], b.y - 3, { size: 8.5, fett: true, farbe: C.text }));
  for (const x of e.einheiten) {
    b.platz(15);
    b.y += 15;
    b.text(x.nr, sp[0], b.y - 3, { size: 9.5, fett: true });
    b.text(x.art, sp[1], b.y - 3, { size: 9.5 });
    b.text(x.lage || "–", sp[2], b.y - 3, { size: 9.5 });
    b.text(x.mea || "–", sp[3], b.y - 3, { size: 9.5 });
  }

  b.abschnitt(4, "Nutzung");
  b.auswahl("nutzung", [
    { option: "selbstbewohnt", text: "selbst bewohnt" },
    { option: "vermietet", text: "vermietet" },
    { option: "fewo", text: "Ferienwohnung" },
    { option: "leerstand", text: "leer / sonstiges" },
  ], { pflicht: true, x: LEFT });
  const vermietet = { gruppe: "nutzung", option: "vermietet" } as const;
  b.eingabe("mieter_name", "Mieter (falls vermietet)", { max: 100, bis: halb - 10, abhaengig: vermietet });
  b.eingabe("mieter_telefon", "Telefon", { max: 40, x: halb + 34, labelX: halb, neueZeile: false, abhaengig: vermietet });

  b.abschnitt(5, "Zustellung von Unterlagen", "Einladungen, Protokolle, Abrechnungen");
  b.auswahl("zustellung", [
    { option: "email", text: "per E-Mail (an die oben genannte Adresse)" },
    { option: "post", text: "per Post" },
  ], { pflicht: true, x: LEFT });

  b.abschnitt(6, "Bankverbindung für Erstattungen", "z. B. Guthaben aus der Abrechnung");
  b.angabe("bank_inhaber", "Kontoinhaber", e.bank.kontoinhaber || (e.bank.iban ? e.name : null), { max: 100 });
  b.angabe("bank_iban", "IBAN", e.bank.iban ? ibanGruppiert(e.bank.iban) : null, { format: "iban", bis: COL + 220 });
  b.angabe("bank_bic", "BIC", e.bank.bic, { bis: halb - 10, max: 11 });
  b.angabe("bank_name", "Kreditinstitut", e.bank.bank, { x: halb + 64, labelX: halb, max: 80, neueZeile: false });

  b.abschnitt(7, "Datenschutz");
  b.ankreuz("datenschutz", `Ich habe die Datenschutzhinweise (${DATENSCHUTZ_URL.replace(/^https:\/\//, "")}) zur Kenntnis genommen.`, { pflicht: true });
  b.y += 2;
  b.unterschreiben(namen, "Unterschrift Eigentümer");
  const bytes = await b.fertig();
  return { bytes, felder: b.felder, unterschriften: b.unterschriften, mandatsreferenz: null };
}

/** Mandatsreferenz: bestehendes Mandat des Eigentümers, sonst neue nach Schema RGI-{KÜRZEL}-{Einheit}-{lfd}. */
async function mandatsreferenz(db: Db, o: Objekt, e: Eigentuemer): Promise<string> {
  if (e.mandat?.mandatsreferenz) return e.mandat.mandatsreferenz;
  const { data, error } = await db.rpc("neue_mandatsreferenz", { p_building: o.id, p_unit: e.einheiten[0]?.nr === "–" ? "" : e.einheiten[0]?.nr ?? "" });
  if (error || !data) throw new Fehler(500, `Mandatsreferenz konnte nicht vergeben werden${error ? `: ${error.message}` : ""}.`);
  return String(data);
}

export async function vorlageBauen(db: Db, art: VorlageArt, o: Objekt, e: Eigentuemer, beide: boolean, praefix = ""): Promise<VorlageErgebnis> {
  const namen = unterzeichnerVon(e, beide).map((s) => s.name);
  if (art === "sepa_mandat" && !o.creditor_id) {
    throw new Fehler(400, `Für ${o.name} ist keine Gläubiger-ID hinterlegt (Objekt › Mandate). Ohne Gläubiger-ID kein SEPA-Mandat.`);
  }
  const r = art === "sepa_mandat" ? await sepaPdf(o, e, await mandatsreferenz(db, o, e), namen) : await stammdatenPdf(o, e, namen);
  const einheit = e.einheiten.map((x) => x.nr).join("+");
  const titel = zeile(`${praefix}${TITEL_KURZ[art]} ${o.name} ${einheit} ${e.name}`, 200);
  return { ...r, titel };
}

// ================================================================ Aktionen

/** vorlage_eigentuemer: Liste für die Auswahl (App, Konnektor). */
export async function vorlageEigentuemer(db: Db, b: Body) {
  const { objekt, eigentuemer } = await eigentuemerLaden(db, b.building_id);
  // Laufende Vorgänge aus Vorlagen je Kontakt (damit niemand doppelt angeschrieben wird)
  const { data: laufend } = await db.from("sign_requests").select("id, nummer, dokumentart, status, vorlage")
    .eq("building_id", objekt.id).eq("quelle_typ", "vorlage").eq("status", "offen");
  return {
    objekt: { id: objekt.id, name: objekt.name, label: objektLabel(objekt), glaeubiger_id: objekt.creditor_id },
    eigentuemer: eigentuemer.map((e) => ({
      contact_id: e.contact_id,
      name: e.name,
      email: e.email,
      einheiten: e.einheiten.map((x) => ({ assignment_id: x.assignment_id, nr: x.nr, art: x.art, lage: x.lage })),
      personen: e.personen.slice(0, 2).map((p) => ({ name: p.name, email: p.email })),
      mandat: e.mandat ? { mandatsreferenz: e.mandat.mandatsreferenz, status: e.mandat.status, mit_iban: !!e.mandat.iban } : null,
      laufend: (laufend ?? []).filter((r: Body) => r.vorlage?.contact_id === e.contact_id)
        .map((r: Body) => ({ id: r.id, nummer: r.nummer, dokumentart: r.dokumentart })),
    })),
  };
}

function eigentuemerFinden(liste: Eigentuemer[], key: { contact_id?: string; assignment_id?: string }): Eigentuemer {
  const e = liste.find((x) => (key.contact_id && x.contact_id === key.contact_id) || (key.assignment_id && x.einheiten.some((u) => u.assignment_id === key.assignment_id)));
  if (!e) throw new Fehler(404, "Dieser Eigentümer gehört nicht (mehr) zum Objekt.");
  return e;
}

/** vorlage_vorschau: PDF eines Eigentümers (Base64), nichts wird gespeichert. */
export async function vorlageVorschau(db: Db, b: Body) {
  if (!istArt(b.vorlage)) throw new Fehler(400, "Unbekannte Vorlage.");
  const { objekt, eigentuemer } = await eigentuemerLaden(db, b.building_id);
  const e = eigentuemerFinden(eigentuemer, { contact_id: uuidOderNull(b.contact_id) ?? undefined, assignment_id: uuidOderNull(b.assignment_id) ?? undefined });
  const r = await vorlageBauen(db, b.vorlage, objekt, e, b.beide === true);
  let bin = "";
  for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
  return {
    titel: r.titel,
    pdf_base64: btoa(bin),
    felder: r.felder.length,
    unterschriftsfelder: r.unterschriften.length,
    mandatsreferenz: r.mandatsreferenz,
    unterzeichner: unterzeichnerVon(e, b.beide === true).map((s) => ({ name: s.name, email: s.email })),
  };
}

/**
 * aus_vorlage: je Eigentümer ein eigener Vorgang.
 * eintraege: [{contact_id | assignment_id, versand: "mail"|"link", beide?: boolean}]
 */
export async function ausVorlageAnlegen(db: Db, b: Body, userId: string | null, test: boolean) {
  if (!istArt(b.vorlage)) throw new Fehler(400, "Unbekannte Vorlage.");
  const art: VorlageArt = b.vorlage;
  const roh = Array.isArray(b.eintraege) ? b.eintraege : [];
  if (!roh.length) throw new Fehler(400, "Bitte mindestens einen Eigentümer auswählen.");
  if (roh.length > 200) throw new Fehler(400, "Höchstens 200 Eigentümer auf einmal.");
  // Nur für Tests: Titel-Präfix (z. B. „TEST “)
  const praefix = test && typeof b.titel_praefix === "string" ? zeile(b.titel_praefix, 20) + " " : "";
  const { objekt, eigentuemer } = await eigentuemerLaden(db, b.building_id);
  if (art === "sepa_mandat" && !objekt.creditor_id) {
    throw new Fehler(400, `Für ${objekt.name} ist keine Gläubiger-ID hinterlegt (Objekt › Mandate). Ohne Gläubiger-ID kein SEPA-Mandat.`);
  }
  const gesehen = new Set<string>();
  const ergebnisse: Body[] = [];
  for (const [i, x] of roh.entries()) {
    let e: Eigentuemer;
    try {
      e = eigentuemerFinden(eigentuemer, { contact_id: uuidOderNull(x?.contact_id) ?? undefined, assignment_id: uuidOderNull(x?.assignment_id) ?? undefined });
    } catch (err) {
      ergebnisse.push({ index: i, ok: false, fehler: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (gesehen.has(e.contact_id)) continue; // mehrere Einheiten desselben Eigentümers → ein Vorgang
    gesehen.add(e.contact_id);
    const versand = x?.versand === "mail" ? "mail" : "link";
    const beide = x?.beide === true;
    const leute = unterzeichnerVon(e, beide);
    if (versand === "mail" && !leute[0].email) {
      ergebnisse.push({ contact_id: e.contact_id, name: e.name, ok: false, fehler: `${e.name}: keine E-Mail-Adresse hinterlegt – bitte „Link selbst verschicken“ wählen.` });
      continue;
    }
    const tmp = `_signaturen/_vorlagen/${crypto.randomUUID()}.pdf`;
    try {
      const r = await vorlageBauen(db, art, objekt, e, beide, praefix);
      await speichern(db, tmp, r.bytes);
      const signers = leute.map((s, si) => ({
        name: s.name,
        email: s.email ?? undefined,
        contact_id: e.contact_id,
        anrede: s.anrede,
        rolle: art === "sepa_mandat" ? "Kontoinhaber" : "Eigentümer",
        methode: "online",
        // ohne E-Mail-Adresse bleibt nur der Link
        versand: versand === "mail" && s.email ? "mail" : "link",
        placements: r.unterschriften.filter((u) => u.signer === si).map(({ signer: _s, ...p }) => p),
      }));
      const res = await anlegen(db, {
        typ: "ausgehend",
        dokumentart: art,
        titel: r.titel,
        building_id: objekt.id,
        quelle_typ: "vorlage",
        quelle_id: e.einheiten[0].assignment_id,
        quelle_label: objektLabel(objekt),
        source_bucket: BUCKET,
        source_path: tmp,
        frist: b.frist,
        reihenfolge: "gleichzeitig",
        mail_betreff: b.mail_betreff,
        mail_text: b.mail_text,
        erinnerung: b.erinnerung !== false,
        kopie_dms: false,
        signers,
        felder: r.felder,
      }, userId, test);
      await db.from("sign_requests").update({
        vorlage: {
          art,
          building_id: objekt.id,
          contact_id: e.contact_id,
          assignment_ids: e.einheiten.map((u) => u.assignment_id),
          einheiten: e.einheiten.map((u) => u.nr),
          name: e.name,
          personen: leute.map((s) => ({ name: s.name, person_id: s.person_id })),
          ...(r.mandatsreferenz ? { mandatsreferenz: r.mandatsreferenz, glaeubiger_id: objekt.creditor_id, mandat_id: e.mandat?.id ?? null } : {}),
        },
      }).eq("id", res.id);
      await ereignis(db, res.id, "aus_vorlage", `Dokument aus der Vorlage „${VORLAGE_NAME[art]}“ erzeugt (${r.felder.length} Ausfüllfelder${r.mandatsreferenz ? `, Mandatsreferenz ${r.mandatsreferenz}` : ""})`, {
        userId, details: { art, contact_id: e.contact_id },
      });
      ergebnisse.push({
        contact_id: e.contact_id, name: e.name, einheiten: e.einheiten.map((u) => u.nr), ok: true,
        id: res.id, nummer: res.nummer, titel: r.titel,
        versand: signers.map((s) => ({ name: s.name, art: s.versand, email: s.email ?? null })),
        links: res.links ?? [],
        ...(res.versand_fehler?.length ? { versand_fehler: res.versand_fehler } : {}),
        ...(test && res.test_links ? { test_links: res.test_links } : {}),
      });
    } catch (err) {
      ergebnisse.push({ contact_id: e.contact_id, name: e.name, ok: false, fehler: err instanceof Error ? err.message : String(err) });
    } finally {
      await db.storage.from(BUCKET).remove([tmp]);
    }
  }
  return {
    vorlage: art,
    objekt: objektLabel(objekt),
    angelegt: ergebnisse.filter((x) => x.ok).length,
    fehler: ergebnisse.filter((x) => !x.ok).length,
    ergebnisse,
  };
}

// ================================================================ In Stammdaten übernehmen

export interface Angabe {
  key: string;
  label: string;
  alt: string | null;
  neu: string | null;
  /** wohin geschrieben wird (Text für die Oberfläche) */
  ziel: string;
  /** false = nur zur Information (z. B. Namensänderung, Mieter) */
  anwendbar: boolean;
  hinweis?: string;
}

const norm = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
const nurZiffern = (s: string | null | undefined) => String(s ?? "").replace(/[^\d+]/g, "").replace(/^\+49/, "0");

/** Wert eines Feldes nach dem Unterschreiben (vorbelegt: neuer Wert oder Text aus dem Dokument). */
const feldWert = (felder: Feld[], key: string): string | null => {
  const f = felder.find((x) => x.feld_key === key);
  if (!f) return null;
  if (f.typ === "vorbelegt") return norm(f.wert ?? f.ausgangswert) || null;
  return norm(f.wert) || null;
};

async function vorgangMitVorlage(db: Db, requestId: unknown) {
  const id = uuidOderNull(requestId);
  if (!id) throw new Fehler(400, "Ungültiger Vorgang.");
  const { data: r } = await db.from("sign_requests").select("*, signers:sign_request_signers(*)").eq("id", id).maybeSingle();
  if (!r) throw new Fehler(404, "Vorgang nicht gefunden.");
  if (!r.vorlage?.art || !istArt(r.vorlage.art)) throw new Fehler(400, "Dieser Vorgang stammt nicht aus einer Vorlage.");
  if (r.status !== "abgeschlossen") throw new Fehler(409, "Übernehmen geht erst, wenn alle unterschrieben haben.");
  return r;
}

/** PLZ und Ort aus „87459 Pfronten“ */
const plzOrt = (s: string | null) => {
  const m = /^(\d{4,5})\s+(.+)$/.exec(norm(s));
  return m ? { plz: m[1], ort: m[2] } : { plz: "", ort: norm(s) };
};

async function angabenBerechnen(db: Db, r: Body) {
  const v = r.vorlage;
  const felder = await felderLaden(db, r.id);
  const { objekt, eigentuemer } = await eigentuemerLaden(db, v.building_id);
  const e = eigentuemer.find((x) => x.contact_id === v.contact_id) ?? null;
  if (!e) throw new Fehler(404, "Der Eigentümer gehört nicht mehr zum Objekt – bitte von Hand übernehmen.");
  const angaben: Angabe[] = [];
  const ziel = (ov: boolean, was: string) => (ov ? `${was} am Objekt (abweichende Angabe der Einheit)` : `${was} beim Kontakt`);

  if (v.art === "sepa_mandat") {
    const unterschrieben = r.signers.map((s: Body) => s.signed_at).filter(Boolean).sort().at(-1) ?? r.completed_at;
    const tag = unterschrieben ? new Date(unterschrieben).toLocaleDateString("sv-SE", { timeZone: TZ }) : heuteIso();
    const iban = feldWert(felder, "iban");
    const inhaber = feldWert(felder, "kontoinhaber");
    const bic = feldWert(felder, "bic");
    const bank = feldWert(felder, "kreditinstitut");
    const { data: vorh } = await db.from("sepa_mandates").select("id, assignment_id, mandatsreferenz, status, iban, kontoinhaber, unterschrieben_am")
      .eq("building_id", objekt.id).in("assignment_id", v.assignment_ids).in("status", ["aktiv", "pruefen"]);
    const altText = (vorh ?? []).length
      ? (vorh ?? []).map((m: Body) => `${m.mandatsreferenz}: ${m.iban ? ibanGruppiert(m.iban) : "ohne IBAN"}${m.kontoinhaber ? `, ${m.kontoinhaber}` : ""}${m.unterschrieben_am ? `, ${datum(m.unterschrieben_am)}` : ""}`).join(" · ")
      : null;
    angaben.push({
      key: "mandat",
      label: `SEPA-Mandat ${v.mandatsreferenz}`,
      alt: altText,
      neu: `${iban ?? "–"} · ${inhaber ?? "–"}${bic ? ` · ${bic}` : ""} · unterschrieben ${datum(tag)}`,
      ziel: `Mandate des Objekts (Einheit ${v.einheiten?.join(", ") ?? ""}) – Status aktiv, mit unterschriebenem PDF`,
      anwendbar: !!iban && !ibanFehler(iban),
      ...(iban && ibanFehler(iban) ? { hinweis: ibanFehler(iban)! } : {}),
    });
    const kontoGleich = !!iban && e.bank.iban === ibanRoh(iban);
    angaben.push({
      key: "bankkonto",
      label: "Bankverbindung des Eigentümers",
      alt: e.bank.iban ? `${ibanGruppiert(e.bank.iban)}${e.bank.kontoinhaber ? ` · ${e.bank.kontoinhaber}` : ""}` : null,
      neu: iban ? `${iban}${inhaber ? ` · ${inhaber}` : ""}${bank ? ` · ${bank}` : ""}` : null,
      ziel: ziel(e.override.iban, "Bankverbindung"),
      anwendbar: !!iban && !ibanFehler(iban) && !kontoGleich,
      ...(kontoGleich ? { hinweis: "schon so gespeichert" } : {}),
    });
    return { e, objekt, felder, angaben, tag };
  }

  // ---- Stammdatenblatt
  const adresseNeu = { strasse: feldWert(felder, "strasse"), ...plzOrt(feldWert(felder, "plz_ort")) };
  const adresseAlt = `${e.strasse}${e.plz || e.ort ? `, ${[e.plz, e.ort].filter(Boolean).join(" ")}` : ""}`.trim() || null;
  const adresseNeuText = `${adresseNeu.strasse ?? ""}${adresseNeu.plz || adresseNeu.ort ? `, ${[adresseNeu.plz, adresseNeu.ort].filter(Boolean).join(" ")}` : ""}`.trim() || null;
  const vergleich = (a: string | null, n: string | null) => norm(a).toLowerCase() === norm(n).toLowerCase();
  const name = feldWert(felder, "name");
  if (name && !vergleich(name, e.name)) {
    angaben.push({ key: "name", label: "Name", alt: e.name, neu: name, ziel: "–", anwendbar: false, hinweis: "Namensänderung bitte von Hand im Kontakt prüfen (z. B. Heirat, Erbfall)" });
  }
  if (adresseNeuText && !vergleich(adresseNeuText, adresseAlt)) {
    angaben.push({ key: "adresse", label: "Anschrift", alt: adresseAlt, neu: adresseNeuText, ziel: ziel(e.override.adresse, "Anschrift"), anwendbar: !!adresseNeu.strasse && !!adresseNeu.ort });
  }
  for (const [key, label, alt] of [["telefon", "Telefon", e.telefon], ["mobil", "Mobil", e.mobil]] as const) {
    const neu = feldWert(felder, key);
    if (neu && nurZiffern(neu) !== nurZiffern(alt)) {
      angaben.push({ key, label, alt: alt ?? null, neu, ziel: ziel(e.override.telefon, `${label} (zusätzlich)`), anwendbar: true });
    }
  }
  const mail = feldWert(felder, "email");
  if (mail && !vergleich(mail, e.email)) {
    angaben.push({
      key: "email", label: "E-Mail", alt: e.email, neu: mail.toLowerCase(), ziel: ziel(e.override.email, "E-Mail als Haupt-Adresse (alte bleibt erhalten)"),
      anwendbar: EMAIL_RE.test(mail), ...(EMAIL_RE.test(mail) ? {} : { hinweis: "keine gültige E-Mail-Adresse" }),
    });
  }
  const zustell = felder.find((f) => f.gruppe === "zustellung" && f.wert === "ja")?.option ?? null;
  const zustellAlt = [...new Set(e.einheiten.map((u) => u.zustellweg).filter(Boolean))].join(", ") || null;
  if (zustell && zustell !== zustellAlt) {
    angaben.push({ key: "zustellweg", label: "Zustellung", alt: zustellAlt === "email" ? "per E-Mail" : zustellAlt === "post" ? "per Post" : zustellAlt, neu: zustell === "email" ? "per E-Mail" : "per Post", ziel: `alle Einheiten des Eigentümers im Objekt`, anwendbar: true });
  }
  const nutzung = felder.find((f) => f.gruppe === "nutzung" && f.wert === "ja")?.option ?? null;
  const NUTZ: Record<string, string> = { selbstbewohnt: "selbst bewohnt", vermietet: "vermietet", fewo: "Ferienwohnung", leerstand: "leer / sonstiges", zweitwohnsitz: "Zweitwohnsitz" };
  const wohnEinheiten = e.einheiten.filter((u) => ["Wohnung", "Gewerbe"].includes(u.art));
  const nutzZiel = wohnEinheiten.length ? wohnEinheiten : e.einheiten.length === 1 ? e.einheiten : [];
  const nutzAlt = [...new Set(nutzZiel.map((u) => u.usage_type).filter(Boolean))] as string[];
  if (nutzung && (nutzAlt.length !== 1 || nutzAlt[0] !== nutzung)) {
    angaben.push({
      key: "nutzung", label: "Nutzung", alt: nutzAlt.map((n) => NUTZ[n] ?? n).join(", ") || null, neu: NUTZ[nutzung] ?? nutzung,
      ziel: nutzZiel.length ? `Einheit ${nutzZiel.map((u) => u.nr).join(", ")}` : "–", anwendbar: nutzZiel.length > 0,
    });
  }
  const mieter = [feldWert(felder, "mieter_name"), feldWert(felder, "mieter_telefon")].filter(Boolean).join(" · ");
  if (mieter) angaben.push({ key: "mieter", label: "Mieter", alt: null, neu: mieter, ziel: "–", anwendbar: false, hinweis: "Mieter bitte bei Bedarf unter Personen anlegen" });
  const p2 = [feldWert(felder, "person2_name"), feldWert(felder, "person2_telefon"), feldWert(felder, "person2_email")].filter(Boolean).join(" · ");
  const p2alt = e.personen[1] ? [e.personen[1].name, e.personen[1].telefon, e.personen[1].email].filter(Boolean).join(" · ") : null;
  if (p2 && !vergleich(p2, p2alt)) angaben.push({ key: "person2", label: "Weitere Person", alt: p2alt, neu: p2, ziel: "–", anwendbar: false, hinweis: "bitte von Hand im Kontakt eintragen" });
  const iban = feldWert(felder, "bank_iban");
  if (iban && ibanRoh(iban) !== (e.bank.iban ?? "")) {
    const inhaber = feldWert(felder, "bank_inhaber");
    const bank = feldWert(felder, "bank_name");
    const bic = feldWert(felder, "bank_bic");
    angaben.push({
      key: "bankkonto", label: "Bankverbindung (Erstattungen)",
      alt: e.bank.iban ? `${ibanGruppiert(e.bank.iban)}${e.bank.kontoinhaber ? ` · ${e.bank.kontoinhaber}` : ""}` : null,
      neu: `${ibanGruppiert(iban)}${inhaber ? ` · ${inhaber}` : ""}${bic ? ` · ${bic}` : ""}${bank ? ` · ${bank}` : ""}`,
      ziel: ziel(e.override.iban, "Bankverbindung"), anwendbar: !ibanFehler(iban), ...(ibanFehler(iban) ? { hinweis: ibanFehler(iban)! } : {}),
    });
  }
  return { e, objekt, felder, angaben, tag: null as string | null };
}

/** stammdaten_vorschau: Vorher/Nachher (Trockenlauf). */
export async function stammdatenVorschau(db: Db, b: Body) {
  const r = await vorgangMitVorlage(db, b.request_id);
  const { angaben } = await angabenBerechnen(db, r);
  return {
    art: r.vorlage.art,
    name: r.vorlage.name ?? null,
    uebernommen_am: r.vorlage.uebernommen_am ?? null,
    angaben,
  };
}

/** stammdaten_uebernehmen: ausgewählte Angaben schreiben (nur von Hand, mit Protokoll). */
export async function stammdatenUebernehmen(db: Db, b: Body, userId: string | null) {
  const r = await vorgangMitVorlage(db, b.request_id);
  const keys: string[] = Array.isArray(b.keys) ? b.keys.map(String) : [];
  if (!keys.length) throw new Fehler(400, "Bitte mindestens eine Angabe auswählen.");
  const { e, objekt, felder, angaben, tag } = await angabenBerechnen(db, r);
  const auswahl = angaben.filter((a) => keys.includes(a.key) && a.anwendbar);
  if (!auswahl.length) throw new Fehler(400, "Keine der gewählten Angaben kann übernommen werden.");
  const jetzt = new Date().toISOString();
  const ids = e.einheiten.map((u) => u.assignment_id);
  const erledigt: string[] = [];
  const f = (k: string) => feldWert(felder, k);

  const kontoSpeichern = async (iban: string, inhaber: string | null, bic: string | null, bank: string | null) => {
    const roh = ibanRoh(iban);
    if (e.override.iban) {
      await db.from("contact_building_assignments").update({ iban_override: roh, ...(inhaber ? { iban_holder_override: inhaber } : {}) }).in("id", ids).not("iban_override", "is", null);
      return;
    }
    const { data: konten } = await db.from("contact_bank_accounts").select("id, iban").eq("contact_id", e.contact_id);
    let id = (konten ?? []).find((k: Body) => ibanRoh(k.iban ?? "") === roh)?.id as string | undefined;
    if (id) {
      await db.from("contact_bank_accounts").update({ account_holder: inhaber, ...(bic ? { bic } : {}), ...(bank ? { bank_name: bank } : {}), is_default: true, updated_at: jetzt }).eq("id", id);
    } else {
      const { data: neu, error } = await db.from("contact_bank_accounts").insert({
        contact_id: e.contact_id, account_holder: inhaber, iban: roh, bic, bank_name: bank, is_default: true,
      }).select("id").single();
      if (error) throw new Fehler(500, `Bankverbindung konnte nicht gespeichert werden: ${error.message}`);
      id = neu.id;
    }
    await db.from("contact_bank_accounts").update({ is_default: false }).eq("contact_id", e.contact_id).neq("id", id);
    await db.from("contact_building_assignments").update({ bank_account_id: id }).in("id", ids);
  };

  for (const a of auswahl) {
    switch (a.key) {
      case "mandat": {
        const iban = ibanRoh(f("iban")!);
        const daten = {
          kontoinhaber: f("kontoinhaber"), iban, bic: f("bic")?.toUpperCase().replace(/\s/g, "") || null, unterschrieben_am: tag,
          status: "aktiv", quelle: "unterschrift", sign_request_id: r.id, updated_at: jetzt,
          notiz: `Elektronisch unterschrieben (${r.nummer})`,
        };
        // unterschriebenes PDF zum Mandat legen (Bucket sepa-mandates wie beim Hochladen in Objekt › Mandate)
        let dok: { dokument_pfad: string; dokument_name: string } | null = null;
        if (r.final_path) {
          const bytes = await laden(db, r.final_bucket || BUCKET, r.final_path);
          const p = `${objekt.id}/${r.id}-${Date.now()}.pdf`;
          const { error } = await db.storage.from("sepa-mandates").upload(p, bytes, { contentType: "application/pdf", upsert: true });
          if (!error) dok = { dokument_pfad: p, dokument_name: `SEPA-Mandat ${r.vorlage.mandatsreferenz} (${r.nummer}).pdf` };
        }
        for (const aid of ids) {
          const { data: vorh } = await db.from("sepa_mandates").select("id, mandatsreferenz, status").eq("building_id", objekt.id).eq("assignment_id", aid).in("status", ["aktiv", "pruefen"]);
          const gleich = (vorh ?? []).find((m: Body) => m.mandatsreferenz === r.vorlage.mandatsreferenz);
          if (gleich) {
            const { error } = await db.from("sepa_mandates").update({ ...daten, ...(dok ?? {}) }).eq("id", gleich.id);
            if (error) throw new Fehler(500, `Mandat konnte nicht aktualisiert werden: ${error.message}`);
          } else {
            for (const m of vorh ?? []) {
              if (m.status === "aktiv") await db.from("sepa_mandates").update({ status: "ersetzt", updated_at: jetzt }).eq("id", m.id);
            }
            const { error } = await db.from("sepa_mandates").insert({
              building_id: objekt.id, assignment_id: aid, contact_id: e.contact_id, mandatsreferenz: r.vorlage.mandatsreferenz,
              created_by: uuidOderNull(userId), ...daten, ...(dok ?? {}),
            });
            if (error) throw new Fehler(500, `Mandat konnte nicht angelegt werden: ${error.message}`);
          }
        }
        erledigt.push(`SEPA-Mandat ${r.vorlage.mandatsreferenz} aktiv (${ibanGruppiert(iban)}, unterschrieben ${datum(tag)})`);
        break;
      }
      case "bankkonto": {
        const sepa = r.vorlage.art === "sepa_mandat";
        await kontoSpeichern(f(sepa ? "iban" : "bank_iban")!, f(sepa ? "kontoinhaber" : "bank_inhaber"), f(sepa ? "bic" : "bank_bic")?.toUpperCase() ?? null, f(sepa ? "kreditinstitut" : "bank_name"));
        erledigt.push(`Bankverbindung ${a.neu}`);
        break;
      }
      case "adresse": {
        const n = { strasse: f("strasse"), ...plzOrt(f("plz_ort")) };
        if (e.override.adresse) {
          await db.from("contact_building_assignments").update({ address_street_override: n.strasse, address_zip_override: n.plz || null, address_city_override: n.ort })
            .in("id", ids);
        } else {
          await db.from("contacts").update({ address_street: n.strasse, address_zip: n.plz || null, address_city: n.ort, updated_at: jetzt }).eq("id", e.contact_id);
        }
        erledigt.push(`Anschrift ${a.neu}`);
        break;
      }
      case "telefon":
      case "mobil": {
        const nummer = norm(a.neu);
        if (e.override.telefon) {
          const { data: z } = await db.from("contact_building_assignments").select("id, phones_override").in("id", ids);
          for (const x of z ?? []) {
            if (!Array.isArray(x.phones_override)) continue;
            await db.from("contact_building_assignments").update({ phones_override: [...x.phones_override, { number: nummer, note: a.label }] }).eq("id", x.id);
          }
        } else {
          await db.from("contact_phones").insert({ contact_id: e.contact_id, phone_number: nummer, label: a.key === "mobil" ? "Mobil" : "Festnetz", note: `aus ${r.nummer}` });
        }
        erledigt.push(`${a.label} ${nummer}`);
        break;
      }
      case "email": {
        const mail = norm(a.neu).toLowerCase();
        if (e.override.email) {
          const { data: z } = await db.from("contact_building_assignments").select("id, emails_override").in("id", ids);
          for (const x of z ?? []) {
            if (!Array.isArray(x.emails_override)) continue;
            const rest = x.emails_override.filter((m: Body) => String(m?.address ?? "").toLowerCase() !== mail);
            await db.from("contact_building_assignments").update({ emails_override: [{ address: mail }, ...rest] }).eq("id", x.id);
          }
        } else {
          const { data: vorh } = await db.from("contact_emails").select("id, email").eq("contact_id", e.contact_id);
          const da = (vorh ?? []).find((m: Body) => String(m.email).toLowerCase() === mail);
          await db.from("contact_emails").update({ is_primary: false }).eq("contact_id", e.contact_id);
          if (da) await db.from("contact_emails").update({ is_primary: true }).eq("id", da.id);
          else await db.from("contact_emails").insert({ contact_id: e.contact_id, email: mail, is_primary: true, label: "Privat", note: `aus ${r.nummer}` });
        }
        erledigt.push(`E-Mail ${mail}`);
        break;
      }
      case "zustellweg": {
        const w = felder.find((x) => x.gruppe === "zustellung" && x.wert === "ja")?.option;
        await db.from("contact_building_assignments").update({ zustellweg: w }).in("id", ids);
        erledigt.push(`Zustellung ${a.neu}`);
        break;
      }
      case "nutzung": {
        const w = felder.find((x) => x.gruppe === "nutzung" && x.wert === "ja")?.option;
        const ziel = e.einheiten.filter((u) => ["Wohnung", "Gewerbe"].includes(u.art));
        const z = (ziel.length ? ziel : e.einheiten.length === 1 ? e.einheiten : []).map((u) => u.assignment_id);
        if (z.length) await db.from("contact_building_assignments").update({ usage_type: w }).in("id", z);
        erledigt.push(`Nutzung ${a.neu}`);
        break;
      }
    }
  }
  await db.from("sign_requests").update({
    vorlage: { ...r.vorlage, uebernommen_am: jetzt, uebernommen_von: uuidOderNull(userId), uebernommen: auswahl.map((a) => a.key) },
  }).eq("id", r.id);
  await ereignis(db, r.id, "stammdaten_uebernommen", `In Stammdaten übernommen: ${erledigt.join("; ")}`.slice(0, 900), {
    userId, details: { keys: auswahl.map((a) => a.key), angaben: auswahl.map((a) => ({ key: a.key, alt: a.alt, neu: a.neu })) },
  });
  return { ok: true, uebernommen: erledigt };
}

// ================================================================ SEPA-Mandat automatisch übernehmen
//
// Beim Abschluss eines SEPA-Vorgangs aus der Vorlage (abschliessen → sepaAutomatisch) werden Mandat
// und Bankverbindung ohne Klick übernommen – außer in Sonderfällen, dann bleibt es beim Dialog
// „In Stammdaten übernehmen“ und der Ersteller bekommt eine Meldung mit dem Grund:
//  - Eigentümer gehört nicht mehr zum Objekt
//  - IBAN fehlt oder ist ungültig
//  - es gibt schon ein aktives (oder zu prüfendes) Mandat mit einem anderen Konto
//  - Kontoinhaber ist nicht der Eigentümer (bzw. keine der hinterlegten Personen)
// Vorher-Stand wird in sign_requests.vorlage.auto gesichert → stammdaten_rueckgaengig stellt ihn wieder her.

/** Namen vergleichbar machen: klein, ohne Akzente/Titel/Bindewörter. */
function namensTeile(s: string | null | undefined): string[] {
  const OHNE = new Set(["dr", "prof", "herr", "frau", "hr", "fr", "und", "u", "eheleute", "ehel", "familie", "fam", "von", "van", "der", "den", "de"]);
  return norm(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ß/g, "ss")
    .replace(/[^a-z0-9& -]/g, " ").split(/[\s&-]+/).filter((t) => t.length >= 2 && !OHNE.has(t));
}

/** Ist der Kontoinhaber der Eigentümer (oder eine hinterlegte Person)? Teilmenge der Namensteile genügt. */
export function gleichePerson(inhaber: string | null, namen: (string | null | undefined)[]): boolean {
  const a = namensTeile(inhaber);
  if (!a.length) return false;
  return namen.some((n) => {
    const b = namensTeile(n);
    if (!b.length) return false;
    return a.every((t) => b.includes(t)) || b.every((t) => a.includes(t));
  });
}

type Zeile = Record<string, unknown> & { id: string };
const MANDAT_SPALTEN = ["status", "kontoinhaber", "iban", "bic", "unterschrieben_am", "dokument_pfad", "dokument_name", "quelle", "notiz", "sign_request_id", "assignment_id", "contact_id"];
const KONTO_SPALTEN = ["account_holder", "iban", "bic", "bank_name", "is_default"];
const auswahlVon = (z: Zeile, spalten: string[]) => Object.fromEntries(spalten.filter((k) => k in z).map((k) => [k, z[k]]));

async function sepaStand(db: Db, objektId: string, contactId: string, ids: string[], referenz: string) {
  const [{ data: m1 }, { data: m2 }, { data: konten }, { data: zuordnungen }] = await Promise.all([
    db.from("sepa_mandates").select("*").eq("building_id", objektId).in("assignment_id", ids),
    db.from("sepa_mandates").select("*").eq("building_id", objektId).eq("mandatsreferenz", referenz),
    db.from("contact_bank_accounts").select("*").eq("contact_id", contactId),
    db.from("contact_building_assignments").select("id, bank_account_id, iban_override, iban_holder_override").in("id", ids),
  ]);
  const mandate = new Map<string, Zeile>();
  for (const m of [...(m1 ?? []), ...(m2 ?? [])] as Zeile[]) mandate.set(m.id, m);
  return { mandate: [...mandate.values()], konten: (konten ?? []) as Zeile[], zuordnungen: (zuordnungen ?? []) as Zeile[] };
}

/** Sonderfall? Liefert den Grund (Text) oder null, wenn automatisch übernommen werden darf. */
async function sepaSonderfall(db: Db, r: Body): Promise<{ grund: string } | { grund: null; daten: Awaited<ReturnType<typeof angabenBerechnen>> }> {
  let daten: Awaited<ReturnType<typeof angabenBerechnen>>;
  try {
    daten = await angabenBerechnen(db, r);
  } catch (e) {
    return { grund: e instanceof Error ? e.message : "Angaben konnten nicht gelesen werden" };
  }
  const { e, objekt, felder } = daten;
  const iban = feldWert(felder, "iban");
  if (!iban) return { grund: "Es wurde keine IBAN angegeben." };
  if (ibanFehler(iban)) return { grund: `IBAN ungültig: ${ibanFehler(iban)}` };
  const roh = ibanRoh(iban);
  const { data: vorh } = await db.from("sepa_mandates").select("mandatsreferenz, iban, status")
    .eq("building_id", objekt.id).in("assignment_id", e.einheiten.map((u) => u.assignment_id)).in("status", ["aktiv", "pruefen"]);
  const anders = (vorh ?? []).filter((m: Body) => m.iban && ibanRoh(m.iban) !== roh);
  if (anders.length) {
    return { grund: `Es gibt schon ein ${anders[0].status === "pruefen" ? "zu prüfendes" : "aktives"} Mandat mit einem anderen Konto (${anders.map((m: Body) => `${m.mandatsreferenz}: ${ibanGruppiert(m.iban)}`).join(", ")}). Soll es ersetzt werden?` };
  }
  const inhaber = feldWert(felder, "kontoinhaber");
  if (!gleichePerson(inhaber, [e.name, ...e.personen.map((p) => p.name)])) {
    return { grund: `Kontoinhaber „${inhaber ?? "–"}“ ist nicht der Eigentümer (${e.name}).` };
  }
  return { grund: null, daten };
}

/**
 * Nach dem Abschluss aufgerufen (ablauf.ts abschliessen). Wirft nie – Fehler landen im Protokoll
 * und als Meldung; dann bleibt das Übernehmen von Hand.
 */
export async function sepaAutomatisch(db: Db, requestId: string): Promise<void> {
  const { data: r } = await db.from("sign_requests").select("*, signers:sign_request_signers(*)").eq("id", requestId).maybeSingle();
  if (!r || r.status !== "abgeschlossen" || r.vorlage?.art !== "sepa_mandat" || r.vorlage?.uebernommen_am || r.vorlage?.auto) return;
  const wer = r.vorlage.name || "Eigentümer";
  const vonHand = async (grund: string) => {
    await db.from("sign_requests").update({ vorlage: { ...r.vorlage, auto_grund: grund.slice(0, 500) } }).eq("id", r.id);
    await ereignis(db, r.id, "stammdaten_pruefen", `SEPA-Mandat nicht automatisch übernommen: ${grund}`.slice(0, 900), {});
    await melden(db, r.created_by, "review_due", `SEPA-Mandat bitte prüfen: ${wer}`, `${r.nummer} · ${grund} Bitte unter „In Stammdaten übernehmen“ entscheiden.`, r.id);
  };
  try {
    const p = await sepaSonderfall(db, r);
    if (!("daten" in p)) return await vonHand(p.grund);
    const { e, objekt, angaben } = p.daten;
    const ids = e.einheiten.map((u) => u.assignment_id);
    const vorher = await sepaStand(db, objekt.id, e.contact_id, ids, r.vorlage.mandatsreferenz);
    const keys = angaben.filter((a) => a.anwendbar && ["mandat", "bankkonto"].includes(a.key)).map((a) => a.key);
    const erg = await stammdatenUebernehmen(db, { request_id: r.id, keys }, null);
    const nachher = await sepaStand(db, objekt.id, e.contact_id, ids, r.vorlage.mandatsreferenz);
    const neu = (alt: Zeile[], jetzt: Zeile[]) => jetzt.filter((x) => !alt.some((y) => y.id === x.id)).map((x) => x.id);
    const { data: akt } = await db.from("sign_requests").select("vorlage").eq("id", r.id).maybeSingle();
    await db.from("sign_requests").update({
      vorlage: {
        ...(akt?.vorlage ?? r.vorlage),
        auto: {
          am: new Date().toISOString(),
          contact_id: e.contact_id,
          vorher: {
            mandate: vorher.mandate.map((m) => ({ id: m.id, ...auswahlVon(m, MANDAT_SPALTEN) })),
            konten: vorher.konten.map((k) => ({ id: k.id, ...auswahlVon(k, KONTO_SPALTEN) })),
            zuordnungen: vorher.zuordnungen,
          },
          neu: { mandate: neu(vorher.mandate, nachher.mandate), konten: neu(vorher.konten, nachher.konten) },
        },
      },
    }).eq("id", r.id);
    await melden(db, r.created_by, "subtask_done", `SEPA-Mandat übernommen: ${wer}`,
      `${r.nummer} · ${erg.uebernommen.join("; ")}. Falls etwas nicht stimmt: im Vorgang „Rückgängig“.`, r.id);
  } catch (err) {
    console.error("[signatur] SEPA automatisch übernehmen:", err);
    await vonHand(`Automatische Übernahme fehlgeschlagen (${String(err instanceof Error ? err.message : err).slice(0, 200)}).`);
  }
}

/** stammdaten_rueckgaengig: automatische Übernahme zurücknehmen (Vorher-Stand wiederherstellen). */
export async function stammdatenRueckgaengig(db: Db, b: Body, userId: string | null) {
  const r = await vorgangMitVorlage(db, b.request_id);
  const a = r.vorlage?.auto;
  if (!a || a.rueckgaengig_am) throw new Fehler(409, "Hier gibt es keine automatische Übernahme zum Zurücknehmen.");
  const neuM: string[] = a.neu?.mandate ?? [];
  if (neuM.length) {
    const { data: genutzt } = await db.from("sepa_mandates").select("id").in("id", neuM).not("zuletzt_genutzt", "is", null);
    if (genutzt?.length) throw new Fehler(409, "Das Mandat wurde schon für einen Einzug genutzt – bitte von Hand ändern.");
  }
  const jetzt = new Date().toISOString();
  // Zuordnungen zuerst (verweisen evtl. auf neue Konten)
  for (const z of a.vorher?.zuordnungen ?? []) {
    await db.from("contact_building_assignments").update({ bank_account_id: z.bank_account_id, iban_override: z.iban_override, iban_holder_override: z.iban_holder_override }).eq("id", z.id);
  }
  if (neuM.length) await db.from("sepa_mandates").delete().in("id", neuM);
  for (const m of a.vorher?.mandate ?? []) {
    const { id, ...rest } = m;
    await db.from("sepa_mandates").update({ ...rest, updated_at: jetzt }).eq("id", id);
  }
  const neuK: string[] = a.neu?.konten ?? [];
  if (neuK.length) await db.from("contact_bank_accounts").delete().in("id", neuK);
  for (const k of a.vorher?.konten ?? []) {
    const { id, ...rest } = k;
    await db.from("contact_bank_accounts").update({ ...rest, updated_at: jetzt }).eq("id", id);
  }
  const { uebernommen_am: _a, uebernommen_von: _v, uebernommen: _u, ...vorlage } = r.vorlage;
  await db.from("sign_requests").update({ vorlage: { ...vorlage, auto: { ...a, rueckgaengig_am: jetzt, rueckgaengig_von: uuidOderNull(userId) } } }).eq("id", r.id);
  await ereignis(db, r.id, "stammdaten_rueckgaengig", "Automatische Übernahme des SEPA-Mandats zurückgenommen – vorheriger Stand wiederhergestellt", { userId });
  return { ok: true };
}

// Für Tests ohne Datenbank (z. B. Layout prüfen)
export const _intern = { sepaPdf, stammdatenPdf };
