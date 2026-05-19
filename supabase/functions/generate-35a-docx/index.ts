// Generates personalized §35a certificates by rendering a Word template (docxtemplater)
// Returns either a single DOCX or a ZIP with one DOCX per owner.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function convertDocxToPdf(docxBytes: Uint8Array, filename: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
  if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY ist nicht konfiguriert");
  // base64 encode
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < docxBytes.length; i += chunk) {
    bin += String.fromCharCode(...docxBytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const jobResp = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: {
        "import-1": { operation: "import/base64", file: b64, filename },
        "convert-1": { operation: "convert", input: "import-1", output_format: "pdf", engine: "libreoffice" },
        "export-1": { operation: "export/url", input: "convert-1" },
      },
    }),
  });
  if (!jobResp.ok) throw new Error(`CloudConvert Job fehlgeschlagen: ${jobResp.status} ${await jobResp.text()}`);
  const jobJson = await jobResp.json();
  const jobId = jobJson?.data?.id;
  if (!jobId) throw new Error("CloudConvert: keine Job-ID erhalten");
  // server-side wait (blocks until finished, max ~10min)
  const waitResp = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!waitResp.ok) throw new Error(`CloudConvert Wait fehlgeschlagen: ${waitResp.status} ${await waitResp.text()}`);
  const waitJson = await waitResp.json();
  if (waitJson?.data?.status !== "finished") {
    throw new Error(`CloudConvert Job nicht erfolgreich: ${waitJson?.data?.status} – ${JSON.stringify(waitJson?.data?.tasks?.map((t: any) => ({ name: t.name, status: t.status, message: t.message })) || [])}`);
  }
  const exportTask = (waitJson.data.tasks || []).find((t: any) => t.name === "export-1");
  const url = exportTask?.result?.files?.[0]?.url;
  if (!url) throw new Error("CloudConvert: keine Download-URL");
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`PDF-Download fehlgeschlagen: ${dl.status}`);
  return new Uint8Array(await dl.arrayBuffer());
}

function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}
const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDateDe = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("de-DE");
};
const fmtShare = (n: number, key: string) => {
  if (key === "mea") return n.toFixed(3);
  if (key === "qm") return n.toFixed(2);
  if (key === "heizk_abr") return (n * 100).toFixed(2) + " %";
  return n.toFixed(0);
};
const DISTRIBUTION_LABELS: Record<string, string> = {
  mea: "Miteigentumsanteile (MEA)",
  einheit: "je Einheit",
  einheiten: "je Einheit",
  qm: "Wohnfläche (m²)",
  personen: "Personen",
  stellplaetze: "Stellplätze",
  heizk_abr: "Heizkostenabrechnung",
};

function normalizeDistributionKey(key: string | null | undefined): string {
  const raw = String(key || "mea").trim();
  const lower = raw.toLowerCase();
  if (["mea", "einheit", "einheiten", "qm", "personen", "stellplaetze", "heizk_abr"].includes(lower)) return lower;
  return raw;
}

function isSecondary(a: any) {
  return a.billing_mode === "distribution_only" || (a.unit_kind != null && a.unit_kind !== "apartment");
}
function shareValue(a: any, type: string): number {
  const needle = String(type || "").trim().toLowerCase();
  return Number(a.contact_building_shares?.find((s: any) => String(s.share_type || "").trim().toLowerCase() === needle)?.share_value ?? 0) || 0;
}
function ownerName(a: any): string {
  const c = a.contacts || {};
  const company = a.company_name_override || c.company_name;
  if (company) return company;
  const last = a.last_name_override || c.last_name || "";
  const first = a.first_name_override || c.first_name || "";
  return `${last}, ${first}`.replace(/^,\s*|,\s*$/g, "").trim();
}
function ownerAddr(a: any) {
  return {
    street: a.address_street_override || a.contacts?.address_street || "",
    zip: a.address_zip_override || a.contacts?.address_zip || "",
    city: a.address_city_override || a.contacts?.address_city || "",
  };
}
function ownerSal(a: any) {
  return a.salutation_override || a.contacts?.salutation || "";
}

function pickAccountId(b: any, accounts: Map<string, any>): string | null {
  const a = b.account_id ? accounts.get(b.account_id) : undefined;
  const c = b.counter_account_id ? accounts.get(b.counter_account_id) : undefined;
  if (a?.is_35a_relevant) return a.id;
  if (c?.is_35a_relevant) return c.id;
  if (a?.default_distribution_key) return a.id;
  if (c?.default_distribution_key) return c.id;
  return b.counter_account_id || b.account_id || null;
}

