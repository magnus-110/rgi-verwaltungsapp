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
  accountHinweis: string; // Hint text shown only for existing accounts
}

const EXISTING_ACCOUNT_HINT =
  "Ihr Zugang besteht bereits — melden Sie sich mit Ihrem bisherigen Passwort an oder nutzen Sie „Passwort vergessen“.";

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

  // Already linked? -> Reset password ONLY if user has never logged in yet.
  // The letter is the official delivery channel for initial credentials, so as
  // long as the recipient hasn't logged in, we can safely (re)issue a new one.
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

    // Rolle anhand ALLER Building-Assignments dieses Kontakts ableiten:
    // Wer irgendwo Eigentümer/Beirat ist -> weg_owner, sonst tenant.
    const { data: allAssignments } = await admin
      .from("contact_building_assignments")
      .select("role_in_building")
      .eq("contact_id", contactId);
    const isOwnerSomewhere = (allAssignments ?? []).some(
      (a: any) => a.role_in_building === "eigentuemer" || a.role_in_building === "beirat",
    );
    const effectiveRole = isOwnerSomewhere ? "weg_owner" : (mode === "weg" ? "weg_owner" : "tenant");

    // Profil-Rolle ggf. nachziehen (falls Account z.B. zuerst als tenant angelegt war)
    await admin.from("profiles").update({
      role: effectiveRole,
      ...(mode === "rent" ? { building_id: buildingId } : {}),
    } as any).eq("user_id", contact.user_id);

    // Building-Verknüpfung sicherstellen
    if (mode === "weg") {
      await admin.from("weg_owner_buildings").upsert(
        { user_id: contact.user_id, building_id: buildingId } as any,
        { onConflict: "user_id,building_id" },
      );
    } else {
      await admin.from("tenants").upsert(
        {
          user_id: contact.user_id,
          building_id: buildingId,
          email: prof?.email || prof?.auth_pseudo_email || null,
          first_name: contact.first_name,
          last_name: contact.last_name,
        } as any,
        { onConflict: "user_id,building_id" },
      );
    }

    // Check if user has ever logged in
    const { data: authUserRes } = await admin.auth.admin.getUserById(contact.user_id);
    const lastSignIn = authUserRes?.user?.last_sign_in_at || null;

    if (!lastSignIn) {
      // Noch nie eingeloggt -> Initial-Passwort neu setzen und im Brief abdrucken
      const password = generateNumericPassword(8);
      const { error: updErr } = await admin.auth.admin.updateUserById(contact.user_id, { password });
      if (updErr) {
        console.error("updateUserById (existing, never logged in) failed", updErr);
        // Fallback: bisheriges Verhalten
        return {
          username,
          password: "(bereits vergeben)",
          created: false,
          accountHinweis: EXISTING_ACCOUNT_HINT,
        };
      }
      await admin
        .from("profiles")
        .update({
          force_password_change: true,
          must_change_password: true,
          initial_password_set_at: new Date().toISOString(),
          terms_accepted_at: null,
        } as any)
        .eq("user_id", contact.user_id);
      return { username, password, created: true, accountHinweis: "" };
    }

    // Bereits eingeloggt -> Passwort NICHT überschreiben
    return {
      username,
      password: "(bereits vergeben)",
      created: false,
      accountHinweis: EXISTING_ACCOUNT_HINT,
    };
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
  // Rolle aus allen Building-Assignments ableiten (nicht stur aus aktuellem Mode)
  const { data: allAssignmentsNew } = await admin
    .from("contact_building_assignments")
    .select("role_in_building")
    .eq("contact_id", contactId);
  const isOwnerSomewhereNew = (allAssignmentsNew ?? []).some(
    (a: any) => a.role_in_building === "eigentuemer" || a.role_in_building === "beirat",
  );
  const role = isOwnerSomewhereNew ? "weg_owner" : (mode === "weg" ? "weg_owner" : "tenant");

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

  return { username, password, created: true, accountHinweis: "" };
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
      // Accept "YYYY-MM-DD" or ISO; parse as LOCAL date to avoid UTC day-shift
      const ymd = String(management_start_date).slice(0, 10);
      const [y, m, d] = ymd.split("-").map(Number);
      if (y && m && d) {
        mgmtDate = new Date(y, m - 1, d);
        await admin.from("buildings").update({ management_start_date: ymd } as any).eq("id", building_id);
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

    // Group recipients by (contact_id + normalized postal address):
    // → one letter per person per distinct postal address.
    // Multiple units at the same address are merged into a single letter.
    const normalizeAddr = (vars: Record<string, string>) => {
      const norm = (s: string) =>
        (s || "")
          .toLowerCase()
          .replace(/ß/g, "ss")
          .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
          .replace(/[^a-z0-9]+/g, "")
          .trim();
      return [norm(vars.strasse), norm(vars.plz), norm(vars.ort)].join("|");
    };

    type Group = { lead: typeof recipients[number]; units: string[] };
    const groups = new Map<string, Group>();
    for (const r of recipients) {
      const key = `${r.contact_id}|${normalizeAddr(r.vars)}`;
      const existing = groups.get(key);
      if (existing) {
        if (r.vars.einheit) existing.units.push(r.vars.einheit);
      } else {
        groups.set(key, {
          lead: r,
          units: r.vars.einheit ? [r.vars.einheit] : [],
        });
      }
    }

    // Per-contact credentials cache: ensures we generate the password ONCE
    // per person, even if they appear in multiple groups (different addresses).
    const credCache = new Map<string, Credentials>();

    const renderedDocs: Uint8Array[] = [];
    let okCount = 0;
    let failCount = 0;
    let createdAccounts = 0;
    let passwordsGenerated = 0;
    const errors: string[] = [];

    for (const g of groups.values()) {
      const r = g.lead;
      try {
        let creds = credCache.get(r.contact_id);
        if (!creds) {
          const fresh = await ensureContactAccount(admin, r.contact_id, building_id, mode);
          if (!fresh) throw new Error("Konto konnte nicht eingerichtet werden");
          creds = fresh;
          credCache.set(r.contact_id, fresh);
          if (fresh.created) {
            createdAccounts++;
            passwordsGenerated++;
          }
        }

        // Deduplicate + sort unit list for the letter
        const uniqueUnits = Array.from(new Set(g.units.filter(Boolean))).sort();
        const einheitenListe = uniqueUnits.join(", ");

        const outBuf = renderDocx(tplBuf, {
          ...r.vars,
          // Override single "einheit" with the joined list when there are multiple,
          // so existing templates using {{einheit}} display all units.
          einheit: uniqueUnits.length > 1 ? einheitenListe : (r.vars.einheit || ""),
          einheiten_liste: einheitenListe,
          einheiten_anzahl: String(uniqueUnits.length),
          benutzername: creds.username || "",
          passwort: creds.password || "",
          account_hinweis: creds.accountHinweis || "",
          login_url: APP_LOGIN_URL,
          verwaltungsbeginn,
          verwaltungsbeginn_kurz: verwaltungsbeginnKurz,
        });
        renderedDocs.push(outBuf);
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

    console.log("welcome-letters summary", {
      recipient_rows: recipients.length,
      groups: groups.size,
      contacts_processed: credCache.size,
      letters_rendered: okCount,
      passwords_generated: passwordsGenerated,
    });

    if (okCount === 0) {
      return json({ error: "Kein Brief konnte erstellt werden", details: errors }, 500);
    }

    // Merge all letters into ONE docx with page breaks between them
    const combinedBytes = mergeDocxBodies(renderedDocs);
    const dateSlug = new Date().toISOString().slice(0, 10);
    const docxFileName = `Begruessungsbriefe_${dateSlug}.docx`;
    const docxPathOut = `welcome-letters/${building_id}/${Date.now()}_${docxFileName}`;
    const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const { error: upErr } = await admin.storage
      .from("comm-assets")
      .upload(docxPathOut, combinedBytes, { contentType: DOCX_MIME, upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    // DMS filing
    let dmsFileId: string | null = null;
    try {
      // Ensure DMS soll-structure exists, then look up "Schriftverkehr / Begrüßungsbriefe" by slug
      await admin.rpc("ensure_stammakte_categories", { p_building_id: building_id });
      const { data: cat } = await admin
        .from("building_file_categories")
        .select("id")
        .eq("building_id", building_id)
        .eq("slug", "schriftverkehr-begruessungsbriefe")
        .maybeSingle();

      const dmsPath = `welcome-letters/${building_id}/${Date.now()}_${docxFileName}`;
      await admin.storage.from("building-files")
        .upload(dmsPath, combinedBytes, { contentType: DOCX_MIME, upsert: true });

      const { data: bf } = await admin.from("building_files").insert({
        building_id,
        category_id: cat?.id || null,
        display_name: docxFileName,
        description: `Begrüßungsbriefe (Sammeldokument) für ${okCount} Eigentümer mit Login-Daten. ${createdAccounts} neue Accounts erstellt.`,
        file_path: dmsPath,
        file_size: combinedBytes.length,
        mime_type: DOCX_MIME,
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
      contacts_processed: credCache.size,
      letters_rendered: okCount,
      passwords_generated: passwordsGenerated,
      recipient_rows: recipients.length,
      errors,
      docx_path: docxPathOut,
      zip_path: docxPathOut, // backwards-compat alias
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
