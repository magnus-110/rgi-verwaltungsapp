// generate-service-document
// ----------------------------------------------------------------
// Rendert die DOCX-Vorlage (billing_templates) mit den Daten aus
// service_orders.input_snapshot. Bei Mieterwechsel (input_snapshot.tenants[])
// wird PRO Mieter ein eigenes PDF erzeugt und anteilig befüllt.
// ----------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPE_BY_SERVICE: Record<string, string> = {
  nebenkosten: "service_nebenkosten",
  anlage_v: "service_anlage_v",
  mietvertrag: "service_mietvertrag",
};

function fmtEUR(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function fmtDate(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("de-DE");
  } catch {
    return d ?? "";
  }
}

// Baut die Render-Daten für GENAU EINEN Mieter (eine Abrechnung).
function buildTenantData(
  order: any,
  snap: any,
  tenantSnap: any,
  vermieter: any,
  objekt: any,
  idx: number,
  total: number,
) {
  const t = tenantSnap.tenant ?? {};
  const totals = tenantSnap.totals ?? {};
  const heating = tenantSnap.heating ?? null;
  const positions = Array.isArray(tenantSnap.positions) ? tenantSnap.positions : [];
  const extras = Array.isArray(tenantSnap.extra_costs) ? tenantSnap.extra_costs : [];

  const positionen = [
    ...positions.map((p: any) => ({
      konto_nr: p.account_number ?? "",
      konto: p.account_number ?? "",
      bezeichnung: p.account_name ?? "",
      gesamt_eur: fmtEUR(p.total_amount),
      gesamtkosten: fmtEUR(p.total_amount),
      verteilerschluessel: String(p.distribution_key ?? "").toUpperCase(),
      anteil_eur: fmtEUR(p.share_amount),
      mieteranteil: fmtEUR(p.share_amount),
    })),
    ...extras.map((c: any) => ({
      konto_nr: "DIREKT",
      konto: "DIREKT",
      bezeichnung: c.label ?? c.cost_type ?? "",
      gesamt_eur: fmtEUR(c.full_amount ?? c.amount),
      gesamtkosten: fmtEUR(c.full_amount ?? c.amount),
      verteilerschluessel: "DIREKT",
      anteil_eur: fmtEUR(c.amount),
      mieteranteil: fmtEUR(c.amount),
    })),
  ];

  const result = Number(totals.result ?? 0);
  const suffix = total > 1 ? "-" + (idx + 1) : "";

  return {
    // Kopf / Allgemein
    rechnung_datum: new Date().toLocaleDateString("de-DE"),
    erstellt_am: new Date().toLocaleDateString("de-DE"),
    erzeugt_am: new Date().toLocaleString("de-DE"),
    abrechnung_nr: "NK-" + String(order.id).slice(0, 8).toUpperCase() + suffix,
    order_id: order.id,
    fiscal_year: String(order.fiscal_year ?? snap.fiscal_year ?? ""),
    abrechnungsjahr: String(order.fiscal_year ?? snap.fiscal_year ?? ""),
    period_from: fmtDate(snap?.period?.from),
    period_to: fmtDate(snap?.period?.to),
    zeitraum_von: fmtDate(snap?.period?.from),
    zeitraum_bis: fmtDate(snap?.period?.to),
    einspruchsfrist: "12 Monate ab Zugang dieser Abrechnung (§ 556 Abs. 3 BGB)",
    agb_version: order.agb_version ?? "",

    // Vermieter / Eigentümer
    vermieter_name: vermieter?.name ?? "",
    vermieter_strasse: vermieter?.adresse ?? "",
    vermieter_adresse: vermieter?.adresse ?? "",
    vermieter_plz_ort: "",
    vermieter_email: vermieter?.email ?? "",
    vermieter_telefon: "",
    vermieter_iban: vermieter?.iban ?? "",
    vermieter_bank: vermieter?.bank ?? "",

    // Wohnung / Liegenschaft
    wohnung_nr: objekt?.wohnung ?? "",
    objekt_wohnung: objekt?.wohnung ?? "",
    liegenschaft_name: objekt?.name ?? "",
    liegenschaft_adresse: objekt?.adresse ?? "",
    objekt_adresse: objekt?.adresse ?? "",

    // Mieter
    mieter_name: t.name ?? "",
    mieter_adresse: t.address ?? "",
    mieter_personen: String(t.persons ?? ""),
    mieter_einzug: t.move_in ? fmtDate(t.move_in) : fmtDate(snap?.period?.from),
    mieter_auszug: t.move_out ? fmtDate(t.move_out) : fmtDate(snap?.period?.to),
    mieter_monate:
      t.months_in_period != null
        ? Number(t.months_in_period).toLocaleString("de-DE", { maximumFractionDigits: 1 })
        : "",
    vorauszahlung_monatlich: fmtEUR(t.prepayment_monthly),
    vorauszahlung_gesamt: fmtEUR(t.prepayment_total),
    mieter_vorauszahlung_monat: fmtEUR(t.prepayment_monthly),
    mieter_vorauszahlung_summe: fmtEUR(t.prepayment_total),

    // Positionen (Schleife) – beide Array-Namen
    positionen,
    positions: positionen,

    // Heizung
    heizung_bezeichnung: heating?.label ?? "Heizung / Warmwasser / Wasser",
    heizung_betrag: fmtEUR(heating?.amount),
    heizung_quelle: heating?.source ?? "",
    heizung_hinweis:
      heating?.source === "missing"
        ? "Keine Messdienst-Abrechnung vorhanden"
        : heating?.user_adjusted
          ? "Vom Eigentümer angepasst"
          : "",

    // Summen
    summe_umlage: fmtEUR(totals.autoSum),
    summe_umlagefaehig: fmtEUR(totals.autoSum),
    summe_extra: fmtEUR(totals.extraSum),
    summe_direkt: fmtEUR(totals.extraSum),
    summe_heizung: fmtEUR(totals.heatingValue),
    summe_gesamt: fmtEUR(totals.costSum),
    summe_vorauszahlungen: fmtEUR(totals.prepaySum),
    summe_vorauszahlung: fmtEUR(totals.prepaySum),
    saldo: fmtEUR(result),
    saldo_abs: fmtEUR(Math.abs(result)),
    saldo_label: result > 0 ? "Nachzahlung" : "Guthaben",
    saldo_text: result > 0 ? "Nachzahlung" : "Guthaben",
    ergebnis_gruen: result > 0,
  };
}

