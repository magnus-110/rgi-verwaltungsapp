// Generate a unique, normalized username from name parts.
// Returns suggestion only — does NOT write to the database.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { buildBaseUsername, ensureUniqueUsername, validateUsername } from "../_shared/username.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { first_name, last_name, company_name, preferred } = await req.json().catch(() => ({}));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let base: string;
    if (preferred && typeof preferred === "string") {
      const v = validateUsername(preferred);
      if (!v.ok) return json({ error: v.error }, 400);
      base = preferred.toLowerCase();
    } else {
      base = buildBaseUsername(first_name, last_name, company_name);
      const v = validateUsername(base);
      if (!v.ok) return json({ error: v.error }, 400);
    }

    const username = await ensureUniqueUsername(admin, base);
    return json({ username, base });
  } catch (e: any) {
    console.error("generate-username error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
