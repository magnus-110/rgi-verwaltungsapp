// antwort-vorschlag – KI-Antwortvorschlag je eingegangener Mail + Abgleich mit der tatsächlich gesendeten Antwort.
//
// Ablauf je Mail:
//   1. Akte zusammenstellen: Mail + Anhänge, früherer Schriftverkehr mit dem Absender (auch unsere eigenen
//      Antworten = Stilvorlage), Kontakt + Einheiten, Objekt (Stammdaten, Dienstleister, Versammlungen,
//      offene Vorgänge), Rechnungen des Absenders, Dokumentliste des Objekts.
//   2. Mistral schreibt den Entwurf und schätzt ein: sicher / Entwurf mit Lücken / keine Antwort möglich.
//   3. Feste Regeln prüfen nach (Geld, Freigaben, Platzhalter → nie „sicher“).
//   4. Ergebnis in email_antwort_vorschlaege. Die App zeigt einen Punkt in der Liste und setzt den Entwurf
//      erst beim Klick auf „Antworten“ ein.
// Abgleich: Geht eine Antwort auf eine Mail mit Vorschlag raus, wird ihr Text gespeichert und mit dem
// Vorschlag verglichen (aehnlichkeit 0–1). Daraus entsteht die Auswertung nach 2/4 Wochen.
//
// Aufruf: {} (Zeitplan: neue Mails + Abgleich) · { email_ids: [...] } (gezielt, überschreibt) · { abgleich: true }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireStaffOrCron } from "../_shared/require-cron.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODELL = "mistral-medium-3-5";
const JE_LAUF = 6;

const ohneHtml = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Nur der neue Teil einer Mail: ohne zitierten Verlauf („Am … schrieb“, „>“-Zeilen, Ursprüngliche Nachricht). */
function nurNeuerText(text: string): string {
  const t = text.replace(/\r/g, "");
  const marken = [
    /\n-{2,}\s*(Ursprüngliche|Weitergeleitete|Original)\s+(Nachricht|Message)/i,
    /\nAm .{5,120}schrieb[^\n]*:/i,
    /\nOn .{5,120}wrote:/i,
    /\nVon:\s.+\n(Gesendet|Datum|An):/i,
    /\nFrom:\s.+\n(Sent|Date|To):/i,
    /\n_{10,}/,
  ];
  let ende = t.length;
  for (const m of marken) {
    const r = t.match(m);
    if (r && r.index !== undefined && r.index < ende) ende = r.index;
  }
  return t
    .slice(0, ende)
    .split("\n")
    .filter((z) => !z.trim().startsWith(">"))
    .join("\n")
    .trim();
}

/** Text der gesendeten Antwort ohne Gruß/Signatur – für den Vergleich. */
function antwortKern(text: string): string {
  let t = nurNeuerText(text);
  const gruss = t.search(/\n\s*(Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße|Beste Grüße|Liebe Grüße|Herzliche Grüße|Für Rückfragen)/i);
  if (gruss > 0) t = t.slice(0, gruss);
  return t.trim();
}

/** Wortüberlappung 0–1 (Dice) auf Inhaltswörtern. */
function aehnlichkeit(a: string, b: string): number {
  const woerter = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-zäöüß0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const A = woerter(a), B = woerter(b);
  if (!A.size || !B.size) return 0;
  let gemeinsam = 0;
  A.forEach((w) => { if (B.has(w)) gemeinsam++; });
  return Math.round((2 * gemeinsam / (A.size + B.size)) * 100) / 100;
}

const kurz = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n) + " …" : t;
};
const datum = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "";