async function convertDocxToPdf(docxBytes: Uint8Array, filename: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("CLOUDCONVERT_API_KEY");
  if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY ist nicht konfiguriert");
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
  const jobId = (await jobResp.json())?.data?.id;
  if (!jobId) throw new Error("CloudConvert: keine Job-ID");
  const waitResp = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!waitResp.ok) throw new Error(`CloudConvert Wait fehlgeschlagen: ${waitResp.status}`);
  const waitJson = await waitResp.json();
  if (waitJson?.data?.status !== "finished") throw new Error(`CloudConvert Status: ${waitJson?.data?.status}`);
  const exportTask = (waitJson.data.tasks || []).find((t: any) => t.name === "export-1");
  const url = exportTask?.result?.files?.[0]?.url;
  if (!url) throw new Error("CloudConvert: keine Download-URL");
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`PDF-Download fehlgeschlagen: ${dl.status}`);
  return new Uint8Array(await dl.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) return new Response("Missing order_id", { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: order, error: orderErr } = await admin
      .from("service_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr || !order) return new Response("Order not found", { status: 404, headers: corsHeaders });
    if (order.status !== "paid" && order.status !== "document_ready") {
      return new Response("Order not paid", { status: 400, headers: corsHeaders });
    }

    const scope = SCOPE_BY_SERVICE[order.service_type];
    if (!scope) throw new Error(`Unbekannter service_type: ${order.service_type}`);

    const snap = order.input_snapshot ?? {};

    let vermieter: any = {};
    let objekt: any = {};
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("first_name,last_name,email,address,iban,bank_name")
        .eq("id", order.user_id)
        .maybeSingle();
      vermieter = {
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "",
        adresse: profile?.address ?? "",
        email: profile?.email ?? "",
        iban: profile?.iban ?? "",
        bank: profile?.bank_name ?? "",
      };
    } catch (_) {}

    if (order.assignment_id) {
      const { data: cba } = await admin
        .from("contact_building_assignments")
        .select("unit_number, building_id, buildings:building_id(name,address,postal_code,city)")
        .eq("id", order.assignment_id)
        .maybeSingle();
      objekt = {
        name: (cba as any)?.buildings?.name ?? "",
        adresse: [(cba as any)?.buildings?.address, [(cba as any)?.buildings?.postal_code, (cba as any)?.buildings?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        wohnung: (cba as any)?.unit_number ?? "",
      };
    }

    const { data: tpl, error: tplErr } = await admin
      .from("billing_templates")
      .select("storage_path,name")
      .eq("scope", scope)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tplErr || !tpl?.storage_path) throw new Error(`Keine Vorlage für scope=${scope} hinterlegt`);
    const { data: tplFile, error: dlErr } = await admin.storage.from("billing-templates").download(tpl.storage_path);
    if (dlErr || !tplFile) throw new Error(`Template-Download fehlgeschlagen: ${dlErr?.message}`);
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    // Mieter ermitteln
    const tenants = Array.isArray(snap.tenants) && snap.tenants.length > 0 ? snap.tenants : [snap];

    const bucketId = "service-documents";
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.id === bucketId)) {
      await admin.storage.createBucket(bucketId, { public: false });
    }

    const documents: Array<{
      index: number;
      path: string;
      mieter_name: string;
      saldo: string;
      saldo_label: string;
    }> = [];

    for (let i = 0; i < tenants.length; i++) {
      const data = buildTenantData(order, snap, tenants[i], vermieter, objekt, i, tenants.length);

      const zip = new PizZip(tplBuf);

      // Normalize whitespace inside docxtemplater tags: {/ tag} -> {/tag}, { mieter_name } -> {mieter_name}
      // Robust gegen Tippfehler in der Word-Vorlage.
      const tagRe = /\{\s*([#/^]?)\s*([a-zA-Z0-9_]+)\s*\}/g;
      const xmlFiles = [
        "word/document.xml",
        "word/header1.xml",
        "word/header2.xml",
        "word/header3.xml",
        "word/footer1.xml",
        "word/footer2.xml",
        "word/footer3.xml",
      ];
      for (const xf of xmlFiles) {
        const file = zip.file(xf);
        if (!file) continue;
        const original = file.asText();
        const normalized = original.replace(tagRe, (_m, marker, name) => `{${marker}${name}}`);
        if (normalized !== original) zip.file(xf, normalized);
      }

      let doc: Docxtemplater;
      try {
        doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "{", end: "}" },
          nullGetter: () => "",
        });
        doc.render(data);
      } catch (tplErr: any) {
        const detail =
          tplErr?.properties?.errors?.map((e: any) => e?.properties?.explanation || e?.message).join("; ") ||
          tplErr?.message ||
          "Template-Fehler";
        await admin
          .from("service_orders")
          .update({ status: "document_error", document_error: `Vorlagen-Fehler: ${detail}` })
          .eq("id", order_id);
        throw new Error(`Vorlagen-Fehler: ${detail}`);
      }
      const docxBytes = doc.getZip().generate({ type: "uint8array" });

      const pdfBytes = await convertDocxToPdf(docxBytes, `${order.service_type}_${order.id}_${i + 1}.docx`);

      const path =
        tenants.length > 1 ? `${order.user_id}/${order.id}_${i + 1}.pdf` : `${order.user_id}/${order.id}.pdf`;

      const { error: upErr } = await admin.storage
        .from(bucketId)
        .upload(path, new Blob([pdfBytes], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (upErr) {
        await admin.from("service_orders").update({ document_error: upErr.message }).eq("id", order_id);
        throw upErr;
      }

      documents.push({
        index: i + 1,
        path,
        mieter_name: data.mieter_name,
        saldo: data.saldo_abs,
        saldo_label: data.saldo_label,
      });
    }

    await admin
      .from("service_orders")
      .update({
        status: "document_ready",
        document_storage_path: documents[0]?.path ?? null,
        document_paths: documents,
        document_ready_at: new Date().toISOString(),
        document_error: null,
      })
      .eq("id", order_id);

    const webhook = Deno.env.get("MAKE_NEBENKOSTEN_WEBHOOK_URL");
    if (webhook) {
      try {
        for (const d of documents) {
          const { data: signed } = await admin.storage.from(bucketId).createSignedUrl(d.path, 60 * 60 * 24);
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: order.id,
              service_type: order.service_type,
              user_id: order.user_id,
              recipient_email: vermieter.email ?? null,
              recipient_name: vermieter.name,
              objekt_adresse: objekt.adresse,
              objekt_wohnung: objekt.wohnung,
              mieter_name: d.mieter_name,
              abrechnungsjahr: String(order.fiscal_year ?? snap.fiscal_year ?? ""),
              saldo: d.saldo,
              saldo_text: d.saldo_label,
              download_url: signed?.signedUrl ?? null,
              generated_at: new Date().toISOString(),
            }),
          });
        }
      } catch (e) {
        console.error("[generate-service-document] Make webhook error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, documents }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-service-document] error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
