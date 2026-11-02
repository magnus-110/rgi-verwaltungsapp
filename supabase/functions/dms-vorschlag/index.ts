// dms-vorschlag – KI-Vorschlag, wo ein Mail-Anhang im DMS abgelegt wird (Objekt, Ordner, Wirtschaftsjahr).
// Ablauf: Hinweise aus festen Regeln (Objekt der Mail, Absender ↔ Kontakte, frühere Ablagen desselben
// Absenders, gleiche Datei schon einmal abgelegt) + Text des Anhangs → Mistral wählt NUR aus den
// vorhandenen Objekten und Ordnern. Ergebnis in dms_vorschlaege; der Ablage-Dialog wählt es vor.
// Aufruf: { attachment_id } – vom Anhang-Leser (Hintergrund) oder aus dem Dialog, falls noch nichts da ist.
//
// Zweiter Fall: { sign_request_id } – unterschriebene Endfassung eines Unterschriften-Vorgangs
// (Dialog „Im DMS ablegen“ auf /unterschriften). Regeln zuerst (Quelle aus dem Firmen-DMS, Angebot der RGI,
// Objekt + Dokumentart des Vorgangs, Ordner der Quelldatei), sonst KI mit Titel/Dokumentart/Text des PDFs.
// Ergebnis in sign_requests.dms_vorschlag (einmal berechnet, beim Öffnen des Dialogs; neu = true rechnet neu).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { extractText, getDocumentProxy } from "npm:unpdf@1.8.1";
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import { DMS_SLUG, dateiname } from "../_shared/signatur/basis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Ordner, die es in jedem Objekt gibt (Soll-Struktur, siehe ensure_stammakte_categories) */
const ORDNER: Record<string, string> = {
  "stammakte-teilungserklaerung": "Teilungserklärung, Gemeinschaftsordnung, Nachträge",
  "stammakte-verwaltervertrag": "Verwaltervertrag, Vollmacht, Übergabeprotokoll",
  "stammakte-energiepass": "Energieausweis",
  "stammakte-hausordnung": "Hausordnung",
  "stammakte-plaene": "Pläne, Grundrisse, Lagepläne",
  "stammakte-schliessanlage": "Schließanlage, Schlüssel, Sicherungskarte",
  "stammakte-bank": "Bank: Kontoeröffnung, Bankunterlagen",
  "eigentuemer-grundbuch": "Grundbuchauszüge",
  "eigentuemer-kaufvertraege": "Kaufverträge, Eigentümerwechsel",
  "eigentuemer-listen": "Eigentümerlisten",
  "dienstleister-angebote": "Angebote von Handwerkern und Dienstleistern",
  "dienstleister-pruefberichte": "Prüfberichte, Gutachten, Begehungen, Mängellisten, Wartungsprotokolle",
  "dienstleister-versicherungen": "Versicherungen: Policen, Schadensmeldungen, Versicherungsschreiben",
  "dienstleister-wartung": "Wartungsverträge, Dienstleisterverträge",
  "finanzen-rechnungen": "Rechnungen und Gutschriften",
  "finanzen-kontoauszuege": "Kontoauszüge",
  "finanzen-zahlungseingaenge": "Zahlungseingänge, Mahnungen",
  "jahresbericht-gesamtabrechnung": "Gesamtabrechnung (Jahresabrechnung der WEG)",
  "jahresbericht-einzelabrechnung": "Einzelabrechnung eines Eigentümers",
  "jahresbericht-gesamt-wp": "Gesamtwirtschaftsplan",
  "jahresbericht-einzel-wp": "Einzelwirtschaftsplan",
  "jahresbericht-35a": "§35a-Bescheinigung",
  "jahresbericht-heizkosten": "Heizkostenabrechnung (Brunata, Ista, Techem …)",
  "jahresbericht-vermoegen": "Vermögensbericht",
  "versammlung-protokolle": "Protokolle von Eigentümerversammlungen",
  "versammlung-beschluesse": "Beschlüsse, Beschlusssammlung",
  "versammlung": "Einladungen, Unterlagen und Anträge zur Eigentümerversammlung",
  "schriftverkehr": "Schriftverkehr: Briefe, Schreiben von Eigentümern, Behörden, Anwälten",
  "sonstiges": "Sonstiges",
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireStaffOrCron(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.sign_request_id) return await signaturVorschlag(db, String(body.sign_request_id), body?.neu === true);
    const id: string | undefined = body?.attachment_id;
    if (!id) return json({ error: "attachment_id fehlt" }, 400);
    if (!body?.neu) {
      const { data: da } = await db.from("dms_vorschlaege").select("*").eq("attachment_id", id).maybeSingle();
      if (da) return json({ vorschlag: da });
    }

    const { data: att } = await db.from("email_attachments")
      .select("id, email_id, file_name, mime_type, extracted_text, text_status, sha256")
      .eq("id", id).maybeSingle();
    if (!att) return json({ error: "Anhang nicht gefunden" }, 404);
    const { data: mail } = await db.from("emails")
      .select("id, subject, from_address, from_name, building_id, date, ai_summary")
      .eq("id", att.email_id).maybeSingle();

    const speichern = async (v: Record<string, unknown>) => {
      const row = { attachment_id: id, ...v, erstellt_am: new Date().toISOString() };
      await db.from("dms_vorschlaege").upsert(row);
      return json({ vorschlag: row });
    };

    // 1) Gleiche Datei schon einmal abgelegt (Fingerabdruck) → dieselbe Ablage
    if (att.sha256) {
      const { data: gleiche } = await db.from("email_attachments").select("id").eq("sha256", att.sha256).neq("id", id).limit(20);
      const ids = (gleiche ?? []).map((g: any) => g.id);
      if (ids.length) {
        const { data: frueher } = await db.from("dms_vorschlaege")
          .select("abgelegt_building_id, abgelegt_category_id, abgelegt_wirtschaftsjahr")
          .in("attachment_id", ids).not("abgelegt_am", "is", null).order("abgelegt_am", { ascending: false }).limit(1).maybeSingle();
        if (frueher?.abgelegt_building_id) {
          const { data: kat } = frueher.abgelegt_category_id
            ? await db.from("building_file_categories").select("slug").eq("id", frueher.abgelegt_category_id).maybeSingle()
            : { data: null };
          return await speichern({ building_id: frueher.abgelegt_building_id, category_slug: kat?.slug ?? null, wirtschaftsjahr: frueher.abgelegt_wirtschaftsjahr, quelle: "gleiche_datei" });
        }
      }
    }

    // 2) Objekte und Hinweise
    const { data: gebaeude } = await db.from("buildings").select("id, name, address, building_code").order("name");
    const objekte = (gebaeude ?? []) as any[];
    const hinweise: string[] = [];
    if (mail?.building_id) {
      const g = objekte.find((o) => o.id === mail.building_id);
      if (g) hinweise.push(`Die E-Mail ist in der App dem Objekt „${g.name}" zugeordnet.`);
    }
    const absender = norm(mail?.from_address);
    if (absender) {
      // Absender ↔ Kontakte ↔ Objekte
      const [{ data: ce }, { data: cp }] = await Promise.all([
        db.from("contact_emails").select("contact_id").ilike("email", absender),
        db.from("contact_persons").select("contact_id").ilike("email", absender),
      ]);
      const kontakte = [...new Set([...(ce ?? []), ...(cp ?? [])].map((x: any) => x.contact_id))];
      if (kontakte.length) {
        const { data: zu } = await db.from("contact_building_assignments").select("building_id, role_in_building, unit_number").in("contact_id", kontakte).or("is_active.is.null,is_active.eq.true");
        const namen = [...new Set((zu ?? []).map((z: any) => {
          const g = objekte.find((o) => o.id === z.building_id);
          return g ? `${g.name} (${z.role_in_building ?? "Kontakt"}${z.unit_number ? `, Einheit ${z.unit_number}` : ""})` : null;
        }).filter(Boolean))];
        if (namen.length) hinweise.push(`Der Absender ist als Kontakt hinterlegt bei: ${namen.join("; ")}.`);
      }
      // Frühere Ablagen desselben Absenders (aus dem DMS)
      const { data: mails } = await db.from("emails").select("id").ilike("from_address", absender).order("date", { ascending: false }).limit(200);
      const mailIds = (mails ?? []).map((m: any) => m.id).filter((m: string) => m !== mail?.id);
      if (mailIds.length) {
        const { data: ablagen } = await db.from("building_files")
          .select("display_name, building_id, created_at, building_file_categories(slug, name)")
          .in("source_email_id", mailIds.slice(0, 150)).is("deleted_at", null).order("created_at", { ascending: false }).limit(8);
        const zeilen = (ablagen ?? []).map((f: any) => {
          const g = objekte.find((o) => o.id === f.building_id);
          return `- „${f.display_name}" → ${g?.name ?? "?"} / ${f.building_file_categories?.slug ?? "ohne Ordner"}`;
        });
        if (zeilen.length) hinweise.push(`So wurden frühere Anhänge dieses Absenders abgelegt:\n${zeilen.join("\n")}`);
      }
    }

    const text = String(att.extracted_text ?? "").replace(/\s+\n/g, "\n").slice(0, 6000);
    const KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!KEY) throw new Error("MISTRAL_API_KEY fehlt");

    const system =
      "Du ordnest Dokumente einer Hausverwaltung (RGI Immobilien, Pfronten) im Dokumentenarchiv ein. " +
      "Wähle das Objekt (WEG/Liegenschaft) und den Ordner. " +
      "Ein Wirtschaftsjahr NUR bei Buchhaltungsunterlagen angeben (Rechnungen, Gutschriften, Kontoauszüge, Jahres-/Heizkostenabrechnungen, Wirtschaftspläne, §35a, Vermögensbericht) – sonst 0. " +
      "Alles rund um Versicherungen (Policen, Versicherungsscheine, Angebote von Versicherern, Schadensfälle) gehört in dienstleister-versicherungen. " +
      "Nutze NUR die angegebenen IDs und Ordner-Schlüssel. Ist das Objekt nicht erkennbar, gib building_id leer zurück. " +
      "Adressen im Text, Objektnamen, Einheitennummern und die Hinweise sind die wichtigsten Anhaltspunkte. Die Adresse der Hausverwaltung (Vilstalstr. 4) ist KEIN Objekt.";
    const nutzer =
      `OBJEKTE (id | Name | Adresse):\n${objekte.map((o) => `${o.id} | ${o.name} | ${o.address ?? ""}`).join("\n")}\n\n` +
      `ORDNER (Schlüssel: Inhalt):\n${Object.entries(ORDNER).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n` +
      (hinweise.length ? `HINWEISE:\n${hinweise.join("\n")}\n\n` : "") +
      `E-MAIL: Betreff „${mail?.subject ?? ""}", von ${mail?.from_name ?? ""} <${mail?.from_address ?? ""}>, ${mail?.date ?? ""}\n` +
      (mail?.ai_summary ? `Zusammenfassung: ${mail.ai_summary}\n` : "") +
      `ANHANG: ${att.file_name}\n` +
      (text ? `TEXT DES ANHANGS:\n${text}` : "(kein lesbarer Text – nur Dateiname und E-Mail verwenden)");

    const args = await kiAblage(KEY, system, nutzer, {
      building_id: { type: "string", description: "id aus OBJEKTE oder leer" },
      ordner: { type: "string", enum: Object.keys(ORDNER) },
      wirtschaftsjahr: { type: "integer", description: "z. B. 2025, oder 0 wenn keinem Jahr zuzuordnen" },
      dokumentart: { type: "string", description: "kurz, z. B. Rechnung, Mängelliste, Protokoll" },
    });

    // Nur gültige Werte übernehmen
    const building_id = objekte.some((o) => o.id === args.building_id) ? args.building_id : (mail?.building_id ?? null);
    const category_slug = ORDNER[args.ordner] ? args.ordner : null;
    const jahr = Number(args.wirtschaftsjahr);
    const aktuell = new Date().getFullYear();
    const wirtschaftsjahr = Number.isInteger(jahr) && jahr >= aktuell - 6 && jahr <= aktuell + 1 ? jahr : null;
    return await speichern({ building_id, category_slug, wirtschaftsjahr, dokumentart: String(args.dokumentart ?? "").slice(0, 80) || null, quelle: text ? "ki" : "ohne_text" });
  } catch (e) {
    console.error("dms-vorschlag", e);
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});