function splitLabor(b: any, account: any): { dienste: number; handwerker: number } {
  const labor = Math.abs(Number(b.amount_35a ?? b.amount) || 0);
  if (labor === 0) return { dienste: 0, handwerker: 0 };

  if (b.settlement_35a_type === "handwerker") return { dienste: 0, handwerker: labor };
  if (b.settlement_35a_type === "dienste") return { dienste: labor, handwerker: 0 };

  const detail = b.invoices?.line_items_detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const vatRate = Number(b.invoices?.vat_rate ?? account?.default_vat_rate ?? 19);
    const factor = vatRate > 0 ? 1 + vatRate / 100 : 1;
    let nd = 0, nh = 0;
    for (const it of detail) {
      if (!it?.is_35a) continue;
      const net = Math.abs(Number(it.amount) || 0);
      if (net === 0) continue;
      if (it.type_35a === "handwerker") nh += net;
      else nd += net;
    }
    const sum = (nd + nh) * factor;
    if (sum > 0) return { dienste: labor * (nd * factor / sum), handwerker: labor * (nh * factor / sum) };
  }
  const t = account?.settlement_35a_type === "handwerker" ? "handwerker" : "dienste";
  return t === "handwerker" ? { dienste: 0, handwerker: labor } : { dienste: labor, handwerker: 0 };
}

function getOwnerShare(owner: any, key: string, ctx: any): number {
  const k = (key || "mea").toLowerCase();
  switch (k) {
    case "mea": {
      const own = shareValue(owner, "mea");
      const extra = (owner.contact_id && ctx.extraMea.get(owner.contact_id)) || 0;
      return own + extra;
    }
    case "einheit": case "einheiten": return 1;
    case "qm": return Number(owner.area_sqm_override ?? shareValue(owner, "qm")) || 0;
    case "personen": return shareValue(owner, "personen");
    case "stellplaetze": return (owner.contact_id && ctx.stellplatz.get(owner.contact_id)) || 0;
    case "heizk_abr": return ctx.heating?.[owner.id] ?? 0;
    default: return shareValue(owner, "mea");
  }
}