const SYSTEM = `Du bist Mitarbeiter der Hausverwaltung RGI Immobilien in Pfronten (WEG-Verwaltung, Mietverwaltung, Makler).
Du bereitest eine Antwort auf eine eingegangene E-Mail vor. Ein Mensch prüft sie, bevor sie verschickt wird.

So schreibst du:
- Auf Deutsch, im SCHREIBSTIL der Person, deren Postfach die Mail bekommen hat (steht am Ende, falls vorhanden). Gibt es frühere Antworten an diesen Absender, gilt deren Anrede (Du/Sie, Vorname/Nachname) vorrangig.
- Beginne mit der Anrede (z. B. „Hallo Herr Müller,“ oder „Sehr geehrte Frau Maier,“). KEINE Grußformel, KEIN Name, KEINE Signatur am Ende – die werden automatisch angefügt.
- Nutze NUR Fakten aus der Akte unten. Erfinde nie Termine, Beträge, Namen, Telefonnummern, Fristen oder Zusagen.
- Fehlt eine Information, setze einen Platzhalter in eckigen Klammern, z. B. [Termin einsetzen] oder [Betrag prüfen].
- Behaupte nie, dass etwas schon erledigt ist (überwiesen, beauftragt, weitergeleitet), wenn das nicht in der Akte steht.
- Keine Zahlungszusagen, keine Preis- oder Auftragsfreigaben, keine verbindlichen Rechtsauskünfte – dort Platzhalter oder „wir prüfen das und melden uns“.
- Sage nie zu, dass jemand von uns vor Ort ist, zu einem Termin kommt oder etwas erledigt, wenn das nicht ausdrücklich in der Akte steht. Wer vor Ort ansprechbar ist (Mieter, Hausmeister, Dienstleister), steht in der Akte – sonst Platzhalter.
- Du kannst keine Anhänge mitschicken, nichts weiterleiten, nichts ablegen und nichts eintragen. Schreibe nie „anbei“, „im Anhang“, „habe weitergeleitet“, „leite weiter“, „abgelegt“, „eingetragen“ als Tatsache. Braucht die Antwort einen Anhang oder eine Handlung, schreibe einen Platzhalter, z. B. [Anhang beifügen: SEPA-Mandat] oder [an Hausmeister weiterleiten].
- Terminzusagen und Teilnahmebestätigungen nur mit Platzhalter [Termin prüfen].
- Gewohnheit der Verwaltung: Schickt ein Geschäftspartner, Eigentümer oder Mieter persönlich etwas oder bestätigt etwas, bedankt sich die Verwaltung kurz (Formulierung wie im Schreibstil, z. B. „Hallo Frau Josko,\n\nsuper, vielen Dank!“). Das ist eine eigene, kurze Antwort (antwort_noetig = true, meist "sicher"). Hänge diesen Dank NICHT an andere, längere Antworten an.
- Nach der Anrede mit Komma geht es klein weiter („Hallo Herr Müller,\n\nvielen Dank …“), außer bei Substantiven und „Sie“.

Einschätzung (stufe):
- "sicher": Die Antwort ist vollständig und stimmt nach der Akte – ein Mensch muss nur noch kurz drüberlesen. Typisch: Bestätigungen, Dank, Weitergabe vorhandener Kontaktdaten/Termine/Unterlagen, Auskünfte, die eindeutig in der Akte stehen.
- "entwurf": Ein brauchbarer Text ist möglich, aber ein Mensch muss etwas ergänzen oder entscheiden (Platzhalter vorhanden, Termin, Geld, Freigabe, Rechtsfrage, Handlung nötig).
- "keine": Ohne den Menschen lässt sich nichts Sinnvolles schreiben (Wissen fehlt völlig, persönliche Absprache, heikler Konflikt). Dann entwurf leer lassen.
antwort_noetig = false nur bei automatischen Mails (Portale, Systeme, noreply), Newslettern, Mails, in denen wir nur in CC stehen, und wenn der Absender sich selbst nur bedankt oder „OK“ sagt (Gesprächsende).
Im Zweifel die vorsichtigere Stufe wählen.`;

const TOOL = {
  type: "function",
  function: {
    name: "antwort_vorschlag",
    description: "Antwortvorschlag und Einschätzung",
    parameters: {
      type: "object",
      properties: {
        antwort_noetig: { type: "boolean" },
        stufe: { type: "string", enum: ["sicher", "entwurf", "keine"] },
        entwurf: { type: "string", description: "Antworttext ab der Anrede, ohne Gruß und Signatur. Leer bei stufe keine." },
        fehlende_infos: { type: "string", description: "Was fehlt oder vom Menschen zu tun ist (kurz). Leer wenn nichts." },
        begruendung: { type: "string", description: "Ein Satz, warum diese Stufe." },
        schritte: {
          type: "array",
          description: "0–3 sinnvolle nächste Schritte, die ein Mensch mit einem Klick bestätigt. Nur wenn wirklich passend.",
          items: {
            type: "object",
            properties: {
              typ: { type: "string", enum: ["anhang", "weiterleiten", "wiedervorlage"] },
              titel: { type: "string", description: "Kurz, z. B. „Protokoll 2025 beifügen“, „An Hausmeister Huber weiterleiten“, „Wiedervorlage: Rückmeldung Versicherung“" },
              datei_id: { type: "string", description: "nur anhang: id aus dms_suchen" },
              an_email: { type: "string", description: "nur weiterleiten: E-Mail-Adresse aus der Akte oder adressen_suchen" },
              an_name: { type: "string" },
              text: { type: "string", description: "weiterleiten: kurzer Begleittext ab Anrede, ohne Gruß; wiedervorlage: Notiz" },
              datum: { type: "string", description: "nur wiedervorlage: YYYY-MM-DD" },
            },
            required: ["typ", "titel"],
            additionalProperties: false,
          },
        },
      },
      required: ["antwort_noetig", "stufe", "entwurf", "fehlende_infos", "begruendung"],
      additionalProperties: false,
    },
  },
};

