import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Nicht angemeldet" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Nicht angemeldet" }, 401);

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const accountIds: string[] | undefined = Array.isArray(body?.accountIds) ? body.accountIds : undefined;

    if (query.length < 3) return json({ error: "Query zu kurz" }, 400);

    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) return json({ error: "MISTRAL_API_KEY nicht konfiguriert" }, 500);

    // Load archived email candidates (RLS applies via user JWT)
    let q = supabase
      .from("emails")
      .select("id, subject, from_name, from_address, date, ai_summary, building_id, contact_id")
      .eq("is_archived", true)
      .order("date", { ascending: false })
      .limit(500);
    if (accountIds && accountIds.length > 0) q = q.in("account_id", accountIds);

    const { data: emails, error: emailsErr } = await q;
    if (emailsErr) throw emailsErr;
    if (!emails || emails.length === 0) {
      return json({ matches: [] });
    }

    // Resolve building & contact names
    const buildingIds = [...new Set(emails.map((e) => e.building_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(emails.map((e) => e.contact_id).filter(Boolean))] as string[];

    const [buildingsRes, contactsRes] = await Promise.all([
      buildingIds.length
        ? supabase.from("buildings").select("id, name").in("id", buildingIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      contactIds.length
        ? supabase
            .from("contacts")
            .select("id, company_name, contact_persons(first_name, last_name)")
            .in("id", contactIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const buildingMap = new Map<string, string>();
    (buildingsRes.data || []).forEach((b: any) => buildingMap.set(b.id, b.name));

    const contactMap = new Map<string, string>();
    (contactsRes.data || []).forEach((c: any) => {
      const person = c.contact_persons?.[0];
      const name = c.company_name || (person ? `${person.first_name || ""} ${person.last_name || ""}`.trim() : "");
      contactMap.set(c.id, name || "");
    });

    // Build compact list for the LLM
    const lines = emails.map((e: any) => {
      const date = e.date ? new Date(e.date).toLocaleDateString("de-DE") : "?";
      const from = (e.from_name || e.from_address || "").substring(0, 60);
      const subject = (e.subject || "(Kein Betreff)").substring(0, 100);
      const building = e.building_id ? buildingMap.get(e.building_id) || "" : "";
      const contact = e.contact_id ? contactMap.get(e.contact_id) || "" : "";
      const summary = (e.ai_summary || "").replace(/\s+/g, " ").substring(0, 160);
      return `${e.id} | ${date} | ${from} | ${subject} | LS:${building} | KT:${contact} | ${summary}`;
    });

    const validIds = new Set(emails.map((e) => e.id));

    const systemPrompt =
      "Du hilfst, archivierte E-Mails zu finden. Wähle aus der gegebenen Liste maximal 10 IDs aus, die am besten zur Beschreibung des Nutzers passen. Sortiere nach Relevanz. Verwende NUR IDs aus der Liste. Keine Halluzinationen.";

    const userPrompt = `Beschreibung des Nutzers:\n${query}\n\nKandidaten (id | datum | absender | betreff | LS:liegenschaft | KT:kontakt | zusammenfassung):\n${lines.join("\n")}`;

    // Mistral with tool calling for structured output
    let resp: Response | null = null;
    let lastErr = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 800,
          tools: [
            {
              type: "function",
              function: {
                name: "return_matches",
                description: "Liefert die passenden E-Mail-IDs zurück.",
                parameters: {
                  type: "object",
                  properties: {
                    matches: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          reason: { type: "string", description: "Kurze Begründung (max. 120 Zeichen)" },
                        },
                        required: ["id"],
                      },
                    },
                  },
                  required: ["matches"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_matches" } },
        }),
      });
      if (resp.ok) break;
      lastStatus = resp.status;
      lastErr = await resp.text();
      if (lastStatus !== 429 && lastStatus < 500) break;
      await new Promise((r) => setTimeout(r, attempt === 0 ? 600 : 1500));
    }

    if (!resp || !resp.ok) {
      console.error("Mistral error:", lastStatus, lastErr);
      return json(
        { error: `KI-Fehler (${lastStatus})`, details: lastErr },
        lastStatus === 429 ? 429 : 502,
      );
    }

    const aiData = await resp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { matches: { id: string; reason?: string }[] } = { matches: [] };
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Parse error", e);
      }
    }

    // Filter to only valid IDs, preserve AI order
    const filtered = (parsed.matches || []).filter((m) => validIds.has(m.id)).slice(0, 10);

    const emailById = new Map(emails.map((e: any) => [e.id, e]));
    const matches = filtered.map((m) => {
      const e: any = emailById.get(m.id);
      return {
        id: e.id,
        subject: e.subject,
        from_name: e.from_name,
        from_address: e.from_address,
        date: e.date,
        building_name: e.building_id ? buildingMap.get(e.building_id) || null : null,
        contact_name: e.contact_id ? contactMap.get(e.contact_id) || null : null,
        reason: m.reason || null,
      };
    });

    return json({ matches });
  } catch (e: any) {
    console.error("ai-search-emails error:", e?.message || e);
    return json({ error: e?.message || "Unbekannter Fehler" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
