// generate-service-document
// ----------------------------------------------------------------
// Rendert die hochgeladene DOCX-Vorlage (billing_templates,
// scope=service_nebenkosten / service_anlage_v / service_mietvertrag)
// mit den Daten aus service_orders.input_snapshot, konvertiert via
// CloudConvert nach PDF, legt das Ergebnis in service-documents/
// {user_id}/{order_id}.pdf ab und benachrichtigt Make.com.
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

function buildPayload(order: any, vermieter: any, objekt: any) {
  const snap = order.input_snapshot ?? {};
  const t = snap.tenant ?? {};
  const totals = snap.totals ?? {};
  const heating = snap.heating ?? null;
  const positions = Array.isArray(snap.positions) ? snap.positions : [];
  const extras = Array.isArray(snap.extra_costs) ? snap.extra_costs : [];

  const saldo = Number(totals.result ?? 0);
  return {
    // Kopf
    vermieter_name: vermieter?.name ?? "",
    vermieter_adresse: vermieter?.adresse ?? "",
    vermieter_iban: vermieter?.iban ?? "",
    vermieter_bank: vermieter?.bank ?? "",
    objekt_adresse: objekt?.adresse ?? "",
    objekt_wohnung: objekt?.wohnung ?? "",
    abrechnungsjahr: String(order.fiscal_year ?? snap.fiscal_year ?? ""),
    zeitraum_von: fmtDate(snap?.period?.from),
    zeitraum_bis: fmtDate(snap?.period?.to),
    erstellt_am: new Date().toLocaleDateString("de-DE"),

    // Mieter
    mieter_name: t.name ?? "",
    mieter_personen: String(t.persons ?? ""),
    mieter_einzug: fmtDate(t.move_in),
    mieter_auszug: fmtDate(t.move_out),
    mieter_monate: String(t.months_in_period ?? ""),
    mieter_vorauszahlung_monat: fmtEUR(t.prepayment_monthly),
    mieter_vorauszahlung_summe: fmtEUR(t.prepayment_total),

    // Positionen
    positions: positions.map((p: any) => ({
      konto: p.account_number ?? "",
      bezeichnung: p.account_name ?? "",
      gesamtkosten: fmtEUR(p.total_amount),
      verteilerschluessel: p.distribution_key ?? "",
      mieteranteil: fmtEUR(p.share_amount),
      verbrauchsabhaengig: p.consumption_based ? "verbrauchsabhängig" : "",
      manuell_angepasst: p.user_adjusted ? "angepasst" : "",
    })),

    // Heizung
    heizung_bezeichnung: heating?.label ?? "",
    heizung_betrag: fmtEUR(heating?.amount),
    heizung_quelle: heating?.source ?? "",
    heizung_hinweis:
      heating?.source === "missing"
        ? "Keine Messdienst-Abrechnung vorhanden"
        : heating?.user_adjusted
          ? "Vom Eigentümer angepasst"
          : "",

    // Direkte Eigentümerkosten
    extra_costs: extras.map((c: any) => ({
      bezeichnung: c.label ?? c.cost_type ?? "",
      betrag: fmtEUR(c.amount),
    })),

    // Summen
    summe_umlagefaehig: fmtEUR(totals.autoSum),
    summe_heizung: fmtEUR(totals.heatingValue),
    summe_direkt: fmtEUR(totals.extraSum),
    summe_gesamt: fmtEUR(totals.costSum),
    summe_vorauszahlung: fmtEUR(totals.prepaySum),
    saldo: fmtEUR(Math.abs(saldo)),
    saldo_text: saldo >= 0 ? "Nachzahlung" : "Guthaben",
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Order laden
    const { data: order, error: orderErr } = await admin
      .from("service_orders").select("*").eq("id", order_id).maybeSingle();
    if (orderErr || !order) return new Response("Order not found", { status: 404, headers: corsHeaders });
    if (order.status !== "paid" && order.status !== "document_ready") {
      return new Response("Order not paid", { status: 400, headers: corsHeaders });
    }

    const scope = SCOPE_BY_SERVICE[order.service_type];
    if (!scope) throw new Error(`Unbekannter service_type: ${order.service_type}`);

    // 2. Stammdaten anreichern (Vermieter + Objekt)
    let vermieter: any = {};
    let objekt: any = {};
    try {
      const { data: profile } = await admin
        .from("profiles").select("first_name,last_name,email,address,iban,bank_name")
        .eq("id", order.user_id).maybeSingle();
      vermieter = {
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "",
        adresse: profile?.address ?? "",
        iban: profile?.iban ?? "",
        bank: profile?.bank_name ?? "",
      };
    } catch (_) {}

    if (order.assignment_id) {
      const { data: cba } = await admin
        .from("contact_building_assignments")
        .select("unit_number, building_id, buildings:building_id(name,address)")
        .eq("id", order.assignment_id).maybeSingle();
      objekt = {
        adresse: (cba as any)?.buildings?.address ?? "",
        wohnung: (cba as any)?.unit_number ?? "",
      };
    }

    // 3. Template laden
    const { data: tpl, error: tplErr } = await admin
      .from("billing_templates").select("storage_path,name")
      .eq("scope", scope).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (tplErr || !tpl?.storage_path) throw new Error(`Keine Vorlage für scope=${scope} hinterlegt`);

    const { data: tplFile, error: dlErr } = await admin.storage
      .from("billing-templates").download(tpl.storage_path);
    if (dlErr || !tplFile) throw new Error(`Template-Download fehlgeschlagen: ${dlErr?.message}`);
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    // 4. Rendern
    const payload = buildPayload(order, vermieter, objekt);
    const zip = new PizZip(tplBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => "",
    });
    doc.render(payload);
    const docxBytes = doc.getZip().generate({ type: "uint8array" });

    // 5. PDF konvertieren
    const pdfBytes = await convertDocxToPdf(docxBytes, `${order.service_type}_${order.id}.docx`);

    // 6. Storage-Upload (Bucket anlegen falls nötig)
    const bucketId = "service-documents";
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.id === bucketId)) {
      await admin.storage.createBucket(bucketId, { public: false });
    }
    const path = `${order.user_id}/${order.id}.pdf`;
    const { error: upErr } = await admin.storage
      .from(bucketId)
      .upload(path, new Blob([pdfBytes], { type: "application/pdf" }), {
        upsert: true, contentType: "application/pdf",
      });
    if (upErr) {
      await admin.from("service_orders").update({ document_error: upErr.message }).eq("id", order_id);
      throw upErr;
    }

    // 7. Order updaten
    await admin.from("service_orders").update({
      status: "document_ready",
      document_storage_path: path,
      document_ready_at: new Date().toISOString(),
      document_error: null,
    }).eq("id", order_id);

    // 8. Make.com Webhook (optional, blockiert nicht)
    const webhook = Deno.env.get("MAKE_NEBENKOSTEN_WEBHOOK_URL");
    if (webhook) {
      try {
        const { data: signed } = await admin.storage
          .from(bucketId).createSignedUrl(path, 60 * 60 * 24); // 24h
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
            mieter_name: payload.mieter_name,
            abrechnungsjahr: payload.abrechnungsjahr,
            saldo: payload.saldo,
            saldo_text: payload.saldo_text,
            download_url: signed?.signedUrl ?? null,
            generated_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error("[generate-service-document] Make webhook error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, path }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-service-document] error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
