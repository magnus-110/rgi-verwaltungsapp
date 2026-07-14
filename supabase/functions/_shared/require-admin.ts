// Shared authorization helper for Edge Functions.
// Verifies the caller's JWT and that they hold an admin/employee role.
// Returns { ok:true, userId, role } on success, or { ok:false, response } on failure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

export async function requireAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: Response }
> {
  const deny = (status: number, error: string) => ({
    ok: false as const,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return deny(401, "Unauthorized");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Internal server-to-server calls authenticate with the service-role key
  // (a server-only secret, never exposed to browsers). Treat as authorized.
  const bearer = authHeader.replace("Bearer ", "").trim();
  if (bearer === serviceKey) {
    return { ok: true, userId: "service", role: "service" };
  }

  // User-scoped client to resolve the caller identity from the JWT.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return deny(401, "Unauthorized");
  const userId = userData.user.id;

  // Role lookup via service role (bypasses RLS reliably).
  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = profile?.role ?? "";
  if (role !== "admin" && role !== "employee") return deny(403, "Forbidden");

  return { ok: true, userId, role };
}
