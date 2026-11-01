// Rundmails (Serien-E-Mails der App, Tabelle comm_campaigns type='email').
// Entwurf anlegen und persönliche bzw. allgemeine Anhänge hochladen/zuordnen –
// genau so, wie es der Rundmail-Editor der App speichert (BulkMailEditor/useBulkRecipients).
// Versendet wird NICHT hier, sondern vom Mitarbeiter in der App.

type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
type Deps = {
  db: any;
  defaultUser: string;
  log: (tool: string, details: Record<string, unknown>) => Promise<void>;
  objektGroesse: (bucket: string, path: string) => Promise<number | null>;
  mimeVon: (name: string, given?: string) => string;
};

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
/** Wie _shared/sanitize-email.ts bzw. src/lib/extractEmails: gültige Adressen aus einem Feld. */
function emailsAus(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/[^,;\s]*<\s*([^>]+?)\s*>/g, "$1")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .split(/[,;\s\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}
/** Einheitennummer ohne führende Nullen ("0005" -> "5"), wie normalizeUnit in der App. */
const einheitKey = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const d = String(u).match(/\d+/)?.[0];
  return d ? String(Number(d)) : String(u).trim().toLowerCase();
};
const nachEinheit = (x: string[]) => [...x].sort((p, q) => (Number(einheitKey(p)) || 0) - (Number(einheitKey(q)) || 0));

type Empf = {
  key: string; assignment_id: string; contact_id: string; einheit: string | null; einheit_key: string | null;
  rolle: string | null; name: string; email: string;
};

