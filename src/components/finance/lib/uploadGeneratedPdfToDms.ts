/**
 * uploadGeneratedPdfToDms
 *
 * Lädt ein generiertes PDF in den `building-files` Storage-Bucket und legt
 * einen Eintrag in `building_files` an. Für pro-Eigentümer-Dokumente werden
 * `linked_contact_id` und `assigned_user_id` gesetzt, sodass via RLS jeder
 * Eigentümer nur seine eigenen Dokumente sieht.
 */
import { supabase } from "@/integrations/supabase/client";

export interface DmsUploadParams {
  bytes: Blob | ArrayBuffer | Uint8Array;
  displayName: string;
  buildingId: string;
  periodId?: string | null;
  contactId?: string | null;
  visibility: "intern" | "alle" | "eigentuemer" | "mieter" | "personen";
  managementMode: "weg" | "rent";
}

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9äöüÄÖÜß_\-. ]+/g, "_").replace(/\s+/g, "_").slice(0, 120);

export async function uploadGeneratedPdfToDms(p: DmsUploadParams): Promise<{ id: string; path: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet.");

  const blob =
    p.bytes instanceof Blob
      ? p.bytes
      : new Blob([p.bytes as BlobPart], { type: "application/pdf" });

  const id = crypto.randomUUID();
  const path = `${p.buildingId}/abrechnungen/${p.periodId || "general"}/${id}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("building-files")
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Storage-Upload fehlgeschlagen: ${upErr.message}`);

  // Falls Eigentümer einen verknüpften Portal-User hat, assigned_user_id setzen.
  let assignedUserId: string | null = null;
  if (p.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("user_id")
      .eq("id", p.contactId)
      .maybeSingle();
    assignedUserId = (contact as any)?.user_id || null;
  }

  const isOwnerDoc = !!p.contactId;

  const { data: inserted, error: insErr } = await supabase
    .from("building_files")
    .insert({
      display_name: sanitize(p.displayName) + (p.displayName.toLowerCase().endsWith(".pdf") ? "" : ".pdf"),
      file_path: path,
      file_size: blob.size,
      mime_type: "application/pdf",
      building_id: p.buildingId,
      linked_billing_period_id: p.periodId || null,
      linked_contact_id: p.contactId || null,
      assigned_user_id: assignedUserId,
      uploaded_by: user.id,
      management_mode: p.managementMode,
      source: "manual",
      visibility_role: p.visibility,
      visible_to_users: isOwnerDoc, // intern für Gesamtdokumente, sichtbar für Eigentümerdokumente
    } as any)
    .select("id")
    .single();
  if (insErr) {
    // Cleanup, damit kein verwaister Storage-Eintrag zurückbleibt
    await supabase.storage.from("building-files").remove([path]).catch(() => {});
    throw new Error(`DMS-Eintrag fehlgeschlagen: ${insErr.message}`);
  }

  return { id: (inserted as any).id, path };
}
