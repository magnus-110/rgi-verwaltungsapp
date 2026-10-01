// etv-protocol-sign
// Öffentlicher Endpunkt für „Protokoll per Link unterschreiben“ (ohne Anmeldung).
//
//   { action: "get",  token }                              → Angaben zur Versammlung + Link zum Protokoll-PDF
//   { action: "sign", token, signer_name, signature_png }  → Unterschrift speichern
//
// Sicherheit: Zugriff nur über das zufällige Token einer offenen, nicht abgelaufenen
// Anfrage aus etv_protocol_sign_requests. Die Funktion arbeitet mit der Service-Rolle
// und gibt nur das Nötigste heraus. Sind alle drei Unterschriften da, wird das Protokoll
// automatisch final erstellt und in den Gebäude-Dokumenten abgelegt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLE_LABEL: Record<string, string> = {
  leiter: "Versammlungsleitung",
  protokollant: "Protokollführung",
  eigentuemer: "Wohnungseigentümer/in",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    if (!/^[a-f0-9]{32,128}$/i.test(token)) return json({ error: "Link ungültig" }, 400);

    const { data: request } = await admin
      .from("etv_protocol_sign_requests")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!request || request.status === "zurueckgezogen") return json({ error: "Dieser Link ist ungültig oder wurde zurückgezogen." }, 404);
    if (new Date(request.expires_at) < new Date() && request.status !== "unterschrieben") {
      return json({ error: "Dieser Link ist abgelaufen. Bitte wenden Sie sich an die Verwaltung." }, 410);
    }

    const { data: meeting } = await admin
      .from("etv_meetings")
      .select("id, title, meeting_date, location, buildings(name, address, city)")
      .eq("id", request.meeting_id)
      .single();

    if (body.action === "get") {
      // Protokoll-PDF: letzte Fassung verwenden, sonst einmalig erzeugen
      let pdfPath: string | null = null;
      const { data: render } = await admin
        .from("etv_protocol_renders")
        .select("storage_path")
        .eq("meeting_id", request.meeting_id)
        .eq("format", "pdf")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pdfPath = render?.storage_path || null;
      if (!pdfPath) {
        try {
          const r = await fetch(`${url}/functions/v1/etv-render-protocol`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ meeting_id: request.meeting_id, output_format: "pdf", file_to_dms: false }),
          });
          const out = await r.json().catch(() => ({}));
          pdfPath = out?.storage_path || null;
        } catch (_) { /* ohne PDF weiter – Unterschrift bleibt möglich */ }
      }
      let pdfUrl: string | null = null;
      if (pdfPath) {
        const { data: signed } = await admin.storage.from("building-files").createSignedUrl(pdfPath, 60 * 60);
        pdfUrl = signed?.signedUrl || null;
      }
      const b = (meeting as any)?.buildings;
      return json({
        ok: true,
        status: request.status,
        signer_name: request.signer_name,
        role: request.role,
        role_label: ROLE_LABEL[request.role] || request.role,
        signed_at: request.signed_at,
        meeting: {
          title: meeting?.title || "Eigentümerversammlung",
          meeting_date: meeting?.meeting_date,
          location: meeting?.location,
          building: b ? [b.name, b.city].filter(Boolean).join(", ") : "",
        },
        pdf_url: pdfUrl,
      });
    }

    if (body.action === "sign") {
      if (request.status === "unterschrieben") return json({ error: "Das Protokoll wurde mit diesem Link bereits unterschrieben." }, 409);
      const png = String(body.signature_png || "");
      const name = String(body.signer_name || "").trim().slice(0, 120);
      if (!png.startsWith("data:image/png;base64,") || png.length > 600_000) return json({ error: "Unterschrift fehlt oder ist zu groß." }, 400);
      if (name.length < 2) return json({ error: "Bitte den Namen angeben." }, 400);

      await admin.from("etv_protocol_signatures").delete().eq("meeting_id", request.meeting_id).eq("role", request.role);
      const { error: insErr } = await admin.from("etv_protocol_signatures").insert({
        meeting_id: request.meeting_id,
        role: request.role,
        signer_name: name,
        signer_contact_id: request.signer_contact_id,
        signature_png: png,
        signed_at: new Date().toISOString(),
      });
      if (insErr) throw insErr;

      await admin
        .from("etv_protocol_sign_requests")
        .update({ status: "unterschrieben", signed_at: new Date().toISOString() })
        .eq("id", request.id);

      // Alle drei Unterschriften da? → final erstellen und ablegen
      const { data: sigs } = await admin.from("etv_protocol_signatures").select("role").eq("meeting_id", request.meeting_id);
      const roles = new Set((sigs || []).map((s: any) => s.role));
      let filed = false;
      if (["leiter", "protokollant", "eigentuemer"].every((r) => roles.has(r))) {
        try {
          const r = await fetch(`${url}/functions/v1/etv-finalize-signed-protocol`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ meeting_id: request.meeting_id }),
          });
          const out = await r.json().catch(() => ({}));
          if (r.ok && !out?.error) {
            filed = true;
            await admin.from("etv_meetings").update({ protocol_filed_at: new Date().toISOString() }).eq("id", request.meeting_id);
          }
        } catch (e) {
          console.error("Finale Ablage fehlgeschlagen:", e);
        }
      }
      return json({ ok: true, filed });
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e: any) {
    console.error("etv-protocol-sign", e);
    return json({ error: "Es ist ein Fehler aufgetreten. Bitte später erneut versuchen." }, 500);
  }
});
