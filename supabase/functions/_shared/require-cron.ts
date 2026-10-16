// Für Zeitpläne (pg_cron) und Server-Aufrufe: akzeptiert
//  - den Service-Role-Schlüssel (Aufrufe zwischen Funktionen),
//  - den Zeitplan-Schlüssel aus dem Tresor im Header "x-cron-secret",
//  - sonst angemeldete Büro-Mitarbeiter (wie requireAdmin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireAdmin } from "./require-admin.ts";

export async function requireStaffOrCron(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: Response }
> {
  const token = req.headers.get("x-cron-secret");
  if (token) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin.rpc("fints_cron_token_pruefen", { p_token: token });
    if (data === true) return { ok: true, userId: "cron", role: "cron" };
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return requireAdmin(req, corsHeaders);
}
