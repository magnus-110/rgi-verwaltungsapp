// Voice-to-Email: Audio aufnehmen → Mistral Voxtral transkribiert → mistral-large formatiert zu Geschäfts-E-Mail
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Ctx {
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
  existingBody?: string;
  senderName?: string;
  isReply?: boolean;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "MISTRAL_API_KEY nicht konfiguriert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioBase64, mimeType, context } = await req.json() as {
      audioBase64: string; mimeType: string; context?: Ctx;
    };

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Schritt 1: Transkription via Voxtral Mini ──
    const audioBytes = base64ToBytes(audioBase64);
    const ext = mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("wav") ? "wav"
      : "webm";
    const audioBlob = new Blob([audioBytes], { type: mimeType || "audio/webm" });

    const fd = new FormData();
    fd.append("file", audioBlob, `recording.${ext}`);
    fd.append("model", "voxtral-mini-latest");
    fd.append("language", "de");

    const sttRes = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    if (!sttRes.ok) {
      const t = await sttRes.text();
      console.error("Mistral STT error:", sttRes.status, t);
      if (sttRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte kurz warten." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Transkription fehlgeschlagen", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sttJson = await sttRes.json();
    const transcript: string = sttJson.text || "";

    if (!transcript.trim()) {
      return new Response(JSON.stringify({ error: "Keine Sprache erkannt. Bitte erneut versuchen." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Schritt 2: Formatierung via Mistral Large ──
    const ctx = context || {};
    const ctxLines: string[] = [];
    if (ctx.recipientName) ctxLines.push(`Empfänger-Name: ${ctx.recipientName}`);
    if (ctx.recipientEmail) ctxLines.push(`Empfänger-E-Mail: ${ctx.recipientEmail}`);
    if (ctx.subject) ctxLines.push(`Aktueller Betreff: ${ctx.subject}`);
    if (ctx.senderName) ctxLines.push(`Absender (du): ${ctx.senderName}`);
    if (ctx.isReply) ctxLines.push(`Dies ist eine Antwort auf eine bestehende E-Mail.`);
    if (ctx.existingBody && ctx.existingBody.trim().length > 0) {
      ctxLines.push(`\nVorhandener Text/Quote (zur Bezugnahme, nicht wiederholen):\n${ctx.existingBody.slice(0, 2000)}`);
    }

    const systemPrompt = `Du bist Assistent eines Hausverwalters. Aus einem Sprach-Transkript formulierst du eine professionelle deutsche Geschäfts-E-Mail.

Regeln:
- Passende Anrede ("Sehr geehrte Frau …", "Sehr geehrter Herr …", "Sehr geehrte Damen und Herren," wenn unklar). Wenn der Empfänger-Name nur ein Vorname / Duz-Kontakt ist, "Hallo <Vorname>,".
- Klare Absätze, höflicher Ton, sachlich, vollständige Sätze.
- Höfliche Grußformel ("Mit freundlichen Grüßen") OHNE Namens-Signatur (wird automatisch angefügt).
- KEIN Betreff im Body. Wenn noch kein Betreff existiert, einen kurzen Vorschlag im Feld suggested_subject liefern.
- Füllwörter, Versprecher und "ähm" entfernen. Inhalte nicht erfinden — nur das Gesagte präzisieren.
- Antworte ausschließlich über den Funktions-Aufruf format_email.`;

    const userPrompt = `KONTEXT:
${ctxLines.join("\n") || "(kein zusätzlicher Kontext)"}

TRANSKRIPT (gesprochen):
"""
${transcript}
"""

Formuliere daraus eine fertige E-Mail.`;

    const llmRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-medium-3-5",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "format_email",
            description: "Liefert die formatierte E-Mail.",
            parameters: {
              type: "object",
              properties: {
                body: { type: "string", description: "Vollständiger E-Mail-Text mit Anrede, Absätzen und Grußformel (ohne Signatur, ohne Betreff)." },
                suggested_subject: { type: "string", description: "Optionaler Betreffvorschlag, falls noch keiner existiert." },
              },
              required: ["body"],
            },
          },
        }],
        tool_choice: "any",
      }),
    });

    if (!llmRes.ok) {
      const t = await llmRes.text();
      console.error("Mistral LLM error:", llmRes.status, t);
      return new Response(JSON.stringify({
        error: "KI-Formatierung fehlgeschlagen",
        transcript, // Fallback: zumindest Transkript zurückgeben
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const llmJson = await llmRes.json();
    const toolCall = llmJson.choices?.[0]?.message?.tool_calls?.[0];
    let body = "";
    let suggestedSubject: string | undefined;

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        body = args.body || "";
        suggestedSubject = args.suggested_subject;
      } catch (e) {
        console.error("tool args parse error:", e);
      }
    }

    if (!body) {
      // Fallback: nimm content
      body = llmJson.choices?.[0]?.message?.content || transcript;
    }

    return new Response(JSON.stringify({
      transcript,
      body,
      suggested_subject: suggestedSubject,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("voice-to-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
