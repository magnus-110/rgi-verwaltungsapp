// Eingangstür für Anfragen von der Website (und später der Nutzer-App).
// Öffentlich erreichbar (Besucher sind nicht angemeldet), deshalb mit Schutz:
//  - nur von rgi-immobilien.de (bzw. Vorschau/Entwicklung)
//  - verstecktes Feld gegen Spam-Programme, Mindest-Ausfüllzeit
//  - Begrenzung pro Gerät (gehashte IP)
//  - Größen- und Längenprüfung
// Speichert die Anfrage für den Posteingang (Ordner „Anfragen“, nur Admins)
// und schickt eine Hinweis-Mail an info@. Klappt das Speichern nicht, geht
// die Anfrage trotzdem vollständig per Mail raus – es geht nichts verloren.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { sendSystemMail } from "../_shared/system-mail.ts";
import { neueAnfrage } from "../_shared/mail-templates.ts";

const ERLAUBT = [
  /^https:\/\/(www\.)?rgi-immobilien\.de$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/,
  /^https:\/\/rgi-immobilien\.app$/,
  /^http:\/\/localhost:\d+$/,
];

const ARTEN: Record<string, "verwaltung" | "bewertung" | "suchauftrag" | "kontakt" | "objekt"> = {
  verwaltung: "verwaltung",
  bewertung: "bewertung",
  suchauftrag: "suchauftrag",
  kontakt: "kontakt",
  "kontakt-immobilie": "objekt",
  objekt: "objekt",
};

const ART_TITEL: Record<string, string> = {
  verwaltung: "Verwaltungsanfrage",
  bewertung: "Bewertungsanfrage",
  suchauftrag: "Suchauftrag",
  kontakt: "Kontaktanfrage",
  objekt: "Anfrage zu einem Objekt",
};

// Verständliche Bezeichnungen für die Felder der Formulare.
const LABELS: Record<string, string> = {
  serviceType: "Art der Verwaltung",
  units: "Einheiten",
  garages: "Garagen / Stellplätze",
  location: "Ort",
  address: "Adresse",
  startDate: "Beginn",
  reason: "Grund",
  ownerRelation: "Verhältnis unter den Eigentümern",
  buildingAge: "Alter des Hauses",
  isBeirat: "Im Beirat",
  wuensche: "Wünsche / Anmerkungen",
  anliegen: "Anliegen",
  nachricht: "Nachricht",
  message: "Nachricht",
  property_title: "Objekt",
  property_address: "Objekt-Ort",
  immobilienart: "Immobilienart",
  hausart: "Hausart",
  wohnungsart: "Wohnungsart",
  gewerbeimmobilienart: "Gewerbeart",
  wohnflaeche: "Wohnfläche",
  grundstuecksflaeche: "Grundstücksfläche",
  grundstuecksgroesse: "Grundstücksgröße",
  gewerbeflaehe: "Gewerbefläche",
  nutzflaeche: "Nutzfläche",
  etage: "Etage",
  zimmeranzahl: "Zimmer",
  baujahr: "Baujahr",
  zustand: "Zustand",
  ausstattungsqualitaet: "Ausstattung",
  extras: "Extras",
  ausstattung: "Ausstattung",
  erschliessung: "Erschließung",
  bebaubarkeit: "Bebaubarkeit",
  bebauungsgebiet: "Bebauungsgebiet",
  aktuelleNutzung: "Aktuelle Nutzung",
  nutzungsart: "Nutzungsart",
  ort: "Ort",
  umkreis: "Umkreis (km)",
  kaltmiete: "Kaltmiete bis",
  bonitaet: "Bonität",
  einkommen: "Einkommen",
};

const AUSLASSEN = new Set([
  "firstName", "lastName", "vorname", "nachname", "name", "email", "phone", "telefon",
  "datenschutz", "kontakt", "property_id", "hp", "website_url",
]);

const corsFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ERLAUBT.some((r) => r.test(origin)) ? origin : "https://rgi-immobilien.de",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max));

function kontaktDaten(d: any) {
  const k = d?.kontakt ?? {};
  const name =
    s(d?.name, 200) ||
    s(k?.name, 200) ||
    [s(d?.firstName, 100), s(d?.lastName, 100)].filter(Boolean).join(" ") ||
    [s(d?.vorname, 100), s(d?.nachname, 100)].filter(Boolean).join(" ");
  const email = (s(d?.email, 200) || s(k?.email, 200)).toLowerCase();
  const phone = s(d?.phone, 60) || s(d?.telefon, 60) || s(k?.telefon, 60);
  const wuensche = s(k?.wuensche, 4000);
  return { name, email, phone, wuensche };
}

function wertText(v: unknown): string {
  if (v === true) return "ja";
  if (v === false) return "nein";
  if (Array.isArray(v)) return v.map((x) => wertText(x)).filter(Boolean).join(", ");
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("strasse" in o || "ort" in o || "plz" in o) {
      return [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
    }
    return Object.values(o).map((x) => wertText(x)).filter(Boolean).join(", ");
  }
  return s(v, 2000);
}