/** Lese-Werkzeuge: die KI entscheidet selbst, wo sie nachschaut (nur lesen, nichts ändern). */
const LESE_TOOLS = [
  {
    type: "function",
    function: {
      name: "adressen_suchen",
      description: "Sucht unter Adressen (Kontakte: Eigentümer, Mieter, Handwerker, Dienstleister, Versicherungen, Behörden) nach Name, Firma oder Gewerk (z. B. hausmeister, heizung, winterdienst, kaminkehrer, elektro, ablesedienst). Liefert E-Mail, Telefon und Zuordnung zu Objekten.",
      parameters: { type: "object", properties: { suchbegriff: { type: "string" }, gewerk: { type: "string" } }, required: ["suchbegriff"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "dms_suchen",
      description: "Durchsucht die Dokumente im DMS (Dateiname und Inhalt), z. B. Protokoll, Teilungserklärung, Wirtschaftsplan, Abrechnung, Vertrag, Versicherungsschein. Liefert datei_id, Name, Objekt, Jahr und Textauszug.",
      parameters: { type: "object", properties: { suchbegriff: { type: "string" }, gebaeude_id: { type: "string" } }, required: ["suchbegriff"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "mails_suchen",
      description: "Durchsucht alle E-Mails (auch mit anderen Absendern) nach einem Begriff, z. B. Schadennummer, Rechnungsnummer, Name, Thema. Liefert Datum, Absender, Betreff, Auszug.",
      parameters: { type: "object", properties: { suchbegriff: { type: "string" } }, required: ["suchbegriff"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "zahlungen_suchen",
      description: "Sucht Kontobewegungen der verwalteten Konten nach Name oder Verwendungszweck (letzte 12 Monate), z. B. ob ein Eigentümer/Mieter gezahlt hat oder eine Rechnung überwiesen wurde.",
      parameters: { type: "object", properties: { suchbegriff: { type: "string" } }, required: ["suchbegriff"], additionalProperties: false },
    },
  },
];
const MAX_RUNDEN = 5;

const SYSTEM_WERKZEUGE = `

Werkzeuge: Du kannst vor der Antwort selbst nachschlagen (adressen_suchen, dms_suchen, mails_suchen, zahlungen_suchen) – nur wenn es für die Antwort oder einen Schritt wirklich nötig ist, höchstens 4 Suchen. Danach rufst du antwort_vorschlag auf.
Schritte (schritte), nur wenn eindeutig sinnvoll:
- "anhang": Ein Dokument aus dem DMS gehört zur Antwort (z. B. angefragtes Protokoll). datei_id MUSS aus dms_suchen stammen. Im Entwurf dann ohne Platzhalter „anbei … “ schreiben ist erlaubt.
- "weiterleiten": Die Mail sollte an einen zuständigen Dienstleister/Hausmeister/Kollegen. an_email MUSS aus der Akte oder adressen_suchen stammen. text = kurzer Begleittext im Schreibstil.
- "wiedervorlage": Etwas muss nachverfolgt werden (Rückmeldung abwarten, Frist). datum in den nächsten 1–30 Tagen.
Erfinde nie IDs oder Adressen.`;

// Was nie „sicher“ sein darf, auch wenn die KI es so einschätzt.
const HEIKEL = /(\b(melde|kümmere|bespreche|kläre|prüfe|schicke|sende|bereite|organisiere|rufe|komme|frage)\b[^.]{0,40}|anbei|im anhang|angehängt|beigefügt|weiterleit|leite[^.]{0,40}weiter|abgelegt|eingetragen|teilnahme|bestätigen[^.]{0,40}termin|\b(ich|wir) (bin|sind|komme|kommen|werde|werden|kümmere|kümmern|melde|melden)\b|vor ort|\[[^\]]{2,}\]|\b\d{1,3}(\.\d{3})*,\d{2}\s?(€|eur)|überwies|überweisen|freigabe|freigeben|beauftrag|auftrag erteil|rechtlich|anwalt|kündig|mahnung|mahnbescheid)/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireStaffOrCron(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const KEY = Deno.env.get("MISTRAL_API_KEY");
  if (!KEY) return json({ error: "MISTRAL_API_KEY fehlt" }, 500);

  const body = await req.json().catch(() => ({}));
  const { data: konten } = await db.from("email_accounts").select("id, email_address, display_name");
  const eigene = new Set((konten ?? []).map((k: any) => String(k.email_address || "").toLowerCase()));

  // ---------- Abgleich mit gesendeten Antworten ----------
  const abgleich = async () => {
    const { data: offen } = await db
      .from("email_antwort_vorschlaege")
      .select("email_id, entwurf, stufe, emails!email_antwort_vorschlaege_email_id_fkey(message_id_header, message_id)")
      .is("antwort_email_id", null)
      .gte("erstellt_am", new Date(Date.now() - 60 * 86400000).toISOString())
      .limit(500);
    let n = 0;
    for (const v of offen ?? []) {
      const e: any = (v as any).emails;
      const ids = [e?.message_id_header, e?.message_id, e?.message_id_header ? `<${e.message_id_header}>` : null].filter(Boolean);
      if (!ids.length) continue;
      const { data: antw } = await db
        .from("emails")
        .select("id, from_address, body_text, body_html, date")
        .in("in_reply_to", ids as string[])
        .is("deleted_at", null)
        .order("date", { ascending: true })
        .limit(5);
      const a = (antw ?? []).find((x: any) => eigene.has(String(x.from_address || "").toLowerCase()));
      if (!a) continue;
      const text = antwortKern(a.body_text || ohneHtml(a.body_html));
      await db
        .from("email_antwort_vorschlaege")
        .update({
          antwort_email_id: a.id,
          antwort_text: text.slice(0, 8000),
          aehnlichkeit: v.entwurf ? aehnlichkeit(v.entwurf, text) : null,
          ausgewertet_am: new Date().toISOString(),
        })
        .eq("email_id", v.email_id);
      n++;
    }
    return n;
  };

  if (body?.abgleich) return json({ ok: true, abgeglichen: await abgleich() });

  // ---------- Welche Mails? ----------
  let ids: string[] = Array.isArray(body?.email_ids) ? body.email_ids : [];
  if (!ids.length) {
    const seit = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: kand } = await db
      .from("emails")
      .select("id, from_address, ai_category, has_attachments, created_at")
      .gte("date", seit)
      .is("deleted_at", null)
      .eq("is_draft", false)
      .not("ai_category", "is", null)
      .order("date", { ascending: false })
      .limit(200);
    const kandidaten = (kand ?? []).filter(
      (m: any) => !eigene.has(String(m.from_address || "").toLowerCase()) && !["Werbung", "Newsletter"].includes(m.ai_category),
    );
    if (kandidaten.length) {
      const { data: schon } = await db.from("email_antwort_vorschlaege").select("email_id").in("email_id", kandidaten.map((k: any) => k.id));
      const fertig = new Set((schon ?? []).map((s: any) => s.email_id));
      for (const k of kandidaten) {
        if (fertig.has(k.id)) continue;
        // Anhänge erst lesen lassen (max. 20 Minuten warten)
        if (k.has_attachments && Date.now() - new Date(k.created_at).getTime() < 20 * 60000) {
          const { data: offenAnh } = await db
            .from("email_attachments")
            .select("id")
            .eq("email_id", k.id)
            .eq("is_inline", false)
            .is("text_status", null)
            .limit(1);
          if (offenAnh?.length) continue;
        }
        ids.push(k.id);
        if (ids.length >= JE_LAUF) break;
      }
    }
  }

  const ergebnisse: any[] = [];
  for (const id of ids) {
    const start = Date.now();
    try {
      const r = await vorschlagFuer(db, KEY, id, eigene, konten ?? []);
      await db.from("email_antwort_vorschlaege").upsert({ email_id: id, ...r, modell: MODELL, dauer_ms: Date.now() - start, fehler: null, erstellt_am: new Date().toISOString() });
      ergebnisse.push({ id, stufe: r.stufe });
    } catch (e: any) {
      console.error("antwort-vorschlag", id, e?.message);
      await db.from("email_antwort_vorschlaege").upsert({ email_id: id, stufe: null, fehler: String(e?.message || e).slice(0, 500), modell: MODELL, dauer_ms: Date.now() - start });
      ergebnisse.push({ id, fehler: e?.message });
    }
  }

  const abgeglichen = Array.isArray(body?.email_ids) ? 0 : await abgleich();
  return json({ ok: true, ergebnisse, abgeglichen });
});

async function vorschlagFuer(db: any, KEY: string, id: string, eigene: Set<string>, konten: any[]) {
  const { data: m, error } = await db
    .from("emails")
    .select("id, account_id, subject, from_address, from_name, to_addresses, cc_addresses, date, body_text, body_html, building_id, contact_id, case_id, ai_category, in_reply_to")
    .eq("id", id)
    .single();
  if (error || !m) throw new Error("Mail nicht gefunden");
  const partner = String(m.from_address || "").toLowerCase();
  const konto = konten.find((k) => k.id === m.account_id);
  const quellen: Record<string, unknown> = {};
  const { data: stilZeile } = await db.from("email_schreibstile").select("profil").eq("account_id", m.account_id).maybeSingle();
  const stil = stilZeile?.profil
    ? `\n\nSCHREIBSTIL VON ${konto?.display_name || "der Person"} (so klingt die Antwort; Grußformel und Signatur trotzdem weglassen):\n${stilZeile.profil}`
    : "";
  const akte: string[] = [];

  akte.push(`HEUTE: ${datum(new Date().toISOString())}`);
  akte.push(`UNSER POSTFACH: ${konto?.display_name || ""} <${konto?.email_address || ""}>`);

  // Anhänge
  const { data: anh } = await db
    .from("email_attachments")
    .select("file_name, extracted_text")
    .eq("email_id", id)
    .eq("is_inline", false)
    .limit(6);
  const anhText = (anh ?? [])
    .map((a: any) => `- ${a.file_name}${a.extracted_text ? `:\n${kurz(a.extracted_text, 2500)}` : " (Inhalt nicht lesbar)"}`)
    .join("\n");

  // Früherer Schriftverkehr mit diesem Absender (beide Richtungen)
  const { data: verlauf } = await db
    .from("emails")
    .select("id, date, from_address, subject, body_text, body_html")
    .is("deleted_at", null)
    .lt("date", m.date)
    .gte("date", new Date(new Date(m.date).getTime() - 365 * 86400000).toISOString())
    .or(`from_address.ilike.${partner},to_addresses.cs.${JSON.stringify([partner])}`)
    .order("date", { ascending: false })
    .limit(12);
  quellen.verlauf = (verlauf ?? []).map((v: any) => v.id);
  const verlaufText = (verlauf ?? [])
    .reverse()
    .map((v: any) => {
      const vonUns = eigene.has(String(v.from_address || "").toLowerCase());
      return `[${datum(v.date)}] ${vonUns ? "WIR an Absender" : "ABSENDER an uns"} – ${v.subject || ""}\n${kurz(nurNeuerText(v.body_text || ohneHtml(v.body_html)), 900)}`;
    })
    .join("\n\n");

  // Kontakt
  let kontaktText = "";
  let buildingIds: string[] = m.building_id ? [m.building_id] : [];
  if (m.contact_id) {
    const [{ data: k }, { data: zu }, { data: tel }] = await Promise.all([
      db.from("contacts").select("salutation, first_name, last_name, company_name, address_street, address_zip, address_city, contact_type, notes").eq("id", m.contact_id).maybeSingle(),
      db.from("contact_building_assignments").select("building_id, unit_number, role_in_building, is_beirat, is_active, buildings(name)").eq("contact_id", m.contact_id),
      db.from("contact_phones").select("phone_number, label").eq("contact_id", m.contact_id),
    ]);
    if (k) {
      kontaktText = `${[k.salutation, k.first_name, k.last_name].filter(Boolean).join(" ")}${k.company_name ? ` (${k.company_name})` : ""}, ${[k.address_street, k.address_zip, k.address_city].filter(Boolean).join(" ")}; Typ: ${k.contact_type || "-"}`;
      if (k.notes) kontaktText += `\nNotiz: ${kurz(k.notes, 300)}`;
      for (const z of zu ?? []) {
        kontaktText += `\n- ${(z as any).buildings?.name || ""}: Einheit ${z.unit_number || "-"}, Rolle ${z.role_in_building || "-"}${z.is_beirat ? ", Beirat" : ""}${z.is_active === false ? " (nicht mehr aktiv)" : ""}`;
        if (z.building_id && !buildingIds.includes(z.building_id)) buildingIds.push(z.building_id);
      }
      if (tel?.length) kontaktText += `\nTelefon: ${tel.map((t: any) => `${t.phone_number}${t.label ? ` (${t.label})` : ""}`).join(", ")}`;
    }
  }
  buildingIds = buildingIds.slice(0, 2);

  // Objekt(e)
  const objektTexte: string[] = [];
  for (const bid of buildingIds) {
    const [{ data: b }, { data: dl }, { data: etv }, { data: faelle }, { data: dok }] = await Promise.all([
      db.from("buildings").select("name, address, postal_code, city, manager_name, general_notes, etv_default_location, unit_count, heating_type, management_start_date").eq("id", bid).maybeSingle(),
      db.from("contact_building_assignments").select("service_category, is_active, emails_override, phones_override, contacts(id, first_name, last_name, company_name)").eq("building_id", bid).eq("role_in_building", "dienstleister").limit(25),
      db.from("etv_meetings").select("title, meeting_date, location, status, invitation_sent_at").eq("building_id", bid).order("meeting_date", { ascending: false }).limit(3),
      db.from("cases").select("title, status, ai_summary, updated_at").eq("building_id", bid).in("status", ["open", "in_progress", "waiting_external"]).order("updated_at", { ascending: false }).limit(6),
      db.from("building_files").select("display_name, fiscal_year, created_at").eq("building_id", bid).is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
    ]);
    if (!b) continue;
    let t = `OBJEKT [gebaeude_id ${bid}] ${b.name} (${[b.address, b.postal_code, b.city].filter(Boolean).join(" ")}), ${b.unit_count ?? "?"} Einheiten, Heizung ${b.heating_type || "?"}, Verwalter ${b.manager_name || "?"}`;
    if (b.general_notes) t += `\nNotizen: ${kurz(b.general_notes, 600)}`;
    if (dl?.length) {
      const kontaktIds = dl.map((d: any) => d.contacts?.id).filter(Boolean);
      const { data: mails } = kontaktIds.length ? await db.from("contact_emails").select("contact_id, email").in("contact_id", kontaktIds) : { data: [] };
      t += `\nZuständige Dienstleister: ${dl
        .filter((d: any) => d.is_active !== false)
        .map((d: any) => {
          const c = d.contacts || {};
          const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ");
          const mail = (mails ?? []).find((x: any) => x.contact_id === c.id)?.email || (Array.isArray(d.emails_override) ? d.emails_override[0] : "");
          return `${d.service_category || "?"}: ${name}${mail ? ` <${mail}>` : ""}`;
        })
        .join("; ")}`;
    }
    if (etv?.length) t += `\nVersammlungen: ${etv.map((e: any) => `${e.title || "ETV"} am ${datum(e.meeting_date)} in ${e.location || b.etv_default_location || "?"} (${e.status || ""}${e.invitation_sent_at ? ", Einladung verschickt" : ""})`).join("; ")}`;
    if (faelle?.length) t += `\nOffene Vorgänge: ${faelle.map((f: any) => `${f.title} [${f.status}]${f.ai_summary ? `: ${kurz(f.ai_summary, 160)}` : ""}`).join(" | ")}`;
    if (dok?.length) t += `\nDokumente im DMS (Auszug): ${dok.map((d: any) => d.display_name + (d.fiscal_year ? ` (${d.fiscal_year})` : "")).join("; ")}`;
    objektTexte.push(t);
  }
  quellen.objekte = buildingIds;

  // Rechnungen dieses Absenders (Handwerker/Lieferanten)
  let rechnungText = "";
  const firma = (m.from_name || "").replace(/["<>]/g, "").trim();
  if (firma.length >= 4 && ["Rechnung", "Handwerker", "Sonstiges", "Anfrage"].includes(m.ai_category || "")) {
    const { data: rg } = await db
      .from("invoices")
      .select("invoice_number, invoice_date, gross_amount, status, paid_at, vendor_name")
      .ilike("vendor_name", `%${firma.split(/\s+/).slice(-1)[0]}%`)
      .order("invoice_date", { ascending: false })
      .limit(6);
    if (rg?.length) rechnungText = rg.map((r: any) => `Nr. ${r.invoice_number || "?"} vom ${datum(r.invoice_date)} über ${r.gross_amount ?? "?"} € – ${r.status}${r.paid_at ? `, bezahlt am ${datum(r.paid_at)}` : ""}`).join("\n");
  }

  const neu = nurNeuerText(m.body_text || ohneHtml(m.body_html));
  const nutzer = [
    `EINGEGANGENE MAIL (${datum(m.date)})`,
    `Von: ${m.from_name || ""} <${m.from_address}>`,
    `An: ${(m.to_addresses || []).join(", ")}${m.cc_addresses?.length ? ` · CC: ${m.cc_addresses.join(", ")}` : ""}`,
    `Betreff: ${m.subject || ""}`,
    `Kategorie: ${m.ai_category || "-"}`,
    "",
    kurz(neu || ohneHtml(m.body_html), 5000),
    anhText ? `\nANHÄNGE:\n${anhText}` : "",
    "",
    "===== AKTE =====",
    akte.join("\n"),
    kontaktText ? `\nKONTAKT (Absender):\n${kontaktText}` : "\nKONTAKT: Absender ist nicht als Kontakt hinterlegt.",
    objektTexte.length ? `\n${objektTexte.join("\n\n")}` : "\nOBJEKT: keins zugeordnet.",
    rechnungText ? `\nRECHNUNGEN DIESES ABSENDERS:\n${rechnungText}` : "",
    verlaufText ? `\nFRÜHERER SCHRIFTVERKEHR MIT DEM ABSENDER (älteste zuerst):\n${verlaufText}` : "\nFRÜHERER SCHRIFTVERKEHR: keiner.",
  ].join("\n");

  // Agent-Schleife: die KI darf nachschlagen, dann muss sie antwort_vorschlag aufrufen
  const nachrichten: any[] = [
    { role: "system", content: SYSTEM + SYSTEM_WERKZEUGE + stil },
    { role: "user", content: nutzer.slice(0, 60000) },
  ];
  const fundIds = { dateien: new Set<string>(), mails: new Set<string>() };
  const suchen: string[] = [];
  let ein = 0, aus = 0, runden = 0;
  let a: any = null;
  while (!a) {
    runden++;
    const letzte = runden > MAX_RUNDEN;
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        temperature: 0.2,
        messages: nachrichten,
        tools: letzte ? [TOOL] : [...LESE_TOOLS, TOOL],
        tool_choice: letzte ? { type: "function", function: { name: "antwort_vorschlag" } } : "any",
      }),
    });
    if (!res.ok) throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = await res.json();
    ein += out.usage?.prompt_tokens ?? 0;
    aus += out.usage?.completion_tokens ?? 0;
    const msg = out.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) {
      if (letzte) throw new Error("keine Antwort der KI");
      nachrichten.push({ role: "assistant", content: msg?.content || "" });
      nachrichten.push({ role: "user", content: "Bitte rufe jetzt antwort_vorschlag auf." });
      continue;
    }
    const final = calls.find((c: any) => c.function?.name === "antwort_vorschlag");
    if (final) {
      a = JSON.parse(final.function.arguments);
      break;
    }
    nachrichten.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let args: any = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* leer */ }
      suchen.push(`${c.function.name}: ${args.suchbegriff ?? ""}`);
      let ergebnis = "";
      try {
        ergebnis = await werkzeug(db, c.function.name, args, fundIds, m.date);
      } catch (e: any) {
        ergebnis = `Fehler: ${e?.message || e}`;
      }
      nachrichten.push({ role: "tool", name: c.function.name, tool_call_id: c.id, content: ergebnis.slice(0, 6000) || "keine Treffer" });
    }
  }
  quellen.tokens = { ein, aus };
  quellen.suchen = suchen;
  const schritte = await schritteBereinigen(db, a.schritte, fundIds, kontaktAdressen(nutzer));

  // Gruß/Signatur entfernen, falls die KI sie doch geschrieben hat
  let entwurf = String(a.entwurf || "").trim();
  entwurf = entwurf
    .replace(/\n+\s*((Danke|Vielen Dank)[^\n]{0,20}(und|&)\s*)?(Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße|Beste Grüße|Liebe Grüße|Herzliche Grüße|Schöne Grüße|Grüße)[\s\S]*$/i, "")
    .trim();

  // Nach „Hallo Herr X,“ klein weiter (häufige Satzanfänge; „Sie“ und Substantive bleiben groß)
  entwurf = entwurf.replace(
    /^([^\n]{2,80},\s*\n+\s*)(Super|Vielen|Danke|Gerne|Gern|Wir|Ich|Das|Die|Der|Leider|Alles|Ja|Nein|Zu|Bitte|Herzlichen|Besten|Anbei)\b/,
    (_m, kopf, wort) => kopf + wort.charAt(0).toLowerCase() + wort.slice(1),
  );

  let stufe: string;
  if (a.antwort_noetig === false) stufe = "keine";
  else if (a.stufe === "keine" || !entwurf) stufe = "rot";
  else if (a.stufe === "sicher" && !HEIKEL.test(entwurf)) stufe = "gruen";
  else stufe = "gelb";

  return {
    antwort_noetig: a.antwort_noetig !== false,
    stufe,
    entwurf: stufe === "rot" || stufe === "keine" ? (entwurf || null) : entwurf,
    fehlende_infos: String(a.fehlende_infos || "").slice(0, 1000) || null,
    begruendung: String(a.begruendung || "").slice(0, 500) || null,
    kontext: quellen,
    schritte: stufe === "keine" ? null : (schritte.length ? schritte : null),
    runden,
  };
}

