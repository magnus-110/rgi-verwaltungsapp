import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FileInput {
  filePath: string;
  fileName: string;
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

    const body = await req.json();
    const { question, sessionId } = body;

    // Support both single file (legacy) and multiple files
    let files: FileInput[] = [];
    if (body.files && Array.isArray(body.files)) {
      files = body.files;
    } else if (body.filePath) {
      files = [{ filePath: body.filePath, fileName: body.fileName || "Dokument" }];
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "Keine Dateien angegeben" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (files.length > 5) {
      return new Response(JSON.stringify({ error: "Maximal 5 Dateien erlaubt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMultiDoc = files.length > 1;
    console.log(`Analyzing ${files.length} document(s)`);

    // OCR each document
    const documentTexts: Array<{ fileName: string; text: string }> = [];
    const filePaths: string[] = [];

    for (const file of files) {
      filePaths.push(file.filePath);
      console.log(`OCR for: ${file.filePath}`);

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("building-documents")
        .createSignedUrl(file.filePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("Signed URL error:", signedUrlError);
        documentTexts.push({ fileName: file.fileName, text: "" });
        continue;
      }

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

      let extractedText = "";
      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        console.error(`OCR error for ${file.fileName}:`, ocrResponse.status, errorText);
      } else {
        const ocrData = await ocrResponse.json();
        if (ocrData.pages) {
          for (const page of ocrData.pages) {
            extractedText += `\n\n--- Seite ${page.index + 1} ---\n\n`;
            extractedText += page.markdown || "";
          }
        } else if (ocrData.text) {
          extractedText = ocrData.text;
        }
        extractedText = extractedText.trim();
      }

      console.log(`OCR for "${file.fileName}": ${extractedText.length} chars`);
      documentTexts.push({ fileName: file.fileName, text: extractedText });
    }

    // Delete all temp files after OCR
    const { error: deleteError } = await supabase.storage
      .from("building-documents")
      .remove(filePaths);
    if (deleteError) {
      console.error("Failed to delete temporary files:", deleteError);
    } else {
      console.log(`Deleted ${filePaths.length} temporary file(s)`);
    }

    // Build analysis prompt
    const userQuestion = question?.trim() || (isMultiDoc
      ? "Vergleiche diese Dokumente und fasse die wichtigsten Informationen zusammen."
      : "Analysiere dieses Dokument und fasse die wichtigsten Informationen zusammen.");

    const hasAnyText = documentTexts.some(d => d.text.length > 0);
    let analysisPrompt: string;

    if (!hasAnyText) {
      const fileNames = documentTexts.map(d => d.fileName).join(", ");
      analysisPrompt = `Du bist ein Experte für Immobilienverwaltung. Der Nutzer hat Dokumente hochgeladen (${fileNames}), aber der Text konnte nicht extrahiert werden. Bitte informiere den Nutzer darüber und schlage vor, die Dokumente in einem anderen Format hochzuladen.\n\nUrsprüngliche Frage: ${userQuestion}`;
    } else if (isMultiDoc) {
      let combinedText = "";
      for (let i = 0; i < documentTexts.length; i++) {
        const doc = documentTexts[i];
        combinedText += `\n\n========== Dokument ${i + 1}: ${doc.fileName} ==========\n\n`;
        combinedText += doc.text || "(Text konnte nicht extrahiert werden)";
      }
      analysisPrompt = `Du bist ein Experte für Immobilienverwaltung und Dokumentenanalyse. Der Nutzer hat ${documentTexts.length} Dokumente hochgeladen und möchte diese vergleichen.\n\nExtrahierte Texte:\n${combinedText}\n\n---\n\nFrage/Aufgabe des Nutzers: ${userQuestion}\n\nBitte analysiere und vergleiche die Dokumente gründlich. Wenn es Unstimmigkeiten, Abweichungen oder auffällige Unterschiede gibt, weise explizit darauf hin. Strukturiere deine Antwort klar und übersichtlich.`;
    } else {
      const doc = documentTexts[0];
      analysisPrompt = doc.text
        ? `Du bist ein Experte für Immobilienverwaltung und Dokumentenanalyse. Der Nutzer hat folgendes Dokument hochgeladen (Dateiname: "${doc.fileName}").\n\nExtrahierter Text aus dem Dokument:\n---\n${doc.text}\n---\n\nFrage/Aufgabe des Nutzers: ${userQuestion}\n\nBitte analysiere das Dokument und beantworte die Frage ausführlich. Strukturiere deine Antwort klar und übersichtlich.`
        : `Du bist ein Experte für Immobilienverwaltung. Der Nutzer hat ein Dokument hochgeladen (Dateiname: "${doc.fileName}"), aber der Text konnte nicht extrahiert werden. Bitte informiere den Nutzer darüber und schlage vor, das Dokument in einem anderen Format hochzuladen.\n\nUrsprüngliche Frage: ${userQuestion}`;
    }

    const analysisResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: isMultiDoc ? 12000 : 8000,
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
    const fileNames = documentTexts.map(d => d.fileName);
    const sessionTitle = isMultiDoc
      ? `📄 ${fileNames.length} Dokumente verglichen`
      : `📄 ${fileNames[0] || "Dokumentanalyse"}`;

    if (!currentSessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("document_chat_sessions")
        .insert({
          user_id: user.id,
          title: sessionTitle,
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
      const userContent = isMultiDoc
        ? `📄 ${fileNames.map(n => `**${n}**`).join(', ')} hochgeladen\n\n${userQuestion}`
        : `📄 **${fileNames[0] || "Dokument"}** hochgeladen\n\n${userQuestion}`;

      await supabase.from("document_chat_messages").insert({
        session_id: currentSessionId,
        role: "user",
        content: userContent,
      });

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
        documentCount: files.length,
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
