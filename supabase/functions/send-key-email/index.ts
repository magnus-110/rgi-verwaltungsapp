import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { loan_id, event = "issued", test = false, payload_override } = body ?? {};

    const webhookUrl = Deno.env.get("MAKE_KEY_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: "MAKE_KEY_WEBHOOK_URL not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: Record<string, unknown>;

    if (test || payload_override) {
      payload = payload_override ?? {
        event: "test",
        test: true,
        sent_at: new Date().toISOString(),
        loan_id: "00000000-0000-0000-0000-000000000000",
        tag: { number: "TEST-001", label: "Beispielschlüssel", color: "#3b82f6" },
        building: { id: "00000000-0000-0000-0000-000000000000", name: "Musterhaus 1, 87645 Schwangau" },
        borrower: {
          contact_id: null,
          name: "Max Mustermann",
          email: "max@example.com",
          company: "Musterfirma GmbH",
        },
        issued_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        open_return: false,
        notes: "Testausgabe – nur zur Strukturfestlegung",
        signature_data_url: null,
        issued_by: { user_id: null, name: "RGI System" },
      };
    } else {
      if (!loan_id) {
        return new Response(JSON.stringify({ error: "loan_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: loan, error } = await supabase
        .from("key_loans")
        .select("*, key_tags(tag_number, label, color), buildings(id, name), contacts(id, company_name, contact_persons(first_name, last_name, is_primary))")
        .eq("id", loan_id)
        .maybeSingle();

      if (error || !loan) {
        return new Response(JSON.stringify({ error: error?.message || "loan not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const persons = (loan.contacts?.contact_persons ?? []) as any[];
      const primary = persons.find((p) => p.is_primary) ?? persons[0];
      const personName = primary ? [primary.first_name, primary.last_name].filter(Boolean).join(" ") : null;

      payload = {
        event,
        sent_at: new Date().toISOString(),
        loan_id: loan.id,
        tag: {
          number: loan.key_tags?.tag_number,
          label: loan.key_tags?.label,
          color: loan.key_tags?.color,
        },
        building: { id: loan.buildings?.id, name: loan.buildings?.name },
        borrower: {
          contact_id: loan.borrower_contact_id,
          name: loan.borrower_name || personName,
          email: loan.borrower_email,
          company: loan.contacts?.company_name ?? null,
        },
        issued_at: loan.issued_at,
        due_at: loan.due_at,
        open_return: loan.due_at === null,
        returned_at: loan.returned_at,
        notes: loan.notes,
        signature_data_url: loan.signature_data,
        issued_by: { user_id: loan.issued_by_user_id, name: null },
      };

      // Update webhook_sent_at after sending
      await supabase.from("key_loans").update({ webhook_sent_at: new Date().toISOString() }).eq("id", loan_id);
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();

    return new Response(JSON.stringify({ ok: res.ok, status: res.status, response: text, payload }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
