import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Bank-zentrische Aggregation: Beträge können entweder auf account_id (Hauptkonto)
 * oder auf counter_account_id (Gegenkonto) liegen. Beide Seiten müssen berücksichtigt
 * und in entgegengesetzter Richtung verrechnet werden.
 *
 * Heizungs-Umbuchungen (booking_category = "heating_repost") werden ausgeschlossen,
 * damit Heizkosten nicht doppelt gezählt werden.
 */
function sumForAccount(bookings: any[], accountId: string): number {
  return (bookings || []).reduce((s: number, b: any) => {
    if (b.booking_category === "heating_repost") return s;
    const amt = Number(b.amount) || 0;
    if (b.account_id === accountId) return s + amt;
    if (b.counter_account_id === accountId) return s - amt;
    return s;
  }, 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { buildingId, periodId, fiscalYear, planYear } = await req.json();
    const targetYear = planYear || fiscalYear + 1;

    // Fetch accounts
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("is_billing_relevant", true)
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .order("account_number");

    // Fetch bookings for last 2 years — INCLUDE counter_account_id for bank-centric aggregation
    const { data: bookings } = await supabase
      .from("bookings")
      .select("account_id, counter_account_id, amount, fiscal_year, description, booking_category")
      .eq("building_id", buildingId)
      .gte("fiscal_year", fiscalYear - 1)
      .lte("fiscal_year", fiscalYear)
      .neq("status", "cancelled");

    // Fetch fuel inventory
    const { data: fuelData } = await supabase
      .from("fuel_inventory")
      .select("*")
      .eq("building_id", buildingId)
      .order("entry_date", { ascending: false })
      .limit(10);

    // Fetch building info
    const { data: building } = await supabase
      .from("buildings")
      .select("name, unit_count")
      .eq("id", buildingId)
      .single();

    // Calculate per-account totals for each year using bank-centric aggregation
    const currentYearBookings = (bookings || []).filter((b: any) => b.fiscal_year === fiscalYear);
    const prevYearBookings = (bookings || []).filter((b: any) => b.fiscal_year === fiscalYear - 1);

    const accountSummaries = (accounts || []).map((acc: any) => {
      const currentYear = Math.abs(sumForAccount(currentYearBookings, acc.id));
      const prevYear = Math.abs(sumForAccount(prevYearBookings, acc.id));

      return {
        account_id: acc.id,
        account_number: acc.account_number,
        account_name: acc.account_name,
        category: acc.category,
        distribution_key: acc.default_distribution_key || "mea",
        current_year: currentYear,
        prev_year: prevYear,
        trend: prevYear > 0 ? ((currentYear - prevYear) / prevYear) * 100 : 0,
      };
    }).filter((a: any) => a.current_year > 0 || a.prev_year > 0);

    const totalCurrent = accountSummaries.reduce((s: number, a: any) => s + a.current_year, 0);

    // Build AI prompt
    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) {
      // Without AI, just copy current year + 3% inflation
      const planItems = accountSummaries.map((acc: any) => ({
        account_id: acc.account_id,
        previous_amount: acc.current_year,
        planned_amount: Math.round(acc.current_year * 1.03 * 100) / 100,
        adjustment_reason: "Pauschale Anpassung +3%",
        distribution_key: acc.distribution_key,
      }));

      // Upsert plan
      const { data: existingPlan } = await supabase
        .from("economic_plans")
        .select("id")
        .eq("building_id", buildingId)
        .eq("fiscal_year", targetYear)
        .maybeSingle();

      let planId = existingPlan?.id;
      if (planId) {
        await supabase.from("economic_plans").update({
          total_costs: planItems.reduce((s: number, i: any) => s + i.planned_amount, 0),
          based_on_period_id: periodId,
          status: "draft",
        }).eq("id", planId);
        await supabase.from("economic_plan_items").delete().eq("plan_id", planId);
      } else {
        const { data: newPlan } = await supabase.from("economic_plans").insert({
          building_id: buildingId,
          fiscal_year: targetYear,
          based_on_period_id: periodId,
          total_costs: planItems.reduce((s: number, i: any) => s + i.planned_amount, 0),
          status: "draft",
        }).select("id").single();
        planId = newPlan?.id;
      }

      if (planId) {
        await supabase.from("economic_plan_items").insert(
          planItems.map((item: any) => ({ ...item, plan_id: planId }))
        );
      }

      return new Response(JSON.stringify({ success: true, planId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI-powered analysis
    const prompt = `Du bist ein erfahrener WEG-Verwalter. Erstelle einen Wirtschaftsplan für ${targetYear} basierend auf den folgenden Daten.

Liegenschaft: ${building?.name || "Unbekannt"} (${building?.unit_count || 0} Einheiten)

Kontendaten (Ist ${fiscalYear} / Vorjahr ${fiscalYear - 1}):
${accountSummaries.map((a: any) => `- ${a.account_number} ${a.account_name}: ${a.current_year.toFixed(2)}€ (Vorjahr: ${a.prev_year.toFixed(2)}€, Trend: ${a.trend > 0 ? '+' : ''}${a.trend.toFixed(1)}%)`).join('\n')}

Gesamtkosten ${fiscalYear}: ${totalCurrent.toFixed(2)}€

${fuelData && fuelData.length > 0 ? `Brennstoffdaten:\n${fuelData.map((f: any) => `- ${f.fuel_type}: ${f.quantity} ${f.unit}, ${f.total_cost}€ am ${f.entry_date}`).join('\n')}` : ''}

Bitte gib für jedes Konto einen Planbetrag für ${targetYear} vor und begründe Abweichungen. Berücksichtige:
- Allgemeine Inflation (~3%)
- Energiepreisentwicklung
- Bekannte Kostensteigerungen bei Versicherungen, Wartung, etc.

Antworte im folgenden JSON-Format:
{
  "planned_items": [
    {
      "account_number": "4100",
      "planned_amount": 12500.00,
      "adjustment_reason": "Begründung"
    }
  ],
  "total_planned": 85000.00,
  "reasoning": "Gesamteinschätzung"
}`;

    const aiResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Mistral API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;
    let aiPlan;
    try {
      aiPlan = JSON.parse(aiContent);
    } catch {
      throw new Error("KI-Antwort konnte nicht geparst werden");
    }

    // Map AI suggestions to account IDs
    const planItems = accountSummaries.map((acc: any) => {
      const aiItem = (aiPlan.planned_items || []).find(
        (i: any) => i.account_number === acc.account_number
      );
      return {
        account_id: acc.account_id,
        previous_amount: acc.current_year,
        planned_amount: aiItem?.planned_amount || Math.round(acc.current_year * 1.03 * 100) / 100,
        adjustment_reason: aiItem?.adjustment_reason || "",
        distribution_key: acc.distribution_key,
      };
    });

    const totalPlanned = planItems.reduce((s: number, i: any) => s + i.planned_amount, 0);

    // Upsert plan
    const { data: existingPlan } = await supabase
      .from("economic_plans")
      .select("id")
      .eq("building_id", buildingId)
      .eq("fiscal_year", targetYear)
      .maybeSingle();

    let planId = existingPlan?.id;
    if (planId) {
      await supabase.from("economic_plans").update({
        total_costs: totalPlanned,
        based_on_period_id: periodId,
        adjustments: { reasoning: aiPlan.reasoning },
        status: "draft",
      }).eq("id", planId);
      await supabase.from("economic_plan_items").delete().eq("plan_id", planId);
    } else {
      const { data: newPlan } = await supabase.from("economic_plans").insert({
        building_id: buildingId,
        fiscal_year: targetYear,
        based_on_period_id: periodId,
        total_costs: totalPlanned,
        adjustments: { reasoning: aiPlan.reasoning },
        status: "draft",
      }).select("id").single();
      planId = newPlan?.id;
    }

    if (planId) {
      await supabase.from("economic_plan_items").insert(
        planItems.map((item: any) => ({ ...item, plan_id: planId }))
      );
    }

    return new Response(JSON.stringify({ success: true, planId, reasoning: aiPlan.reasoning }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("generate-economic-plan error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