/** Mistral mit erzwungenem Werkzeug „ablage“ – liefert die Argumente als Objekt. */
// deno-lint-ignore no-explicit-any
async function kiAblage(key: string, system: string, nutzer: string, properties: Record<string, unknown>): Promise<any> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-medium-3-5",
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: nutzer }],
      tools: [{
        type: "function",
        function: {
          name: "ablage",
          description: "Ablageort im DMS",
          parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
        },
      }],
      tool_choice: { type: "function", function: { name: "ablage" } },
    }),
  });
  if (!res.ok) throw new Error(`KI-Fehler ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const r = await res.json();
  return JSON.parse(r.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
}

// ================================================================ Unterschriften-Vorgang

/** Text der ersten Seiten eines PDFs (für die KI), höchstens ~6000 Zeichen. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: false });
    const seiten = (Array.isArray(text) ? text : [String(text)]).slice(0, 6);
    return seiten.join("\n").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").slice(0, 6000);
  } catch (e) {
    console.warn("dms-vorschlag: PDF-Text nicht lesbar", e);
    return "";
  }
}

// deno-lint-ignore no-explicit-any
async function signaturVorschlag(db: any, id: string, neu: boolean): Promise<Response> {
  const { data: r } = await db.from("sign_requests")
    .select("id, nummer, titel, typ, dokumentart, building_id, quelle_typ, quelle_id, quelle_label, email_id, final_bucket, final_path, dms_vorschlag")
    .eq("id", id).maybeSingle();
  if (!r) return json({ error: "Vorgang nicht gefunden" }, 404);
  if (r.dms_vorschlag && !neu) return json({ vorschlag: r.dms_vorschlag });

  const vorschlagName = dateiname(`${r.titel} (unterschrieben)`);
  const speichern = async (v: Record<string, unknown>) => {
    const row = { ziel: null, building_id: null, category_slug: null, category_id: null, ...v, dateiname: vorschlagName, erstellt_am: new Date().toISOString() };
    await db.from("sign_requests").update({ dms_vorschlag: row }).eq("id", id);
    return json({ vorschlag: row });
  };

  // Ordner des Firmen-DMS (is_company)
  const { data: fo } = await db.from("building_file_categories").select("id, name, slug, parent_id")
    .eq("is_company", true).is("archived_at", null).order("sort_order");
  const firmenOrdner = (fo ?? []) as { id: string; name: string; slug: string | null; parent_id: string | null }[];
  const firmaSlug = (slug: string) => firmenOrdner.find((k) => k.slug === slug)?.id ?? null;
  const firmaPfad = (k: { name: string; parent_id: string | null }) => {
    const p = k.parent_id ? firmenOrdner.find((x) => x.id === k.parent_id) : null;
    return p ? `${p.name} › ${k.name}` : k.name;
  };

  // 1) Quelle aus dem DMS: Firmendatei → Firmen-DMS im selben Ordner; sonst Text und Ordner der Quelle merken
  let quellText = "";
  let quellSlug: string | null = null;
  if (r.quelle_typ === "building_file" && r.quelle_id) {
    const { data: f } = await db.from("building_files")
      .select("is_company, category_id, extracted_text, building_file_categories(slug)")
      .eq("id", r.quelle_id).maybeSingle();
    if (f?.is_company) {
      const ordner = firmenOrdner.some((k) => k.id === f.category_id) ? f.category_id : firmaSlug("rgi-sonstiges");
      return await speichern({ ziel: "firma", category_id: ordner, quelle: "quelle_firma" });
    }
    quellText = String(f?.extracted_text ?? "");
    quellSlug = f?.building_file_categories?.slug ?? null;
  }
  // 2) Angebot der RGI an eine (neue) WEG → Firmen-DMS › Angebote (Unterordner des Angebots, falls vorhanden)
  if (r.quelle_typ === "offer") {
    return await speichern({ ziel: "firma", category_id: (r.quelle_id && firmaSlug(`rgi-angebot-${r.quelle_id}`)) || firmaSlug("rgi-angebote"), quelle: "regel" });
  }
  // 3) Objekt bekannt und Dokumentart eindeutig → Ordner der Dokumentart (wie bisher automatisch)
  if (r.building_id && r.dokumentart !== "sonstiges") {
    return await speichern({ ziel: "objekt", building_id: r.building_id, category_slug: DMS_SLUG[r.dokumentart] ?? "schriftverkehr", quelle: "regel" });
  }
  if (r.building_id && quellSlug && ORDNER[quellSlug]) {
    return await speichern({ ziel: "objekt", building_id: r.building_id, category_slug: quellSlug, quelle: "quelle_ordner" });
  }

  // 4) KI: Text der Quelle (DMS/Mail-Anhang) oder der Endfassung
  if (!quellText && r.quelle_typ === "email_attachment" && r.quelle_id) {
    const { data: a } = await db.from("email_attachments").select("extracted_text").eq("id", r.quelle_id).maybeSingle();
    quellText = String(a?.extracted_text ?? "");
  }
  if (!quellText && r.final_path) {
    const { data: blob } = await db.storage.from(r.final_bucket || "building-files").download(r.final_path);
    if (blob) quellText = await pdfText(new Uint8Array(await blob.arrayBuffer()));
  }
  const text = quellText.replace(/\s+\n/g, "\n").slice(0, 6000);
  const regelSlug = DMS_SLUG[r.dokumentart] ?? "schriftverkehr";
  const KEY = Deno.env.get("MISTRAL_API_KEY");
  if (!KEY) {
    return await speichern(r.building_id
      ? { ziel: "objekt", building_id: r.building_id, category_slug: regelSlug, quelle: "regel" }
      : { quelle: "ohne_ki" });
  }

  const { data: gebaeude } = await db.from("buildings").select("id, name, address").order("name");
  const objekte = (gebaeude ?? []) as { id: string; name: string; address: string | null }[];
  const { data: signer } = await db.from("sign_request_signers").select("name, rolle").eq("request_id", id).order("position");
  const objektName = r.building_id ? objekte.find((o) => o.id === r.building_id)?.name : null;

  const system =
    "Du ordnest unterschriebene Dokumente einer Hausverwaltung (RGI Immobilien, Pfronten) im Dokumentenarchiv ein. " +
    "Wähle das Ziel: eine Liegenschaft (WEG/Objekt) ODER „RGI“ für Unterlagen der Hausverwaltung selbst (eigene Verträge, Personal, Buchhaltung, Marketing, Angebote der RGI an neue Kunden). " +
    "Bei einer Liegenschaft wähle einen Ordner-Schlüssel aus ORDNER, bei „RGI“ eine ID aus FIRMEN-ORDNER. " +
    "Nutze NUR die angegebenen IDs und Schlüssel. Ist das Ziel nicht erkennbar, gib building_id leer zurück. " +
    "Die Adresse der Hausverwaltung (Vilstalstr. 4) ist KEIN Objekt.";
  const nutzer =
    `OBJEKTE (id | Name | Adresse):\n${objekte.map((o) => `${o.id} | ${o.name} | ${o.address ?? ""}`).join("\n")}\n\n` +
    `ORDNER einer Liegenschaft (Schlüssel: Inhalt):\n${Object.entries(ORDNER).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n` +
    `FIRMEN-ORDNER von RGI (id: Ordner):\n${firmenOrdner.map((k) => `${k.id}: ${firmaPfad(k)}`).join("\n")}\n\n` +
    (objektName ? `HINWEIS: Der Vorgang ist dem Objekt „${objektName}" zugeordnet (building_id ${r.building_id}) – nur den Ordner wählen.\n\n` : "") +
    `VORGANG ${r.nummer}: „${r.titel}", Dokumentart ${r.dokumentart}${r.quelle_label ? `, Quelle ${r.quelle_label}` : ""}\n` +
    `Unterzeichner: ${(signer ?? []).map((s: { name: string; rolle: string | null }) => s.rolle ? `${s.name} (${s.rolle})` : s.name).join("; ") || "–"}\n` +
    (text ? `TEXT DES DOKUMENTS:\n${text}` : "(kein lesbarer Text – nur Titel und Angaben verwenden)");

  // deno-lint-ignore no-explicit-any
  let args: any;
  try {
    args = await kiAblage(KEY, system, nutzer, {
      building_id: { type: "string", description: "id aus OBJEKTE, „RGI“ für das Firmen-DMS oder leer" },
      ordner: { type: "string", enum: [...Object.keys(ORDNER), ...firmenOrdner.map((k) => k.id)] },
      dokumentart: { type: "string", description: "kurz, z. B. Vertrag, Vollmacht, Abnahmeprotokoll" },
    });
  } catch (e) {
    // KI nicht erreichbar: Regel-Vorschlag zurückgeben, aber nicht speichern (beim nächsten Öffnen neu versuchen)
    console.error("dms-vorschlag (Unterschrift): KI-Fehler", e);
    return json({
      vorschlag: {
        ziel: r.building_id ? "objekt" : null, building_id: r.building_id, category_slug: regelSlug, category_id: null,
        dateiname: vorschlagName, quelle: "regel", erstellt_am: new Date().toISOString(),
      },
    });
  }
  const dokumentart = String(args.dokumentart ?? "").slice(0, 80) || null;
  const quelle = text ? "ki" : "ohne_text";
  const ordnerObjekt = ORDNER[args.ordner] ? args.ordner : null;

  if (r.building_id) {
    return await speichern({ ziel: "objekt", building_id: r.building_id, category_slug: ordnerObjekt ?? regelSlug, dokumentart, quelle });
  }
  if (String(args.building_id).toUpperCase() === "RGI") {
    const k = firmenOrdner.some((x) => x.id === args.ordner) ? args.ordner : firmaSlug("rgi-sonstiges");
    return await speichern({ ziel: "firma", category_id: k, dokumentart, quelle });
  }
  if (objekte.some((o) => o.id === args.building_id)) {
    return await speichern({ ziel: "objekt", building_id: args.building_id, category_slug: ordnerObjekt ?? regelSlug, dokumentart, quelle });
  }
  return await speichern({ category_slug: ordnerObjekt ?? regelSlug, dokumentart, quelle });
}