function zeilenAus(d: Record<string, unknown>): [string, string][] {
  const z: [string, string][] = [];
  for (const [k, v] of Object.entries(d ?? {})) {
    if (AUSLASSEN.has(k)) continue;
    const t = wertText(v);
    if (!t) continue;
    z.push([LABELS[k] ?? (k === "adresse" ? "Adresse" : k), t]);
  }
  return z;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Nur POST" }, 405);
  if (!origin || !ERLAUBT.some((r) => r.test(origin))) return json({ ok: false, error: "Nicht erlaubt" }, 403);

  const raw = await req.text();
  if (raw.length > 30_000) return json({ ok: false, error: "Anfrage zu groß" }, 413);
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Ungültige Anfrage" }, 400);
  }

  const kind = ARTEN[s(body?.formType, 40)];
  if (!kind) return json({ ok: false, error: "Unbekanntes Formular" }, 400);
  const data = body?.data && typeof body.data === "object" ? body.data : {};

  // Spam: verstecktes Feld ausgefüllt oder in unter 2 Sekunden abgeschickt → so tun, als ob.
  const honeypot = s(body?.hp) || s(data?.hp) || s(data?.website_url);
  const elapsed = Number(body?.elapsed_ms);
  if (honeypot || (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 2000)) {
    console.warn("[website-anfrage] Spam verworfen", { honeypot: !!honeypot, elapsed });
    return json({ ok: true });
  }

  const { name, email, phone, wuensche } = kontaktDaten(data);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben" }, 400);
  if (!name) return json({ ok: false, error: "Bitte einen Namen angeben" }, 400);
  const datenschutz = data?.datenschutz === true || data?.kontakt?.datenschutz === true || kind === "objekt" || kind === "kontakt";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const ipHash = ip ? await sha256(`${ip}|rgi-anfrage`) : null;

  // Begrenzung: höchstens 5 Anfragen pro Gerät und Stunde.
  if (ipHash) {
    const seit = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await admin.from("inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", seit);
    if (!error && (count ?? 0) >= 5) return json({ ok: false, error: "Zu viele Anfragen. Bitte rufen Sie uns an." }, 429);
  }

  // Objekt-Anfrage: passendes Makler-Objekt finden (falls bekannt).
  let brokerPropertyId: string | null = null;
  const propId = s(data?.broker_property_id ?? data?.property_id, 60);
  if (kind === "objekt" && /^[0-9a-f-]{36}$/i.test(propId)) {
    const { data: bp } = await admin.from("broker_properties").select("id").eq("id", propId).maybeSingle();
    brokerPropertyId = bp?.id ?? null;
  }

  const attribution = body?.attribution && typeof body.attribution === "object" ? body.attribution : {};
  let inquiryId: string | null = null;
  let nummer: number | null = null;
  const { data: ins, error: insErr } = await admin
    .from("inquiries")
    .insert({
      kind,
      source: s(body?.source, 20) === "nutzer_app" ? "nutzer_app" : "website",
      name,
      email,
      phone: phone || null,
      data,
      attribution,
      page_url: s(body?.page_url, 500) || null,
      broker_property_id: brokerPropertyId,
      consent_at: datenschutz ? new Date().toISOString() : null,
      ip_hash: ipHash,
    })
    .select("id, nummer")
    .single();
  if (insErr) console.error("[website-anfrage] Speichern fehlgeschlagen:", insErr.message);
  else {
    inquiryId = ins.id;
    nummer = ins.nummer;
  }

  // Hinweis an die Admins in der App.
  if (inquiryId) {
    try {
      const { data: admins } = await admin.from("profiles").select("user_id").eq("role", "admin");
      const rows = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        type: "anfrage",
        title: `Neue ${ART_TITEL[kind]}: ${name}`,
        body: [email, phone].filter(Boolean).join(" · "),
        url: `/postfach?anfrage=${inquiryId}`,
        ref_type: "inquiry",
        ref_id: inquiryId,
      }));
      if (rows.length) await admin.from("notifications").insert(rows);
    } catch (e) {
      console.warn("[website-anfrage] Benachrichtigung fehlgeschlagen", e);
    }
  }

  // Hinweis-Mail an info@ – mit allen Angaben, falls das Speichern nicht geklappt hat.
  const zeilen: [string, unknown][] = [["Name", name], ["E-Mail", email], ["Telefon", phone], ...zeilenAus(data)];
  if (wuensche) zeilen.push(["Wünsche / Anmerkungen", wuensche]);
  const herkunft = [attribution?.kanal, attribution?.utm_campaign].filter(Boolean).join(" · ");
  if (herkunft) zeilen.push(["Herkunft", herkunft]);
  const mail = neueAnfrage({
    titel: `Neue ${ART_TITEL[kind]}${nummer ? ` #${nummer}` : ""}: ${name}`,
    zeilen,
    link: inquiryId ? `https://rgi-immobilien.app/postfach?anfrage=${inquiryId}` : "https://rgi-immobilien.app/postfach",
  });
  const sent = await sendSystemMail(admin, {
    kind: "anfrage_hinweis",
    to: "info@rgi-immobilien.de",
    replyTo: email,
    subject: mail.subject,
    html: mail.html,
    refType: "inquiry",
    refId: inquiryId,
  });

  if (!inquiryId && !sent.ok) {
    return json({ ok: false, error: "Ihre Anfrage konnte gerade nicht übermittelt werden." }, 502);
  }
  return json({ ok: true, id: inquiryId });
});
