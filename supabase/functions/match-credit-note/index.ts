// Auto-Match: Beleg für Zahlungseingang (credit_note) <-> Bank-Eingang
// Triggers:
//  A) Nach Beleg-Import + OCR: Rückwärts-Match gegen unzugeordnete Bank-Eingänge
//     der letzten 90 Tage. Aufruf mit { invoiceId }.
//  B) Nach CAMT-Import: Vorwärts-Match einer neuen Bank-Eingangs-Tx gegen
//     offene Belege. Aufruf mit { bankTransactionId }.
//
// Auto-Match: Score >= 70 -> Vorschlag (match_status = 'suggested', ai_suggestion gesetzt).
// Bestätigung erfolgt manuell durch User in der Bank-Reconciliation-UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Invoice = {
  id: string;
  building_id: string | null;
  vendor_name: string | null;
  vendor_iban: string | null;
  invoice_date: string | null;
  gross_amount: number | null;
  status: string;
};

type BankTx = {
  id: string;
  building_id: string | null;
  amount: number;
  booking_date: string;
  debtor_name: string | null;
  debtor_iban: string | null;
  purpose: string | null;
  match_status: string | null;
  matched_invoice_id: string | null;
};

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreMatch(inv: Invoice, tx: BankTx): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const invAmount = Math.abs(Number(inv.gross_amount || 0));
  const txAmount = Math.abs(Number(tx.amount || 0));
  if (invAmount > 0 && txAmount > 0) {
    if (Math.abs(invAmount - txAmount) < 0.01) {
      score += 60;
      reasons.push("Betrag exakt");
    } else if (Math.abs(invAmount - txAmount) / invAmount <= 0.01) {
      score += 40;
      reasons.push("Betrag ±1 %");
    }
  }

  const purposeNorm = normalize(tx.purpose);
  const debtorNorm = normalize(tx.debtor_name);
  const haystack = purposeNorm + " " + debtorNorm;
  const vendorNorm = normalize(inv.vendor_name);
  if (vendorNorm.length >= 4 && haystack.includes(vendorNorm)) {
    score += 25;
    reasons.push("Aussteller im Verwendungszweck");
  }

  const invIban = normalize(inv.vendor_iban);
  const txIban = normalize(tx.debtor_iban);
  if (invIban && txIban && invIban === txIban) {
    score += 30;
    reasons.push("IBAN identisch");
  }

  if (inv.invoice_date) {
    const invDate = new Date(inv.invoice_date).getTime();
    const txDate = new Date(tx.booking_date).getTime();
    const diffDays = Math.abs(txDate - invDate) / (1000 * 60 * 60 * 24);
    if (diffDays <= 60) {
      score += 10;
      reasons.push("Datum innerhalb 60 Tage");
    }
  }

  return { score, reasons };
}

async function applyMatch(
  supabase: any,
  inv: Invoice,
  tx: BankTx,
  score: number,
  reasons: string[]
) {
  // Mark invoice as suggested-matched (still requires user confirmation in UI)
  // Bank-Tx wird auf 'suggested' gesetzt mit ai_suggestion-Payload, der den Beleg referenziert
  const suggestion = {
    type: "credit_note_match",
    invoice_id: inv.id,
    score,
    reasons,
    suggested_at: new Date().toISOString(),
  };

  await supabase
    .from("bank_transactions")
    .update({
      match_status: "suggested",
      matched_invoice_id: inv.id,
      ai_suggestion: suggestion,
    })
    .eq("id", tx.id)
    .is("matched_invoice_id", null); // nur wenn noch nicht zugeordnet
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { invoiceId, bankTransactionId } = await req.json().catch(() => ({}));

    let invoices: Invoice[] = [];
    let bankTxs: BankTx[] = [];

    if (invoiceId) {
      // A) Rückwärts: gegebener Beleg → suche passende Bank-Eingänge der letzten 90 Tage
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, building_id, vendor_name, vendor_iban, invoice_date, gross_amount, status")
        .eq("id", invoiceId)
        .maybeSingle();

      if (!inv || inv.status !== "credit_open") {
        return new Response(
          JSON.stringify({ ok: true, matched: 0, reason: "invoice not open" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      invoices = [inv as Invoice];

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 90);

      let q = supabase
        .from("bank_transactions")
        .select("id, building_id, amount, booking_date, debtor_name, debtor_iban, purpose, match_status, matched_invoice_id")
        .gt("amount", 0) // nur Eingänge
        .gte("booking_date", sinceDate.toISOString().slice(0, 10))
        .is("matched_invoice_id", null);
      if (inv.building_id) q = q.eq("building_id", inv.building_id);
      const { data: txs } = await q;
      bankTxs = (txs || []) as BankTx[];
    } else if (bankTransactionId) {
      // B) Vorwärts: gegebene Bank-Tx → suche passende offene Belege
      const { data: tx } = await supabase
        .from("bank_transactions")
        .select("id, building_id, amount, booking_date, debtor_name, debtor_iban, purpose, match_status, matched_invoice_id")
        .eq("id", bankTransactionId)
        .maybeSingle();

      if (!tx || Number(tx.amount) <= 0 || tx.matched_invoice_id) {
        return new Response(
          JSON.stringify({ ok: true, matched: 0, reason: "tx not eligible" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      bankTxs = [tx as BankTx];

      let q = supabase
        .from("invoices")
        .select("id, building_id, vendor_name, vendor_iban, invoice_date, gross_amount, status")
        .eq("invoice_type", "credit_note")
        .eq("status", "credit_open");
      if (tx.building_id) {
        q = q.or(`building_id.eq.${tx.building_id},building_id.is.null`);
      }
      const { data: invs } = await q;
      invoices = (invs || []) as Invoice[];
    } else {
      return new Response(
        JSON.stringify({ error: "invoiceId or bankTransactionId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pair-wise scoring → bestes Paar pro Tx
    let matchCount = 0;
    for (const tx of bankTxs) {
      let best: { inv: Invoice; score: number; reasons: string[] } | null = null;
      for (const inv of invoices) {
        const { score, reasons } = scoreMatch(inv, tx);
        if (!best || score > best.score) best = { inv, score, reasons };
      }
      if (best && best.score >= 70) {
        await applyMatch(supabase, best.inv, tx, best.score, best.reasons);
        matchCount++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, matched: matchCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("match-credit-note error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
