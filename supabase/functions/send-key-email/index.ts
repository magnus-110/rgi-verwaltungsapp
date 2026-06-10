import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INLINE_BYTES = 2 * 1024 * 1024; // 2MB für base64-Attachment

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
        tag: {
          number: "TEST-001",
          label: "Haustür",
          color: "#3b82f6",
          notes: "Beispielnotiz",
          photo_url: null,
          photo_base64: null,
          photo_mime: null,
          photo_filename: null,
        },
        building: { id: "00000000-0000-0000-0000-000000000000", name: "Musterhaus 1, 87645 Schwangau" },
        borrower: {
          contact_id: null,
          name: "Max Mustermann",
          email: "max@example.com",
          company: "Musterfirma GmbH",
        },
        issued_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        returned_at: null,
        open_return: false,
        notes: "Testausgabe – nur zur Strukturfestlegung",
        signature_data_url: null,
        issued_by: { user_id: null, name: "RGI System" },
        returned_by: null,
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
        .select(`
          *,
          key_tags!key_loans_tag_id_fkey(tag_number, photo_path, notes, key_type_id, key_types(name, color_hex)),
          buildings(id, name),
          contacts(id, company_name, contact_persons(first_name, last_name, is_primary))
        `)
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

      // Photo: signierte URL + (optional) base64
      let photoUrl: string | null = null;
      let photoBase64: string | null = null;
      let photoMime: string | null = null;
      let photoFilename: string | null = null;
      const photoPath = loan.key_tags?.photo_path as string | null | undefined;
      if (photoPath) {
        const { data: signed } = await supabase.storage
          .from("key-files")
          .createSignedUrl(photoPath, 60 * 60 * 24 * 7); // 7 Tage
        photoUrl = signed?.signedUrl ?? null;
        photoFilename = photoPath.split("/").pop() ?? "photo";
        try {
          const { data: blob } = await supabase.storage.from("key-files").download(photoPath);
          if (blob && blob.size <= MAX_INLINE_BYTES) {
            const buf = new Uint8Array(await blob.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
            photoBase64 = btoa(bin);
            photoMime = (blob as any).type || "image/jpeg";
          }
        } catch (e) {
          console.warn("photo download failed", e);
        }
      }

      const fmtDe = (iso: string | null | undefined) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const parts = new Intl.DateTimeFormat("de-DE", {
          timeZone: "Europe/Berlin",
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: false,
        }).formatToParts(d);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
        return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")} Uhr`;
      };
      const nowIso = new Date().toISOString();

      payload = {
        event,
        sent_at: nowIso,
        sent_at_de: fmtDe(nowIso),
        loan_id: loan.id,
        tag: {
          number: loan.key_tags?.tag_number,
          label: loan.key_tags?.key_types?.name ?? null,
          color: loan.key_tags?.key_types?.color_hex ?? null,
          notes: loan.key_tags?.notes ?? null,
          photo_url: photoUrl,
          photo_base64: photoBase64,
          photo_mime: photoMime,
          photo_filename: photoFilename,
        },
        building: { id: loan.buildings?.id, name: loan.buildings?.name },
        borrower: {
          contact_id: loan.borrower_contact_id,
          name: loan.borrower_name || personName,
          email: loan.borrower_email,
          company: loan.contacts?.company_name ?? null,
        },
        issued_at: loan.issued_at,
        issued_at_de: fmtDe(loan.issued_at),
        due_at: loan.due_at,
        due_at_de: fmtDe(loan.due_at),
        returned_at: loan.returned_at,
        returned_at_de: fmtDe(loan.returned_at),
        open_return: loan.due_at === null,
        notes: loan.notes,
        signature_data_url: loan.signature_data,
        issued_by: { user_id: loan.issued_by_user_id, name: null },
        returned_by: loan.returned_confirmed_by_user_id
          ? { user_id: loan.returned_confirmed_by_user_id, name: "RGI" }
          : null,
      };

      await supabase.from("key_loans").update({ webhook_sent_at: new Date().toISOString() }).eq("id", loan_id);
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();

    return new Response(JSON.stringify({ ok: res.ok, status: res.status, response: text }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-key-email error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
