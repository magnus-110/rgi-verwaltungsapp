import { requireAdmin } from "../_shared/require-admin.ts";
import { ortAus, unterschriftenSeiteAnhaengen } from "../_shared/protokoll-unterschriften.ts";
// etv-finalize-signed-protocol
// Lädt ein bestehendes Protokoll-PDF (oder rendert es neu), stempelt die
// gesammelten Unterschriften (Leiter, Protokollant, Eigentümer) auf eine
// finale Unterschriftenseite und legt das Ergebnis im DMS ab
// (building-files, Kategorie versammlung-protokolle).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(async (req) => {
  if (req.method !== "OPTIONS") {
    const __auth = await requireAdmin(req, corsHeaders);
    if (!__auth.ok) return __auth.response;
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { meeting_id, source_render_id } = await req.json();
    if (!meeting_id) return json({ error: "meeting_id erforderlich" }, 400);

    // Quell-PDF holen
    let pdfPath: string | null = null;
    if (source_render_id) {
      const { data } = await admin.from("etv_protocol_renders").select("storage_path,format").eq("id", source_render_id).maybeSingle();
      if (data?.format === "pdf") pdfPath = data.storage_path;
    }
    if (!pdfPath) {
      // letzten PDF-Render dieser Versammlung verwenden
      const { data } = await admin.from("etv_protocol_renders")
        .select("storage_path,format")
        .eq("meeting_id", meeting_id)
        .eq("format", "pdf")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pdfPath = data?.storage_path || null;
    }
    if (!pdfPath) {
      // Kein PDF vorhanden → automatisch erzeugen (inkl. Unterschriftenseite + DMS-Ablage)
      try {
        const renderResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/etv-render-protocol`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.get("Authorization") ||
              `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ meeting_id, output_format: "pdf", file_to_dms: true }),
        });
        const rendered = await renderResp.json().catch(() => ({}));
        if (!renderResp.ok || rendered?.error) {
          return json({
            error: rendered?.error ||
              "Kein Protokoll-PDF vorhanden und die automatische Erzeugung ist fehlgeschlagen. Bitte zuerst das Protokoll erzeugen.",
          }, 400);
        }
        return json({
          ok: true,
          auto_rendered: true,
          signed_url: rendered.signed_url,
          dms_file_id: rendered.dms_file_id ?? null,
          storage_path: rendered.storage_path,
        });
      } catch (e: any) {
        return json({
          error: `Kein Protokoll-PDF vorhanden und die automatische Erzeugung ist fehlgeschlagen: ${e?.message || e}`,
        }, 400);
      }
    }

    const { data: pdfFile, error: dlErr } = await admin.storage.from("building-files").download(pdfPath);
    if (dlErr || !pdfFile) return json({ error: dlErr?.message || "PDF nicht ladbar" }, 500);

    // Daten
    const { data: meeting } = await admin
      .from("etv_meetings")
      .select("*, buildings(id, name, address, city, management_mode)")
      .eq("id", meeting_id).single();
    const building = meeting?.buildings as any;

    const { data: signatures = [] } = await admin
      .from("etv_protocol_signatures").select("*").eq("meeting_id", meeting_id).order("role");

    // PDF mit Unterschriftenseite versehen
    const finalBytes = await unterschriftenSeiteAnhaengen(await pdfFile.arrayBuffer(), {
      signatures: signatures ?? [],
      titel: meeting?.title || "",
      liegenschaft: building?.name || "",
      datum: meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "",
      ort: ortAus(meeting?.location, building?.city || "Pfronten"),
    });
    const finalName = `Protokoll_signiert_${(meeting?.title || "ETV").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60)}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const finalPath = `_etv-protocol-renders/${meeting_id}/${finalName}`;

    const { error: upErr } = await admin.storage.from("building-files").upload(finalPath, finalBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    // DMS-Ablage in Kategorie versammlung-protokolle
    let dmsFileId: string | null = null;
    try {
      await admin.rpc("ensure_stammakte_categories", { p_building_id: building.id });
      const { data: cat } = await admin
        .from("building_file_categories")
        .select("id")
        .eq("building_id", building.id)
        .eq("slug", "versammlung-protokolle")
        .maybeSingle();

      // Aufrufer für uploaded_by ermitteln (Pflichtfeld)
      let uploadedBy: string | null = meeting?.created_by || null;
      try {
        const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
        if (jwt) {
          const { data: userData } = await admin.auth.getUser(jwt);
          if (userData?.user?.id) uploadedBy = userData.user.id;
        }
      } catch (_) { /* Fallback bleibt meeting.created_by */ }

      const fiscalYear = meeting?.meeting_date ? new Date(meeting.meeting_date).getFullYear() : new Date().getFullYear();
      const dmsPath = `versammlung-protokolle/${building.id}/${meeting_id}/${finalName}`;
      const { error: dmsUpErr } = await admin.storage.from("building-files")
        .upload(dmsPath, finalBytes, { contentType: "application/pdf", upsert: true });
      if (dmsUpErr) throw dmsUpErr;

      const { data: bf, error: bfErr } = await admin.from("building_files").insert({
        building_id: building.id,
        uploaded_by: uploadedBy,
        category_id: cat?.id || null,
        display_name: `Protokoll ${fiscalYear}.pdf`,
        description: `Unterzeichnetes Protokoll der Versammlung "${meeting?.title || ""}" vom ${meeting?.meeting_date ? new Date(meeting.meeting_date).toLocaleDateString("de-DE") : ""}`,
        file_path: dmsPath,
        file_size: finalBytes.length,
        mime_type: "application/pdf",
        fiscal_year: fiscalYear,
        management_mode: building.management_mode || "weg",
        source: "manual",
        rag_enabled: true,
        visibility_role: "alle",
        visible_to_users: true,
        tags: ["protokoll", "etv", "unterschrieben"],
      }).select("id").single();
      if (bfErr) throw bfErr;
      dmsFileId = bf?.id || null;
    } catch (dmsErr) {
      console.error("DMS-Ablage fehlgeschlagen (nicht-fatal):", dmsErr);
    }

    const { data: render } = await admin.from("etv_protocol_renders").insert({
      meeting_id,
      format: "pdf_signed",
      storage_path: finalPath,
      is_signed: true,
      dms_file_id: dmsFileId,
    }).select("id").single();

    const { data: signed } = await admin.storage.from("building-files").createSignedUrl(finalPath, 60 * 60);

    return json({ ok: true, render_id: render?.id, dms_file_id: dmsFileId, signed_url: signed?.signedUrl });
  } catch (e: any) {
    console.error("etv-finalize-signed-protocol error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
