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

    const { filePath, question, sessionId, fileName } = await req.json();

    if (!filePath) {
      return new Response(JSON.stringify({ error: "Kein Dateipfad angegeben" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing document: ${filePath}, question: ${question}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("building-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Datei konnte nicht heruntergeladen werden" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 in chunks to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 8192;
    let binaryString = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Data = btoa(binaryString);

    // Determine MIME type
    const mimeType = filePath.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

    console.log(`File size: ${bytes.length} bytes, sending to Mistral OCR...`);

    // Step 1: OCR with Mistral pixtral-large
    const ocrResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrahiere den gesamten Text aus diesem Dokument. Gib den Text strukturiert und vollständig zurück, behalte die Formatierung bei (Tabellen, Listen, Überschriften etc.). Antworte nur mit dem extrahierten Text, keine zusätzlichen Kommentare.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error("Mistral OCR error:", ocrResponse.status, errorText);
      
      // If vision fails, try without image (text-only analysis prompt)
      // Fall through to analysis with a note
    }

    let extractedText = "";
    if (ocrResponse.ok) {
      const ocrData = await ocrResponse.json();
      extractedText = ocrData.choices?.[0]?.message?.content || "";
      console.log(`OCR extracted ${extractedText.length} characters`);
    }

    // Step 2: Analysis with Mistral
    const userQuestion = question?.trim() || "Analysiere dieses Dokument und fasse die wichtigsten Informationen zusammen.";
    
    const analysisPrompt = extractedText
      ? `Du bist ein Experte für Immobilienverwaltung und Dokumentenanalyse. Der Nutzer hat folgendes Dokument hochgeladen (Dateiname: "${fileName || 'Dokument'}").\n\nExtrahierter Text aus dem Dokument:\n---\n${extractedText}\n---\n\nFrage/Aufgabe des Nutzers: ${userQuestion}\n\nBitte analysiere das Dokument und beantworte die Frage ausführlich. Strukturiere deine Antwort klar und übersichtlich.`
      : `Du bist ein Experte für Immobilienverwaltung. Der Nutzer hat ein Dokument hochgeladen (Dateiname: "${fileName || 'Dokument'}"), aber der Text konnte nicht extrahiert werden. Bitte informiere den Nutzer darüber und schlage vor, das Dokument in einem anderen Format hochzuladen.\n\nUrsprüngliche Frage: ${userQuestion}`;

    const analysisResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        max_tokens: 8000,
        temperature: 0.3,
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("Mistral analysis error:", analysisResponse.status, errorText);
      return new Response(JSON.stringify({ error: "KI-Analyse fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysisData = await analysisResponse.json();
    const answer = analysisData.choices?.[0]?.message?.content || "Keine Antwort erhalten.";

    // Save to session
    let currentSessionId = sessionId;

    if (!currentSessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("document_chat_sessions")
        .insert({
          user_id: user.id,
          title: `📄 ${fileName || "Dokumentanalyse"}`,
          search_scope: "general",
          include_general: true,
        })
        .select("id")
        .single();

      if (sessionError) {
        console.error("Session creation error:", sessionError);
      } else {
        currentSessionId = session.id;
      }
    }

    if (currentSessionId) {
      // Save user message
      await supabase.from("document_chat_messages").insert({
        session_id: currentSessionId,
        role: "user",
        content: `📄 **${fileName || "Dokument"}** hochgeladen\n\n${userQuestion}`,
      });

      // Save assistant message
      await supabase.from("document_chat_messages").insert({
        session_id: currentSessionId,
        role: "assistant",
        content: answer,
      });
    }

    return new Response(
      JSON.stringify({
        answer,
        sessionId: currentSessionId,
        extractedTextLength: extractedText.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("analyze-document error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