function formatBookingLabel(b: any): string {
  const desc = (b.description || "").trim() || "Buchung";
  const inv = b.invoices;
  if (!inv) return desc;
  const parts = [
    inv.invoice_number?.trim(),
    inv.invoice_date ? fmtDateDe(inv.invoice_date) : null,
    inv.vendor_name?.trim(),
  ].filter(Boolean);
  return parts.length ? `${desc} (${parts.join("/ ")})` : desc;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { template_id, building_id, fiscal_year, period_id, assignment_ids, format, mode } = body || {};
    const wantPdf = format === "pdf";
    const payloadOnly = mode === "payloads_only";
    if (!building_id || !fiscal_year) {
      return json({ error: "building_id, fiscal_year required" }, 400);
    }
    if (!payloadOnly && !template_id) {
      return json({ error: "template_id required" }, 400);
    }

    // Template (zentral: billing_templates, scope=paragraph_35a) — nur wenn nicht payload-only
    let tplBuf: Uint8Array | null = null;
    if (!payloadOnly) {
      const { data: tpl } = await admin.from("billing_templates").select("*").eq("id", template_id).maybeSingle();
      if (!tpl) return json({ error: "Vorlage nicht gefunden" }, 404);
      const { data: tplFile, error: dlErr } = await admin.storage.from("billing-templates").download(tpl.storage_path);
      if (dlErr || !tplFile) return json({ error: dlErr?.message || "Vorlage konnte nicht geladen werden" }, 500);
      tplBuf = new Uint8Array(await tplFile.arrayBuffer());
    }

    // Building + period
    const { data: building } = await admin.from("buildings").select("id, name, address").eq("id", building_id).maybeSingle();
    let period: any = null;
    if (period_id) {
      const r = await admin.from("billing_periods").select("id, period_from, period_to").eq("id", period_id).maybeSingle();
      period = r.data;
    }

    // Bookings
    const { data: bookingsRaw, error: bookingsError } = await admin
      .from("bookings")
      .select(`id, booking_date, description, amount, amount_35a, is_35a_relevant,
               settlement_35a_type,
               account_id, counter_account_id, invoice_id,
               invoices(invoice_number, invoice_date, vendor_name)`)
      .eq("building_id", building_id)
      .eq("fiscal_year", fiscal_year)
      .neq("status", "cancelled");
    if (bookingsError) throw bookingsError;

    const bookings = (bookingsRaw || []).filter((b: any) =>
      (b.is_35a_relevant || b.amount_35a != null) &&
      Math.abs(Number(b.amount_35a ?? b.amount) || 0) > 0
    );

    // Accounts
    const accIds = Array.from(new Set(bookings.flatMap((b: any) => [b.account_id, b.counter_account_id]).filter(Boolean)));
    const accMap = new Map<string, any>();
    if (accIds.length) {
      const { data: accs } = await admin.from("chart_of_accounts")
        .select("id, account_number, account_name, default_distribution_key, is_35a_relevant, settlement_35a_type, default_vat_rate")
        .in("id", accIds);
      for (const a of accs || []) accMap.set(a.id, a);
    }

    // Owners
    const { data: ownersRaw } = await admin.from("contact_building_assignments")
      .select(`id, contact_id, unit_number, floor_location, unit_kind, billing_mode, parent_assignment_id,
               area_sqm_override, salutation_override, first_name_override, last_name_override, company_name_override,
               address_street_override, address_zip_override, address_city_override,
               contacts(salutation, first_name, last_name, company_name, address_street, address_zip, address_city),
               contact_building_shares(share_type, share_value)`)
      .eq("building_id", building_id).eq("is_active", true).eq("role_in_building", "eigentuemer");

    const allOwners = ownersRaw || [];
    const mainOwners = allOwners.filter((o: any) => !isSecondary(o))
      .sort((a: any, b: any) => (a.unit_number || "").localeCompare(b.unit_number || ""));

    // Heating
    const heating: Record<string, number> = {};
    if (period_id) {
      const { data: hs } = await admin.from("heating_distribution_values")
        .select("assignment_id, amount").eq("billing_period_id", period_id);
      for (const r of hs || []) heating[r.assignment_id as string] = (heating[r.assignment_id as string] || 0) + Number(r.amount || 0);
    }
    const extraMea = new Map<string, number>();
    const stellplatz = new Map<string, number>();
    for (const a of allOwners) {
      if (isSecondary(a) && a.contact_id) {
        extraMea.set(a.contact_id, (extraMea.get(a.contact_id) || 0) + shareValue(a, "mea"));
        if (["stellplatz", "garage", "tiefgarage"].includes(a.unit_kind)) {
          stellplatz.set(a.contact_id, (stellplatz.get(a.contact_id) || 0) + 1);
        }
      }
    }
    const ctx = { extraMea, stellplatz, heating };

    // Build account blocks
    const groups = new Map<string, any[]>();
    for (const b of bookings) {
      const id = pickAccountId(b, accMap);
      if (!id) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(b);
    }
    const blocks: any[] = [];
    for (const [accId, bs] of groups) {
      const acc = accMap.get(accId);
      if (!acc) continue;
      const key = normalizeDistributionKey(acc.default_distribution_key || "mea");
      let totalGross = 0, totalLabor = 0, totalLaborD = 0, totalLaborH = 0;
      for (const b of bs) {
        totalGross += Math.abs(Number(b.amount) || 0);
        const sp = splitLabor(b, acc);
        totalLabor += sp.dienste + sp.handwerker;
        totalLaborD += sp.dienste; totalLaborH += sp.handwerker;
      }
      const totalDist = mainOwners.reduce((s, o) => s + getOwnerShare(o, key, ctx), 0);
      blocks.push({ acc, key, bookings: bs, totalGross, totalLabor, totalLaborD, totalLaborH, totalDist });
    }
    blocks.sort((a, b) => a.acc.account_number.localeCompare(b.acc.account_number));
    const blocksFiltered = blocks.filter((b) => Math.abs(b.totalLabor) > 0);

    const targetOwners = Array.isArray(assignment_ids) && assignment_ids.length
      ? mainOwners.filter((o: any) => assignment_ids.includes(o.id))
      : mainOwners;

    const buildVarsFor = (owner: any) => {
      let total = 0, totalD = 0, totalH = 0;
      const positionen: any[] = [];
      const positionen_dienste: any[] = [];
      const positionen_handwerker: any[] = [];
      const bloecke: any[] = [];
      for (const block of blocksFiltered) {
        const ownerShare = getOwnerShare(owner, block.key, ctx);
        const totalShare = block.totalDist;
        const factor = totalShare > 0 ? ownerShare / totalShare : 0;
        const zeilen: any[] = [];
        let blockOC = 0, blockD = 0, blockH = 0;
        for (const b of block.bookings) {
          const sp = splitLabor(b, block.acc);
          const labor = sp.dienste + sp.handwerker;
          const oc = labor * factor;
          const ocD = sp.dienste * factor;
          const ocH = sp.handwerker * factor;
          blockOC += oc; blockD += ocD; blockH += ocH;
          const baseRow = {
            konto_nr: block.acc.account_number,
            konto_name: block.acc.account_name,
            verteiler: DISTRIBUTION_LABELS[block.key] || block.key,
            beleg: formatBookingLabel(b),
            gesamt: fmtEUR(Math.abs(Number(b.amount) || 0)),
            lohn: fmtEUR(labor),
            gesamtanteil: fmtShare(totalShare, block.key),
            ihr_anteil: fmtShare(ownerShare, block.key),
            ihre_kosten: fmtEUR(oc),
            ihre_kosten_dienste: ocD > 0 ? fmtEUR(ocD) : "",
            ihre_kosten_handwerker: ocH > 0 ? fmtEUR(ocH) : "",
          };
          zeilen.push(baseRow);
          positionen.push(baseRow);
          if (ocD > 0) {
            positionen_dienste.push({
              ...baseRow,
              lohn: fmtEUR(sp.dienste),
              ihre_kosten: fmtEUR(ocD),
            });
          }
          if (ocH > 0) {
            positionen_handwerker.push({
              ...baseRow,
              lohn: fmtEUR(sp.handwerker),
              ihre_kosten: fmtEUR(ocH),
            });
          }
        }
        bloecke.push({
          konto_nr: block.acc.account_number,
          konto_name: block.acc.account_name,
          verteiler: DISTRIBUTION_LABELS[block.key] || block.key,
          zeilen,
          block_summe: fmtEUR(blockOC),
          block_summe_dienste: fmtEUR(blockD),
          block_summe_handwerker: fmtEUR(blockH),
        });
        total += blockOC; totalD += blockD; totalH += blockH;
      }
      const addr = ownerAddr(owner);
      const tage = period?.period_from && period?.period_to
        ? Math.round((new Date(period.period_to).getTime() - new Date(period.period_from).getTime()) / 86400000) + 1
        : 0;
      const unitNo = (owner.unit_number || "").padStart(4, "0");
      return {
        empfaenger_anrede: ownerSal(owner),
        empfaenger_name: ownerName(owner),
        empfaenger_strasse: addr.street,
        empfaenger_plz: addr.zip,
        empfaenger_ort: addr.city,
        einheit_nr: owner.unit_number || "",
        einheit_lage: owner.floor_location || "",
        gebaeude_name: building?.name || "",
        gebaeude_adresse: building?.address || "",
        wirtschaftsjahr: String(fiscal_year),
        periode_von: fmtDateDe(period?.period_from),
        periode_bis: fmtDateDe(period?.period_to),
        tage: String(tage),
        bescheinigung_nr: `a1001${fiscal_year}${unitNo}3112`,
        erstell_datum: fmtDateDe(new Date().toISOString()),
        verwalter_name: "RGI Immobilien GmbH & Co. KG",
        summe_dienste: fmtEUR(totalD),
        summe_handwerker: fmtEUR(totalH),
        summe_gesamt: fmtEUR(total),
        positionen,
        positionen_dienste,
        positionen_handwerker,
        bloecke,
      };
    };

    if (targetOwners.length === 1) {
      const owner = targetOwners[0];
      const zip = new PizZip(tplBuf);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true, linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });
      doc.render(buildVarsFor(owner));
      const out = doc.getZip().generate({ type: "uint8array" });
      const baseName = `35a_${fiscal_year}_${sanitize(owner.unit_number || "")}_${sanitize(ownerName(owner))}`;
      if (wantPdf) {
        const pdf = await convertDocxToPdf(out, `${baseName}.docx`);
        return new Response(pdf, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
          },
        });
      }
      return new Response(out, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${baseName}.docx"`,
        },
      });
    }

    const bundle = new PizZip();
    for (let i = 0; i < targetOwners.length; i++) {
      const owner = targetOwners[i];
      try {
        const zip = new PizZip(tplBuf);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true, linebreaks: true,
          delimiters: { start: "{{", end: "}}" },
        });
        doc.render(buildVarsFor(owner));
        const out = doc.getZip().generate({ type: "uint8array" });
        const baseName = `35a_${fiscal_year}_${sanitize(owner.unit_number || "")}_${sanitize(ownerName(owner))}`;
        if (wantPdf) {
          const pdf = await convertDocxToPdf(out, `${baseName}.docx`);
          bundle.file(`${baseName}.pdf`, pdf);
        } else {
          bundle.file(`${baseName}.docx`, out);
        }
      } catch (e: any) {
        bundle.file(`ERROR_${i + 1}_${sanitize(ownerName(owner))}.txt`, String(e?.message || e));
      }
    }
    const zipOut = bundle.generate({ type: "uint8array" });
    return new Response(zipOut, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="35a_Bescheinigungen_${fiscal_year}${wantPdf ? "_PDF" : ""}.zip"`,
      },
    });
  } catch (e: any) {
    console.error("generate-35a-docx error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
