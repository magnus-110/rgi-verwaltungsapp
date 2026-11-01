// finanz-dokumente – Jahresabrechnung, Wirtschaftsplan und §35a-Bescheinigungen serverseitig erzeugen.
// Rechnet mit DENSELBEN Modulen wie die App (supabase/functions/_shared/finanzen/*) und füllt
// dieselben Vorlagen über dieselben Funktionen (generate-billing-document, generate-35a-docx).
// Aufruf: Claude-Konnektor (Service-Schlüssel) oder Büro-Mitarbeiter.
//
// Body: { art: "jahresabrechnung"|"wirtschaftsplan"|"bescheinigung_35a", building_id, wirtschaftsjahr,
//         einheiten?: string[], nur_gesamt?: boolean, nur_zaehlen?: boolean, format?: "pdf"|"docx", vorlage_id? }
// Antwort: { anzahl, dateien: [{ dateiname, bucket, path, einheiten?, kontakt_ids?, kategorie }], zusammenfassung, warnungen }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import { berechneWirtschaftsplan, ladeWirtschaftsplanDaten, wirtschaftsplanDateiname, unitNo } from "../_shared/finanzen/wirtschaftsplan.ts";
import { unitFilePrefix } from "../_shared/finanzen/unitFilePrefix.ts";
import { einheitKey } from "../_shared/rundmail-anhaenge.ts";
import { abrechnungsDokumente } from "./abrechnung.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PARALLEL = 4;

/** Speicher-Schlüssel nur mit erlaubten Zeichen (§, Umlaute u. a. lehnt der Speicher ab) */
export const speicherName = (n: string) =>
  n.replace(/§/g, "Par").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[^\w.\-]+/g, "_");

export type Auftrag = {
  /** Dateiname ohne Endung */
  name: string;
  fn: "generate-billing-document" | "generate-35a-docx";
  body: Record<string, unknown>;
  einheiten?: string[];
  kontakt_ids?: string[];
  /** DMS-Ordner (Slug) */
  kategorie: string;
};

/** Vorlage wie in der App: neueste der Art (BillingSettlement/FinanceDocumentsDialog) */
export async function vorlage(db: any, scope: string, vorlage_id?: string | null): Promise<string> {
  if (vorlage_id) return vorlage_id;
  const { data } = await db.from("billing_templates").select("id").eq("scope", scope).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.id) throw new Error(`Keine Vorlage für „${scope}" hinterlegt (Buchhaltung › Dokumente)`);
  return data.id;
}

/** Einheiten-Filter (["3","0007"]) */
export const passtEinheit = (filter: string[] | null | undefined, unit: string | null | undefined) =>
  !filter?.length || filter.map((u) => einheitKey(u)).includes(einheitKey(unit ?? ""));

async function erzeugen(db: any, auftraege: Auftrag[], format: "pdf" | "docx") {
  const lauf = crypto.randomUUID();
  const dateien: any[] = [];
  const fehler: string[] = [];
  const eins = async (a: Auftrag) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${a.fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...a.body, format }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 300));
      const bytes = new Uint8Array(await res.arrayBuffer());
      const dateiname = `${a.name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120)}.${format}`;
      const path = `outgoing/finanz/${lauf}/${speicherName(dateiname)}`;
      const { error } = await db.storage.from("email-attachments").upload(path, bytes, {
        contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (error) throw new Error(error.message);
      dateien.push({ dateiname, bucket: "email-attachments", path, einheiten: a.einheiten, kontakt_ids: a.kontakt_ids, kategorie: a.kategorie });
    } catch (e) {
      fehler.push(`${a.name}: ${(e as Error).message}`);
    }
  };
  for (let i = 0; i < auftraege.length; i += PARALLEL) await Promise.all(auftraege.slice(i, i + PARALLEL).map(eins));
  // Reihenfolge wie die Aufträge
  const reihenfolge = new Map(auftraege.map((a, i) => [a.name, i]));
  dateien.sort((x, y) => (reihenfolge.get(x.dateiname.replace(/\.\w+$/, "")) ?? 0) - (reihenfolge.get(y.dateiname.replace(/\.\w+$/, "")) ?? 0));
  return { dateien, fehler };
}

