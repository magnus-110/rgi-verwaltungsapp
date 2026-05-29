import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { buildingId, periodId, fiscalYear, mode } = body;

    if (!buildingId || !fiscalYear) {
      return new Response(JSON.stringify({ error: "buildingId und fiscalYear erforderlich" }), {
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

    // Route based on mode
    if (mode === "booking_review") {
      return await handleBookingReview(body, MISTRAL_API_KEY);
    }
    if (mode === "accrual_suggestion") {
      return await handleAccrualSuggestion(body, MISTRAL_API_KEY);
    }
    if (mode === "settlement_summary") {
      return await handleSettlementSummary(body, MISTRAL_API_KEY);
    }

    // Default: full billing analysis
    return await handleFullAnalysis(body, MISTRAL_API_KEY);
  } catch (e) {
    console.error("analyze-billing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callMistral(systemPrompt: string, userPrompt: string, apiKey: string) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-medium-3-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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
      return { error: "Rate limit erreicht. Bitte versuche es in einer Minute erneut." };
    }
    return { error: `Mistral API Fehler (${response.status})` };
  }

  const aiResult = await response.json();
  const content = aiResult.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content, recommendations: [] };
  }
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// === MODE: booking_review ===
async function handleBookingReview(body: any, apiKey: string) {
  const { accountData, fiscalYear } = body;

  const systemPrompt = `Du bist ein WEG-Buchhalter. Prüfe die folgenden Kontobuchungen auf Anomalien.
Suche nach:
- Fehlende Buchungen (z.B. nur 10 statt 12 monatliche Zahlungen)
- Ungewöhnliche Beträge vs. erwartete Beträge
- Doppelbuchungen (gleicher Betrag am gleichen Tag)
- Konten ohne Buchungen die Buchungen haben sollten

Antworte als JSON:
{
  "recommendations": [
    {
      "severity": "error|warning|info|success",
      "area": "Kontobereich",
      "title": "Kurzer Titel",
      "description": "Detail",
      "suggestion": "Handlungsempfehlung"
    }
  ]
}`;

  const result = await callMistral(
    systemPrompt,
    `Prüfe diese Buchungsübersicht für das Geschäftsjahr ${fiscalYear}:\n\n${JSON.stringify(accountData, null, 2)}`,
    apiKey
  );
  return jsonResponse(result);
}

// === MODE: accrual_suggestion ===
async function handleAccrualSuggestion(body: any, apiKey: string) {
  const { accrualData, yearStart, yearEnd, fiscalYear } = body;

  const systemPrompt = `Du bist ein WEG-Buchhalter. Analysiere Buchungen mit jahresübergreifendem Leistungszeitraum und schlage passende Abgrenzungsbuchungen vor.

Für jede Buchung deren Leistungszeitraum über die Geschäftsjahresgrenzen (${yearStart} bis ${yearEnd}) hinausgeht:
1. Berechne den zeitanteiligen Betrag der ins aktuelle Jahr gehört
2. Schlage eine Abgrenzungsbuchung auf ein 4xxx-Konto vor
3. Erkläre kurz die Berechnung

Antworte als JSON:
{
  "suggestions": [
    {
      "title": "Abgrenzung: [Kontoname]",
      "description": "Erklärung der Berechnung",
      "amount": 123.45,
      "suggestion": "Buchung auf Konto 4000 mit Betrag X€ für den Anteil außerhalb des GJ"
    }
  ]
}`;

  const result = await callMistral(
    systemPrompt,
    `Analysiere diese ${accrualData?.length || 0} Buchungen mit übergreifendem Leistungszeitraum (GJ ${fiscalYear}):\n\n${JSON.stringify(accrualData, null, 2)}`,
    apiKey
  );
  return jsonResponse(result);
}

// === MODE: settlement_summary ===
async function handleSettlementSummary(body: any, apiKey: string) {
  const { settlementData, fiscalYear } = body;

  const systemPrompt = `Du bist ein WEG-Verwalter und erstellst eine natürlichsprachliche Zusammenfassung der Jahresabrechnung.

Schreibe 3-5 Absätze die folgendes abdecken:
1. Gesamtkosten und Vergleich zum Wirtschaftsplan
2. Hauptkostentreiber und auffällige Veränderungen  
3. Ergebnis für die Eigentümer (wer bekommt Guthaben, wer muss nachzahlen)
4. Empfehlung für den Wirtschaftsplan des Folgejahres

Schreibe sachlich und professionell, verwende konkrete Zahlen. Die Zusammenfassung wird den Eigentümern als Anschreiben zur Abrechnung beigefügt.

Antworte als JSON:
{
  "summary": "Die natürlichsprachliche Zusammenfassung als Text (Markdown erlaubt)"
}`;

  const result = await callMistral(
    systemPrompt,
    `Erstelle eine Zusammenfassung der Jahresabrechnung ${fiscalYear}:\n\n${JSON.stringify(settlementData, null, 2)}`,
    apiKey
  );
  return jsonResponse(result);
}

