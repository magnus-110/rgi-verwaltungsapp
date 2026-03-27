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

    const { statementId, bookAll, testMode } = await req.json();

    // Test mode: send a fictional dummy transaction without touching DB
    if (testMode) {
      const dummyPayload = {
        transactions: [{
          transaction_id: "test-" + crypto.randomUUID(),
          booking_date: new Date().toISOString().split("T")[0],
          value_date: new Date().toISOString().split("T")[0],
          amount: -250.00,
          currency: "EUR",
          creditor_name: "Stadtwerke Musterstadt GmbH",
          creditor_iban: "DE89370400440532013000",
          debtor_name: null,
          debtor_iban: null,
          purpose: "Abschlag Gas Dezember 2025 Kd-Nr 4711 Zähler 00012345",
          end_to_end_ref: "SWMS-2025-12-4711",
          match_type: "matched_template",
          building_id: "test-building-id",
          building_name: "Musterhaus Beispielstraße 1",
          building_code: "MH001",
          booking_instructions: "Stadtwerke Musterstadt immer auf Konto 1590 buchen. Gas-Abschläge sind Vorauszahlungen.",
          invoice_number: null,
          invoice_date: null,
          invoice_description: null,
          invoice_type: "installment",
          line_items: [],
          vendor_name: "Stadtwerke Musterstadt GmbH",
          net_amount: 210.08,
          gross_amount: 250.00,
          vat_amount: 39.92,
          vat_rate: 19.0,
          account_number: "4200",
          account_name: "Gaskosten",
          template_name: "Stadtwerke Gas Abschlag",
          is_35a_relevant: false,
          category: "versorgung",
          utility_type: "gas",
          prepayment_account_number: "1590",
          prepayment_account_name: "Vorauszahlungen Gas",
          expense_account_number: "4200",
          expense_account_name: "Gaskosten",
          installment_period: "2025-12",
          meter_number: "00012345",
          billing_period_from: null,
          billing_period_to: null,
          total_consumption: null,
          paid_installments_total: null,
          settlement_difference: null,
        }],
        batch_number: 1,
        total_batches: 1,
        test_mode: true,
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyPayload),
      });

      return new Response(
        JSON.stringify({
          success: response.ok,
          bookedCount: 0,
          totalBookable: 1,
          message: response.ok
            ? "Test-Transaktion erfolgreich an Make.com gesendet (keine DB-Änderung)"
            : `Webhook fehlgeschlagen: HTTP ${response.status}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Fetch related data (including booking_instructions from buildings)
    const [invoicesRes, templatesRes, buildingsRes] = await Promise.all([
      invoiceIds.length > 0
        ? supabase.from("invoices").select("id, invoice_number, invoice_date, vendor_name, net_amount, gross_amount, vat_amount, description, line_items, suggested_account_id, invoice_type, utility_contract_id, installment_period, meter_number, billing_period_from, billing_period_to, total_consumption, paid_installments_total, settlement_difference, chart_of_accounts:suggested_account_id(account_number, account_name)").in("id", invoiceIds)
        : { data: [] },
      templateIds.length > 0
        ? supabase.from("booking_templates").select("id, name, account_id, is_35a_relevant, category, chart_of_accounts:account_id(account_number, account_name)").in("id", templateIds)
        : { data: [] },
      buildingIds.length > 0
        ? supabase.from("buildings").select("id, name, building_code, booking_instructions").in("id", buildingIds)
        : { data: [] },
    ]);

    // Fetch utility contracts for invoices that reference them
    const contractIds = [...new Set((invoicesRes.data || []).filter((i: any) => i.utility_contract_id).map((i: any) => i.utility_contract_id))];
    let contractMap = new Map();
    if (contractIds.length > 0) {
      const { data: contracts } = await supabase
        .from("utility_contracts")
        .select("id, utility_type, prepayment_account_id, expense_account_id, prepay_account:prepayment_account_id(account_number, account_name), expense_account:expense_account_id(account_number, account_name)")
        .in("id", contractIds);
      contractMap = new Map((contracts || []).map((c: any) => [c.id, c]));
    }

    const invoiceMap = new Map((invoicesRes.data || []).map((i: any) => [i.id, i]));
    const templateMap = new Map((templatesRes.data || []).map((t: any) => [t.id, t]));
    const buildingMap = new Map((buildingsRes.data || []).map((b: any) => [b.id, b]));

    // Build payloads
    const payloads = transactions.map((txn: any) => {
      const building = txn.building_id ? buildingMap.get(txn.building_id) : null;
      const invoice = txn.matched_invoice_id ? invoiceMap.get(txn.matched_invoice_id) : null;
      const template = txn.matched_template_id ? templateMap.get(txn.matched_template_id) : null;
      const contract = invoice?.utility_contract_id ? contractMap.get(invoice.utility_contract_id) : null;

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
        purpose: invoice?.description || txn.purpose,
        end_to_end_ref: txn.end_to_end_ref,
        match_type: txn.match_status,
        building_id: txn.building_id,
        building_name: building?.name || null,
        building_code: building?.building_code || null,
        booking_instructions: building?.booking_instructions || null,
        invoice_number: invoice?.invoice_number || null,
        invoice_date: invoice?.invoice_date || null,
        invoice_description: invoice?.description || null,
        invoice_type: invoice?.invoice_type || "standard",
        line_items: invoice?.line_items || [],
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
        // Utility contract / installment fields
        utility_type: contract?.utility_type || null,
        prepayment_account_number: contract?.prepay_account?.account_number || null,
        prepayment_account_name: contract?.prepay_account?.account_name || null,
        expense_account_number: contract?.expense_account?.account_number || null,
        expense_account_name: contract?.expense_account?.account_name || null,
        installment_period: invoice?.installment_period || null,
        meter_number: invoice?.meter_number || null,
        billing_period_from: invoice?.billing_period_from || null,
        billing_period_to: invoice?.billing_period_to || null,
        total_consumption: invoice?.total_consumption || null,
        paid_installments_total: invoice?.paid_installments_total || null,
        settlement_difference: invoice?.settlement_difference || null,
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
