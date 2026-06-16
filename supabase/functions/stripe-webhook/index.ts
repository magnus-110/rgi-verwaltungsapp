import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

// Public webhook — verifies Stripe signature itself, no JWT.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, webhookSecret);
  } catch (e) {
    console.error("Signature verification failed:", e);
    return new Response("Bad signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const orderId = s.metadata?.order_id;
      if (!orderId) return new Response("No order_id", { status: 200 });

      let invoicePdf: string | null = null;
      let invoiceHosted: string | null = null;
      if (s.invoice) {
        const inv = await stripe.invoices.retrieve(s.invoice as string);
        invoicePdf = inv.invoice_pdf ?? null;
        invoiceHosted = inv.hosted_invoice_url ?? null;
      }

      await admin
        .from("service_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: (s.payment_intent as string) ?? null,
          stripe_invoice_id: (s.invoice as string) ?? null,
          stripe_invoice_pdf_url: invoicePdf,
          stripe_invoice_hosted_url: invoiceHosted,
        })
        .eq("id", orderId);

      // Trigger document generation (fire-and-forget)
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-service-document`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      }).catch((e) => console.error("generate trigger failed", e));
    } else if (event.type === "charge.refunded") {
      const c = event.data.object as Stripe.Charge;
      if (c.payment_intent) {
        await admin
          .from("service_orders")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", c.payment_intent as string);
      }
    }
  } catch (e) {
    console.error("Webhook handling error:", e);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
