// Loads existing contact data for Step 1 prefill.
// Priority: building-specific overrides > global contact data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const { building_id } = await req.json();
    if (!building_id) return json({ error: "building_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Find assignment + contact
    const { data: assignment } = await admin
      .from("contact_building_assignments")
      .select("*, contacts!inner(*)")
      .eq("building_id", building_id)
      .eq("contacts.user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!assignment) return json({ prefilled: false, data: {} });

    const contactId = (assignment as any).contact_id;
    const contact = (assignment as any).contacts;
    const a = assignment as any;

    // Has any override? -> short-circuit using overrides
    const hasOverrides =
      a.address_street_override ||
      a.address_zip_override ||
      a.address_city_override ||
      a.phones_override ||
      a.emails_override ||
      a.iban_override ||
      a.primary_contact_self !== null ||
      a.expectations_override;

    // Globals as fallback
    const [{ data: phones }, { data: emails }, { data: banks }, { data: persons }] = await Promise.all([
      admin.from("contact_phones").select("phone_number, note").eq("contact_id", contactId),
      admin.from("contact_emails").select("email").eq("contact_id", contactId),
      admin.from("contact_bank_accounts").select("iban, is_default").eq("contact_id", contactId),
      admin.from("contact_persons").select("onboarding_expectations, is_primary").eq("contact_id", contactId),
    ]);

    const defaultBank = banks?.find((b: any) => b.is_default) ?? banks?.[0];
    const primaryPerson = persons?.find((p: any) => p.is_primary) ?? persons?.[0];

    const data = {
      street: a.address_street_override ?? contact?.address_street ?? "",
      zip: a.address_zip_override ?? contact?.address_zip ?? "",
      city: a.address_city_override ?? contact?.address_city ?? "",
      phones:
        a.phones_override ??
        (phones?.map((p: any) => ({ number: p.phone_number, note: p.note ?? "" })) ?? []),
      emails:
        a.emails_override ??
        (emails?.map((e: any) => ({ address: e.email })) ?? []),
      iban: a.iban_override ?? defaultBank?.iban ?? "",
      contact_self: a.primary_contact_self ?? undefined,
      contact_other: a.primary_contact_other ?? undefined,
      expectations: a.expectations_override ?? primaryPerson?.onboarding_expectations ?? "",
    };

    return json({ prefilled: true, hasOverrides: !!hasOverrides, data });
  } catch (e: any) {
    console.error("prefill-onboarding-step1 error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
