import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = Deno.env.get("MAKE_BOOKING_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: "MAKE_BOOKING_WEBHOOK_URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { statementId, bookAll } = await req.json();
    if (!statementId && !bookAll) {
      return new Response(JSON.stringify({ error: "statementId or bookAll required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get bookable transactions
    let txQuery = supabase
      .from("bank_transactions")
      .select("*")
      .is("booked_at", null)
      .in("match_status", ["matched_invoice", "matched_template", "manually_matched"]);

    if (!bookAll && statementId) {
      txQuery = txQuery.eq("statement_id", statementId);
    }

    const { data: transactions, error: txError } = await txQuery;

    if (txError) throw txError;
    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, bookedCount: 0, message: "Keine buchbaren Transaktionen" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect related IDs
    const invoiceIds = transactions.filter(t => t.matched_invoice_id).map(t => t.matched_invoice_id);
    const templateIds = transactions.filter(t => t.matched_template_id).map(t => t.matched_template_id);
    const buildingIds = [...new Set(transactions.filter(t => t.building_id).map(t => t.building_id))];

    // Fetch related data
    const [invoicesRes, templatesRes, buildingsRes] = await Promise.all([
      invoiceIds.length > 0
        ? supabase.from("invoices").select("id, invoice_number, invoice_date, vendor_name, net_amount, gross_amount, vat_amount, description, line_items, suggested_account_id, chart_of_accounts:suggested_account_id(account_number, account_name)").in("id", invoiceIds)
        : { data: [] },
      templateIds.length > 0
        ? supabase.from("booking_templates").select("id, name, account_id, is_35a_relevant, category, chart_of_accounts:account_id(account_number, account_name)").in("id", templateIds)
        : { data: [] },
      buildingIds.length > 0
        ? supabase.from("buildings").select("id, name, building_code").in("id", buildingIds)
        : { data: [] },
    ]);

    const invoiceMap = new Map((invoicesRes.data || []).map((i: any) => [i.id, i]));
    const templateMap = new Map((templatesRes.data || []).map((t: any) => [t.id, t]));
    const buildingMap = new Map((buildingsRes.data || []).map((b: any) => [b.id, b]));

    // Build payloads
    const payloads = transactions.map((txn: any) => {
      const building = txn.building_id ? buildingMap.get(txn.building_id) : null;
      const invoice = txn.matched_invoice_id ? invoiceMap.get(txn.matched_invoice_id) : null;
      const template = txn.matched_template_id ? templateMap.get(txn.matched_template_id) : null;

      let vat_rate: number | null = null;
      let vat_amount: number | null = invoice?.vat_amount ?? null;
      const net_amount: number | null = invoice?.net_amount ?? null;
      const gross_amount: number | null = invoice?.gross_amount ?? (txn.amount ? Math.abs(txn.amount) : null);

      if (vat_amount != null && net_amount != null && net_amount !== 0) {
        vat_rate = Math.round((vat_amount / net_amount) * 100 * 100) / 100;
      } else if (gross_amount != null && net_amount != null && net_amount !== 0) {
        vat_amount = gross_amount - net_amount;
        vat_rate = Math.round((vat_amount / net_amount) * 100 * 100) / 100;
      }

      return {
        transaction_id: txn.id,
        booking_date: txn.booking_date,
        value_date: txn.value_date,
        amount: txn.amount,
        currency: txn.currency,
        creditor_name: txn.creditor_name,
        creditor_iban: txn.creditor_iban,
        debtor_name: txn.debtor_name,
        debtor_iban: txn.debtor_iban,
        purpose: txn.purpose,
        end_to_end_ref: txn.end_to_end_ref,
        match_type: txn.match_status,
        building_id: txn.building_id,
        building_name: building?.name || null,
        building_code: building?.building_code || null,
        invoice_number: invoice?.invoice_number || null,
        invoice_date: invoice?.invoice_date || null,
        vendor_name: invoice?.vendor_name || txn.creditor_name || txn.debtor_name,
        net_amount: net_amount,
        gross_amount: gross_amount,
        vat_amount: vat_amount,
        vat_rate: vat_rate,
        account_number: invoice?.chart_of_accounts?.account_number || template?.chart_of_accounts?.account_number || null,
        account_name: invoice?.chart_of_accounts?.account_name || template?.chart_of_accounts?.account_name || null,
        template_name: template?.name || null,
        is_35a_relevant: template?.is_35a_relevant || false,
        category: template?.category || null,
      };
    });

    // Send in batches
    let bookedCount = 0;
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: batch, batch_number: Math.floor(i / BATCH_SIZE) + 1, total_batches: Math.ceil(payloads.length / BATCH_SIZE) }),
      });

      if (!response.ok) {
        console.error(`Webhook batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, response.status);
        break;
      }

      const batchIds = batch.map((p: any) => p.transaction_id);
      const { error: updateError } = await supabase
        .from("bank_transactions")
        .update({ booked_at: new Date().toISOString() })
        .in("id", batchIds);

      if (updateError) {
        console.error("Error marking as booked:", updateError);
      } else {
        bookedCount += batchIds.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookedCount,
        totalBookable: payloads.length,
        message: bookedCount === payloads.length
          ? `Alle ${bookedCount} Transaktionen gebucht`
          : `${bookedCount} von ${payloads.length} Transaktionen gebucht`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-booking-data error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
