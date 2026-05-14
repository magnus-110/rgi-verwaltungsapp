// generate-billing-document
// ----------------------------------------------------------------
// Rendert eine vom User hochgeladene Word-Vorlage (DOCX) mit den
// vom Frontend übergebenen, fertig berechneten Payload-Daten.
// Optional Konvertierung nach PDF via CloudConvert.
//
// PRINZIP: Diese Function rechnet NICHTS selbst — sie ist ein
// reiner Renderer. Quelle der Wahrheit sind die UI-Werte aus
// BillingSettlement.tsx (siehe lib/buildBillingPayload.ts).
// ----------------------------------------------------------------
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
  if (!jobId) throw new Error("CloudConvert: keine Job-ID");
  const waitResp = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!waitResp.ok) throw new Error(`CloudConvert Wait fehlgeschlagen: ${waitResp.status} ${await waitResp.text()}`);
  const waitJson = await waitResp.json();
  if (waitJson?.data?.status !== "finished") {
    throw new Error(`CloudConvert Job nicht erfolgreich: ${waitJson?.data?.status}`);
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

function renderTemplate(tplBuf: Uint8Array, payload: any): Uint8Array {
  const zip = new PizZip(tplBuf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });
  doc.render(payload);
  return doc.getZip().generate({ type: "uint8array" });
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      template_id,
      overall_template_id, // optional: für mode=all separate Vorlage für Gesamtdokument
      fiscal_year,
      mode, // "single" | "all"
      format, // "docx" | "pdf"
      file_prefix,
      items, // [{ kind: "owner"|"overall", ownerId?, ownerName?, payload }]
    } = body || {};

    const wantPdf = format === "pdf";
    if (!template_id || !mode || !Array.isArray(items) || items.length === 0) {
      return json({ error: "template_id, mode und items erforderlich" }, 400);
    }

    // Vorlage(n) laden
    const { data: tpl } = await admin.from("billing_templates").select("*").eq("id", template_id).maybeSingle();
    if (!tpl) return json({ error: "Vorlage nicht gefunden" }, 404);
    const { data: tplFile, error: dlErr } = await admin.storage.from("billing-templates").download(tpl.storage_path);
    if (dlErr || !tplFile) return json({ error: dlErr?.message || "Vorlage nicht ladbar" }, 500);
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    let overallTplBuf: Uint8Array | null = null;
    if (overall_template_id && overall_template_id !== template_id) {
      const { data: otpl } = await admin.from("billing_templates").select("*").eq("id", overall_template_id).maybeSingle();
      if (otpl) {
        const { data: f } = await admin.storage.from("billing-templates").download(otpl.storage_path);
        if (f) overallTplBuf = new Uint8Array(await f.arrayBuffer());
      }
    }

    const prefix = file_prefix ? sanitize(file_prefix) : `Abrechnung_${fiscal_year}`;

    // Single
    if (mode === "single" && items.length === 1) {
      const it = items[0];
      const useTpl = it.kind === "overall" && overallTplBuf ? overallTplBuf : tplBuf;
      const docxBytes = renderTemplate(useTpl, it.payload);
      const baseName =
        it.kind === "overall"
          ? `${prefix}_Gesamt`
          : it.kind === "asset_report"
            ? prefix
            : `${prefix}_${sanitize(it.ownerName || "Eigentuemer")}`;
      if (wantPdf) {
        const pdf = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
        return new Response(pdf, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
          },
        });
      }
      return new Response(docxBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${baseName}.docx"`,
        },
      });
    }

    // ZIP-Bundle
    const bundle = new PizZip();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const useTpl = it.kind === "overall" && overallTplBuf ? overallTplBuf : tplBuf;
        const docxBytes = renderTemplate(useTpl, it.payload);
        const baseName =
          it.kind === "overall"
            ? `00_${prefix}_Gesamt`
            : `${prefix}_${sanitize(it.ownerName || `Eigentuemer_${i}`)}`;
        if (wantPdf) {
          const pdf = await convertDocxToPdf(docxBytes, `${baseName}.docx`);
          bundle.file(`${baseName}.pdf`, pdf);
        } else {
          bundle.file(`${baseName}.docx`, docxBytes);
        }
      } catch (e: any) {
        bundle.file(`ERROR_${i + 1}.txt`, String(e?.message || e));
      }
    }
    const zipOut = bundle.generate({ type: "uint8array" });
    return new Response(zipOut, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${prefix}${wantPdf ? "_PDF" : ""}.zip"`,
      },
    });
  } catch (e: any) {
    console.error("generate-billing-document error", e);
    // Docxtemplater-Fehler enthalten in e.properties.errors die konkreten
    // Tag-Probleme (z. B. "Unopened loop", "Unclosed loop"). Diese wollen
    // wir an den Client weiterreichen, damit der User die Vorlage gezielt
    // korrigieren kann.
    const tplErrors = e?.properties?.errors;
    if (Array.isArray(tplErrors) && tplErrors.length) {
      const details = tplErrors.map((te: any) => {
        const p = te?.properties || {};
        return {
          message: te?.message || "Template-Fehler",
          explanation: p.explanation || null,
          tag: p.xtag || null,
          id: p.id || null,
          file: p.file || null,
        };
      });
      const summary = details
        .map((d) => `• ${d.message}: ${d.explanation || d.tag || ""}`)
        .join("\n");
      return json(
        {
          error: "DOCX-Vorlage enthält ungültige Platzhalter",
          hint: "Bitte die Word-Vorlage prüfen — wahrscheinlich ein {#tag}…{/tag} Block, der nicht sauber geöffnet/geschlossen ist.",
          details,
          summary,
        },
        422,
      );
    }
    return json({ error: String(e?.message || e) }, 500);
  }
});
