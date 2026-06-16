import { createClient } from "npm:@supabase/supabase-js@2";

// Service-internal: erzeugt das PDF und legt es in service-documents/{user_id}/{order_id}.pdf ab.
// v1: minimaler Stub, der den Storage-Bucket bei Bedarf anlegt und einen
// einfachen PDF-Platzhalter aus den input_snapshot-Daten ablegt. Die
// Anbindung an docxtemplater + CloudConvert kommt in einer Folge-Iteration.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { order_id } = await req.json();
    if (!order_id) return new Response("Missing order_id", { status: 400 });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await admin
      .from("service_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();
    if (error || !order) return new Response("Order not found", { status: 404 });
    if (order.status !== "paid" && order.status !== "document_ready") {
      return new Response("Order not paid", { status: 400 });
    }

    // Bucket anlegen, falls nicht vorhanden
    const bucketId = "service-documents";
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.id === bucketId)) {
      await admin.storage.createBucket(bucketId, { public: false });
    }

    // Platzhalter-Inhalt erzeugen (echtes PDF kommt mit docxtemplater/CloudConvert)
    const path = `${order.user_id}/${order.id}.txt`;
    const content =
      `Nebenkostenabrechnung (Entwurf v1)\n` +
      `Order: ${order.id}\n` +
      `Jahr: ${order.fiscal_year}\n\n` +
      JSON.stringify(order.input_snapshot, null, 2);

    const { error: upErr } = await admin.storage
      .from(bucketId)
      .upload(path, new Blob([content], { type: "text/plain" }), { upsert: true });
    if (upErr) {
      await admin
        .from("service_orders")
        .update({ document_error: upErr.message })
        .eq("id", order_id);
      return new Response(upErr.message, { status: 500 });
    }

    await admin
      .from("service_orders")
      .update({
        status: "document_ready",
        document_storage_path: path,
        document_ready_at: new Date().toISOString(),
        document_error: null,
      })
      .eq("id", order_id);

    return new Response(JSON.stringify({ ok: true, path }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(e.message ?? "error", { status: 500 });
  }
});
