// Verwalter-Angebote über den Claude-Konnektor – gleicher Ablauf wie der Angebots-Assistent der App:
//   angebote_suchen / angebot_lesen       Überblick und Details
//   angebot_speichern                    neu anlegen oder ändern; Standardpositionen und Vertragswerte
//                                        aus _shared/angebot-vorgaben.ts, Word/PDF über rgi-render-offer
//   angebot_gebaeude_anlegen             gewonnenes Angebot übernehmen: Gebäude, Verwaltervertrag
//                                        (_shared/vertrag-aus-angebot.ts), Status "gewonnen",
//                                        Rechnungsempfänger – erst Vorschau, dann nur mit bestaetigt=true.
import { ANGEBOT_VERTRAGSWERTE, RGI_STANDARD_FEES, angebotVertragswerte, contractEndDate, parseTermYears, toIsoDate } from "../_shared/angebot-vorgaben.ts";
import { vertragAusAngebot } from "../_shared/vertrag-aus-angebot.ts";

type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const num = (d: string) => ({ type: "number", description: d });
const int = (d: string) => ({ type: "integer", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });
const datum = (d: string) => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: `${d} (JJJJ-MM-TT)` });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STATUS: Record<string, string> = { inquiry: "Anfrage", drafted: "Entwurf", sent: "Versendet", won: "Gewonnen", lost: "Abgelehnt", withdrawn: "Zurückgezogen" };
const eur = (n: number | null | undefined) => n == null ? null : (Math.round(Number(n) * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const heute = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const monatlich = (o: any) =>
  ([["rate_apartment", "units_apartment"], ["rate_commercial", "units_commercial"], ["rate_parking", "units_parking"], ["rate_other", "units_other"]] as const)
    .reduce((s, [r, u]) => s + (Number(o[r]) || 0) * (Number(o[u]) || 0), 0);

/** Positionen in der Form von offer_items (wie useSaveOfferItems in der App) */
function positionsZeile(offerId: string, it: any, i: number) {
  return {
    offer_id: offerId, position: i, fee_type: it.fee_type ?? null, label: it.label || "Position", basis: it.basis ?? "case",
    amount: it.amount ?? null, percent: it.percent ?? null, quantity: it.quantity ?? 1, is_gross: !!it.is_gross,
    vat_rate: it.vat_rate ?? 19, is_included: it.is_included !== false, threshold: it.threshold ?? null,
    min_amount: it.min_amount ?? null, max_count: it.max_count ?? null, debtor: it.debtor ?? "community",
    halved_if_supervised: !!it.halved_if_supervised, tier_from: it.tier_from ?? null, tier_to: it.tier_to ?? null, note: it.note ?? null,
  };
}

export function angebotTools(d: Deps): Tool[] {
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
    const { data, error } = await db.from("offers").select("*, items:offer_items(*)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Angebot nicht gefunden");
    data.items = (data.items ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    return data;
  }

  async function link(path: string | null) {
    if (!path) return null;
    const { data } = await db.storage.from("invoices").createSignedUrl(path, 24 * 3600);
    return data?.signedUrl ?? null;
  }

  async function gebaeudeZumVertrag(contractId: string | null) {
    if (!contractId) return null;
    const { data } = await db.from("management_contracts").select("building_id, buildings(id, name, building_code)").eq("id", contractId).maybeSingle();
    return data?.buildings ? { building_id: data.buildings.id, name: data.buildings.name, objektnummer: data.buildings.building_code } : null;
  }

  function ueberblick(o: any) {
    const cd = o.contract_defaults ?? {};
    return {
      offer_id: o.id,
      interessent: o.prospect_name,
      status: STATUS[o.status] ?? o.status,
      objekt: [o.object_address, [o.object_zip, o.object_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      verwaltungsart: o.management_mode === "rent" ? "Mietverwaltung" : "WEG-Verwaltung",
      einheiten: { wohnungen: o.units_apartment, gewerbe: o.units_commercial, stellplaetze: o.units_parking, sonstige: o.units_other },
      saetze_netto_je_einheit_monat: { wohnung: o.rate_apartment, gewerbe: o.rate_commercial, stellplatz: o.rate_parking, sonstige: o.rate_other },
      grundverguetung_monatlich_netto: eur(o.monthly_net),
      beginn: o.desired_start,
      laufzeit_jahre: parseTermYears(cd["laufzeit.jahre_anzahl"]) ?? parseTermYears(cd["laufzeit.jahre"]),
      bestellung_bis: toIsoDate(cd["bestellung.bis"]),
      ansprechpartner: o.contact_person, email: o.contact_email, telefon: o.contact_phone,
      versendet_am: o.sent_on, wiedervorlage: o.follow_up_on, entschieden_am: o.decided_on, ablehnungsgrund: o.lost_reason,
    };
  }

  const zusatzSchema = {
    type: "array",
    description: "Zusatzleistungen (ersetzt die komplette Liste). Felder wie offer_items: label, basis (unit_month, case, item_year, item, hour, claim_payout, gross_project_volume, monthly_flat, net_rent_percent, custom), amount bzw. percent, is_gross, vat_rate, is_included, debtor (community/owner/tenant), threshold, min_amount, max_count, tier_from, tier_to, halved_if_supervised, fee_type, note.",
    items: { type: "object", required: ["label", "basis"], properties: {
      label: { type: "string" }, basis: { type: "string" }, amount: { type: "number" }, percent: { type: "number" }, quantity: { type: "number" },
      is_gross: { type: "boolean" }, vat_rate: { type: "number" }, is_included: { type: "boolean" }, debtor: { type: "string", enum: ["community", "owner", "tenant"] },
      threshold: { type: "number" }, min_amount: { type: "number" }, max_count: { type: "integer" }, tier_from: { type: "number" }, tier_to: { type: "number" },
      halved_if_supervised: { type: "boolean" }, fee_type: { type: "string" }, note: { type: "string" },
    } },
  };

  return [
    {
      name: "angebote_suchen",
      description: "Listet Verwalter-Angebote (RGI › Angebote) mit offer_id, Interessent, Objekt, Status und monatlicher Grundvergütung. Filter nach Text (Interessent/Objekt) und Status.",
      inputSchema: S({
        suche: str("optional: Teil von Interessent, Straße oder Ort"),
        status: { type: "string", enum: Object.keys(STATUS), description: "optional" },
        limit: int("Standard 30"),
      }),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        let q = db.from("offers").select("id, prospect_name, status, object_address, object_zip, object_city, management_mode, units_apartment, units_commercial, units_parking, monthly_net, desired_start, sent_on, follow_up_on, won_contract_id, created_at")
          .order("created_at", { ascending: false }).limit(Math.min(a.limit ?? 30, 100));
        if (a.status) q = q.eq("status", a.status);
        if (a.suche) q = q.or(`prospect_name.ilike.%${a.suche}%,object_address.ilike.%${a.suche}%,object_city.ilike.%${a.suche}%`);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map((o: any) => ({
          offer_id: o.id, interessent: o.prospect_name, status: STATUS[o.status] ?? o.status,
          objekt: [o.object_address, [o.object_zip, o.object_city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
          einheiten: [o.units_apartment && `${o.units_apartment} Whg.`, o.units_commercial && `${o.units_commercial} Gew.`, o.units_parking && `${o.units_parking} Stellpl.`].filter(Boolean).join(", "),
          monatlich_netto: eur(o.monthly_net), beginn: o.desired_start, versendet_am: o.sent_on, wiedervorlage: o.follow_up_on,
          uebernommen: !!o.won_contract_id, angelegt: String(o.created_at).slice(0, 10),
        }));
      },
    },
    {
      name: "angebot_lesen",
      description: "Liefert ein Angebot mit allen Angaben: Objekt, Einheiten, Sätze, Zusatzleistungen (Positionen), Vertragswerte, Antworten zum Objekt und Links zu Vertragsentwurf und Übersichtsblatt (PDF, 24 Std.).",
      inputSchema: S({ offer_id: uuid("Angebot") }, ["offer_id"]),
      annotations: { readOnlyHint: true },
      run: async ({ offer_id }) => {
        const o = await laden(offer_id);
        const { data: fragen } = await db.from("offer_questions").select("key, label").eq("is_active", true).order("position");
        return {
          ...ueberblick(o),
          bisheriger_verwalter: o.previous_manager, anfragequelle: o.inquiry_source, anfragedatum: o.inquiry_date,
          objektvertreter: o.object_representative, grundbuch: o.land_register_ref, notizen: o.notes, kontakt_id: o.prospect_contact_id,
          antworten: (fragen ?? []).map((f: any) => ({ key: f.key, frage: f.label, antwort: o.answers?.[f.key] ?? null })),
          vertragswerte: o.contract_defaults ?? {},
          zusatzleistungen: o.items.map((it: any) => ({ label: it.label, basis: it.basis, amount: it.amount, percent: it.percent, is_gross: it.is_gross, vat_rate: it.vat_rate, is_included: it.is_included, debtor: it.debtor, threshold: it.threshold, min_amount: it.min_amount, max_count: it.max_count, tier_from: it.tier_from, tier_to: it.tier_to, halved_if_supervised: it.halved_if_supervised, fee_type: it.fee_type, note: it.note })),
          vertragsentwurf_pdf: await link(o.pdf_storage_path),
          uebersichtsblatt_pdf: await link(o.summary_pdf_storage_path),
          uebernommen_in: await gebaeudeZumVertrag(o.won_contract_id),
        };
      },
    },
    {
      name: "angebot_speichern",
      description:
        "Legt ein Verwalter-Angebot an (ohne offer_id) oder ändert es (mit offer_id – nur die übergebenen Felder ändern sich). Neue Angebote bekommen wie im Assistenten der App alle Standard-Zusatzleistungen und Vertragswerte des RGI-Verwaltervertrags. Laufzeit-Texte und Ende der Bestellung werden aus Beginn und Laufzeit berechnet. Sobald Sätze und Einheiten eingetragen sind, entstehen Vertragsentwurf (Word + PDF) und Übersichtsblatt neu – wie beim Speichern in der App. Sätze und Beträge nur nach Vorgabe des Nutzers, nie schätzen. Es wird nichts versendet.",
      inputSchema: S({
        offer_id: uuid("optional: vorhandenes Angebot ändern"),
        interessent: str("Name, z. B. 'WEG Musterstr. 5' (Pflicht bei neuen Angeboten)"),
        kontakt_id: uuid("optional: Kontakt aus der App"),
        ansprechpartner: str("Ansprechpartner"), email: str("E-Mail"), telefon: str("Telefon"),
        strasse: str("Objekt: Straße und Hausnummer"), plz: str("Objekt: PLZ"), ort: str("Objekt: Ort"),
        verwaltungsart: { type: "string", enum: ["weg", "rent"], description: "weg = WEG-Verwaltung, rent = Mietverwaltung (Standard weg)" },
        wohnungen: int("Anzahl Wohnungen"), gewerbe: int("Anzahl Gewerbe/Teileigentum"), stellplaetze: int("Anzahl Garagen/Stellplätze"), sonstige: int("Anzahl sonstige Einheiten"),
        satz_wohnung: num("Netto je Wohnung und Monat"), satz_gewerbe: num("Netto je Gewerbeeinheit und Monat"), satz_stellplatz: num("Netto je Stellplatz und Monat"), satz_sonstige: num("Netto je sonstiger Einheit und Monat"),
        beginn: datum("gewünschter Verwaltungsbeginn"),
        laufzeit_jahre: { type: "integer", minimum: 1, maximum: 5, description: "Laufzeit der Bestellung (Standard 3; § 26 Abs. 2 WEG: Erstbestellung max. 3, sonst max. 5 Jahre)" },
        bestellung_bis: datum("optional: Ende der Bestellung abweichend von Beginn + Laufzeit"),
        bisheriger_verwalter: str("bisheriger Verwalter"), anfragequelle: str("z. B. Empfehlung, Website"), anfragedatum: datum("Datum der Anfrage"),
        objektvertreter: str("Vertreter der Gemeinschaft für den Vertrag"), grundbuch: str("Grundbuchangabe"),
        antworten: { type: "object", additionalProperties: true, description: "Antworten zum Objekt, Schlüssel wie in angebot_lesen (z. B. building_age, change_reason, owner_count); werden ergänzt" },
        vertragswerte: { type: "object", additionalProperties: { type: "string" }, description: "Vertragswerte überschreiben, z. B. {\"freigabe.grenze\":\"2.000,00\"}; werden ergänzt" },
        zusatzleistungen: zusatzSchema,
        status: { type: "string", enum: ["sent", "lost", "withdrawn", "drafted"], description: "optional: versendet / abgelehnt / zurückgezogen / wieder öffnen. 'Gewonnen' nur über angebot_gebaeude_anlegen." },
        versendet_am: datum("bei status sent (Standard heute)"),
        wiedervorlage: datum("Wiedervorlage"),
        ablehnungsgrund: str("bei status lost"),
        notizen: str("interne Notizen (ersetzt den bisherigen Text)"),
        dokumente_erzeugen: { type: "boolean", description: "Vertragsentwurf/Übersichtsblatt neu erzeugen (Standard true, sobald ein Honorar eingetragen ist)" },
        mitarbeiter_email: str("optional: wer das veranlasst"),
      }),
      run: async (a) => {
        const alt = a.offer_id ? await laden(a.offer_id) : null;
        if (!alt && !(a.interessent ?? "").trim()) throw new Error("interessent fehlt");
        if (alt?.status === "won" && a.status) throw new Error("Das Angebot ist bereits übernommen (gewonnen) – Status nicht mehr änderbar.");

        const felder: Record<string, unknown> = {};
        const setze = (spalte: string, wert: unknown) => { if (wert !== undefined) felder[spalte] = wert; };
        setze("prospect_name", a.interessent?.trim()); setze("prospect_contact_id", a.kontakt_id);
        setze("contact_person", a.ansprechpartner); setze("contact_email", a.email); setze("contact_phone", a.telefon);
        setze("object_address", a.strasse); setze("object_zip", a.plz); setze("object_city", a.ort);
        setze("management_mode", a.verwaltungsart);
        setze("units_apartment", a.wohnungen); setze("units_commercial", a.gewerbe); setze("units_parking", a.stellplaetze); setze("units_other", a.sonstige);
        setze("rate_apartment", a.satz_wohnung); setze("rate_commercial", a.satz_gewerbe); setze("rate_parking", a.satz_stellplatz); setze("rate_other", a.satz_sonstige);
        setze("desired_start", a.beginn); setze("previous_manager", a.bisheriger_verwalter); setze("inquiry_source", a.anfragequelle);
        setze("inquiry_date", a.anfragedatum); setze("object_representative", a.objektvertreter); setze("land_register_ref", a.grundbuch);
        setze("follow_up_on", a.wiedervorlage); setze("notes", a.notizen);

        const neu = { ...(alt ?? { status: "inquiry", management_mode: "weg", inquiry_date: heute() }), ...felder } as any;
        neu.answers = { ...(alt?.answers ?? {}), ...(a.antworten ?? {}) };

        // Vertragswerte: Standard → gespeichert → Änderungen; Laufzeit und Ende wie im Assistenten
        const gespeichert = alt?.contract_defaults ?? {};
        const werte: Record<string, string> = { ...ANGEBOT_VERTRAGSWERTE, ...gespeichert, ...(a.vertragswerte ?? {}) };
        if (a.laufzeit_jahre) werte["laufzeit.jahre_anzahl"] = String(a.laufzeit_jahre);
        const altesEnde = toIsoDate(gespeichert["bestellung.bis"]);
        const altJahre = parseTermYears(gespeichert["laufzeit.jahre_anzahl"]) ?? parseTermYears(gespeichert["laufzeit.jahre"]);
        const endeVonHand = altesEnde && altesEnde !== contractEndDate(alt?.desired_start, altJahre);
        neu.contract_defaults = angebotVertragswerte(werte, neu.desired_start, a.bestellung_bis ?? (endeVonHand ? altesEnde : null));
        neu.monthly_net = monatlich(neu) || null;

        if (a.status) {
          neu.status = a.status;
          if (a.status === "sent") neu.sent_on = a.versendet_am ?? alt?.sent_on ?? heute();
          if (a.status === "lost" || a.status === "withdrawn") { neu.decided_on = heute(); neu.lost_reason = a.ablehnungsgrund ?? null; }
          if (a.status === "drafted") { neu.decided_on = null; neu.lost_reason = null; }
        }

        const { data: vorlagen } = await db.from("rgi_invoice_templates").select("id").eq("template_kind", "contract").limit(1);
        const kannErzeugen = (neu.monthly_net ?? 0) > 0 && (vorlagen ?? []).length > 0;
        if (kannErzeugen && neu.status === "inquiry") neu.status = "drafted";

        const { items: _i, id: _id, created_at: _c, updated_at: _u, ...zeile } = neu;
        let offerId = alt?.id as string | undefined;
        if (offerId) {
          const { error } = await db.from("offers").update(zeile).eq("id", offerId);
          if (error) throw error;
        } else {
          const { data, error } = await db.from("offers").insert({ ...zeile, created_by: await d.uploaderId(a.mitarbeiter_email) }).select("id").single();
          if (error) throw error;
          offerId = data.id;
        }

        // Positionen: neue Angebote mit den Standard-Zusatzleistungen, sonst nur bei Übergabe ersetzen
        const positionen = a.zusatzleistungen ?? (alt ? null : RGI_STANDARD_FEES);
        if (positionen) {
          const { error: delErr } = await db.from("offer_items").delete().eq("offer_id", offerId);
          if (delErr) throw delErr;
          if (positionen.length) {
            const { error } = await db.from("offer_items").insert(positionen.map((it: any, i: number) => positionsZeile(offerId!, it, i)));
            if (error) throw error;
          }
        }

        let dokumente: any = undefined;
        if (kannErzeugen && a.dokumente_erzeugen !== false) {
          try {
            const r = await funktion("rgi-render-offer", { offer_id: offerId, formats: ["docx", "pdf"] });
            dokumente = {
              vertragsentwurf_pdf: await link(r.pdf_path ?? null), vertragsentwurf_word: await link(r.docx_path ?? null),
              uebersichtsblatt_pdf: await link(r.summary_pdf_path ?? null),
              hinweise: [r.pdf_error && `PDF: ${r.pdf_error}`, r.summary_error && !/Keine Vorlage/.test(r.summary_error) && `Übersichtsblatt: ${r.summary_error}`].filter(Boolean),
            };
          } catch (e) {
            dokumente = { fehler: `Gespeichert, aber Word/PDF nicht erstellt: ${(e as Error).message}` };
          }
        }

        const o = await laden(offerId!);
        await log("angebot_speichern", { offer_id: offerId, neu: !alt, status: o.status, monatlich: o.monthly_net, mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          status: alt ? "ANGEBOT GEÄNDERT" : "ANGEBOT ANGELEGT",
          ...ueberblick(o),
          zusatzleistungen: o.items.length,
          dokumente: dokumente ?? (kannErzeugen ? "nicht neu erzeugt" : "Vertragsentwurf entsteht, sobald Sätze und Einheiten eingetragen sind"),
        };
      },
    },
    {
      name: "angebot_gebaeude_anlegen",
      description:
        "Übernimmt ein gewonnenes Angebot in die Verwaltung: legt das Gebäude an (Objektnummer und Stammakte-Ordner automatisch) oder nutzt ein vorhandenes (building_id), erzeugt den Verwaltervertrag mit allen Vergütungsbausteinen wie 'In Vertrag übernehmen' in der App, setzt das Angebot auf 'gewonnen' und legt das Objekt als Rechnungsempfänger an. WICHTIG: Zuerst ohne bestaetigt aufrufen (Vorschau mit Hinweisen, z. B. ähnliche vorhandene Gebäude), dem Nutzer zeigen und erst nach seiner ausdrücklichen Zustimmung mit bestaetigt=true.",
      inputSchema: S({
        offer_id: uuid("Angebot"),
        bestaetigt: { type: "boolean", description: "erst nach ausdrücklicher Zustimmung des Nutzers true setzen" },
        building_id: uuid("optional: vorhandenes Gebäude verwenden statt neu anlegen"),
        gebaeude_name: str("optional: Name des Gebäudes (Standard: Straße und Hausnummer aus dem Angebot)"),
        verwalter_email: str("optional: zuständiger Verwalter (Mitarbeiter-E-Mail)"),
        mitarbeiter_email: str("optional: wer das veranlasst"),
      }, ["offer_id"]),
      run: async (a) => {
        const o = await laden(a.offer_id);
        if (o.won_contract_id) {
          const g = await gebaeudeZumVertrag(o.won_contract_id);
          throw new Error(`Angebot ist bereits übernommen${g ? ` (Gebäude ${g.name}, ${g.objektnummer})` : ""}.`);
        }
        if (!o.object_address && !a.building_id) throw new Error("Im Angebot fehlt die Objektadresse – erst mit angebot_speichern ergänzen.");

        let vorhanden: any = null;
        if (a.building_id) {
          const { data } = await db.from("buildings").select("id, name, building_code, address, postal_code, city, management_mode").eq("id", a.building_id).maybeSingle();
          if (!data) throw new Error("building_id nicht gefunden");
          vorhanden = data;
        }
        // Ähnliche Gebäude (gleiche Straße/Hausnummer) – damit kein Objekt doppelt entsteht
        const strasse = String(o.object_address ?? "").trim();
        const { data: aehnlich } = strasse && !vorhanden
          ? await db.from("buildings").select("id, name, building_code, address, postal_code, city").or(`address.ilike.%${strasse.replace(/[,()]/g, " ")}%,name.ilike.%${strasse.replace(/[,()]/g, " ")}%`).limit(5)
          : { data: [] };
        const { data: vertraege } = vorhanden
          ? await db.from("management_contracts").select("id, status, appointed_from").eq("building_id", vorhanden.id).eq("status", "active")
          : { data: [] };

        const gebaeude = vorhanden ?? {
          name: (a.gebaeude_name ?? strasse).trim(),
          address: strasse,
          postal_code: o.object_zip ?? null,
          city: o.object_city ?? null,
          management_mode: o.management_mode ?? "weg",
          type: o.management_mode === "rent" ? "miete" : "weg",
          unit_count: (o.units_apartment ?? 0) + (o.units_commercial ?? 0),
        };
        const cd = o.contract_defaults ?? {};
        const ende = toIsoDate(cd["bestellung.bis"]) || contractEndDate(o.desired_start, parseTermYears(cd["laufzeit.jahre_anzahl"]) ?? parseTermYears(cd["laufzeit.jahre"])) || null;
        const hinweise = [
          ...(aehnlich ?? []).map((b: any) => `Ähnliches Gebäude vorhanden: ${b.name} (${b.building_code}, ${[b.address, b.postal_code, b.city].filter(Boolean).join(" ")}) – ggf. building_id ${b.id} verwenden`),
          ...((vertraege ?? []).length ? [`Das Gebäude hat bereits ${vertraege.length} aktiven Verwaltervertrag – es käme ein weiterer hinzu.`] : []),
          ...(!o.desired_start ? ["Kein Verwaltungsbeginn im Angebot – der Vertrag hätte keinen Bestellungsbeginn."] : []),
          ...(!o.monthly_net ? ["Keine Grundvergütung im Angebot (Sätze/Einheiten fehlen)."] : []),
          ...(!o.object_zip || !o.object_city ? ["PLZ oder Ort fehlen im Angebot."] : []),
        ];
        const vorschau = {
          gebaeude: vorhanden
            ? { vorhanden: true, building_id: vorhanden.id, name: vorhanden.name, objektnummer: vorhanden.building_code }
            : { vorhanden: false, name: gebaeude.name, adresse: [gebaeude.address, [gebaeude.postal_code, gebaeude.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), verwaltungsart: gebaeude.management_mode, einheiten: gebaeude.unit_count, objektnummer: "wird automatisch vergeben" },
          vertrag: {
            bestellung_von: o.desired_start, bestellung_bis: ende,
            grundverguetung_monatlich_netto: eur(o.monthly_net),
            bausteine: [o.rate_apartment && o.units_apartment && `${o.units_apartment} Wohnungen à ${eur(o.rate_apartment)}`, o.rate_commercial && o.units_commercial && `${o.units_commercial} Gewerbe à ${eur(o.rate_commercial)}`, o.rate_parking && o.units_parking && `${o.units_parking} Stellplätze à ${eur(o.rate_parking)}`, o.rate_other && o.units_other && `${o.units_other} Sonstige à ${eur(o.rate_other)}`].filter(Boolean),
            zusatzleistungen: o.items.filter((it: any) => it.is_included !== false).length,
            freigabegrenze: cd["freigabe.grenze"] ?? null,
          },
          angebot: `${o.prospect_name}: ${STATUS[o.status] ?? o.status} → Gewonnen`,
          rechnungsempfaenger: "Objekt als Rechnungsempfänger (RGI › Kunden), falls noch nicht vorhanden",
          hinweise,
        };
        if (!a.bestaetigt) return { status: "VORSCHAU – noch nichts angelegt", ...vorschau, naechster_schritt: "Dem Nutzer zeigen. Erst nach ausdrücklicher Zustimmung mit bestaetigt=true aufrufen." };

        // 1. Gebäude
        let buildingId = vorhanden?.id as string | undefined;
        let neuesGebaeude = false;
        if (!buildingId) {
          const { data: b, error } = await db.from("buildings").insert({ ...gebaeude, building_code: "" }).select("id, name, building_code").single();
          if (error) throw new Error(`Gebäude konnte nicht angelegt werden: ${error.message}`);
          buildingId = b.id;
          neuesGebaeude = true;
        }
        // 2. Vertrag + Angebot gewonnen (gemeinsame Logik mit der App)
        let vertrag: any;
        try {
          vertrag = await vertragAusAngebot(db, o, buildingId!);
        } catch (e) {
          if (neuesGebaeude) await db.from("buildings").delete().eq("id", buildingId);
          throw new Error(`Vertrag konnte nicht angelegt werden${neuesGebaeude ? " – Gebäude wieder entfernt" : ""}: ${(e as Error).message}`);
        }
        const nachher: string[] = [];
        // 3. Zuständiger Verwalter
        if (a.verwalter_email) {
          const { data: p } = await db.from("profiles").select("user_id, role").ilike("email", a.verwalter_email).maybeSingle();
          if (p?.user_id && ["admin", "employee"].includes(String(p.role))) {
            const { error } = await db.from("building_managers").insert({ building_id: buildingId, user_id: p.user_id });
            if (error) nachher.push(`Verwalter nicht zugeordnet: ${error.message}`);
          } else nachher.push(`Verwalter ${a.verwalter_email} nicht gefunden – bitte in der App zuordnen.`);
        }
        // 4. Rechnungsempfänger
        const { data: kunde } = await db.from("rgi_clients").select("id").eq("building_id", buildingId).eq("type", "building").limit(1).maybeSingle();
        if (!kunde) {
          const { data: geb } = await db.from("buildings").select("name, address, postal_code, city, management_mode").eq("id", buildingId).single();
          const name = geb.management_mode === "weg" && !/^weg\b/i.test(geb.name) ? `WEG ${geb.name}` : geb.name;
          const { error } = await db.from("rgi_clients").insert({ name, type: "building", building_id: buildingId, address_line1: geb.address, zip: geb.postal_code?.trim() || null, city: geb.city, country: "DE", created_by: await d.uploaderId(a.mitarbeiter_email) });
          if (error) nachher.push(`Rechnungsempfänger nicht angelegt: ${error.message}`);
        }

        const { data: b } = await db.from("buildings").select("id, name, building_code").eq("id", buildingId).single();
        await log("angebot_gebaeude_anlegen", { offer_id: o.id, building_id: buildingId, neues_gebaeude: neuesGebaeude, contract_id: vertrag.id, mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          status: "ÜBERNOMMEN",
          gebaeude: { building_id: b.id, name: b.name, objektnummer: b.building_code, neu_angelegt: neuesGebaeude },
          vertrag_id: vertrag.id, bestellung_von: vertrag.appointed_from, bestellung_bis: vertrag.appointed_until,
          angebot: "Gewonnen",
          hinweise: [...hinweise.filter((h) => !h.startsWith("Ähnliches")), ...nachher],
          als_naechstes: "In der App: Einheiten und Eigentümer anlegen (bzw. Import), Bankkonto und Wirtschaftsjahr prüfen.",
        };
      },
    },
  ];
}
