import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get invoice record
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("id, file_path, file_name")
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

    // Step 1: Mistral OCR to extract text
    const ocrResponse = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: signedUrlData.signedUrl,
        },
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
            content: "Du bist ein Experte für die Extraktion von Rechnungsdaten aus OCR-Text. Extrahiere alle relevanten Felder und rufe die Funktion extract_invoice_data auf. Wenn ein Feld nicht erkennbar ist, setze null. Betraege immer als Dezimalzahl (z.B. 1234.56). Datumsangaben im Format YYYY-MM-DD. Fuer suggested_account_number: Schlage eine passende Kontonummer aus dem deutschen SKR-Kontenrahmen vor (z.B. 4200 fuer Reparaturen, 4100 fuer Versicherungen, 4500 fuer Verwaltungskosten)."
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
                  vendor_name: { type: "string", description: "Name des Lieferanten/Dienstleisters" },
                  vendor_iban: { type: "string", description: "IBAN des Lieferanten" },
                  invoice_number: { type: "string", description: "Rechnungsnummer" },
                  invoice_date: { type: "string", description: "Rechnungsdatum (YYYY-MM-DD)" },
                  due_date: { type: "string", description: "Fälligkeitsdatum (YYYY-MM-DD)" },
                  net_amount: { type: "number", description: "Nettobetrag" },
                  vat_amount: { type: "number", description: "MwSt-Betrag" },
                  gross_amount: { type: "number", description: "Bruttobetrag" },
                  description: { type: "string", description: "Kurzbeschreibung der Rechnung" },
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
                  suggested_account_number: { type: "string", description: "Vorgeschlagene SKR-Kontonummer" }
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
      // Still save OCR raw data even if extraction fails
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
        .maybeSingle();
      if (account) suggestedAccountId = account.id;
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

    // Only overwrite fields that are currently empty
    if (extracted.vendor_name) updateData.vendor_name = extracted.vendor_name;
    if (extracted.invoice_number) updateData.invoice_number = extracted.invoice_number;
    if (extracted.invoice_date) updateData.invoice_date = extracted.invoice_date;
    if (extracted.due_date) updateData.due_date = extracted.due_date;
    if (extracted.net_amount != null) updateData.net_amount = extracted.net_amount;
    if (extracted.vat_amount != null) updateData.vat_amount = extracted.vat_amount;
    if (extracted.gross_amount != null) updateData.gross_amount = extracted.gross_amount;
    if (extracted.description) updateData.description = extracted.description;

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

    console.log(`Invoice ${invoiceId} OCR completed successfully`);

    return new Response(
      JSON.stringify({ success: true, extracted }),
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
