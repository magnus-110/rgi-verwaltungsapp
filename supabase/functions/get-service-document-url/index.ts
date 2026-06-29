import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return j({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claimsData?.claims) return j({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { order_id, index } = await req.json();
    if (!order_id) return j({ error: "Missing order_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: order } = await admin
      .from("service_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();

    if (!order || order.user_id !== userId) return j({ error: "Not found" }, 404);
    let pathToSign: string | null = order.document_storage_path;
    if (index != null && Array.isArray(order.document_paths)) {
      const found = order.document_paths.find((d: any) => d.index === Number(index));
      if (found?.path) pathToSign = found.path;
    }

    if (order.status !== "document_ready" || !pathToSign) {
      return j({ error: "Document not ready" }, 409);
    }

    const { data: signed, error } = await admin.storage
      .from("service-documents")
      .createSignedUrl(pathToSign, 300);
    if (error) return j({ error: error.message }, 500);

    return j({ url: signed.signedUrl });
  } catch (e: any) {
    return j({ error: e.message ?? "Server error" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
