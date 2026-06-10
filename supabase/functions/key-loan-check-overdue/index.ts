// Cron-triggered: findet überfällige Schlüsselleihen und versendet Mahn-Webhook.
// Stabil exakt-einmal pro Loan via overdue_reminder_sent_at.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: loans, error } = await supabase
    .from("key_loans")
    .select("id, due_at, send_overdue_reminder, overdue_reminder_sent_at, status, returned_at")
    .eq("status", "open")
    .eq("send_overdue_reminder", true)
    .is("returned_at", null)
    .is("overdue_reminder_sent_at", null)
    .not("due_at", "is", null)
    .lt("due_at", new Date().toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const loan of loans ?? []) {
    try {
      // Atomically claim: only proceed wenn noch nicht versendet
      const { data: claimed, error: claimErr } = await supabase
        .from("key_loans")
        .update({ overdue_reminder_sent_at: new Date().toISOString() })
        .eq("id", loan.id)
        .is("overdue_reminder_sent_at", null)
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) { results.push({ id: loan.id, skipped: true }); continue; }

      const { error: invErr } = await supabase.functions.invoke("send-key-email", {
        body: { loan_id: loan.id, event: "overdue_reminder" },
      });
      if (invErr) {
        // Claim zurückrollen, damit nächster Lauf es erneut versucht
        await supabase.from("key_loans").update({ overdue_reminder_sent_at: null }).eq("id", loan.id);
        results.push({ id: loan.id, error: invErr.message });
      } else {
        results.push({ id: loan.id, sent: true });
      }
    } catch (e) {
      results.push({ id: loan.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ checked: loans?.length ?? 0, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
