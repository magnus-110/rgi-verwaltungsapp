// extract-heating-statement
// ------------------------------------------------------------------
// Liest die Heizkostenabrechnung des Messdienstes (Techem, ista, Brunata,
// Minol, …) per Mistral-OCR + Tool-Calling aus und gibt einen
// strukturierten Vorschlag zurück. Der Endbetrag wird im Frontend
// IMMER vom Nutzer per Klick bestätigt – diese Funktion schreibt
// nichts in die DB.
// ------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { assignment_id, file_path } = await req.json().catch(() => ({}));
    if (!assignment_id || !file_path) {
      return json({ error: "assignment_id und file_path erforderlich" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mistralApiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!mistralApiKey) {
      return json({ error: "MISTRAL_API_KEY fehlt" }, 500);
    }

    // User-Auth
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Eigentümerschaft prüfen: gehört assignment_id dem User
    // (oder darf er als admin/employee handeln)?
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const isStaff = profile?.role === "admin" || profile?.role === "employee";

    if (!isStaff) {
      const { data: assignment } = await admin
        .from("contact_building_assignments")
        .select("id, contact_id, contacts!inner(user_id)")
        .eq("id", assignment_id)
        .maybeSingle();
      if (!assignment || (assignment as any).contacts?.user_id !== userId) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    // Signed URL für Datei aus building-files bucket
    const { data: signedUrlData, error: signedErr } = await admin.storage
      .from("building-files")
      .createSignedUrl(file_path, 600);

    if (signedErr || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedErr);
      return json({ error: "Datei nicht lesbar" }, 500);
    }

    const lower = file_path.toLowerCase();
    const isImage = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(lower);

    // ─── Schritt 1: Mistral OCR ─────────────────────────────────────
    const ocrDocument = isImage
      ? { type: "image_url", image_url: signedUrlData.signedUrl }
      : { type: "document_url", document_url: signedUrlData.signedUrl };

    const ocrResp = await fetch("https://api.mistral.ai/v1/ocr", {
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

    if (!ocrResp.ok) {
      const t = await ocrResp.text();
      console.error("OCR error", ocrResp.status, t);
      return json({ error: "OCR fehlgeschlagen" }, 500);
    }

    const ocrData = await ocrResp.json();
    let text = "";
    if (ocrData.pages) {
      for (const p of ocrData.pages) {
        text += `\n--- Seite ${p.index + 1} ---\n${p.markdown || ""}`;
      }
    } else if (ocrData.text) {
      text = ocrData.text;
    }
    text = text.trim();

    if (!text) {
      return json({
        found: false,
        confidence: "niedrig",
        warnings: ["Kein Text in dem Dokument erkannt."],
      });
    }

    // ─── Schritt 2: Strukturierte Auslese via Tool-Calling ──────────
    const systemPrompt = `Du bist Experte für deutsche Heizkostenabrechnungen von Messdiensten
(Techem, ista, Brunata, Minol u. a.). Aus dem OCR-Text einer Abrechnung
sollst du den anteiligen Heiz-/Warmwasser-Betrag einer einzelnen Wohnung
extrahieren und über die Funktion extract_heating_data zurückgeben.

REGELN – sehr wichtig:
1. Suche zuerst "Ihr Anteil an den Gesamtkosten" bzw. die Summe aus
   Heizkosten- und Warmwasserkosten-Anteil dieser Wohnung. Das ist
   "anteil_gesamtkosten".
2. Suche, ob ein Vermieteranteil der CO₂-Abgabe ausgewiesen ist
   ("Diesen Betrag muss Ihnen Ihr Vermieter gemäß CO₂KostAufG erstatten",
   "CO2-Abgabe Vermieteranteil", "CO₂-Kostenaufteilung Vermieter").
   Dieser Betrag wird vom Anteil abgezogen.
3. Berechne suggested_value = anteil_gesamtkosten - co2_vermieteranteil
   (wenn co2_vermieteranteil fehlt: suggested_value = anteil_gesamtkosten).
4. Lies den Nutzungszeitraum ("Nutzungszeitraum", "Abrechnungszeitraum
   für diese Nutzeinheit"). Wenn der Zeitraum kein volles Kalenderjahr ist
   (also < ~360 Tage) → mieterwechsel_verdacht=true, confidence="niedrig"
   und füge eine warning hinzu "Nur Teilzeitraum – bitte manuell prüfen".
5. Erfinde NIEMALS Zahlen. Wenn ein Wert nicht eindeutig im Text steht:
   das Feld auf null. Wenn der Hauptbetrag (anteil_gesamtkosten) fehlt
   oder unklar ist: found=false.
6. Wenn Wasser/Frischwasser bereits in der Heizkostenabrechnung enthalten
   ist, ergänze warning "Wasser ist bereits enthalten – nicht doppelt
   ansetzen".
7. confidence: "hoch" wenn alle Schlüsselzahlen klar gelesen wurden und
   ein volles Jahr abgerechnet ist; "mittel" wenn kleinere Unsicherheiten;
   "niedrig" bei Teilzeitraum, Mieterwechsel, schlechter OCR-Qualität
   oder Unklarheiten.
8. source_quote: kurzer Originaltext (max 200 Zeichen), aus dem du den
   Hauptbetrag entnommen hast – zur Transparenz für den Nutzer.
9. Beträge immer als Dezimalzahl in Euro (z. B. 908.27), Datum als
   YYYY-MM-DD.`;

    const extractionResp = await fetch(
      "https://api.mistral.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralApiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                `Hier ist der OCR-Text der Heizkostenabrechnung. Extrahiere die Daten und rufe extract_heating_data auf:\n\n${text}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_heating_data",
                description:
                  "Strukturierte Daten aus einer Messdienst-Heizkostenabrechnung",
                parameters: {
                  type: "object",
                  properties: {
                    found: {
                      type: "boolean",
                      description:
                        "true, wenn ein eindeutiger Hauptbetrag (anteil_gesamtkosten) erkannt wurde",
                    },
                    anteil_gesamtkosten: {
                      type: ["number", "null"],
                      description:
                        "Ihr Anteil an den Gesamtkosten (Heizung + Warmwasser, ggf. inkl. Wasser) in EUR",
                    },
                    heizkosten: {
                      type: ["number", "null"],
                      description: "Heizkosten-Anteil in EUR",
                    },
                    warmwasserkosten: {
                      type: ["number", "null"],
                      description: "Warmwasserkosten-Anteil in EUR",
                    },
                    co2_vermieteranteil: {
                      type: ["number", "null"],
                      description:
                        "Vom Vermieter zu erstattender CO₂-Anteil nach CO₂KostAufG (wird vom Anteil abgezogen)",
                    },
                    suggested_value: {
                      type: ["number", "null"],
                      description:
                        "anteil_gesamtkosten minus co2_vermieteranteil – der vorgeschlagene Wert für das Eingabefeld",
                    },
                    nutzungszeitraum_von: {
                      type: ["string", "null"],
                      description: "Nutzungszeitraum-Beginn (YYYY-MM-DD)",
                    },
                    nutzungszeitraum_bis: {
                      type: ["string", "null"],
                      description: "Nutzungszeitraum-Ende (YYYY-MM-DD)",
                    },
                    mieterwechsel_verdacht: {
                      type: "boolean",
                      description:
                        "true, wenn der abgerechnete Zeitraum kein volles Jahr ist",
                    },
                    confidence: {
                      type: "string",
                      enum: ["hoch", "mittel", "niedrig"],
                    },
                    source_quote: {
                      type: ["string", "null"],
                      description:
                        "Originaltext-Auszug zur Belegung des Hauptbetrags (max 200 Zeichen)",
                    },
                    warnings: {
                      type: "array",
                      items: { type: "string" },
                      description: "Hinweise an den Nutzer",
                    },
                  },
                  required: ["found", "confidence", "warnings"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_heating_data" },
          },
          temperature: 0.1,
          max_tokens: 1500,
        }),
      },
    );

    if (!extractionResp.ok) {
      const t = await extractionResp.text();
      console.error("Extraction error", extractionResp.status, t);
      return json({ error: "Auslese fehlgeschlagen" }, 500);
    }

    const extractionData = await extractionResp.json();
    const toolCall = extractionData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({
        found: false,
        confidence: "niedrig",
        warnings: ["Keine strukturierten Daten erkannt."],
      });
    }

    let extracted: Record<string, any> = {};
    try {
      extracted =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
    } catch {
      return json({
        found: false,
        confidence: "niedrig",
        warnings: ["Antwort konnte nicht gelesen werden."],
      });
    }

    // Server-seitige Plausibilität für suggested_value
    if (
      extracted.found &&
      extracted.suggested_value == null &&
      typeof extracted.anteil_gesamtkosten === "number"
    ) {
      const co2 = typeof extracted.co2_vermieteranteil === "number"
        ? extracted.co2_vermieteranteil
        : 0;
      extracted.suggested_value =
        Math.round((extracted.anteil_gesamtkosten - co2) * 100) / 100;
    }

    return json(extracted);
  } catch (e: any) {
    console.error("extract-heating-statement error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
