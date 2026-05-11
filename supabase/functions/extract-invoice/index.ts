import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { detectAndParseEInvoice } from "../_shared/einvoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// Robuste Liegenschafts-Erkennung
// Strategie: Score je Building aus drei Signalen (Straßen-Stamm + Hausnr + PLZ).
// Pflicht: Straßen-Stamm UND Hausnummer (oder Bereich) treffen.
// Bonus: gleiche PLZ. Bestes Score gewinnt; Schwelle gegen Zufallstreffer.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  if (!s) return "";
  let n = s.toLowerCase();
  n = n.replace(/ß/g, "ss");
  // Vereinheitliche Straßen-Suffixe: "straße"/"strasse"/"str." → "str"
  n = n.replace(/strasse/g, "str");
  n = n.replace(/str\./g, "str ");
  // Sonderzeichen → Space (behält Umlaute)
  n = n.replace(/[^a-z0-9äöü]/g, " ");
  // "<wort>str" → "<wort> str" (Ahornstr → Ahorn str)
  n = n.replace(/([a-zäöü]{2,})str\b/g, "$1 str");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function extractPostalCodes(n: string): string[] {
  return Array.from(n.matchAll(/\b(\d{5})\b/g)).map((m) => m[1]);
}

function extractHouseNumbers(n: string): string[] {
  const out = new Set<string>();
  for (const m of n.matchAll(/\b(\d{1,4}[a-z]?)\b/g)) {
    const v = m[1];
    if (v.length === 5 && /^\d+$/.test(v)) continue; // PLZ raus
    out.add(v);
  }
  return Array.from(out);
}

const SUFFIXES = ["str","weg","platz","allee","gasse","ring","damm","markt","feld","bach","tal","wehr","hof","ufer","berg","winkel","steig","pfad","chaussee","brueck","brücke"];

function extractStreetStems(n: string): string[] {
  const stems = new Set<string>();
  const tokens = n.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (SUFFIXES.includes(t) && i > 0) {
      const prev = tokens[i - 1];
      if (prev.length >= 2 && /^[a-zäöü]+$/.test(prev)) {
        stems.add(`${prev} ${t}`);
        stems.add(`${prev}${t}`);
      }
      continue;
    }
    for (const suf of SUFFIXES) {
      if (t.length > suf.length + 1 && t.endsWith(suf) && /^[a-zäöü]+$/.test(t)) {
        stems.add(t);
        const base = t.slice(0, -suf.length);
        if (base.length >= 2) stems.add(`${base} ${suf}`);
        break;
      }
    }
    // Mehrteilige Namen wie "Am Wehr", "Im Argental", "Neuer Weg", "Adolf Haff Weg"
    if (["am","im","an","auf","neuer","neue","alter","alte","zum","zur"].includes(t) && i + 2 < tokens.length) {
      const w2 = tokens[i + 1];
      const w3 = tokens[i + 2];
      if (/^[a-zäöü]+$/.test(w2) && /^\d/.test(w3)) {
        stems.add(`${t} ${w2}`);
      }
    }
  }
  return Array.from(stems);
}

// Schneidet alles ab c/o-Markern weg (z.H., z.Hd., zu Händen, c/o, RGI Immobilien …)
// damit nur die oberste Empfänger-Zeile (die echte Liegenschaft) gematcht wird.
function stripCareOf(address: string): string {
  if (!address) return "";
  // Normalize line breaks and commas to a single separator we can split on
  const lines = address
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
  const stopRe = /(z\.?\s*h(d)?\.?|zu\s+h[äa]nden|c\/o|c\.o\.|rgi[\s-]*immobilien)/i;
  const kept: string[] = [];
  for (const line of lines) {
    if (stopRe.test(line)) break;
    kept.push(line);
  }
  return (kept.length ? kept : lines.slice(0, 1)).join(", ");
}

