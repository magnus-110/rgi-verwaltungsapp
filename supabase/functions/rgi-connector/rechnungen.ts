// RGI-Rechnungen über den Claude-Konnektor schreiben – gleicher Ablauf wie der Rechnungseditor der App:
//   1. rechnung_entwurf_anlegen: Empfänger, Positionen, Texte → Entwurf ohne Nummer + Vorschau-PDF
//   2. rechnung_festschreiben:   erst Vorschau, nach Zustimmung (bestaetigt=true) Nummer aus dem
//                                Nummernkreis (rgi_next_invoice_number), Status "sent", finales PDF.
// Summen rechnet die Datenbank (Trigger auf rgi_invoice_items), das PDF erzeugt rgi-render-invoice.
// Festgeschriebene Rechnungen werden hier nie geändert – Korrekturen nur per Storno in der App.

type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
  objektGroesse: (bucket: string, path: string) => Promise<number | null>;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });
const datum = (d: string) => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: `${d} (JJJJ-MM-TT)` });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const eur = (n: number) => (Math.round(n * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const heute = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const plusTage = (iso: string, tage: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
};

export function rechnungTools(d: Deps): Tool[] {
  const { db, log } = d;

  async function funktion(name: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const r: any = await res.json().catch(() => ({}));
    if (!res.ok || r?.error) throw new Error(`${name}: ${r?.error ?? `Fehler ${res.status}`}`);
    return r;
  }

  async function laden(id: string) {
    const { data: inv, error } = await db.from("rgi_invoices")
      .select("*, client:rgi_clients(id, name, type, building_id, address_line1, address_line2, zip, city, email), project:rgi_projects(id, name, sparte), items:rgi_invoice_items(position, kind, description, quantity, unit, unit_price_net, vat_rate, line_net, line_vat, line_gross)")
      .eq("id", id).maybeSingle();
    if (error) throw error;
    if (!inv) throw new Error("Rechnung nicht gefunden");
    return inv;
  }

  function zusammenfassung(inv: any) {
    const c = inv.client ?? {};
    return {
      invoice_id: inv.id,
      rechnungsnummer: inv.invoice_number ?? "– (Entwurf)",
      status: inv.status,
      empfaenger: [c.name, c.address_line1, c.address_line2, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      objekt_bezug: !!(inv.building_id || c.building_id),
      projekt: inv.project?.name ?? null,
      rechnungsdatum: inv.issue_date,
      faellig_am: inv.due_date,
      leistungszeitraum: inv.service_period_from || inv.service_period_to ? `${inv.service_period_from ?? ""} – ${inv.service_period_to ?? ""}` : null,
      positionen: (inv.items ?? []).sort((x: any, y: any) => x.position - y.position).map((it: any) => ({
        pos: it.position, text: it.description, menge: Number(it.quantity), einheit: it.unit,
        einzelpreis_netto: eur(Number(it.unit_price_net)), ust: `${Number(it.vat_rate)} %`, netto: eur(Number(it.line_net)),
      })),
      netto: eur(Number(inv.subtotal_net)),
      umsatzsteuer: eur(Number(inv.vat_total)),
      brutto: eur(Number(inv.total_gross)),
    };
  }

  async function pdfLink(path: string) {
    const { data } = await db.storage.from("invoices").createSignedUrl(path, 24 * 3600);
    return data?.signedUrl ?? null;
  }

  /** Empfänger (rgi_clients) finden oder anlegen */
  async function kundeErmitteln(a: any): Promise<string> {
    if (a.client_id) {
      const { data } = await db.from("rgi_clients").select("id").eq("id", a.client_id).maybeSingle();
      if (!data) throw new Error("client_id nicht gefunden");
      return data.id;
    }
    const nk = a.neuer_kunde ?? {};
    if (a.kontakt_id) {
      const { data: vorhanden } = await db.from("rgi_clients").select("id").eq("contact_id", a.kontakt_id).limit(1).maybeSingle();
      if (vorhanden) {
        // Anschrift ergänzen, wenn mitgegeben (Kontakte haben oft keine)
        if (nk.strasse || nk.plz || nk.ort) {
          await db.from("rgi_clients").update({ address_line1: nk.strasse ?? null, zip: nk.plz ?? null, city: nk.ort ?? null }).eq("id", vorhanden.id);
        }
        return vorhanden.id;
      }
      const { data: k } = await db.from("contacts").select("id, salutation, first_name, last_name, company_name, short_name, address_street, address_zip, address_city").eq("id", a.kontakt_id).maybeSingle();
      if (!k) throw new Error("kontakt_id nicht gefunden");
      const name = nk.name ?? k.company_name ?? ([k.first_name, k.last_name].filter(Boolean).join(" ") || k.short_name);
      const strasse = nk.strasse ?? k.address_street, plz = nk.plz ?? k.address_zip, ort = nk.ort ?? k.address_city;
      if (!strasse || !plz || !ort) throw new Error("Beim Kontakt fehlt die Anschrift – bitte neuer_kunde.strasse/plz/ort mitgeben.");
      const { data: neu, error } = await db.from("rgi_clients").insert({
        name, type: "contact", contact_id: k.id, address_line1: strasse, zip: plz, city: ort, country: "DE", email: nk.email ?? null,
        created_by: await d.uploaderId(a.mitarbeiter_email),
      }).select("id").single();
      if (error) throw error;
      return neu.id;
    }
    if (a.building_id) {
      const { data: vorhanden } = await db.from("rgi_clients").select("id").eq("building_id", a.building_id).eq("type", "building").limit(1).maybeSingle();
      if (vorhanden) return vorhanden.id;
      throw new Error("Für dieses Objekt gibt es noch keinen Rechnungsempfänger – bitte einmal in der App unter RGI › Kunden anlegen.");
    }
    if (nk.name) {
      if (!nk.strasse || !nk.plz || !nk.ort) throw new Error("neuer_kunde braucht name, strasse, plz und ort");
      const { data: neu, error } = await db.from("rgi_clients").insert({
        name: nk.name, type: "free", address_line1: nk.strasse, zip: nk.plz, city: nk.ort, country: "DE", email: nk.email ?? null,
        created_by: await d.uploaderId(a.mitarbeiter_email),
      }).select("id").single();
      if (error) throw error;
      return neu.id;
    }
    throw new Error("Empfänger fehlt: client_id, kontakt_id, building_id oder neuer_kunde angeben (Liste: rechnung_kunden).");
  }

  const posSchema = {
    type: "array", minItems: 1,
    items: {
      type: "object", additionalProperties: false, required: ["beschreibung", "einzelpreis_netto"],
      properties: {
        beschreibung: str("Positionstext. Zusatzzeile mit Zeilenumbruch oder ' – ' abtrennen."),
        menge: { type: "number", description: "Standard 1" },
        einheit: str("z. B. pauschal, Stk, h (Standard: pauschal)"),
        einzelpreis_netto: { type: "number", description: "Nettopreis je Einheit in Euro" },
        ust_satz: { type: "number", description: "Umsatzsteuer in % (Standard 19)" },
        art: { type: "string", enum: ["flat", "time", "material", "text"], description: "Standard flat" },
      },
    },
  };

  return [
    {
      name: "rechnung_kunden",
      description: "Listet die Rechnungsempfänger (RGI › Kunden) mit client_id, Anschrift und Projekten. Vor rechnung_entwurf_anlegen nutzen, um einen vorhandenen Empfänger zu finden.",
      inputSchema: S({ suche: str("optional: Teil des Namens") }),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        let q = db.from("rgi_clients").select("id, name, type, contact_id, building_id, address_line1, zip, city, email, rgi_projects(id, name, sparte, status)").order("name");
        if (a.suche) q = q.ilike("name", `%${a.suche}%`);
        const { data, error } = await q.limit(100);
        if (error) throw error;
        return (data ?? []).map((c: any) => ({
          client_id: c.id, name: c.name, art: c.type, kontakt_id: c.contact_id ?? undefined, building_id: c.building_id ?? undefined,
          anschrift: [c.address_line1, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          projekte: (c.rgi_projects ?? []).map((p: any) => ({ project_id: p.id, name: p.name, sparte: p.sparte, status: p.status })),
        }));
      },
    },
    {
      name: "rechnung_entwurf_anlegen",
      description:
        "Legt eine RGI-Rechnung als ENTWURF an (ohne Rechnungsnummer) oder überarbeitet einen Entwurf (invoice_id). Empfänger über client_id, kontakt_id (Kontakt aus der App, Anschrift ggf. über neuer_kunde ergänzen), building_id (Rechnung an eine WEG) oder neuer_kunde. Summen rechnet die App. Ergebnis: Zusammenfassung + Vorschau-PDF (Wasserzeichen 'Entwurf'). Beträge nie schätzen – nur vom Nutzer genannte Preise verwenden. Festschreiben anschließend mit rechnung_festschreiben.",
      inputSchema: S({
        invoice_id: uuid("optional: vorhandenen Entwurf überarbeiten (Positionen werden ersetzt)"),
        client_id: uuid("vorhandener Rechnungsempfänger (rechnung_kunden)"),
        kontakt_id: uuid("Kontakt aus der App – wird bei Bedarf als Rechnungsempfänger angelegt"),
        building_id: uuid("Objekt: Rechnung an die Gemeinschaft (Zahlung vom Objektkonto)"),
        neuer_kunde: { type: "object", additionalProperties: false, description: "neuer Empfänger bzw. Anschrift für kontakt_id", properties: { name: { type: "string" }, strasse: { type: "string" }, plz: { type: "string" }, ort: { type: "string" }, email: { type: "string" } } },
        project_id: uuid("optional: Projekt (bestimmt die Sparte im Nummernkreis)"),
        rechnungsdatum: datum("Standard: heute"),
        faellig_am: datum("Standard: Rechnungsdatum + Zahlungsziel aus den Firmeneinstellungen"),
        leistung_von: datum("Leistungszeitraum Beginn"),
        leistung_bis: datum("Leistungszeitraum Ende"),
        einleitung: str("Text über den Positionen"),
        schlusstext: str("Text unter den Positionen (sonst Standard der Firma)"),
        selbstentnahme: { type: "boolean", description: "Betrag wird gemäß Verwaltervertrag vom Objektkonto entnommen (nur mit Objektbezug)" },
        positionen: posSchema,
        mitarbeiter_email: str("optional: wer das veranlasst"),
      }, ["positionen"]),
      run: async (a) => {
        if (a.invoice_id) {
          const { data: alt } = await db.from("rgi_invoices").select("id, invoice_number").eq("id", a.invoice_id).maybeSingle();
          if (!alt) throw new Error("Rechnung nicht gefunden");
          if (alt.invoice_number) throw new Error(`Rechnung ${alt.invoice_number} ist festgeschrieben und kann nicht mehr geändert werden (Korrektur nur per Storno in der App).`);
        }
        const hatEmpfaenger = a.client_id || a.kontakt_id || a.building_id || a.neuer_kunde?.name;
        let clientId: string | undefined;
        if (!a.invoice_id || hatEmpfaenger) clientId = await kundeErmitteln(a);

        const { data: firma } = await db.from("rgi_company_settings").select("default_payment_terms_days").limit(1).maybeSingle();
        const issue = a.rechnungsdatum ?? heute();
        const payload: Record<string, unknown> = {
          issue_date: issue,
          due_date: a.selbstentnahme ? null : (a.faellig_am ?? plusTage(issue, Number(firma?.default_payment_terms_days ?? 14))),
          service_period_from: a.leistung_von ?? null,
          service_period_to: a.leistung_bis ?? null,
          intro_text: a.einleitung ?? null,
          footer_text: a.schlusstext ?? null,
          paid_by_withdrawal: !!a.selbstentnahme,
        };
        if (clientId) payload.client_id = clientId;
        if (a.building_id) payload.building_id = a.building_id;
        if (a.project_id) payload.project_id = a.project_id;

        let id = a.invoice_id as string | undefined;
        if (id) {
          const { error } = await db.from("rgi_invoices").update(payload).eq("id", id);
          if (error) throw error;
          await db.from("rgi_invoice_items").delete().eq("invoice_id", id);
        } else {
          const { data: inv, error } = await db.from("rgi_invoices").insert({ ...payload, status: "draft", created_by: await d.uploaderId(a.mitarbeiter_email) }).select("id").single();
          if (error) throw error;
          id = inv.id;
        }
        const rows = (a.positionen as any[]).map((p, i) => ({
          invoice_id: id, position: i + 1, kind: p.art ?? "flat", description: String(p.beschreibung).trim(),
          quantity: p.menge ?? 1, unit: p.einheit ?? "pauschal", unit_price_net: p.einzelpreis_netto, vat_rate: p.ust_satz ?? 19,
        }));
        const { error: pErr } = await db.from("rgi_invoice_items").insert(rows);
        if (pErr) throw pErr;

        const r = await funktion("rgi-render-invoice", { invoice_id: id, formats: ["pdf"] });
        const inv = await laden(id!);
        await log("rechnung_entwurf_anlegen", { invoice_id: id, neu: !a.invoice_id, brutto: inv.total_gross, mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          status: "ENTWURF – noch keine Rechnungsnummer",
          ...zusammenfassung(inv),
          vorschau_pdf: r.pdf_path ? await pdfLink(r.pdf_path) : null,
          naechster_schritt: "Vorschau dem Nutzer zeigen. Festschreiben (Nummer + finales PDF) nur nach seiner Zustimmung mit rechnung_festschreiben.",
        };
      },
    },
    {
      name: "rechnung_festschreiben",
      description:
        "Schreibt einen Rechnungsentwurf fest: vergibt die nächste Rechnungsnummer, setzt den Status auf 'gestellt' und erzeugt das finale PDF – wie 'Festschreiben' im Rechnungseditor. Mit Objektbezug landet die Rechnung wie in der App in den Zahlungen des Objekts. WICHTIG: Zuerst ohne bestaetigt aufrufen (nur Vorschau), dem Nutzer zeigen und erst nach seiner ausdrücklichen Zustimmung mit bestaetigt=true. Nicht umkehrbar. Optional wird das PDF an einen Mail-Entwurf gehängt (mail_entwurf_id) und/oder als Anhang-Objekt für mail_entwurf_anlegen geliefert.",
      inputSchema: S({
        invoice_id: uuid("Rechnungsentwurf"),
        bestaetigt: { type: "boolean", description: "erst nach ausdrücklicher Zustimmung des Nutzers true setzen" },
        mail_entwurf_id: uuid("optional: E-Mail-Entwurf (email_drafts), an den das PDF gehängt wird"),
        mitarbeiter_email: str("optional: wer das veranlasst"),
      }, ["invoice_id"]),
      run: async (a) => {
        let inv = await laden(a.invoice_id);
        if (!(inv.items ?? []).length) throw new Error("Die Rechnung hat keine Positionen.");
        if (!inv.invoice_number && !a.bestaetigt) {
          return { status: "VORSCHAU – noch nicht festgeschrieben", ...zusammenfassung(inv), hinweis: "Dem Nutzer zeigen. Erst nach ausdrücklicher Zustimmung mit bestaetigt=true aufrufen – die Rechnungsnummer ist danach vergeben." };
        }
        let neuVergeben = false;
        if (!inv.invoice_number) {
          const { data: nr, error: nErr } = await db.rpc("rgi_next_invoice_number", inv.project?.sparte ? { p_sparte: inv.project.sparte } : {});
          if (nErr || !nr) throw new Error(`Rechnungsnummer konnte nicht vergeben werden: ${nErr?.message ?? "unbekannt"}`);
          // Nur festschreiben, wenn in der Zwischenzeit niemand anderes eine Nummer vergeben hat
          const { data: upd, error: uErr } = await db.from("rgi_invoices")
            .update({ invoice_number: nr, status: "sent", sent_at: new Date().toISOString() })
            .eq("id", inv.id).is("invoice_number", null).select("id");
          if (uErr) throw uErr;
          if (!upd?.length) throw new Error(`Rechnung wurde inzwischen anderweitig festgeschrieben – Nummer ${nr} ist verbraucht, bitte in der App prüfen.`);
          neuVergeben = true;
        }
        const r = await funktion("rgi-render-invoice", { invoice_id: inv.id, formats: ["pdf"] });
        if (!r.pdf_path) throw new Error(r.pdf_error ?? "PDF wurde nicht erzeugt");
        inv = await laden(inv.id);

        // Kopie als Mail-Anhang (gleicher Speicherort wie mail_anhang_vorbereiten)
        const { data: blob, error: dErr } = await db.storage.from("invoices").download(r.pdf_path);
        if (dErr || !blob) throw new Error("PDF konnte nicht geladen werden");
        const dateiname = `Rechnung_${inv.invoice_number}.pdf`;
        const anhangPfad = `outgoing/claude/${crypto.randomUUID()}/${dateiname}`;
        const { error: upErr } = await db.storage.from("email-attachments").upload(anhangPfad, blob, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        const anhang = { storage_path: anhangPfad, dateiname, mime_type: "application/pdf" };

        let mail_entwurf: string | undefined;
        if (a.mail_entwurf_id) {
          const { data: dr } = await db.from("email_drafts").select("id, attachments").eq("id", a.mail_entwurf_id).maybeSingle();
          if (!dr) throw new Error("Mail-Entwurf nicht gefunden – Rechnung ist trotzdem festgeschrieben.");
          const atts = ((dr.attachments ?? []) as any[]).filter((x) => x.filename !== dateiname);
          atts.push({ filename: dateiname, storage_path: anhangPfad, contentType: "application/pdf", size: (await d.objektGroesse("email-attachments", anhangPfad)) ?? blob.size });
          const { error } = await db.from("email_drafts").update({ attachments: atts, updated_at: new Date().toISOString() }).eq("id", dr.id);
          if (error) throw error;
          mail_entwurf = `PDF an Mail-Entwurf ${dr.id} gehängt`;
        }

        await log("rechnung_festschreiben", { invoice_id: inv.id, nummer: inv.invoice_number, neu: neuVergeben, brutto: inv.total_gross, mail_entwurf_id: a.mail_entwurf_id ?? null, mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          status: neuVergeben ? `FESTGESCHRIEBEN – Nummer ${inv.invoice_number}` : `War bereits festgeschrieben (${inv.invoice_number}) – PDF neu erzeugt`,
          ...zusammenfassung(inv),
          pdf: await pdfLink(r.pdf_path),
          anhang,
          zahlungen: r.payment === "created" || r.payment === "updated" ? "in den Zahlungen des Objekts eingestellt" : r.payment_error ? `nicht in Zahlungen: ${r.payment_error}` : "ohne Objektbezug – Empfänger überweist selbst",
          mail_entwurf,
        };
      },
    },
  ];
}
