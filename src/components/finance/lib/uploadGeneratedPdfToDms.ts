/**
 * uploadGeneratedPdfToDms
 *
 * Lädt ein generiertes PDF in den `building-files` Storage-Bucket und legt
 * einen Eintrag in `building_files` an.
 *
 * - visibility "alle": sichtbar für alle (Verwaltung + Eigentümer/Mieter).
 * - visibility "eigentuemer_only": sichtbar nur für den verlinkten Eigentümer
 *   (über linked_contact_id + ggf. assigned_user_id, RLS sortiert).
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveDmsFolder, type DmsFolderKey } from "./resolveDmsFolder";

export interface DmsUploadParams {
  bytes: Blob | ArrayBuffer | Uint8Array;
  displayName: string;
  buildingId: string;
  periodId?: string | null;
  contactId?: string | null;
  folderKey: DmsFolderKey;
  visibility: "alle" | "eigentuemer_only";
  managementMode: "weg" | "rent";
  fiscalYear?: number | null;
}

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9äöüÄÖÜß_\-. ]+/g, "_").replace(/\s+/g, "_").slice(0, 120);

export async function uploadGeneratedPdfToDms(
  p: DmsUploadParams,
): Promise<{ id: string; path: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet.");

  const blob =
    p.bytes instanceof Blob
      ? p.bytes
      : new Blob([p.bytes as BlobPart], { type: "application/pdf" });

  const id = crypto.randomUUID();
  const path = `${p.buildingId}/abrechnungen/${p.periodId || "general"}/${id}.pdf`;

  // 1) Ordner (Kategorie) auflösen / anlegen
  let categoryId: string | null = null;
  try {
    categoryId = await resolveDmsFolder(p.buildingId, p.folderKey, p.managementMode);
  } catch (e) {
    console.warn("[uploadGeneratedPdfToDms] Ordnerauflösung fehlgeschlagen, lege ohne Kategorie ab:", e);
  }

  // 2) Storage-Upload
  const { error: upErr } = await supabase.storage
    .from("building-files")
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Storage-Upload fehlgeschlagen: ${upErr.message}`);

  // 3) ggf. Eigentümer → Portal-User auflösen
  let assignedUserId: string | null = null;
  if (p.visibility === "eigentuemer_only" && p.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("user_id")
      .eq("id", p.contactId)
      .maybeSingle();
    assignedUserId = (contact as any)?.user_id || null;
  }

  const isOwnerOnly = p.visibility === "eigentuemer_only";

  const { data: inserted, error: insErr } = await supabase
    .from("building_files")
    .insert({
      display_name:
        sanitize(p.displayName) +
        (p.displayName.toLowerCase().endsWith(".pdf") ? "" : ".pdf"),
      file_path: path,
      file_size: blob.size,
      mime_type: "application/pdf",
      building_id: p.buildingId,
      category_id: categoryId,
      linked_billing_period_id: p.periodId || null,
      linked_contact_id: isOwnerOnly ? p.contactId || null : null,
      assigned_user_id: isOwnerOnly ? assignedUserId : null,
      uploaded_by: user.id,
      management_mode: p.managementMode,
      source: "manual",
      visibility_role: isOwnerOnly ? "personen" : "alle",
      visible_to_users: true,
    } as any)
    .select("id")
    .single();
  if (insErr) {
    await supabase.storage.from("building-files").remove([path]).catch(() => {});
    throw new Error(`DMS-Eintrag fehlgeschlagen: ${insErr.message}`);
  }

  return { id: (inserted as any).id, path };
}
