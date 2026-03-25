import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { buildingId, periodId, fiscalYear } = await req.json();
    if (!buildingId || !periodId || !fiscalYear) {
      return new Response(JSON.stringify({ error: "buildingId, periodId und fiscalYear erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) {
      return new Response(JSON.stringify({ error: "MISTRAL_API_KEY nicht konfiguriert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gather all relevant data
    const [
      { data: building },
      { data: period },
      { data: accounts },
      { data: bookings },
      { data: prevBookings },
      { data: balances },
      { data: prevBalances },
      { data: fuelEntries },
      { data: shares },
    ] = await Promise.all([
      supabase.from("buildings").select("name, building_code, address, unit_count, management_mode").eq("id", buildingId).single(),
      supabase.from("billing_periods").select("*").eq("id", periodId).single(),
      supabase.from("chart_of_accounts").select("*").or(`building_id.is.null,building_id.eq.${buildingId}`).order("account_number"),
      supabase.from("bookings").select("*, chart_of_accounts!bookings_account_id_fkey(account_number, account_name)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear).neq("status", "cancelled"),
      supabase.from("bookings").select("account_id, amount, booking_category").eq("building_id", buildingId).eq("fiscal_year", fiscalYear - 1).neq("status", "cancelled"),
      supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear),
      supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear - 1),
      supabase.from("fuel_inventory").select("*").eq("building_id", buildingId).eq("billing_period_id", periodId),
      supabase.from("contact_building_shares").select("*, contact_building_assignments!inner(building_id, contact_id, role_in_building, unit_number, contacts(first_name, last_name, company_name))").eq("contact_building_assignments.building_id", buildingId),
    ]);

    // Aggregate data for AI
    const heatingAccounts = (accounts || []).filter((a: any) => a.is_heating_relevant);
    const billingAccounts = (accounts || []).filter((a: any) => a.is_billing_relevant);

    const accountSummary = (accounts || []).map((a: any) => {
      const total = (bookings || [])
        .filter((b: any) => b.account_id === a.id && b.booking_category !== "heating_repost")
        .reduce((s: number, b: any) => s + Number(b.amount), 0);
      const prevTotal = (prevBookings || [])
        .filter((b: any) => b.account_id === a.id && b.booking_category !== "heating_repost")
        .reduce((s: number, b: any) => s + Number(b.amount), 0);
      return {
        number: a.account_number,
        name: a.account_name,
        category: a.category,
        is_heating: a.is_heating_relevant,
        is_billing: a.is_billing_relevant,
        current_total: total,
        prev_total: prevTotal,
        yoy_change_pct: prevTotal !== 0 ? ((total - prevTotal) / Math.abs(prevTotal)) * 100 : null,
      };
    }).filter((a: any) => a.current_total !== 0 || a.prev_total !== 0);

    const fuelSummary = [...new Set((fuelEntries || []).map((e: any) => e.fuel_type))].map((ft) => {
      const entries = (fuelEntries || []).filter((e: any) => e.fuel_type === ft);
      const opening = entries.find((e: any) => e.entry_type === "opening_balance");
      const closing = entries.find((e: any) => e.entry_type === "closing_balance");
      const purchases = entries.filter((e: any) => e.entry_type === "purchase");
      const totalPurchaseQty = purchases.reduce((s: number, e: any) => s + Number(e.quantity), 0);
      const totalPurchaseCost = purchases.reduce((s: number, e: any) => s + Number(e.total_price), 0);
      return {
        type: ft,
        opening: opening ? Number(opening.quantity) : null,
        closing: closing ? Number(closing.quantity) : null,
        purchases: purchases.length,
        total_purchased: totalPurchaseQty,
        total_cost: totalPurchaseCost,
        consumption: opening && closing ? Number(opening.quantity) + totalPurchaseQty - Number(closing.quantity) : null,
      };
    });

    const rebookings = (bookings || []).filter((b: any) => b.booking_category === "heating_repost");
    const heatingTotal = heatingAccounts.reduce((s: number, a: any) => {
      return s + Math.abs((bookings || [])
        .filter((b: any) => b.account_id === a.id && b.booking_category !== "heating_repost")
        .reduce((ss: number, b: any) => ss + Number(b.amount), 0));
    }, 0);
    const rebookingTotal = rebookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);

    const balanceSummary = (balances || []).map((b: any) => ({
      account: b.chart_of_accounts?.account_number + " " + b.chart_of_accounts?.account_name,
      opening: Number(b.opening_balance),
      closing: Number(b.closing_balance),
      carried_forward: b.is_carried_forward,
    }));

    const totalIncome = (bookings || []).filter((b: any) => b.booking_type === "income").reduce((s: number, b: any) => s + Number(b.amount), 0);
    const totalExpense = (bookings || []).filter((b: any) => b.booking_type === "expense").reduce((s: number, b: any) => s + Number(b.amount), 0);

    const dataPayload = {
      building: building || {},
      fiscal_year: fiscalYear,
      period: period ? { from: period.period_from, to: period.period_to, status: period.status, provider: period.heating_provider } : {},
      accounts: accountSummary,
      heating_accounts_count: heatingAccounts.length,
      heating_total: heatingTotal,
      rebooking_total: rebookingTotal,
      heating_balanced: Math.abs(heatingTotal - rebookingTotal) < 0.01,
      fuel: fuelSummary,
      balances: balanceSummary,
      total_income: totalIncome,
      total_expense: totalExpense,
      booking_count: (bookings || []).length,
      shares_count: (shares || []).length,
    };

    const systemPrompt = `Du bist ein erfahrener WEG-Buchhalter und Prüfer für Hausverwaltungen in Deutschland. 
Analysiere die folgenden Abrechnungsdaten einer Wohnungseigentümergemeinschaft und finde Fehler, Unstimmigkeiten und Verbesserungsmöglichkeiten.

Prüfe insbesondere:
1. Summenabweichungen zwischen Einzelkonten und Umbuchungen
2. Fehlende oder unplausible Brennstoffdaten (negativer Verbrauch, fehlende Bestände)
3. Starke Abweichungen zum Vorjahr (>10%) mit möglichen Erklärungen
4. Fehlende Saldenübernahme
5. Auffällige Buchungen oder fehlende Buchungskategorien
6. Einnahmen-/Ausgaben-Bilanz
7. Verteilerschlüssel-Probleme

Antworte IMMER als gültiges JSON mit genau dieser Struktur:
{
  "summary": "Kurze Zusammenfassung der Analyse (2-3 Sätze, Markdown erlaubt)",
  "recommendations": [
    {
      "severity": "error|warning|info|success",
      "area": "Bereich (z.B. Heizkosten, Brennstoff, Salden, Buchungen)",
      "title": "Kurzer Titel",
      "description": "Detaillierte Beschreibung des Problems",
      "suggestion": "Konkreter Handlungsvorschlag"
    }
  ]
}

Sei präzise und nenne konkrete Zahlen und Kontonummern. Gib mindestens 3 Empfehlungen.`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analysiere diese Abrechnungsdaten für ${building?.name || "die Liegenschaft"} (${fiscalYear}):\n\n${JSON.stringify(dataPayload, null, 2)}` },
        ],
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Mistral API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte versuche es in einer Minute erneut." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Mistral API Fehler (${response.status})` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, recommendations: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-billing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