function findBestBuildingMatch(
  recipientAddress: string,
  buildings: { id: string; name: string; address: string }[]
): string | null {
  if (!recipientAddress) return null;
  const trimmed = stripCareOf(recipientAddress);
  const recv = normalizeForMatch(trimmed);
  if (!recv) return null;

  const recvPostals = new Set(extractPostalCodes(recv));
  const recvNumbers = new Set(extractHouseNumbers(recv));

  let bestId: string | null = null;
  let bestScore = 0;

  for (const b of buildings) {
    const combined = normalizeForMatch(`${b.address || ""} ${b.name || ""}`);
    const stems = extractStreetStems(combined);
    if (stems.length === 0) continue;
    const buildingPostal = extractPostalCodes(combined)[0] || null;
    const buildingNumbers = extractHouseNumbers(combined);

    // 1) Straßen-Stamm muss treffen (Pflicht)
    let bestStemLen = 0;
    for (const stem of stems) {
      if (stem.length >= 4 && recv.includes(stem) && stem.length > bestStemLen) {
        bestStemLen = stem.length;
      }
    }
    if (bestStemLen === 0) continue;

    let score = bestStemLen;

    // 2) Hausnummer (exakt oder im Bereich) – Pflicht
    let hasNumber = false;
    for (const hn of buildingNumbers) {
      if (recvNumbers.has(hn)) { score += 25; hasNumber = true; break; }
    }
    if (!hasNumber) {
      const ranges = (b.address || "").match(/(\d{1,4})\s*[-+/]\s*(\d{1,4})/g) || [];
      for (const r of ranges) {
        const m = r.match(/(\d{1,4})\s*[-+/]\s*(\d{1,4})/);
        if (!m) continue;
        const lo = parseInt(m[1]); const hi = parseInt(m[2]);
        for (const rn of recvNumbers) {
          const num = parseInt(rn);
          if (!isNaN(num) && num >= lo && num <= hi) { score += 18; hasNumber = true; break; }
        }
        if (hasNumber) break;
      }
    }
    if (!hasNumber) continue;

    // 3) PLZ als Bonus (gegen Verwechslung gleichnamiger Straßen in anderen Orten)
    if (buildingPostal && recvPostals.has(buildingPostal)) score += 15;

    if (score > bestScore) {
      bestScore = score;
      bestId = b.id;
    }
  }

  return bestScore >= 30 ? bestId : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mistralApiKey = Deno.env.get("MISTRAL_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin/employee role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "employee")) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoiceId, isCompanyInvoice } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get invoice record
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("id, file_path, file_name, building_id, is_company_invoice")
      .eq("id", invoiceId)
      .single();

    if (invError || !invoice?.file_path) {
      return new Response(JSON.stringify({ error: "Rechnung nicht gefunden oder keine Datei" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set ocr_status to processing
    await supabase.from("invoices").update({ ocr_status: "processing" }).eq("id", invoiceId);

    console.log(`OCR for invoice ${invoiceId}: ${invoice.file_path}`);

    // Get signed URL for the PDF
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: "Datei konnte nicht gelesen werden" 
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "Datei nicht lesbar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect file type by extension (PDF/XML go through E-Rechnung + document_url OCR; images go through image_url OCR)
    const lowerName = (invoice.file_name || "").toLowerCase();
    const isImageFile = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(lowerName);

    // ─── E-Rechnung Detection (XRechnung / ZUGFeRD) — only for PDF/XML ───
    if (!isImageFile) {
      try {
        const fileResp = await fetch(signedUrlData.signedUrl);
        const fileBytes = new Uint8Array(await fileResp.arrayBuffer());
        const eInvoice = await detectAndParseEInvoice(fileBytes, invoice.file_name);

        if (eInvoice) {
          console.log(`E-Rechnung detected (${eInvoice.format}) for invoice ${invoiceId}`);

          // Auto-match building from recipient address (skip for company invoices)
          const isCompany = invoice.is_company_invoice || isCompanyInvoice === true;
          let matchedBuildingId: string | null = invoice.building_id || null;
          if (!isCompany && !matchedBuildingId && eInvoice.recipient_address) {
            const { data: allBuildings } = await supabase.from("buildings").select("id, name, address");
            if (allBuildings) {
              matchedBuildingId = findBestBuildingMatch(eInvoice.recipient_address, allBuildings);
            }
          }

          // Duplicate check
          if (eInvoice.invoice_number && eInvoice.vendor_name) {
            const { data: dups } = await supabase
              .from("invoices")
              .select("id, file_name")
              .eq("invoice_number", eInvoice.invoice_number)
              .ilike("vendor_name", eInvoice.vendor_name)
              .neq("id", invoiceId)
              .limit(1);
            if (dups && dups.length > 0) {
              await supabase.from("invoices").update({
                ocr_status: "done",
                einvoice_format: eInvoice.format,
                vendor_name: eInvoice.vendor_name,
                invoice_number: eInvoice.invoice_number,
                invoice_date: eInvoice.invoice_date,
                gross_amount: eInvoice.gross_amount,
                duplicate_of: dups[0].id,
                description: `⚠️ Mögliches Duplikat von ${dups[0].file_name || dups[0].id}`,
              }).eq("id", invoiceId);
              return new Response(JSON.stringify({ success: true, warning: "duplicate_detected", einvoice: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          const eUpdate: Record<string, any> = {
            ocr_status: "done",
            ocr_error: null,
            einvoice_format: eInvoice.format,
            leitweg_id: eInvoice.leitweg_id,
            line_items: eInvoice.line_items || [],
            ocr_extracted_data: eInvoice,
          };
          if (eInvoice.vendor_name) eUpdate.vendor_name = eInvoice.vendor_name;
          if (eInvoice.vendor_iban) eUpdate.vendor_iban = eInvoice.vendor_iban;
          if (eInvoice.invoice_number) eUpdate.invoice_number = eInvoice.invoice_number;
          if (eInvoice.invoice_date) eUpdate.invoice_date = eInvoice.invoice_date;
          if (eInvoice.due_date) eUpdate.due_date = eInvoice.due_date;
          if (eInvoice.net_amount != null) eUpdate.net_amount = eInvoice.net_amount;
          if (eInvoice.vat_amount != null) eUpdate.vat_amount = eInvoice.vat_amount;
          if (eInvoice.gross_amount != null) eUpdate.gross_amount = eInvoice.gross_amount;
          if (eInvoice.description) eUpdate.description = eInvoice.description;
          if (eInvoice.payment_purpose) eUpdate.payment_purpose = eInvoice.payment_purpose;
          if (matchedBuildingId && !invoice.building_id && !isCompany) eUpdate.building_id = matchedBuildingId;
          if (isCompanyInvoice === true && !invoice.is_company_invoice) eUpdate.is_company_invoice = true;

          const { error: eUpdErr } = await supabase.from("invoices").update(eUpdate).eq("id", invoiceId);
          if (eUpdErr) {
            console.error("E-Invoice update error:", eUpdErr);
            // fall through to OCR
          } else {
            return new Response(JSON.stringify({ success: true, einvoice: true, format: eInvoice.format }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (eErr) {
        console.warn("E-Rechnung detection failed, falling back to OCR:", eErr);
      }
    }

    // Step 1: Mistral OCR to extract text
    // For images: use image_url type. For PDFs: use document_url type.
    const ocrDocument = isImageFile
      ? { type: "image_url", image_url: signedUrlData.signedUrl }
      : { type: "document_url", document_url: signedUrlData.signedUrl };

    const ocrResponse = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: ocrDocument,
        include_image_base64: false,
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error("OCR error:", ocrResponse.status, errorText);
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: `OCR fehlgeschlagen: ${ocrResponse.status}` 
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "OCR fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ocrData = await ocrResponse.json();
    let extractedText = "";
    if (ocrData.pages) {
      for (const page of ocrData.pages) {
        extractedText += `\n--- Seite ${page.index + 1} ---\n`;
        extractedText += page.markdown || "";
      }
    } else if (ocrData.text) {
      extractedText = ocrData.text;
    }
    extractedText = extractedText.trim();

    console.log(`OCR extracted ${extractedText.length} chars for invoice ${invoiceId}`);

    if (!extractedText) {
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: "Kein Text extrahiert" 
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "Kein Text extrahiert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Mistral tool-calling to extract structured data
    const extractionResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          {
            role: "system",
            content: `Du bist ein Experte für die Extraktion von Rechnungsdaten aus OCR-Text. Extrahiere alle relevanten Felder und rufe die Funktion extract_invoice_data auf. Wenn ein Feld nicht erkennbar ist, setze null. Betraege immer als Dezimalzahl (z.B. 1234.56). Datumsangaben im Format YYYY-MM-DD. Fuer suggested_account_number: Schlage eine passende Kontonummer aus dem deutschen SKR-Kontenrahmen vor (z.B. 4200 fuer Reparaturen, 4100 fuer Versicherungen, 4500 fuer Verwaltungskosten). WICHTIG: Extrahiere auch die vollständige Empfängeradresse (an wen die Rechnung adressiert ist, NICHT der Absender/Lieferant). Das ist typischerweise die Hausverwaltung oder der Eigentümer mit Straße und Ort.

BRENNSTOFF-ERKENNUNG: Prüfe ob es sich um eine Brennstofflieferung handelt (Heizöl, Pellets, Gas, Fernwärme). Wenn ja, setze is_fuel_purchase=true und extrahiere fuel_type, fuel_quantity und fuel_unit.

CO₂-DATEN (BEHG, nur bei fossilen Brennstoffen oil/gas/district_heating): Extrahiere NUR wenn explizit auf der Rechnung genannt - NIEMALS berechnen oder schätzen!
- co2_emissions_kg: Gesamt-CO₂-Emissionen in kg (Schlüsselwörter: "CO2-Emissionen", "CO₂-Ausstoß", "CO2 in kg", "Kohlendioxid")
- co2_tax_amount_eur: CO₂-Preisanteil in EUR (Schlüsselwörter: "CO2-Preis", "CO₂-Steuer", "BEHG", "nationaler Emissionshandel", "nEHS")
- energy_content_kwh: Energiegehalt/Brennwert in kWh der Lieferung (Schlüsselwörter: "Brennwert", "Energiegehalt", "kWh")
Wenn ein Wert nicht explizit auf der Rechnung steht: setze null. Bei Pellets KEINE CO₂-Felder ausgeben (biogen, BEHG-frei).

ABSCHLAGSZAHLUNGEN / VERSORGUNGSVERTRÄGE:
Prüfe ob es sich um einen Abschlagsplan oder eine Jahresabrechnung handelt:
- ABSCHLAGSPLAN: Schlüsselwörter sind "Abschlag", "Abschlagsplan", "monatliche Vorauszahlung", "neuer Abschlag", "Abschlagszahlung". Setze invoice_type="installment" und extrahiere installment_amount (monatlicher Abschlagsbetrag), installment_interval, contract_number, meter_number.
- JAHRESABRECHNUNG / ENDABRECHNUNG: Schlüsselwörter sind "Jahresabrechnung", "Verbrauchsabrechnung", "Endabrechnung", "Schlussrechnung", "Abrechnungszeitraum". Setze invoice_type="annual_settlement" und extrahiere billing_period_from, billing_period_to, total_consumption, paid_installments_total (Summe aller bereits gezahlten Abschläge), settlement_difference (Nachzahlung positiv, Gutschrift negativ).
- Bei einer normalen Rechnung setze invoice_type="standard".

Bestimme auch den utility_type wenn es sich um Gas, Strom, Wasser oder Fernwärme handelt.`
          },
          {
            role: "user",
            content: `Extrahiere die Rechnungsdaten aus folgendem OCR-Text:\n\n${extractedText}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice_data",
              description: "Extrahierte strukturierte Rechnungsdaten",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "Name des Lieferanten/Dienstleisters (Absender der Rechnung)" },
                  vendor_iban: { type: "string", description: "IBAN des Lieferanten" },
                  invoice_number: { type: "string", description: "Rechnungsnummer" },
                  invoice_date: { type: "string", description: "Rechnungsdatum (YYYY-MM-DD)" },
                  due_date: { type: "string", description: "Fälligkeitsdatum (YYYY-MM-DD)" },
                  net_amount: { type: "number", description: "Nettobetrag" },
                  vat_amount: { type: "number", description: "MwSt-Betrag" },
                  gross_amount: { type: "number", description: "Bruttobetrag" },
                  description: { type: "string", description: "Kurzbeschreibung der Rechnung" },
                  recipient_address: { type: "string", description: "Vollständige Empfängeradresse inkl. Name, Straße, PLZ, Ort" },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        amount: { type: "number" },
                        vat_rate: { type: "number" }
                      },
                      required: ["description", "amount"]
                    },
                    description: "Einzelpositionen der Rechnung"
                  },
                  suggested_account_number: { type: "string", description: "Vorgeschlagene SKR-Kontonummer" },
                  // Fuel fields
                  is_fuel_purchase: { type: "boolean", description: "Ist dies eine Brennstofflieferung?" },
                  fuel_type: { type: "string", enum: ["oil", "pellets", "gas", "district_heating"], description: "Art des Brennstoffs" },
                  fuel_quantity: { type: "number", description: "Gelieferte Menge" },
                  fuel_unit: { type: "string", description: "Einheit (l, kg, kWh)" },
                  co2_emissions_kg: { type: "number", description: "CO₂-Emissionen in kg (NUR wenn explizit auf Rechnung)" },
                  co2_tax_amount_eur: { type: "number", description: "CO₂-Preisanteil/BEHG-Steuer in EUR (NUR wenn explizit auf Rechnung)" },
                  energy_content_kwh: { type: "number", description: "Energiegehalt/Brennwert der Lieferung in kWh (NUR wenn explizit auf Rechnung)" },
                  // Installment / utility fields
                  invoice_type: { type: "string", enum: ["standard", "installment", "annual_settlement"], description: "Rechnungstyp: standard, installment (Abschlag), annual_settlement (Jahresabrechnung)" },
                  utility_type: { type: "string", enum: ["gas", "strom", "wasser", "fernwaerme"], description: "Art des Versorgungsvertrags" },
                  installment_amount: { type: "number", description: "Monatlicher Abschlagsbetrag" },
                  installment_interval: { type: "string", description: "Intervall: monatlich, quartalsweise" },
                  contract_number: { type: "string", description: "Vertragsnummer des Versorgungsvertrags" },
                  meter_number: { type: "string", description: "Zählernummer" },
                  billing_period_from: { type: "string", description: "Abrechnungszeitraum Start (YYYY-MM-DD)" },
                  billing_period_to: { type: "string", description: "Abrechnungszeitraum Ende (YYYY-MM-DD)" },
                  total_consumption: { type: "number", description: "Gesamtverbrauch im Abrechnungszeitraum" },
                  paid_installments_total: { type: "number", description: "Summe aller gezahlten Abschläge" },
                  settlement_difference: { type: "number", description: "Nachzahlung (positiv) oder Gutschrift (negativ)" },
                },
                required: ["vendor_name", "gross_amount"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice_data" } },
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error("Extraction error:", extractionResponse.status, errorText);
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: "Datenextraktion fehlgeschlagen",
        ocr_raw_data: { text: extractedText }
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "Extraktion fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extractionData = await extractionResponse.json();
    const toolCall = extractionData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response");
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: "Keine strukturierten Daten extrahiert",
        ocr_raw_data: { text: extractedText }
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "Keine Daten extrahiert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: Record<string, any>;
    try {
      extracted = typeof toolCall.function.arguments === 'string' 
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      console.error("Failed to parse tool call arguments");
      await supabase.from("invoices").update({ 
        ocr_status: "error", 
        ocr_error: "Parsing fehlgeschlagen",
        ocr_raw_data: { text: extractedText }
      }).eq("id", invoiceId);
      return new Response(JSON.stringify({ error: "Parsing fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Extracted data:", JSON.stringify(extracted));

    // Look up suggested account by number
    let suggestedAccountId: string | null = null;
    if (extracted.suggested_account_number) {
      const { data: account } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_number", extracted.suggested_account_number)
        .is("building_id", null)
        .maybeSingle();
      if (account) suggestedAccountId = account.id;
    }

    // Auto-match building from recipient_address if no building_id is set yet
    // Skip auto-matching for company invoices (RGI Immobilien itself)
    const isCompany = invoice.is_company_invoice || isCompanyInvoice === true;
    let matchedBuildingId: string | null = invoice.building_id || null;
    if (!isCompany && !matchedBuildingId && extracted.recipient_address) {
      const { data: allBuildings } = await supabase
        .from("buildings")
        .select("id, name, address");
      
      if (allBuildings && allBuildings.length > 0) {
        matchedBuildingId = findBestBuildingMatch(extracted.recipient_address, allBuildings);
        if (matchedBuildingId) {
          console.log(`Auto-matched building: ${matchedBuildingId} from recipient: ${extracted.recipient_address}`);
        } else {
          console.log(`No building match for recipient: ${extracted.recipient_address}`);
        }
      }
    } else if (isCompany) {
      console.log(`Skipping building auto-match: invoice ${invoiceId} is a company invoice`);
    }

    // Post-OCR duplicate check: same invoice_number + vendor_name already exists?
    if (extracted.invoice_number && extracted.vendor_name) {
      let dupQuery = supabase
        .from("invoices")
        .select("id, file_name")
        .eq("invoice_number", extracted.invoice_number)
        .ilike("vendor_name", extracted.vendor_name)
        .neq("id", invoiceId)
        .limit(1);

      const { data: duplicates } = await dupQuery;
      if (duplicates && duplicates.length > 0) {
        console.log(`Duplicate detected: invoice_number=${extracted.invoice_number}, vendor=${extracted.vendor_name}, existing=${duplicates[0].id}`);
        await supabase.from("invoices").update({
          ocr_status: "done",
          ocr_error: null,
          ocr_raw_data: { text: extractedText },
          ocr_extracted_data: extracted,
          duplicate_of: duplicates[0].id,
          vendor_name: extracted.vendor_name,
          invoice_number: extracted.invoice_number,
          invoice_date: extracted.invoice_date || null,
          gross_amount: extracted.gross_amount || null,
          description: `⚠️ Mögliches Duplikat von ${duplicates[0].file_name || duplicates[0].id}`,
        }).eq("id", invoiceId);

        return new Response(JSON.stringify({ 
          success: true, 
          warning: "duplicate_detected",
          duplicate_of: duplicates[0].id 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update invoice with extracted data
    const updateData: Record<string, any> = {
      ocr_status: "done",
      ocr_error: null,
      ocr_raw_data: { text: extractedText },
      ocr_extracted_data: extracted,
      line_items: extracted.line_items || [],
      vendor_iban: extracted.vendor_iban || null,
      suggested_account_id: suggestedAccountId,
    };

    // Set building_id if auto-matched (never for company invoices)
    if (matchedBuildingId && !invoice.building_id && !isCompany) {
      updateData.building_id = matchedBuildingId;
    }

    // Persist company-invoice flag if requested via call
    if (isCompanyInvoice === true && !invoice.is_company_invoice) {
      updateData.is_company_invoice = true;
    }

    // Only overwrite fields that are currently empty
    if (extracted.vendor_name) updateData.vendor_name = extracted.vendor_name;
    if (extracted.invoice_number) updateData.invoice_number = extracted.invoice_number;
    if (extracted.invoice_date) updateData.invoice_date = extracted.invoice_date;
    if (extracted.due_date) updateData.due_date = extracted.due_date;
    if (extracted.net_amount != null) updateData.net_amount = extracted.net_amount;
    if (extracted.vat_amount != null) updateData.vat_amount = extracted.vat_amount;
    if (extracted.gross_amount != null) updateData.gross_amount = extracted.gross_amount;
    if (extracted.description) updateData.description = extracted.description;

    // Installment / utility fields
    if (extracted.invoice_type && extracted.invoice_type !== "standard") {
      updateData.invoice_type = extracted.invoice_type;
    }
    if (extracted.meter_number) updateData.meter_number = extracted.meter_number;
    if (extracted.billing_period_from) updateData.billing_period_from = extracted.billing_period_from;
    if (extracted.billing_period_to) updateData.billing_period_to = extracted.billing_period_to;
    if (extracted.total_consumption != null) updateData.total_consumption = extracted.total_consumption;
    if (extracted.paid_installments_total != null) updateData.paid_installments_total = extracted.paid_installments_total;
    if (extracted.settlement_difference != null) updateData.settlement_difference = extracted.settlement_difference;

    const { error: updateError } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", invoiceId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Speichern fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-create or update utility contract if installment detected and building matched
    const finalBuildingId = matchedBuildingId || invoice.building_id;
    if (finalBuildingId && extracted.utility_type && (extracted.invoice_type === "installment" || extracted.invoice_type === "annual_settlement")) {
      try {
        // Check if a matching utility contract already exists
        const { data: existingContract } = await supabase
          .from("utility_contracts")
          .select("id")
          .eq("building_id", finalBuildingId)
          .eq("utility_type", extracted.utility_type)
          .eq("status", "active")
          .maybeSingle();

        if (!existingContract && extracted.invoice_type === "installment") {
          // Create new utility contract
          const { data: newContract } = await supabase
            .from("utility_contracts")
            .insert({
              building_id: finalBuildingId,
              vendor_name: extracted.vendor_name || "Unbekannt",
              vendor_iban: extracted.vendor_iban || null,
              utility_type: extracted.utility_type,
              contract_number: extracted.contract_number || null,
              meter_number: extracted.meter_number || null,
              installment_amount: extracted.installment_amount || extracted.gross_amount || null,
              installment_interval: extracted.installment_interval || "monatlich",
            })
            .select("id")
            .single();

          if (newContract) {
            await supabase.from("invoices").update({ utility_contract_id: newContract.id }).eq("id", invoiceId);
            console.log(`Created utility contract ${newContract.id} for building ${finalBuildingId}`);
          }
        } else if (existingContract) {
          // Link invoice to existing contract
          await supabase.from("invoices").update({ utility_contract_id: existingContract.id }).eq("id", invoiceId);
          
          // Update contract with new installment amount if it changed
          if (extracted.invoice_type === "installment" && extracted.installment_amount) {
            await supabase.from("utility_contracts").update({
              installment_amount: extracted.installment_amount,
              meter_number: extracted.meter_number || undefined,
              updated_at: new Date().toISOString(),
            }).eq("id", existingContract.id);
          }
          console.log(`Linked invoice to existing contract ${existingContract.id}`);
        }
      } catch (contractError) {
        console.error("Utility contract handling error:", contractError);
        // Non-fatal: invoice was already saved successfully
      }
    }

    // Auto-file invoice PDF in building DMS under "Rechnungen" subfolder
    if (finalBuildingId && invoice.file_path) {
      try {
        // Check if already filed
        const { data: existingFile } = await supabase
          .from("building_files")
          .select("id")
          .eq("linked_invoice_id", invoiceId)
          .maybeSingle();

        if (!existingFile) {
          // Ensure stammakte categories exist
          await supabase.rpc("ensure_stammakte_categories", { p_building_id: finalBuildingId });

          // Find "Rechnungen" subcategory under "Finanzen"
          const { data: finanzen } = await supabase
            .from("building_file_categories")
            .select("id")
            .eq("building_id", finalBuildingId)
            .eq("slug", "finanzen")
            .maybeSingle();

          let rechnungenId: string | null = null;
          if (finanzen) {
            const { data: rech } = await supabase
              .from("building_file_categories")
              .select("id")
              .eq("building_id", finalBuildingId)
              .eq("parent_id", finanzen.id)
              .eq("slug", "rechnungen")
              .maybeSingle();
            
            if (rech) {
              rechnungenId = rech.id;
            } else {
              const { data: building } = await supabase
                .from("buildings")
                .select("management_mode")
                .eq("id", finalBuildingId)
                .single();
              const { data: created } = await supabase
                .from("building_file_categories")
                .insert({
                  name: "Rechnungen",
                  slug: "rechnungen",
                  building_id: finalBuildingId,
                  parent_id: finanzen.id,
                  management_mode: building?.management_mode || "weg",
                  icon: "receipt",
                  color: "#F97316",
                  sort_order: 10,
                  auto_rag_enabled: false,
                })
                .select("id")
                .single();
              rechnungenId = created?.id || null;
            }
          }

          // Get file size from storage
          let fileSize = 0;
          try {
            const { data: storageList } = await supabase.storage
              .from("invoices")
              .list(invoice.file_path.split("/").slice(0, -1).join("/"), {
                search: invoice.file_path.split("/").pop(),
              });
            fileSize = storageList?.[0]?.metadata?.size || 0;
          } catch {}

          const displayName = extracted.vendor_name && extracted.invoice_number
            ? `${extracted.vendor_name} – ${extracted.invoice_number}.pdf`
            : invoice.file_name || "Rechnung.pdf";

          await supabase.from("building_files").insert({
            building_id: finalBuildingId,
            category_id: rechnungenId,
            display_name: displayName,
            description: extracted.description || null,
            file_path: invoice.file_path,
            file_size: fileSize,
            mime_type: "application/pdf",
            management_mode: "weg",
            source: "invoice",
            linked_invoice_id: invoiceId,
            uploaded_by: user.id,
            extracted_text: extractedText,
            rag_enabled: false,
            visibility_role: "intern",
          });

          console.log(`Auto-filed invoice ${invoiceId} in building DMS`);
        }
      } catch (filingError) {
        console.error("Building DMS filing error (non-fatal):", filingError);
      }
    }

    console.log(`Invoice ${invoiceId} OCR completed successfully`);

    return new Response(
      JSON.stringify({ success: true, extracted, matchedBuildingId: finalBuildingId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-invoice error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
