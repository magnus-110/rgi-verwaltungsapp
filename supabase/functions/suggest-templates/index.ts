import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { buildingId } = await req.json();
    if (!buildingId) throw new Error("buildingId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mistralKey = Deno.env.get("MISTRAL_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load all transactions for building
    const { data: transactions, error: txnErr } = await supabase
      .from("bank_transactions")
      .select("id, booking_date, amount, creditor_name, creditor_iban, debtor_name, debtor_iban, purpose, match_status")
      .eq("building_id", buildingId)
      .order("booking_date", { ascending: false });
    if (txnErr) throw txnErr;

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], message: "Keine Transaktionen gefunden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing templates
    const { data: existingTemplates } = await supabase
      .from("booking_templates")
      .select("name, vendor_name, vendor_iban, expected_amount, interval")
      .eq("building_id", buildingId);

    // Load accounts for this building
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number, account_name, category")
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .order("account_number");

    // Prepare transaction summary for AI (limit to manageable size)
    const txnSummary = transactions.slice(0, 500).map(t => ({
      date: t.booking_date,
      amount: t.amount,
      creditor: t.creditor_name,
      creditor_iban: t.creditor_iban,
      debtor: t.debtor_name,
      debtor_iban: t.debtor_iban,
      purpose: t.purpose?.substring(0, 120),
    }));

    const accountList = (accounts || []).map(a => `${a.account_number} ${a.account_name} (${a.category})`).join("\n");
    const existingList = (existingTemplates || []).map(t => `${t.name} | ${t.vendor_name || ""} | ${t.vendor_iban || ""}`).join("\n");

    const prompt = `Du bist ein Experte für WEG-Hausverwaltung und Buchhaltung. Analysiere die folgenden Kontoauszug-Transaktionen und schlage Buchungsvorlagen vor.

REGELN:
- Gruppiere wiederkehrende Zahlungen an denselben Kreditor (gleicher IBAN oder ähnlicher Name)
- Erkenne Intervalle: monatlich, quartalsweise, halbjährlich, jährlich, einmalig
- Berechne den typischen Betrag und eine sinnvolle Toleranz
- Ordne jedem Vorschlag das passendste Konto zu
- Ignoriere Vorlagen die bereits existieren
- Typische WEG-Kosten: Strom, Gas, Wasser, Versicherung, Hausmeister, Aufzugwartung, Müllabfuhr, Gartenpflege, etc.
- Gib nur Vorschläge zurück, bei denen du dir sicher bist (mind. 2 Transaktionen oder ein klares Muster)

EXISTIERENDE VORLAGEN (nicht nochmal vorschlagen):
${existingList || "Keine"}

VERFÜGBARE KONTEN:
${accountList}

TRANSAKTIONEN (${transactions.length} gesamt, ${txnSummary.length} angezeigt):
${JSON.stringify(txnSummary)}`;

    const toolSchema = {
      type: "function",
      function: {
        name: "suggest_templates",
        description: "Schlage Buchungsvorlagen basierend auf Transaktionsmustern vor",
        parameters: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Name der Vorlage, z.B. 'Stromabschlag EnBW'" },
                  vendor_name: { type: "string", description: "Name des Kreditors" },
                  vendor_iban: { type: "string", description: "IBAN des Kreditors, falls bekannt" },
                  expected_amount: { type: "number", description: "Typischer Betrag (positiv für Ausgaben, negativ für Einnahmen)" },
                  amount_tolerance: { type: "number", description: "Toleranz in Euro" },
                  interval: { type: "string", enum: ["monatlich", "quartalsweise", "halbjährlich", "jährlich", "einmalig"] },
                  account_number: { type: "string", description: "Kontonummer aus dem Kontenrahmen" },
                  account_name: { type: "string", description: "Kontoname" },
                  category: { type: "string", description: "Kategorie wie Betriebskosten, Versicherung etc." },
                  vat_rate: { type: "number", description: "MwSt-Satz: 0, 7 oder 19" },
                  is_35a_relevant: { type: "boolean", description: "Ob §35a EStG relevant" },
                  description: { type: "string", description: "Kurze Beschreibung" },
                  confidence: { type: "string", enum: ["high", "medium"], description: "Wie sicher bist du dir" },
                  transaction_count: { type: "integer", description: "Anzahl gefundener Transaktionen für dieses Muster" },
                },
                required: ["name", "vendor_name", "expected_amount", "interval", "confidence", "transaction_count"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    };

    const aiResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: "Du bist ein KI-Assistent für WEG-Hausverwaltung. Antworte nur über die Tool-Funktion." },
          { role: "user", content: prompt },
        ],
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: "suggest_templates" } },
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Mistral error:", aiResponse.status, errText);
      throw new Error(`KI-Fehler: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ suggestions: [], message: "Keine Muster erkannt" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const suggestions = parsed.suggestions || [];

    // Resolve account_number to account_id
    for (const s of suggestions) {
      if (s.account_number && accounts) {
        const acc = accounts.find(a => a.account_number === s.account_number);
        if (acc) s.account_id = acc.id;
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-templates error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
