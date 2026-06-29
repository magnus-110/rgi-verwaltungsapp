import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const {
      service_type,
      assignment_id,
      fiscal_year,
      agb_version,
      privacy_version,
      widerruf_waiver_confirmed,
      input_snapshot,
      quantity,
    } = body ?? {};
    const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
    if (!service_type || !widerruf_waiver_confirmed) {
      return json({ error: "Missing fields" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json(
        { error: "STRIPE_SECRET_KEY ist noch nicht konfiguriert. Bitte später erneut versuchen." },
        503,
      );
    }

    // Preis
    const { data: pricing } = await supabase
      .from("service_pricing")
      .select("*")
      .eq("service_type", service_type)
      .maybeSingle();
    if (!pricing) return json({ error: "Preis nicht gefunden" }, 400);

    // E-Mail des Users (für Stripe)
    const { data: userRes } = await supabase.auth.getUser(token);
    const email = userRes?.user?.email;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error: insErr } = await admin
      .from("service_orders")
      .insert({
        user_id: userId,
        service_type,
        assignment_id: assignment_id ?? null,
        fiscal_year: fiscal_year ?? null,
        price_cents: pricing.price_cents * qty,
        currency: pricing.currency,
        quantity: qty,
        status: "pending",
        agb_version: agb_version ?? "0",
        privacy_version: privacy_version ?? "0",
        widerruf_waiver_confirmed: true,
        input_snapshot: input_snapshot ?? {},
        ip_address: req.headers.get("x-forwarded-for") ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
      })
      .select()
      .single();
    if (insErr || !order) return json({ error: insErr?.message ?? "Insert failed" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const origin = req.headers.get("origin") ?? "https://rgi-immobilien.app";

    const lineItem = pricing.stripe_price_id
      ? { price: pricing.stripe_price_id as string, quantity: 1 }
      : {
          price_data: {
            currency: pricing.currency,
            unit_amount: pricing.price_cents,
            tax_behavior: pricing.tax_behavior ?? "inclusive",
            product_data: {
              name: labelFor(service_type),
              description: fiscal_year ? `Abrechnungsjahr ${fiscal_year}` : undefined,
            },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email ?? undefined,
      automatic_tax: { enabled: true },
      invoice_creation: { enabled: true },
      line_items: [lineItem as any],
      metadata: {
        order_id: order.id,
        user_id: userId,
        service_type,
        fiscal_year: fiscal_year ? String(fiscal_year) : "",
      },
      success_url: `${origin}/weg-owner/service-hub/erfolg?order_id=${order.id}`,
      cancel_url: `${origin}/weg-owner/service-hub`,
    });

    await admin
      .from("service_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);

    return json({ url: session.url, order_id: order.id });
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message ?? "Server error" }, 500);
  }
});

function labelFor(t: string) {
  if (t === "nebenkosten") return "Nebenkostenabrechnung für Mieter";
  if (t === "anlage_v") return "Anlage V — Vermietungseinkünfte";
  if (t === "mietvertrag") return "Mietvertrag";
  return t;
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
