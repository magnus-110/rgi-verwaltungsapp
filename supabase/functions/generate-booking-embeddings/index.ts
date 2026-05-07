// Edge Function: generate-booking-embeddings
// Erzeugt für eine bestätigte Buchung ein Mistral-Embedding (1024-dim),
// schreibt es in booking_embeddings und pflegt vendor_memory.
//
// Aufruf:
//   POST { booking_id }                          -> einzelne Buchung
//   POST { mode: "backfill", building_id?, limit?, offset? } -> Batch-Backfill

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------- Mistral Embed mit Retry ----------
async function embedText(text: string): Promise<number[]> {
  const trimmed = text.length > 8000 ? text.slice(0, 8000) : text;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-embed",
          input: [trimmed],
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Mistral ${r.status}: ${body.slice(0, 200)}`);
      }
      const data = await r.json();
      const emb = data?.data?.[0]?.embedding;
      if (!Array.isArray(emb)) throw new Error("Kein Embedding zurück");
      return emb;
    } catch (e) {
      lastErr = e;
      const wait = 500 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Embed failed");
}

// ---------- Helpers ----------
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function shorten(s: string | null | undefined, max = 500): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) : t;
}

// ---------- Build Embedding Input (Multi-Field, bank-zentrisch) ----------
async function buildEmbeddingPayload(bookingId: string) {
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(`
      id, building_id, amount, booking_type, description, is_35a_relevant,
      account_id, counter_account_id, bank_transaction_id, invoice_id, source, status
    `)
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr) throw bErr;
  if (!booking) throw new Error(`Booking ${bookingId} nicht gefunden`);
  if (booking.status !== "confirmed") {
    return null; // nur bestätigte Buchungen lernen
  }

  const [{ data: building }, { data: acc }, { data: cAcc }, { data: bt }, { data: inv }] =
    await Promise.all([
      supabase.from("buildings").select("management_mode").eq("id", booking.building_id).maybeSingle(),
      booking.account_id
        ? supabase.from("chart_of_accounts").select("account_number, account_name, category").eq("id", booking.account_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.counter_account_id
        ? supabase.from("chart_of_accounts").select("account_number, account_name, category").eq("id", booking.counter_account_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.bank_transaction_id
        ? supabase.from("bank_transactions").select("creditor_name, debtor_name, creditor_iban, debtor_iban, purpose").eq("id", booking.bank_transaction_id).maybeSingle()
        : Promise.resolve({ data: null }),
      booking.invoice_id
        ? supabase.from("invoices").select("vendor_name, vendor_iban, line_items, description").eq("id", booking.invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (!building?.management_mode) {
    throw new Error(`Building ${booking.building_id} ohne management_mode`);
  }

  const isExpense = booking.booking_type === "expense";
  const counterparty =
    bt?.creditor_name || bt?.debtor_name || inv?.vendor_name || "";
  const iban = bt?.creditor_iban || bt?.debtor_iban || inv?.vendor_iban || "";
  const purpose = bt?.purpose || inv?.description || "";

  let lineItemsText = "";
  if (inv?.line_items && Array.isArray(inv.line_items)) {
    lineItemsText = inv.line_items
      .slice(0, 10)
      .map((li: any) => {
        if (typeof li === "string") return li;
        const desc = li?.description || li?.title || li?.name || "";
        const amt = li?.amount ?? li?.gross_amount ?? "";
        return desc ? `${desc}${amt !== "" ? ` (${amt} EUR)` : ""}` : "";
      })
      .filter(Boolean)
      .join(" | ");
  }

  const inputText = [
    `KREDITOR: ${counterparty || "(unbekannt)"} | IBAN: ${iban || "-"}`,
    `BETRAG: ${booking.amount} EUR | TYP: ${booking.booking_type || "-"}`,
    `VERWENDUNGSZWECK: ${shorten(purpose, 500)}`,
    `RECHNUNGSPOSITIONEN: ${shorten(lineItemsText, 500) || "-"}`,
    `BUCHUNGSTEXT: ${shorten(booking.description, 300)}`,
    `KONTIERUNG:`,
    `  account     = ${acc?.account_number || "?"} "${acc?.account_name || ""}"`,
    `  counter_acc = ${cAcc?.account_number || "?"} "${cAcc?.account_name || ""}"`,
    `§35a: ${booking.is_35a_relevant ? "true" : "false"}`,
  ].join("\n");

  // Quelle ableiten
  let source = "confirmed_human";
  if (booking.source === "hv_office_import" || booking.source === "hv-office-import") {
    source = "imported_legacy";
  } else if (booking.invoice_id) {
    source = "invoice_match";
  }

  return {
    booking,
    management_mode: building.management_mode,
    inputText,
    creditor_name: counterparty || null,
    creditor_iban: iban || null,
    purpose_text: shorten(purpose, 500) || null,
    account_number: acc?.account_number || null,
    account_name: acc?.account_name || null,
    counter_account_number: cAcc?.account_number || null,
    counter_account_name: cAcc?.account_name || null,
    account_category: cAcc?.category || acc?.category || null,
    isExpense,
    source,
  };
}

async function processBooking(bookingId: string) {
  const p = await buildEmbeddingPayload(bookingId);
  if (!p) return { booking_id: bookingId, skipped: "not confirmed" };

  const embedding = await embedText(p.inputText);

  // Upsert booking_embeddings
  const { error: upErr } = await supabase
    .from("booking_embeddings")
    .upsert(
      {
        booking_id: p.booking.id,
        building_id: p.booking.building_id,
        management_mode: p.management_mode,
        input_text: p.inputText,
        embedding: embedding as any,
        creditor_name: p.creditor_name,
        amount: p.booking.amount,
        booking_type: p.booking.booking_type,
        purpose_text: p.purpose_text,
        account_number: p.account_number,
        account_name: p.account_name,
        counter_account_number: p.counter_account_number,
        counter_account_name: p.counter_account_name,
        booking_description: shorten(p.booking.description, 500),
        is_35a_relevant: !!p.booking.is_35a_relevant,
        source: p.source,
        embedded_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" },
    );
  if (upErr) throw upErr;

  // Vendor-Memory pflegen (nur für expense; das relevante Sachkonto ist die counter-Seite)
  // Bei expense: counter_account ist Aufwand. Bei income: counter_account ist Ertrag.
  // Wir lernen pro Lieferanten-Kontonummer.
  const sachkontoNumber = p.counter_account_number;
  const sachkontoCategory = p.account_category;
  if (sachkontoNumber && (p.creditor_iban || p.creditor_name)) {
    const vendorNameNorm = normalizeName(p.creditor_name);
    const { error: vmErr } = await supabase.rpc("vendor_memory_upsert" as any, {
      p_vendor_iban: p.creditor_iban,
      p_vendor_name_normalized: vendorNameNorm,
      p_management_mode: p.management_mode,
      p_account_number: sachkontoNumber,
      p_account_category: sachkontoCategory,
      p_purpose_pattern: (p.purpose_text || "").slice(0, 80) || null,
      p_is_35a: !!p.booking.is_35a_relevant,
    });
    // Falls RPC noch nicht existiert: silent fallback via direktem Upsert
    if (vmErr) {
      await supabase
        .from("vendor_memory")
        .upsert(
          {
            vendor_iban: p.creditor_iban,
            vendor_name_normalized: vendorNameNorm,
            management_mode: p.management_mode,
            account_number: sachkontoNumber,
            account_category: sachkontoCategory,
            purpose_pattern: (p.purpose_text || "").slice(0, 80) || null,
            is_35a_relevant: !!p.booking.is_35a_relevant,
            usage_count: 1,
            last_used_at: new Date().toISOString(),
          },
          {
            onConflict: "vendor_iban,vendor_name_normalized,management_mode,account_number",
            ignoreDuplicates: false,
          } as any,
        );
    }
  }

  return { booking_id: bookingId, ok: true, source: p.source };
}

// ---------- HTTP Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Single-Mode
    if (body.booking_id) {
      const result = await processBooking(body.booking_id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backfill-Mode: nur Buchungen ohne Embedding bearbeiten
    if (body.mode === "backfill") {
      const limit = Math.min(Number(body.limit) || 10, 25);

      // Alle bereits eingebetteten IDs holen
      const { data: embedded } = await supabase
        .from("booking_embeddings")
        .select("booking_id");
      const embeddedSet = new Set((embedded || []).map((e: any) => e.booking_id));

      // Bestätigte Buchungen holen und in JS filtern
      let q = supabase
        .from("bookings")
        .select("id")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (body.building_id) q = q.eq("building_id", body.building_id);

      const { data: rows, error } = await q;
      if (error) throw error;
      const candidates = (rows || []).filter((r: any) => !embeddedSet.has(r.id)).slice(0, limit);

      const results: any[] = [];
      for (const row of candidates) {
        try {
          const r = await processBooking(row.id);
          results.push(r);
        } catch (e) {
          results.push({ booking_id: row.id, error: e instanceof Error ? e.message : String(e) });
        }
        await new Promise((res) => setTimeout(res, 1000));
      }

      return new Response(
        JSON.stringify({ processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "booking_id oder mode=backfill erforderlich" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-booking-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