export function rundmailTools(d: Deps): Tool[] {
  const { db } = d;
  const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
  const str = (x: string) => ({ type: "string", description: x });
  const uuid = (x: string) => ({ type: "string", format: "uuid", description: x });

  /** Empfänger wie im Rundmail-Editor: je Zuordnung und E-Mail-Adresse ein Eintrag (Schlüssel assignment_id|email). */
  async function empfaenger(building_id: string, rolle = "alle") {
    const { data: rows, error } = await db
      .from("contact_building_assignments")
      .select("id, contact_id, unit_number, role_in_building, contacts(first_name, last_name, company_name)")
      .eq("building_id", building_id)
      .or("is_active.is.null,is_active.eq.true");
    if (error) throw error;
    const zuord = (rows ?? []).filter((a: any) => {
      const r = String(a.role_in_building ?? "").toLowerCase();
      return rolle === "alle" ? r !== "dienstleister" : r === rolle;
    });
    const mitEmail: Empf[] = [];
    const ohneEmail: { einheit: string | null; name: string }[] = [];
    const ids = [...new Set(zuord.map((a: any) => a.contact_id))];
    if (!ids.length) return { mitEmail, ohneEmail };
    const [{ data: ce }, { data: cp }] = await Promise.all([
      db.from("contact_emails").select("contact_id, email, is_primary").in("contact_id", ids),
      db.from("contact_persons").select("contact_id, email, is_primary").in("contact_id", ids),
    ]);
    const proKontakt = new Map<string, string[]>();
    const add = (c: string, e: string) => {
      const arr = proKontakt.get(c) ?? [];
      if (!arr.some((x) => x.toLowerCase() === e.toLowerCase())) arr.push(e);
      proKontakt.set(c, arr);
    };
    const prim = (a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary);
    [...(ce ?? [])].sort(prim).forEach((r: any) => emailsAus(r.email).forEach((e) => add(r.contact_id, e)));
    [...(cp ?? [])].sort(prim).forEach((p: any) => emailsAus(p.email).forEach((e) => add(p.contact_id, e)));
    for (const a of zuord as any[]) {
      const c = a.contacts;
      const name = c?.company_name || `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "(ohne Name)";
      const mails = proKontakt.get(a.contact_id) ?? [];
      if (!mails.length) { ohneEmail.push({ einheit: a.unit_number ?? null, name }); continue; }
      for (const e of mails) {
        mitEmail.push({
          key: `${a.id}|${e.toLowerCase()}`, assignment_id: a.id, contact_id: a.contact_id, einheit: a.unit_number ?? null,
          einheit_key: einheitKey(a.unit_number), rolle: a.role_in_building ?? null, name, email: e,
        });
      }
    }
    return { mitEmail, ohneEmail };
  }

  async function mitarbeiterId(...mails: (string | null | undefined)[]): Promise<string> {
    for (const m of mails) {
      if (!m) continue;
      const { data: p } = await db.from("profiles").select("user_id, role").ilike("email", m).maybeSingle();
      if (p?.user_id && ["admin", "employee"].includes(String(p.role))) return p.user_id;
    }
    return d.defaultUser;
  }

  async function entwurfLaden(campaign_id: string) {
    const { data: c, error } = await db
      .from("comm_campaigns")
      .select("id, name, type, status, building_id, recipient_filter, attachment_paths")
      .eq("id", campaign_id)
      .maybeSingle();
    if (error || !c) throw new Error("Rundmail nicht gefunden");
    if (c.type !== "email") throw new Error("Das ist keine Rundmail (E-Mail-Kampagne)");
    if (c.status !== "draft") throw new Error(`Rundmail ist kein Entwurf mehr (Status: ${c.status}) – Änderungen nur an Entwürfen`);
    return c;
  }

  async function entwurfAnlegen(a: any) {
    const { data: acc } = await db.from("email_accounts").select("id, display_name, email_address, is_active, signature_html").eq("id", a.account_id).maybeSingle();
    if (!acc || acc.is_active === false) throw new Error("Postfach nicht gefunden oder inaktiv");
    const { data: geb } = await db.from("buildings").select("id, name").eq("id", a.building_id).maybeSingle();
    if (!geb) throw new Error("Gebäude nicht gefunden");

    const { mitEmail, ohneEmail } = await empfaenger(a.building_id, a.rolle ?? "eigentuemer");
    const nur: string[] = (a.empfaenger_emails ?? []).map((e: string) => e.trim().toLowerCase()).filter(Boolean);
    const ohne = new Set((a.ausschliessen_emails ?? []).map((e: string) => e.trim().toLowerCase()));
    const gruppen = new Map<string, { key: string; email: string; namen: string[]; einheiten: string[] }>();
    for (const r of mitEmail) {
      const em = r.email.toLowerCase();
      if ((nur.length && !nur.includes(em)) || ohne.has(em)) continue;
      const g = gruppen.get(em) ?? { key: r.key, email: r.email, namen: [], einheiten: [] };
      if (!g.namen.includes(r.name)) g.namen.push(r.name);
      if (r.einheit && !g.einheiten.includes(r.einheit)) g.einheiten.push(r.einheit);
      gruppen.set(em, g);
    }
    const unbekannt = nur.filter((e) => !gruppen.has(e));
    if (unbekannt.length) throw new Error(`Diese Adressen gehören zu keinem Empfänger des Objekts: ${unbekannt.join(", ")}`);
    if (!gruppen.size) throw new Error("Keine Empfänger mit E-Mail-Adresse gefunden");

    const liste = [...gruppen.values()].map((g) => ({ ...g, einheiten: nachEinheit(g.einheiten) }));
    const unit_labels: Record<string, string> = {};
    for (const g of liste) if (g.einheiten.length > 1) unit_labels[g.key] = g.einheiten.join(", ");

    // Signatur genau wie der Editor anhängen ("\n\n" + Signatur), sonst fügt er sie beim Öffnen erneut ein
    let body = String(a.text ?? "").replace(/\s+$/, "");
    const sig = acc.signature_html ?? "";
    if (a.signatur_anhaengen !== false && sig && !body.includes(sig)) body = `${body}\n\n${sig}`;

    const recipient_keys = liste.map((g) => g.key);
    const { data: c, error } = await db.from("comm_campaigns").insert({
      name: (a.name ?? a.betreff ?? "Rundmail").trim() || "Rundmail",
      type: "email", status: "draft", building_id: a.building_id, email_account_id: acc.id,
      created_by: await mitarbeiterId(a.mitarbeiter_email, acc.email_address),
      subject_override: a.betreff, body_html_override: body, body_format: "html",
      attachment_paths: [], free_vars: {}, recipient_count: recipient_keys.length,
      recipient_filter: { roles: [], contact_ids: [], assignment_ids: [], recipient_keys, no_duplicates: true, unit_labels },
    }).select("id").single();
    if (error || !c) throw new Error(`Rundmail konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`);

    await d.log("rundmail_entwurf_anlegen", { campaign_id: c.id, building_id: a.building_id, betreff: a.betreff, empfaenger: recipient_keys.length, postfach: acc.email_address, mitarbeiter: a.mitarbeiter_email ?? null });
    return {
      status: "RUNDMAIL-ENTWURF GESPEICHERT – nicht gesendet",
      campaign_id: c.id, objekt: geb.name, postfach: `${acc.display_name} <${acc.email_address}>`, betreff: a.betreff,
      anzahl_empfaenger: liste.length,
      empfaenger: liste.map((g) => ({ email: g.email, namen: g.namen, einheiten: g.einheiten })),
      ohne_email: ohneEmail,
      hinweis: "Liegt in der App unter Postfach → Rundmails. Persönliche Anhänge mit rundmail_anhaenge_vorbereiten + rundmail_anhaenge_zuordnen ergänzen. Versendet wird in der App.",
    };
  }

  return [
    {
      name: "rundmail_entwurf_anlegen",
      description:
        "Legt eine Rundmail (Serien-E-Mail an die Eigentümer/Mieter eines Objekts) als ENTWURF in der App an (Postfach → Rundmails). Es wird NICHTS gesendet – der Mitarbeiter prüft und versendet in der App. Jeder Empfänger bekommt eine eigene Mail; Adressen, die mehrere Einheiten abdecken, werden zusammengefasst. Text ohne Grußformel/Signatur übergeben: die Signatur des Postfachs wird automatisch angehängt. Persönliche Anhänge (z. B. Einladung je Einheit) danach mit rundmail_anhaenge_vorbereiten und rundmail_anhaenge_zuordnen ergänzen.",
      inputSchema: S({
        building_id: uuid("Gebäude"),
        account_id: uuid("Absender-Postfach aus mail_postfaecher"),
        betreff: str("Betreff"),
        text: str("Nachricht als Klartext, ohne Signatur"),
        name: str("optional: Name der Rundmail in der Liste (Standard: Betreff)"),
        rolle: { type: "string", enum: ["eigentuemer", "mieter", "alle"], description: "Empfängerkreis (Standard: eigentuemer)" },
        empfaenger_emails: { type: "array", items: { type: "string" }, description: "optional: nur diese Adressen auswählen" },
        ausschliessen_emails: { type: "array", items: { type: "string" }, description: "optional: diese Adressen nicht auswählen" },
        signatur_anhaengen: { type: "boolean", description: "Signatur des Postfachs anhängen (Standard: true)" },
        mitarbeiter_email: str("optional: wer die Rundmail anlegt (Standard: Inhaber des Postfachs)"),
      }, ["building_id", "account_id", "betreff", "text"]),
      run: (a) => entwurfAnlegen(a),
    },
    {
      name: "rundmail_anhaenge_vorbereiten",
      description:
        "Schritt 1 von 2 für Anhänge einer Rundmail im Entwurf: liefert je Datei einen Upload-Link (2 Std. gültig). Dateien per PUT hochladen (curl -X PUT -H 'Content-Type: <mime>' --data-binary @datei '<upload_url>'), danach rundmail_anhaenge_zuordnen mit den paths aufrufen. art 'persoenlich' = Anhang nur für bestimmte Empfänger (Standard; Dateinamen am besten mit Einheitennummer beginnen, z. B. '0005-0006_Einladung.pdf'), art 'alle' = Anhang für alle Empfänger.",
      inputSchema: S({
        campaign_id: uuid("Rundmail aus rundmail_entwurf_anlegen"),
        dateinamen: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
        art: { type: "string", enum: ["persoenlich", "alle"], description: "Standard: persoenlich" },
      }, ["campaign_id", "dateinamen"]),
      run: async ({ campaign_id, dateinamen, art }) => {
        await entwurfLaden(campaign_id);
        const ordner = art === "alle" ? "attachments" : "personal";
        const ts = Date.now(); // 13-stelliger Präfix wie in der App; wird beim Versand aus dem Dateinamen entfernt
        const out = [];
        const gesehen = new Set<string>();
        for (const n of dateinamen as string[]) {
          const safe = String(n)
            .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
            .replace(/[^\w.\-]+/g, "_");
          if (gesehen.has(safe)) throw new Error(`Dateiname doppelt: ${n}`);
          gesehen.add(safe);
          const path = `campaigns/${campaign_id}/${ordner}/${ts}_${safe}`;
          const { data, error } = await db.storage.from("comm-assets").createSignedUploadUrl(path);
          if (error) throw new Error(`${n}: ${error.message}`);
          out.push({ dateiname: n, path, upload_url: data.signedUrl, content_type: d.mimeVon(n) });
        }
        return { art: art ?? "persoenlich", gueltig_sekunden: 7200, dateien: out, hinweis: "Alle Dateien per PUT hochladen, dann rundmail_anhaenge_zuordnen mit den paths aufrufen." };
      },
    },
    {
      name: "rundmail_anhaenge_zuordnen",
      description:
        "Schritt 2 von 2: hängt hochgeladene Dateien an die Rundmail. Persönliche Anhänge werden wie beim Hineinziehen in der App über die Einheitennummer am Anfang des Dateinamens zugeordnet ('0005-0006_…' → alle Adressen der Einheiten 5 und 6); alternativ je Datei einheiten oder emails angeben. Empfänger mit persönlichem Anhang werden automatisch ausgewählt. Allgemeine Anhänge (art 'alle') gehen an alle. Liefert, wer noch keinen persönlichen Anhang hat.",
      inputSchema: S({
        campaign_id: uuid("Rundmail"),
        dateien: {
          type: "array", minItems: 1, maxItems: 100,
          items: {
            type: "object", additionalProperties: false, required: ["path"],
            properties: {
              path: { type: "string", description: "path aus rundmail_anhaenge_vorbereiten" },
              art: { type: "string", enum: ["persoenlich", "alle"], description: "Standard: aus dem path (personal/attachments)" },
              einheiten: { type: "array", items: { type: "string" }, description: "optional: Einheitennummern statt Dateiname" },
              emails: { type: "array", items: { type: "string" }, description: "optional: Empfänger-Adressen statt Einheiten" },
            },
          },
        },
      }, ["campaign_id", "dateien"]),
      run: async ({ campaign_id, dateien }) => {
        const camp = await entwurfLaden(campaign_id);
        const filter = (camp.recipient_filter ?? {}) as Record<string, any>;
        const keys: string[] = [...(filter.recipient_keys ?? [])];
        const keysVorher = keys.length;
        const { mitEmail } = await empfaenger(camp.building_id, "alle");

        // Je Adresse der bereits ausgewählte Schlüssel (der Editor fasst gleiche Adressen zusammen)
        const keyNachEmail = new Map<string, string>();
        for (const k of keys) {
          const em = k.split("|")[1];
          if (em && !keyNachEmail.has(em)) keyNachEmail.set(em, k);
        }
        const allgemein: string[] = [...(camp.attachment_paths ?? [])];
        const allgemeinVorher = allgemein.length;
        const neu = new Map<string, string[]>(); // Schlüssel -> zusätzliche Pfade
        const ergebnisse: any[] = [];

        for (const f of dateien as any[]) {
          const path = String(f.path);
          if (!path.startsWith(`campaigns/${campaign_id}/`)) { ergebnisse.push({ ok: false, path, fehler: "Pfad gehört nicht zu dieser Rundmail" }); continue; }
          if ((await d.objektGroesse("comm-assets", path)) === null) { ergebnisse.push({ ok: false, path, fehler: "Datei nicht im Speicher – wurde der Upload abgeschlossen?" }); continue; }
          const dateiname = (path.split("/").pop() ?? path).replace(/^\d{13}_/, "");
          const art = f.art ?? (path.includes("/attachments/") ? "alle" : "persoenlich");
          if (art === "alle") {
            if (!allgemein.includes(path)) allgemein.push(path);
            ergebnisse.push({ ok: true, dateiname, art: "alle" });
            continue;
          }
          let ziele: Empf[];
          if (f.emails?.length) {
            const s = new Set((f.emails as string[]).map((e) => e.trim().toLowerCase()));
            ziele = mitEmail.filter((r) => s.has(r.email.toLowerCase()));
          } else {
            const einh: string[] = f.einheiten?.length ? f.einheiten : (dateiname.match(/^\s*(\d+(?:\s*-\s*\d+)*)\s*[_\-. ]/)?.[1]?.split("-") ?? []);
            const s = new Set(einh.map((u) => einheitKey(u)).filter(Boolean));
            ziele = mitEmail.filter((r) => r.einheit_key && s.has(r.einheit_key));
          }
          if (!ziele.length) { ergebnisse.push({ ok: false, dateiname, fehler: "Kein Empfänger mit E-Mail gefunden – Einheitennummer am Dateianfang, einheiten oder emails angeben" }); continue; }
          const an = new Set<string>();
          for (const r of ziele) {
            const em = r.email.toLowerCase();
            let k = keyNachEmail.get(em);
            if (!k) { k = r.key; keys.push(k); keyNachEmail.set(em, k); }
            const arr = neu.get(k) ?? [];
            if (!arr.includes(path)) arr.push(path);
            neu.set(k, arr);
            an.add(r.email);
          }
          ergebnisse.push({ ok: true, dateiname, art: "persoenlich", an: [...an] });
        }

        // Persönliche Anhänge speichern (comm_recipient_overrides, eine Zeile je Schlüssel)
        const { data: ovRows, error: oErr } = await db.from("comm_recipient_overrides").select("id, assignment_id, email, attachment_paths").eq("campaign_id", campaign_id);
        if (oErr) throw oErr;
        const ovNachKey = new Map<string, any>();
        for (const o of ovRows ?? []) ovNachKey.set(`${o.assignment_id}|${String(o.email ?? "").toLowerCase()}`, o);
        const kontaktNachZuordnung = new Map(mitEmail.map((r) => [r.assignment_id, r.contact_id]));
        for (const [k, paths] of neu) {
          const [assignment_id, email] = k.split("|");
          const vorhanden = ovNachKey.get(k);
          if (vorhanden) {
            const merged = [...(vorhanden.attachment_paths ?? [])];
            for (const p of paths) if (!merged.includes(p)) merged.push(p);
            const { error } = await db.from("comm_recipient_overrides").update({ attachment_paths: merged }).eq("id", vorhanden.id);
            if (error) throw new Error(`Anhang konnte nicht gespeichert werden: ${error.message}`);
          } else {
            let contact_id = kontaktNachZuordnung.get(assignment_id);
            if (!contact_id) {
              const { data: z } = await db.from("contact_building_assignments").select("contact_id").eq("id", assignment_id).maybeSingle();
              contact_id = z?.contact_id;
            }
            if (!contact_id) throw new Error(`Zuordnung ${assignment_id} nicht gefunden`);
            const { error } = await db.from("comm_recipient_overrides").insert({ campaign_id, contact_id, assignment_id, email, attachment_paths: paths });
            if (error) throw new Error(`Anhang konnte nicht gespeichert werden: ${error.message}`);
          }
        }

        if (keys.length !== keysVorher || allgemein.length !== allgemeinVorher) {
          const { error } = await db.from("comm_campaigns")
            .update({ attachment_paths: allgemein, recipient_filter: { ...filter, recipient_keys: keys }, recipient_count: keys.length })
            .eq("id", campaign_id).eq("status", "draft");
          if (error) throw new Error(`Rundmail konnte nicht aktualisiert werden: ${error.message}`);
        }

        // Stand: welche ausgewählten Adressen haben einen persönlichen Anhang?
        const { data: nachher } = await db.from("comm_recipient_overrides").select("email, attachment_paths").eq("campaign_id", campaign_id);
        const mitAnhang = new Set((nachher ?? []).filter((o: any) => (o.attachment_paths ?? []).length > 0).map((o: any) => String(o.email ?? "").toLowerCase()));
        const ausgewaehlt = [...new Set(keys.map((k) => k.split("|")[1]).filter(Boolean))];
        const ohne = ausgewaehlt.filter((e) => !mitAnhang.has(e));

        await d.log("rundmail_anhaenge_zuordnen", { campaign_id, ok: ergebnisse.filter((x) => x.ok).length, fehler: ergebnisse.filter((x) => !x.ok).length });
        return {
          zugeordnet: ergebnisse.filter((x) => x.ok).length,
          fehlgeschlagen: ergebnisse.filter((x) => !x.ok).length,
          ergebnisse,
          ausgewaehlte_empfaenger: ausgewaehlt.length,
          mit_persoenlichem_anhang: ausgewaehlt.length - ohne.length,
          ohne_persoenlichen_anhang: ohne,
          allgemeine_anhaenge: allgemein.map((p) => (p.split("/").pop() ?? p).replace(/^\d{13}_/, "")),
        };
      },
    },
    {
      name: "etv_versammlungen",
      description: "Listet die Eigentümerversammlungen eines Gebäudes (neueste zuerst) mit meeting_id, Titel, Datum, Ort und Status – z. B. um die meeting_id für etv_einladungen_an_rundmail zu finden.",
      inputSchema: S({ building_id: uuid("Gebäude") }, ["building_id"]),
      annotations: { readOnlyHint: true },
      run: async ({ building_id }) => {
        const { data, error } = await db.from("etv_meetings").select("id, title, meeting_date, location, status").eq("building_id", building_id).order("meeting_date", { ascending: false }).limit(20);
        if (error) throw error;
        const fmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        return (data ?? []).map((m: any) => ({ meeting_id: m.id, titel: m.title, datum: m.meeting_date ? fmt.format(new Date(m.meeting_date)) : null, ort: m.location, status: m.status }));
      },
    },
    {
      name: "etv_einladungen_an_rundmail",
      description:
        "Erzeugt die Einladungen zur Eigentümerversammlung als PDF (gleiche Vorlage und Funktion wie 'Einladungen erstellen' in der App: objektbezogene Vorlage, sonst die allgemeine) und hängt sie je Eigentümer als persönlichen Anhang an eine Rundmail (Entwurf). Entweder rundmail_id einer bestehenden Rundmail angeben oder account_id + betreff + text, dann wird die Rundmail neu angelegt (wie rundmail_entwurf_anlegen). Ältere Einladungen in der Rundmail werden ersetzt (ersetzen=false behält sie). Dauert ca. 3 Sekunden je Brief. Liefert u. a. zip_download_url (1 Std.) mit allen Einladungen zum Ansehen. Versendet wird in der App.",
      inputSchema: S({
        meeting_id: uuid("Versammlung aus etv_versammlungen"),
        rundmail_id: uuid("optional: bestehende Rundmail (Entwurf)"),
        account_id: uuid("nur für neue Rundmail: Absender-Postfach"),
        betreff: str("nur für neue Rundmail: Betreff"),
        text: str("nur für neue Rundmail: Text ohne Signatur"),
        ersetzen: { type: "boolean", description: "ältere Einladungen in der Rundmail ersetzen (Standard: true)" },
        vorlage_id: uuid("optional: bestimmte Einladungsvorlage (comm_templates)"),
        mitarbeiter_email: str("optional: wer das veranlasst"),
      }, ["meeting_id"]),
      run: async (a) => {
        let rundmail_id: string | undefined = a.rundmail_id;
        let neu: any = null;
        if (!rundmail_id) {
          if (!a.account_id || !a.betreff || !a.text) throw new Error("Ohne rundmail_id bitte account_id, betreff und text für eine neue Rundmail angeben");
          const { data: m } = await db.from("etv_meetings").select("building_id").eq("id", a.meeting_id).maybeSingle();
          if (!m) throw new Error("Versammlung nicht gefunden");
          neu = await entwurfAnlegen({ building_id: m.building_id, account_id: a.account_id, betreff: a.betreff, text: a.text, mitarbeiter_email: a.mitarbeiter_email });
          rundmail_id = neu.campaign_id;
        }
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/etv-einladungen-rundmail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ meeting_id: a.meeting_id, rundmail_id, ersetzen: a.ersetzen !== false, vorlage_id: a.vorlage_id, created_by: await mitarbeiterId(a.mitarbeiter_email) }),
        });
        const r: any = await res.json().catch(() => ({}));
        if (!res.ok || r?.error) throw new Error(r?.error ?? `Einladungen konnten nicht erzeugt werden (${res.status})`);
        await d.log("etv_einladungen_an_rundmail", { meeting_id: a.meeting_id, rundmail_id, neu: !!neu, erzeugt: r.einladungen_erzeugt, zugeordnet: r.zugeordnet, mitarbeiter: a.mitarbeiter_email ?? null });
        return { rundmail_id, rundmail_neu_angelegt: !!neu, ...r, hinweis: "Rundmail liegt als Entwurf in der App (Postfach → Rundmails) und wird dort versendet." };
      },
    },
  ];
}
