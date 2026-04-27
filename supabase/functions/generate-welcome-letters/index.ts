// Generate personalised welcome-letter DOCX files (one per owner) including
// login credentials (username + initial password) and the management start date.
// Bundles all letters as a ZIP and files them into the building's DMS.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "npm:pizzip@3.1.7";
import Docxtemplater from "npm:docxtemplater@3.50.0";
import { loadRecipients } from "../_shared/comm-vars.ts";
import {
  buildBaseUsername,
  ensureUniqueUsername,
  pseudoEmail,
} from "../_shared/username.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_LOGIN_URL = "https://rgi-immobilien.app/login";
const monthsDe = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
];

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function generateNumericPassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

function formatDateLong(d: Date): string {
  return `${d.getDate()}. ${monthsDe[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function renderDocx(tplBuf: Uint8Array, data: Record<string, unknown>): Uint8Array {
  const zip = new PizZip(tplBuf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  doc.render(data);
  return doc.getZip().generate({ type: "uint8array" });
}

/**
 * Merge multiple rendered DOCX buffers into ONE document.
 * Strategy: keep the first doc as base (preserves styles, header/footer,
 * relationships, media). Append the body content of each subsequent doc
 * before the closing <w:sectPr>, separated by a hard page break.
 *
 * Works because every letter is rendered from the SAME template,
 * so all rId references (logos, fonts) resolve identically.
 */
function mergeDocxBodies(docs: Uint8Array[]): Uint8Array {
  if (docs.length === 1) return docs[0];

  const baseZip = new PizZip(docs[0]);
  const docXmlFile = baseZip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Basis-Dokument enthält keine document.xml");
  let baseXml = docXmlFile.asText();

  // Find insertion point: just before the final <w:sectPr> (page setup),
  // falling back to just before </w:body>.
  const sectPrMatch = baseXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  const insertionPoint = sectPrMatch
    ? baseXml.lastIndexOf(sectPrMatch[0])
    : baseXml.lastIndexOf("</w:body>");
  if (insertionPoint < 0) throw new Error("Konnte Body des Basis-Dokuments nicht parsen");

  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const additions: string[] = [];

  for (let i = 1; i < docs.length; i++) {
    const xml = new PizZip(docs[i]).file("word/document.xml")!.asText();
    // Extract everything between <w:body ...> and </w:body>, then strip a
    // trailing <w:sectPr>...</w:sectPr> if present (we only keep the base's).
    const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/);
    if (!bodyMatch) continue;
    const bodyInner = bodyMatch[1].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, "");
    additions.push(pageBreak + bodyInner);
  }

  baseXml =
    baseXml.slice(0, insertionPoint) +
    additions.join("") +
    baseXml.slice(insertionPoint);

  baseZip.file("word/document.xml", baseXml);
  return baseZip.generate({ type: "uint8array" });
}

type Mode = "weg" | "rent";

interface Credentials {
  username: string;
  password: string; // "(bereits vergeben)" if not freshly created
  created: boolean;
}

/** Ensure there is an auth account for the contact and return login credentials. */
async function ensureContactAccount(
  admin: SupabaseClient,
  contactId: string,
  buildingId: string,
  mode: Mode,
): Promise<Credentials | null> {
  // Load contact
  const { data: contact } = await admin
    .from("contacts")
    .select("id, user_id, first_name, last_name, company_name")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return null;

  // Already linked? -> reset password so it can be printed in the letter.
  if (contact.user_id) {
    const { data: prof } = await admin
      .from("profiles")
      .select("username, email, auth_pseudo_email, first_name, last_name")
      .eq("user_id", contact.user_id)
      .maybeSingle();

    let username = prof?.username || null;
    // If the existing profile has no username yet, generate one and persist it.
    if (!username) {
      const base = buildBaseUsername(
        prof?.first_name || contact.first_name,
        prof?.last_name || contact.last_name,
        contact.company_name,
      );
      username = await ensureUniqueUsername(admin, base);
      await admin.from("profiles").update({ username }).eq("user_id", contact.user_id);
    }

    const newPassword = generateNumericPassword(8);
    const { error: pwErr } = await admin.auth.admin.updateUserById(contact.user_id, {
      password: newPassword,
    });
    if (pwErr) {
      console.error("password reset failed for existing user", contact.user_id, pwErr);
      return { username, password: "(bereits vergeben)", created: false };
    }
    await admin.from("profiles").update({
      force_password_change: true,
      must_change_password: true,
      initial_password_set_at: new Date().toISOString(),
    }).eq("user_id", contact.user_id);

    return { username, password: newPassword, created: false };
  }

  // Build a unique username
  const base = buildBaseUsername(contact.first_name, contact.last_name, contact.company_name);
  const username = await ensureUniqueUsername(admin, base);

  // Prefer real email if available (primary contact_emails)
  const { data: emails } = await admin
    .from("contact_emails")
    .select("email, is_primary")
    .eq("contact_id", contactId)
    .order("is_primary", { ascending: false });
  const realEmail = emails && emails.length > 0 ? emails[0].email : null;
  const authEmail = realEmail || pseudoEmail(username);
  const password = generateNumericPassword(8);
  const role = mode === "weg" ? "weg_owner" : "tenant";

  // Try to create auth user; if email already exists, fall back to existing user
  let authUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: contact.first_name,
      last_name: contact.last_name,
    },
  });

  if (createErr) {
    // Email collision → reuse existing auth user (and update password)
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = (list?.users as any[] | undefined)?.find(
      (u: any) => u.email?.toLowerCase() === authEmail.toLowerCase(),
    );
    if (!existing) {
      console.error("createUser failed and no existing user", createErr);
      return null;
    }
    authUserId = existing.id;
    await admin.auth.admin.updateUserById(authUserId, { password });
  } else {
    authUserId = created.user!.id;
  }

  // Profile upsert
  await admin.from("profiles").upsert(
    {
      user_id: authUserId,
      email: realEmail || null,
      auth_pseudo_email: realEmail ? null : authEmail,
      username,
      first_name: contact.first_name,
      last_name: contact.last_name,
      role,
      building_id: mode === "rent" ? buildingId : null,
      force_password_change: true,
      must_change_password: true,
      initial_password_set_at: new Date().toISOString(),
      terms_accepted_at: null,
    } as any,
    { onConflict: "user_id" },
  );

  // Link contact -> auth user
  await admin.from("contacts").update({ user_id: authUserId }).eq("id", contactId);

  // Building link
  if (mode === "weg") {
    await admin.from("weg_owner_buildings").upsert(
      { user_id: authUserId, building_id: buildingId } as any,
      { onConflict: "user_id,building_id" },
    );
  } else {
    await admin.from("tenants").upsert(
      {
        user_id: authUserId,
        building_id: buildingId,
        email: realEmail || authEmail,
        first_name: contact.first_name,
        last_name: contact.last_name,
      } as any,
      { onConflict: "user_id,building_id" },
    );
  }

  return { username, password, created: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Server-Konfiguration unvollständig." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: hasAccess } = await admin.rpc("user_has_admin_access", {
      user_id: userRes.user.id,
    });
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    const { building_id, template_id, management_start_date } = await req.json();
    if (!building_id) return json({ error: "building_id required" }, 400);

    // Resolve management start date: prefer payload, persist on building, else use stored value
    let mgmtDate: Date | null = null;
    if (management_start_date) {
      const d = new Date(management_start_date);
      if (!isNaN(d.getTime())) {
        mgmtDate = d;
        // Persist on building (store as YYYY-MM-DD)
        const iso = d.toISOString().slice(0, 10);
        await admin.from("buildings").update({ management_start_date: iso } as any).eq("id", building_id);
      }
    }
    if (!mgmtDate) {
      const { data: bDate } = await admin
        .from("buildings").select("management_start_date").eq("id", building_id).maybeSingle();
      if ((bDate as any)?.management_start_date) {
        const d = new Date((bDate as any).management_start_date);
        if (!isNaN(d.getTime())) mgmtDate = d;
      }
    }
    const verwaltungsbeginn = mgmtDate ? formatDateLong(mgmtDate) : "";
    const verwaltungsbeginnKurz = mgmtDate ? formatDateShort(mgmtDate) : "";

    // Resolve template
    let docxPath: string | null = null;
    if (template_id) {
      const { data: t } = await admin
        .from("comm_templates").select("docx_path").eq("id", template_id).maybeSingle();
      docxPath = t?.docx_path ?? null;
    } else {
      const { data: b } = await admin
        .from("buildings").select("welcome_letter_template_id").eq("id", building_id).maybeSingle();
      if (b?.welcome_letter_template_id) {
        const { data: t } = await admin
          .from("comm_templates").select("docx_path")
          .eq("id", b.welcome_letter_template_id).maybeSingle();
        docxPath = t?.docx_path ?? null;
      }
    }
    if (!docxPath) return json({ error: "Keine Begrüßungsbrief-Vorlage hinterlegt." }, 400);

    const { data: tplFile, error: dlErr } = await admin.storage
      .from("comm-assets").download(docxPath);
    if (dlErr || !tplFile) {
      return json({ error: dlErr?.message || "Vorlage konnte nicht geladen werden" }, 500);
    }
    const tplBuf = new Uint8Array(await tplFile.arrayBuffer());

    // Building mode
    const { data: bRow } = await admin
      .from("buildings").select("management_mode").eq("id", building_id).maybeSingle();
    const mode: Mode = (bRow?.management_mode === "rent" ? "rent" : "weg");

    // Owners
    const recipients = await loadRecipients(admin, building_id, { roles: ["eigentuemer"] });
    if (recipients.length === 0) return json({ error: "Keine Eigentümer gefunden." }, 400);

    const bundle = new PizZip();
    let okCount = 0;
    let failCount = 0;
    let createdAccounts = 0;
    const errors: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      try {
        const creds = await ensureContactAccount(admin, r.contact_id, building_id, mode);
        if (creds?.created) createdAccounts++;

        const outBuf = renderDocx(tplBuf, {
          ...r.vars,
          benutzername: creds?.username || "",
          passwort: creds?.password || "",
          login_url: APP_LOGIN_URL,
          verwaltungsbeginn,
          verwaltungsbeginn_kurz: verwaltungsbeginnKurz,
        });
        const baseName = sanitize(r.display_name) || `eigentuemer_${i + 1}`;
        const fileName = `${String(i + 1).padStart(3, "0")}_${baseName}.docx`;
        bundle.file(fileName, outBuf);
        okCount++;
      } catch (e: any) {
        failCount++;
        console.error("welcome-letter recipient failed", {
          recipient: r.display_name,
          contact_id: r.contact_id,
          message: e?.message || String(e),
          properties: e?.properties,
        });
        errors.push(`${r.display_name}: ${e?.message || String(e)}`);
      }
    }

    if (okCount === 0) {
      return json({ error: "Kein Brief konnte erstellt werden", details: errors }, 500);
    }

    const zipBytes = bundle.generate({ type: "uint8array" });
    const dateSlug = new Date().toISOString().slice(0, 10);
    const zipFileName = `Begruessungsbriefe_${dateSlug}.zip`;
    const zipPath = `welcome-letters/${building_id}/${Date.now()}_${zipFileName}`;

    const { error: upErr } = await admin.storage
      .from("comm-assets")
      .upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    // DMS filing
    let dmsFileId: string | null = null;
    try {
      let { data: cat } = await admin
        .from("building_file_categories")
        .select("id")
        .eq("slug", "begruessungsbriefe")
        .or(`building_id.eq.${building_id},building_id.is.null`)
        .order("building_id", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();

      if (!cat) {
        const { data: createdCat } = await admin
          .from("building_file_categories")
          .insert({
            name: "Begrüßungsbriefe",
            slug: "begruessungsbriefe",
            building_id,
            management_mode: mode,
            icon: "mail",
            color: "#10B981",
            sort_order: 65,
            auto_rag_enabled: false,
          })
          .select("id").single();
        cat = createdCat;
      }

      const dmsPath = `welcome-letters/${building_id}/${Date.now()}_${zipFileName}`;
      await admin.storage.from("building-files")
        .upload(dmsPath, zipBytes, { contentType: "application/zip", upsert: true });

      const { data: bf } = await admin.from("building_files").insert({
        building_id,
        category_id: cat?.id || null,
        display_name: zipFileName,
        description: `Begrüßungsbriefe für ${okCount} Eigentümer mit Login-Daten. ${createdAccounts} neue Accounts erstellt.`,
        file_path: dmsPath,
        file_size: zipBytes.length,
        mime_type: "application/zip",
        management_mode: mode,
        source: "manual",
        uploaded_by: userRes.user.id,
        rag_enabled: false,
        visibility_role: "intern",
        visible_to_users: false,
        tags: ["begruessungsbrief", "onboarding"],
      }).select("id").single();
      dmsFileId = bf?.id ?? null;
    } catch (filingError) {
      console.error("DMS auto-filing error (non-fatal):", filingError);
    }

    return json({
      success: true,
      ok: okCount,
      failed: failCount,
      created_accounts: createdAccounts,
      errors,
      zip_path: zipPath,
      dms_file_id: dmsFileId,
      login_url: APP_LOGIN_URL,
    });
  } catch (e: any) {
    console.error("generate-welcome-letters error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