/** E-Mail-Adressen, die in der Akte stehen (dürfen als Weiterleitungsziel genutzt werden). */
function kontaktAdressen(text: string): Set<string> {
  return new Set((text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).map((x) => x.toLowerCase()));
}

async function werkzeug(db: any, name: string, args: any, fund: { dateien: Set<string>; mails: Set<string> }, bis: string): Promise<string> {
  const q = String(args.suchbegriff || "").replace(/[%,()]/g, " ").trim().slice(0, 80);
  if (!q && name !== "adressen_suchen") return "Suchbegriff fehlt";
  if (name === "adressen_suchen") {
    const gewerk = String(args.gewerk || "").toLowerCase().trim();
    let anfrage = db
      .from("contacts")
      .select("id, first_name, last_name, company_name, contact_type, service_provider_categories, contact_building_assignments(role_in_building, service_category, unit_number, is_active, buildings(name)), contact_emails(email), contact_phones(phone_number)")
      .limit(8);
    if (q) anfrage = anfrage.or(`company_name.ilike.%${q}%,last_name.ilike.%${q}%,first_name.ilike.%${q}%,short_name.ilike.%${q}%,trade_notes.ilike.%${q}%`);
    if (gewerk) anfrage = anfrage.contains("service_provider_categories", [gewerk]);
    let { data } = await anfrage;
    if ((!data || !data.length) && gewerk && q) {
      ({ data } = await db
        .from("contacts")
        .select("id, first_name, last_name, company_name, contact_type, service_provider_categories, contact_building_assignments(role_in_building, service_category, unit_number, is_active, buildings(name)), contact_emails(email), contact_phones(phone_number)")
        .contains("service_provider_categories", [gewerk])
        .limit(8));
    }
    if (!data?.length) return "keine Treffer";
    for (const c of data) for (const e of c.contact_emails ?? []) fund.mails.add(String(e.email).toLowerCase());
    return data
      .map((c: any) => {
        const name = [c.company_name, [c.first_name, c.last_name].filter(Boolean).join(" ")].filter(Boolean).join(" – ");
        const zu = (c.contact_building_assignments ?? [])
          .filter((z: any) => z.is_active !== false)
          .map((z: any) => `${z.buildings?.name || "?"}: ${z.role_in_building}${z.service_category ? ` (${z.service_category})` : ""}${z.unit_number ? ` Einheit ${z.unit_number}` : ""}`)
          .join("; ");
        return `- ${name} [${c.contact_type || "-"}${c.service_provider_categories?.length ? `, ${c.service_provider_categories.join("/")}` : ""}] E-Mail: ${(c.contact_emails ?? []).map((e: any) => e.email).join(", ") || "-"} · Tel: ${(c.contact_phones ?? []).map((p: any) => p.phone_number).join(", ") || "-"}${zu ? ` · Objekte: ${zu}` : ""}`;
      })
      .join("\n");
  }
  if (name === "dms_suchen") {
    const gid = args.gebaeude_id && /^[0-9a-f-]{36}$/i.test(args.gebaeude_id) ? args.gebaeude_id : null;
    let nachName = db.from("building_files").select("id, display_name, fiscal_year, created_at, buildings(name)").is("deleted_at", null).ilike("display_name", `%${q}%`).order("created_at", { ascending: false }).limit(8);
    if (gid) nachName = nachName.eq("building_id", gid);
    let nachText = db.from("document_chunks").select("file_id, content").ilike("content", `%${q}%`).not("file_id", "is", null).limit(8);
    if (gid) nachText = nachText.eq("building_id", gid);
    const [{ data: n }, { data: t }] = await Promise.all([nachName, nachText]);
    const zeilen: string[] = [];
    for (const f of n ?? []) {
      fund.dateien.add(f.id);
      zeilen.push(`- datei_id ${f.id}: ${f.display_name} (${(f as any).buildings?.name || "-"}${f.fiscal_year ? `, ${f.fiscal_year}` : ""}, abgelegt ${datum(f.created_at)})`);
    }
    const textIds = [...new Set((t ?? []).map((x: any) => x.file_id))].filter((id) => !fund.dateien.has(id)).slice(0, 5);
    if (textIds.length) {
      const { data: tf } = await db.from("building_files").select("id, display_name, fiscal_year, buildings(name)").in("id", textIds).is("deleted_at", null);
      for (const f of tf ?? []) {
        fund.dateien.add(f.id);
        const ausz = (t ?? []).find((x: any) => x.file_id === f.id)?.content || "";
        const i = ausz.toLowerCase().indexOf(q.toLowerCase());
        zeilen.push(`- datei_id ${f.id}: ${f.display_name} (${(f as any).buildings?.name || "-"}${f.fiscal_year ? `, ${f.fiscal_year}` : ""}) – „…${ausz.slice(Math.max(0, i - 150), i + 250).replace(/\s+/g, " ")}…“`);
      }
    }
    return zeilen.join("\n") || "keine Treffer";
  }
  if (name === "mails_suchen") {
    const { data } = await db
      .from("emails")
      .select("date, from_name, from_address, subject, body_text")
      .is("deleted_at", null)
      .lt("date", bis)
      .or(`subject.ilike.%${q}%,body_text.ilike.%${q}%`)
      .order("date", { ascending: false })
      .limit(8);
    if (!data?.length) return "keine Treffer";
    return data.map((e: any) => `- [${datum(e.date)}] ${e.from_name || ""} <${e.from_address}> – ${e.subject || ""}: ${kurz(nurNeuerText(e.body_text || "").replace(/\s+/g, " "), 400)}`).join("\n");
  }
  if (name === "zahlungen_suchen") {
    const { data } = await db
      .from("bank_transactions")
      .select("booking_date, amount, debtor_name, creditor_name, purpose, buildings(name)")
      .gte("booking_date", new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10))
      .or(`debtor_name.ilike.%${q}%,creditor_name.ilike.%${q}%,purpose.ilike.%${q}%`)
      .order("booking_date", { ascending: false })
      .limit(12);
    if (!data?.length) return "keine Treffer (Hinweis: Kontoumsätze sind nicht für alle Objekte vollständig importiert)";
    return data.map((b: any) => `- ${datum(b.booking_date)} ${Number(b.amount).toFixed(2)} € ${b.amount >= 0 ? `von ${b.debtor_name || "?"}` : `an ${b.creditor_name || "?"}`} (${b.buildings?.name || "-"}): ${kurz(b.purpose, 120)}`).join("\n");
  }
  return "unbekanntes Werkzeug";
}

