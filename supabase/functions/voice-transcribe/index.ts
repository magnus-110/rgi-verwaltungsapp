// Generische Sprach-Transkription: Audio → Voxtral Mini → (optional) KI-Cleanup
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioBase64, mimeType, cleanup, contextHint, language } = await req.json() as {
      audioBase64: string;
      mimeType?: string;
      cleanup?: boolean;       // KI-Aufräumen (Füllwörter raus, Zeichensetzung)
      contextHint?: string;    // optionaler Kontext für die KI (z. B. die Frage)
      language?: string;
    };

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: "audioBase64 fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1: Transkription ──
    const audioBytes = base64ToBytes(audioBase64);
    const mt = mimeType || "audio/webm";
    const ext = mt.includes("mp4") ? "mp4"
      : mt.includes("ogg") ? "ogg"
      : mt.includes("wav") ? "wav"
      : "webm";
    const audioBlob = new Blob([audioBytes], { type: mt });

    const fd = new FormData();
    fd.append("file", audioBlob, `recording.${ext}`);
    fd.append("model", "voxtral-mini-latest");
    fd.append("language", language || "de");

    const sttRes = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    if (!sttRes.ok) {
      const t = await sttRes.text();
      console.error("Mistral STT error:", sttRes.status, t);
      const status = sttRes.status === 429 ? 429 : 502;
      return new Response(JSON.stringify({ error: "Transkription fehlgeschlagen", detail: t }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sttJson = await sttRes.json();
    const transcript: string = (sttJson.text || "").trim();

    if (!cleanup || !transcript) {
      return new Response(JSON.stringify({ transcript, text: transcript }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2: KI-Cleanup ──
    const sys = "Du bearbeitest gesprochene Notizen einer Hausverwaltung. Entferne Füllwörter, ergänze Zeichensetzung, behalte Bedeutung und Fakten exakt. Antworte ausschließlich mit dem bereinigten Text – keine Anrede, keine Erklärung.";
    const usr = contextHint
      ? `Kontext der Frage: ${contextHint}\n\nDiktat:\n${transcript}`
      : `Diktat:\n${transcript}`;

    const llmRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
      }),
    });

    if (!llmRes.ok) {
      // Fallback: rohen Transkript zurückgeben, nicht hart fehlschlagen
      return new Response(JSON.stringify({ transcript, text: transcript }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const llmJson = await llmRes.json();
    const text: string = (llmJson?.choices?.[0]?.message?.content || transcript).trim();

    return new Response(JSON.stringify({ transcript, text }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("voice-transcribe error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