// ------------------------------------------------------------ Wirtschaftsplan
async function wirtschaftsplan(db: any, b: any) {
  const jahr = Number(b.wirtschaftsjahr);
  const daten = await ladeWirtschaftsplanDaten(db, b.building_id, jahr);
  const wp = berechneWirtschaftsplan(daten, { fiscalYear: jahr });
  const warnungen: string[] = [];
  if (daten.plan?.status !== "active") warnungen.push("Der Wirtschaftsplan ist noch ein Entwurf (nicht aktiviert).");

  const auftraege: Auftrag[] = [];
  if (!b.einheiten?.length) {
    auftraege.push({
      name: wirtschaftsplanDateiname.gesamt(jahr),
      fn: "generate-billing-document",
      body: { template_id: await vorlage(db, "economic_plan_overall", b.vorlage_id), fiscal_year: jahr, mode: "single", file_prefix: `Gesamtwirtschaftsplan_${jahr}`, items: [{ kind: "overall", payload: wp.buildOverallPlanPayload() }] },
      kategorie: "jahresbericht-gesamt-wp",
    });
  }
  if (!b.nur_gesamt) {
    const tpl = await vorlage(db, "economic_plan_single", b.vorlage_id);
    for (const o of wp.ownerData) {
      if (!passtEinheit(b.einheiten, o.unitNumber)) continue;
      auftraege.push({
        name: wirtschaftsplanDateiname.einzel(jahr, o),
        fn: "generate-billing-document",
        body: { template_id: tpl, fiscal_year: jahr, mode: "single", file_prefix: `Einzelwirtschaftsplan_${jahr}`, items: [{ kind: "owner", ownerId: o.id, ownerName: o.name, unitNumber: unitNo(o), payload: wp.buildOwnerPlanPayload(o.id) }] },
        einheiten: unitNo(o) ? [unitNo(o)] : undefined,
        kontakt_ids: o.raw?.contact_id ? [o.raw.contact_id] : undefined,
        kategorie: "jahresbericht-einzel-wp",
      });
    }
  }
  const zusammenfassung = {
    plan_status: daten.plan?.status,
    summe_gesamt: Math.round(wp.totalPlanned * 100) / 100,
    summe_umlagefaehig: Math.round(wp.distributableTotal * 100) / 100,
    hausgeld_monatlich: wp.hausgeldWerte.map((w) => ({ einheit: w.einheit, name: w.name, monatlich: Math.round(w.monatlich * 100) / 100, davon_ruecklage: Math.round(w.ruecklage * 100) / 100 })),
  };
  return { auftraege, zusammenfassung, warnungen };
}

// ------------------------------------------------------------ §35a
async function paragraph35a(db: any, b: any) {
  const jahr = Number(b.wirtschaftsjahr);
  const { data: periode } = await db.from("billing_periods").select("id").eq("building_id", b.building_id).eq("fiscal_year", jahr).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!periode) throw new Error(`Für ${jahr} gibt es keine Abrechnungsperiode`);
  // Dieselben Empfänger wie in der App: die Ergebnisse der Jahresabrechnung
  const { empfaenger } = await abrechnungsDokumente(db, { building_id: b.building_id, period_id: periode.id, wirtschaftsjahr: jahr, nurEmpfaenger: true });
  const tpl = await vorlage(db, "paragraph_35a", b.vorlage_id);
  const auftraege: Auftrag[] = empfaenger
    .filter((o: any) => passtEinheit(b.einheiten, o.unitNumber))
    .map((o: any) => ({
      name: `${unitFilePrefix(o.unitNumber)}§35a_${jahr}_${o.name}${o.unitNumber && o.unitNumber !== "–" ? `_${o.unitNumber}` : ""}`,
      fn: "generate-35a-docx",
      body: { template_id: tpl, building_id: b.building_id, fiscal_year: jahr, period_id: periode.id, assignment_ids: [o.assignmentId] },
      einheiten: o.unitNumber && o.unitNumber !== "–" ? [o.unitNumber] : undefined,
      kontakt_ids: o.contactId ? [o.contactId] : undefined,
      kategorie: "jahresbericht-35a",
    }));
  return { auftraege, zusammenfassung: { periode_id: periode.id }, warnungen: [] as string[] };
}

// ------------------------------------------------------------ Jahresabrechnung
async function jahresabrechnung(db: any, b: any) {
  const jahr = Number(b.wirtschaftsjahr);
  const { data: periode } = await db.from("billing_periods").select("id").eq("building_id", b.building_id).eq("fiscal_year", jahr).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!periode) throw new Error(`Für ${jahr} gibt es keine Abrechnungsperiode`);
  return await abrechnungsDokumente(db, {
    building_id: b.building_id, period_id: periode.id, wirtschaftsjahr: jahr, einheiten: b.einheiten ?? null, nur_gesamt: !!b.nur_gesamt,
    vorlage: (scope: string) => vorlage(db, scope, null), passtEinheit,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireStaffOrCron(req, corsHeaders);
  if (!auth.ok) return auth.response;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const b = await req.json().catch(() => ({}));
    if (!b?.art || !b?.building_id || !b?.wirtschaftsjahr) return json({ error: "art, building_id und wirtschaftsjahr erforderlich" }, 400);
    const plan =
      b.art === "wirtschaftsplan" ? await wirtschaftsplan(db, b)
      : b.art === "bescheinigung_35a" ? await paragraph35a(db, b)
      : b.art === "jahresabrechnung" ? await jahresabrechnung(db, b)
      : null;
    if (!plan) return json({ error: `Unbekannte Art: ${b.art}` }, 400);
    if (b.nur_zaehlen) return json({ anzahl: plan.auftraege.length, dokumente: plan.auftraege.map((a: Auftrag) => a.name), zusammenfassung: plan.zusammenfassung, warnungen: plan.warnungen });
    if (!plan.auftraege.length) return json({ error: "Keine Dokumente zu erzeugen (Einheiten-Filter prüfen)" }, 400);
    const { dateien, fehler } = await erzeugen(db, plan.auftraege, b.format === "docx" ? "docx" : "pdf");
    if (!dateien.length) return json({ error: `Kein Dokument erzeugt: ${fehler.slice(0, 3).join(" · ")}` }, 500);
    return json({ anzahl: dateien.length, dateien, zusammenfassung: plan.zusammenfassung, warnungen: [...plan.warnungen, ...fehler.map((f) => `Fehlgeschlagen: ${f}`)] });
  } catch (e) {
    console.error("finanz-dokumente", e);
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