/** Nur Schritte mit geprüften Angaben durchlassen (keine erfundenen Dateien/Adressen/Daten). */
async function schritteBereinigen(db: any, roh: any, fund: { dateien: Set<string>; mails: Set<string> }, akteMails: Set<string>) {
  const aus: any[] = [];
  for (const s of Array.isArray(roh) ? roh.slice(0, 3) : []) {
    const titel = String(s?.titel || "").slice(0, 120);
    if (!titel) continue;
    if (s.typ === "anhang") {
      if (!s.datei_id || !fund.dateien.has(s.datei_id)) continue;
      const { data: f } = await db.from("building_files").select("id, display_name, file_path, storage_bucket, source, mime_type").eq("id", s.datei_id).is("deleted_at", null).maybeSingle();
      if (!f) continue;
      aus.push({ typ: "anhang", titel, datei_id: f.id, name: f.display_name, pfad: f.file_path, bucket: f.storage_bucket || (f.source === "invoice" ? "invoices" : "building-files"), mime: f.mime_type });
    } else if (s.typ === "weiterleiten") {
      const ziel = String(s.an_email || "").toLowerCase().trim();
      if (!ziel || !(fund.mails.has(ziel) || akteMails.has(ziel))) continue;
      aus.push({ typ: "weiterleiten", titel, an_email: ziel, an_name: String(s.an_name || "").slice(0, 80), text: String(s.text || "").slice(0, 2000) });
    } else if (s.typ === "wiedervorlage") {
      const d = String(s.datum || "");
      const t = Date.parse(d);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(t) || t < Date.now() - 86400000 || t > Date.now() + 60 * 86400000) continue;
      aus.push({ typ: "wiedervorlage", titel, datum: d, text: String(s.text || "").slice(0, 500) });
    }
  }
  return aus;
}
