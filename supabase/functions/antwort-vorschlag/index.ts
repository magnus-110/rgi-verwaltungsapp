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
      },
      required: ["antwort_noetig", "stufe", "entwurf", "fehlende_infos", "begruendung"],
      additionalProperties: false,
    },
  },
};

// Was nie „sicher“ sein darf, auch wenn die KI es so einschätzt.
const HEIKEL = /(\b(melde|melden|kümmere|kümmern|bespreche|kläre|prüfe|schicke|sende|bereite|organisiere|rufe|komme|frage)\b[^.]{0,40}|anbei|im anhang|angehängt|beigefügt|weiterleit|leite[^.]{0,40}weiter|abgelegt|eingetragen|teilnahme|bestätigen[^.]{0,40}termin|\b(ich|wir) (bin|sind|komme|kommen|werde|werden|kümmere|kümmern|melde|melden)\b|vor ort|\[[^\]]{2,}\]|\b\d{1,3}(\.\d{3})*,\d{2}\s?(€|eur)|überwies|überweisen|freigabe|freigeben|beauftrag|auftrag erteil|rechtlich|anwalt|kündig|mahnung|mahnbescheid)/i;

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
      db.from("building_service_providers").select("name, category, phone, email").eq("building_id", bid).limit(15),
      db.from("etv_meetings").select("title, meeting_date, location, status, invitation_sent_at").eq("building_id", bid).order("meeting_date", { ascending: false }).limit(3),
      db.from("cases").select("title, status, ai_summary, updated_at").eq("building_id", bid).in("status", ["open", "in_progress", "waiting_external"]).order("updated_at", { ascending: false }).limit(6),
      db.from("building_files").select("display_name, fiscal_year, created_at").eq("building_id", bid).is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
    ]);
    if (!b) continue;
    let t = `OBJEKT ${b.name} (${[b.address, b.postal_code, b.city].filter(Boolean).join(" ")}), ${b.unit_count ?? "?"} Einheiten, Heizung ${b.heating_type || "?"}, Verwalter ${b.manager_name || "?"}`;
    if (b.general_notes) t += `\nNotizen: ${kurz(b.general_notes, 600)}`;
    if (dl?.length) t += `\nDienstleister: ${dl.map((d: any) => `${d.category || ""} ${d.name}${d.phone ? ` Tel. ${d.phone}` : ""}`).join("; ")}`;
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

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM + stil },
        { role: "user", content: nutzer.slice(0, 60000) },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "antwort_vorschlag" } },
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = await res.json();
  const call = out.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("keine Antwort der KI");
  const a = JSON.parse(call.function.arguments);
  // Verbrauch mitschreiben (für die Kostenübersicht)
  quellen.tokens = { ein: out.usage?.prompt_tokens ?? null, aus: out.usage?.completion_tokens ?? null };

  // Gruß/Signatur entfernen, falls die KI sie doch geschrieben hat
  let entwurf = String(a.entwurf || "").trim();
  entwurf = entwurf
    .replace(/\s*(Bei|Für) (weiteren )?(Rückfragen|Fragen)[^.\n]{0,60}(Verfügung|melden)[^.\n]{0,10}\.?\s*$/i, "")
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
  };
}