// === DEFAULT: Full billing analysis ===
async function handleFullAnalysis(body: any, apiKey: string) {
  const { buildingId, periodId, fiscalYear } = body;

  if (!periodId) {
    return jsonResponse({ error: "periodId erforderlich für Gesamtanalyse" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

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
    supabase.from("bookings").select("account_id, counter_account_id, amount, booking_category").eq("building_id", buildingId).eq("fiscal_year", fiscalYear - 1).neq("status", "cancelled"),
    supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear),
    supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear - 1),
    supabase.from("fuel_inventory").select("*").eq("building_id", buildingId).eq("billing_period_id", periodId),
    supabase.from("contact_building_shares").select("*, contact_building_assignments!inner(building_id, contact_id, role_in_building, unit_number, contacts(first_name, last_name, company_name))").eq("contact_building_assignments.building_id", buildingId),
  ]);

  const heatingAccounts = (accounts || []).filter((a: any) => a.is_heating_relevant);

  // Bank-zentrisch: Beträge können auf account_id ODER counter_account_id liegen.
  const sumBoth = (rows: any[], accId: string) =>
    rows.reduce((s: number, b: any) => {
      if (b.booking_category === "heating_repost") return s;
      const amt = Number(b.amount) || 0;
      if (b.account_id === accId) return s + amt;
      if (b.counter_account_id === accId) return s - amt;
      return s;
    }, 0);

  const accountSummary = (accounts || []).map((a: any) => {
    const total = sumBoth(bookings || [], a.id);
    const prevTotal = sumBoth(prevBookings || [], a.id);
    return {
      number: a.account_number, name: a.account_name, category: a.category,
      is_heating: a.is_heating_relevant, is_billing: a.is_billing_relevant,
      current_total: total, prev_total: prevTotal,
      yoy_change_pct: prevTotal !== 0 ? ((total - prevTotal) / Math.abs(prevTotal)) * 100 : null,
    };
  }).filter((a: any) => a.current_total !== 0 || a.prev_total !== 0);

  const fuelSummary = [...new Set((fuelEntries || []).map((e: any) => e.fuel_type))].map((ft) => {
    const entries = (fuelEntries || []).filter((e: any) => e.fuel_type === ft);
    const opening = entries.find((e: any) => e.entry_type === "opening_balance");
    const closing = entries.find((e: any) => e.entry_type === "closing_balance");
    const purchases = entries.filter((e: any) => e.entry_type === "purchase");
    return {
      type: ft,
      opening: opening ? Number(opening.quantity) : null,
      closing: closing ? Number(closing.quantity) : null,
      purchases: purchases.length,
      total_purchased: purchases.reduce((s: number, e: any) => s + Number(e.quantity), 0),
      total_cost: purchases.reduce((s: number, e: any) => s + Number(e.total_price), 0),
      consumption: opening && closing ? Number(opening.quantity) + purchases.reduce((s: number, e: any) => s + Number(e.quantity), 0) - Number(closing.quantity) : null,
    };
  });

  const rebookings = (bookings || []).filter((b: any) => b.booking_category === "heating_repost");
  const heatingTotal = heatingAccounts.reduce((s: number, a: any) =>
    s + Math.abs(sumBoth(bookings || [], a.id)), 0);
  const rebookingTotal = rebookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);

  const balanceSummary = (balances || []).map((b: any) => ({
    account: b.chart_of_accounts?.account_number + " " + b.chart_of_accounts?.account_name,
    opening: Number(b.opening_balance), closing: Number(b.closing_balance), carried_forward: b.is_carried_forward,
  }));

  const totalIncome = (bookings || []).filter((b: any) => b.booking_type === "income").reduce((s: number, b: any) => s + Number(b.amount), 0);
  const totalExpense = (bookings || []).filter((b: any) => b.booking_type === "expense").reduce((s: number, b: any) => s + Number(b.amount), 0);

  const dataPayload = {
    building: building || {}, fiscal_year: fiscalYear,
    period: period ? { from: period.period_from, to: period.period_to, status: period.status, provider: period.heating_provider } : {},
    accounts: accountSummary,
    heating_accounts_count: heatingAccounts.length, heating_total: heatingTotal,
    rebooking_total: rebookingTotal, heating_balanced: Math.abs(heatingTotal - rebookingTotal) < 0.01,
    fuel: fuelSummary, balances: balanceSummary,
    total_income: totalIncome, total_expense: totalExpense,
    booking_count: (bookings || []).length, shares_count: (shares || []).length,
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

  const result = await callMistral(
    systemPrompt,
    `Analysiere diese Abrechnungsdaten für ${building?.name || "die Liegenschaft"} (${fiscalYear}):\n\n${JSON.stringify(dataPayload, null, 2)}`,
    apiKey
  );
  return jsonResponse(result);
}
