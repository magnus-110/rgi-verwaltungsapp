/**
 * Speichern unterschriebener Dokumente + Nachweis + hinterlegte Unterschrift.
 *
 * Grundsatz: Das Original wird nie verändert. Die unterschriebene Fassung
 * ist immer eine neue Datei („…_unterschrieben.pdf“) an derselben Stelle.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SignItem } from "@/lib/pdfSign";

// Neue Tabellen sind (noch) nicht in den generierten Typen enthalten.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SignContext = "email_attachment" | "building_file" | "company_file" | "contract" | "other";

/** Wer gerade angemeldet ist (für Nachweis und Beschreibung). */
export const currentSigner = async (): Promise<{ id: string; name: string }> => {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Nicht angemeldet");
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    profile?.email ||
    user.email ||
    "Unbekannt";
  return { id: user.id, name };
};

/** Kurzbeschreibung der Platzierungen für den Nachweis (ohne Bilddaten). */
const placementSummary = (items: SignItem[]) =>
  items.map((i) => ({
    kind: i.kind,
    page: i.page + 1,
    x: Math.round(i.x),
    y: Math.round(i.y),
    w: Math.round(i.w),
    h: Math.round(i.h),
    ...(i.kind === "text" ? { text: i.text } : {}),
  }));

/** Nachweis schreiben. Ein Fehler hier darf das Speichern nicht scheitern lassen. */
export const logDocumentSignature = async (entry: {
  context: SignContext;
  signer: { id: string; name: string };
  items: SignItem[];
  source?: { bucket?: string | null; path?: string | null; name?: string | null };
  result?: { bucket?: string | null; path?: string | null; name?: string | null; fileId?: string | null };
  emailId?: string | null;
  buildingId?: string | null;
  contractId?: string | null;
}) => {
  try {
    await db.from("document_signature_log").insert({
      signed_by: entry.signer.id,
      signer_name: entry.signer.name,
      context: entry.context,
      source_bucket: entry.source?.bucket ?? null,
      source_path: entry.source?.path ?? null,
      source_name: entry.source?.name ?? null,
      result_bucket: entry.result?.bucket ?? null,
      result_path: entry.result?.path ?? null,
      result_name: entry.result?.name ?? null,
      result_file_id: entry.result?.fileId ?? null,
      email_id: entry.emailId ?? null,
      building_id: entry.buildingId ?? null,
      contract_id: entry.contractId ?? null,
      placements: placementSummary(entry.items),
    });
  } catch (e) {
    console.warn("Unterschrift-Nachweis konnte nicht gespeichert werden", e);
  }
};

const signedDescription = (signerName: string, previous?: string | null) => {
  const stamp = new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  const line = `Unterschrieben in der App von ${signerName} am ${stamp}.`;
  return previous ? `${line}\n${previous}` : line;
};

/**
 * E-Mail-Anhang: unterschriebene Fassung als zusätzlichen Anhang an derselben
 * E-Mail ablegen. So taucht sie direkt neben dem Original auf.
 */
export const saveSignedEmailAttachment = async (params: {
  emailId: string;
  sourcePath: string;
  sourceName: string;
  fileName: string;
  blob: Blob;
  items: SignItem[];
}) => {
  const signer = await currentSigner();
  const path = `${params.emailId}/signed_${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("email-attachments")
    .upload(path, params.blob, { contentType: "application/pdf" });
  if (upErr) throw upErr;

  const { data: row, error: insErr } = await supabase
    .from("email_attachments")
    .insert({
      email_id: params.emailId,
      file_name: params.fileName,
      file_path: path,
      file_size: params.blob.size,
      mime_type: "application/pdf",
      is_inline: false,
    })
    .select("id")
    .single();
  if (insErr) {
    await supabase.storage.from("email-attachments").remove([path]);
    throw insErr;
  }

  await logDocumentSignature({
    context: "email_attachment",
    signer,
    items: params.items,
    source: { bucket: "email-attachments", path: params.sourcePath, name: params.sourceName },
    result: { bucket: "email-attachments", path, name: params.fileName, fileId: row?.id ?? null },
    emailId: params.emailId,
  });

  return { path, attachmentId: row?.id as string | undefined };
};

/** Die Felder eines Dokuments, die für die unterschriebene Kopie übernommen werden. */
export type BuildingFileLike = {
  id: string;
  display_name: string;
  description?: string | null;
  file_path: string;
  category_id: string | null;
  building_id: string | null;
  source?: string | null;
  storage_bucket?: string | null;
  visibility_role?: string | null;
  fiscal_year?: number | null;
  management_mode?: string | null;
  is_company?: boolean | null;
};

/**
 * Dokument eines Objekts oder der RGI-Firmenablage: unterschriebene Fassung
 * als neue Datei im selben Ordner anlegen.
 */
export const saveSignedBuildingFile = async (params: {
  file: BuildingFileLike;
  sourceBucket: string;
  fileName: string;
  blob: Blob;
  items: SignItem[];
  context?: SignContext;
  contractId?: string | null;
}) => {
  const signer = await currentSigner();
  const f = params.file;
  const isCompany = !!f.is_company || (!f.building_id && f.file_path.startsWith("rgi/"));
  const folder = isCompany ? "rgi" : f.building_id || "allgemein";
  const path = `${folder}/${crypto.randomUUID()}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("building-files")
    .upload(path, params.blob, { contentType: "application/pdf" });
  if (upErr) throw upErr;

  const visibility = (f.visibility_role as string) || "intern";
  const { data: inserted, error: insErr } = await db
    .from("building_files")
    .insert({
      display_name: params.fileName,
      description: signedDescription(signer.name),
      file_path: path,
      file_size: params.blob.size,
      mime_type: "application/pdf",
      category_id: f.category_id,
      building_id: isCompany ? null : f.building_id,
      ...(isCompany ? { is_company: true } : {}),
      management_mode: f.management_mode || "weg",
      // Personen-Freigaben werden bewusst nicht übernommen: im Zweifel intern.
      visibility_role: visibility === "personen" ? "intern" : visibility,
      visible_to_users: visibility === "alle",
      fiscal_year: f.fiscal_year ?? null,
      source: "manual",
      uploaded_by: signer.id,
    })
    .select("id")
    .single();
  if (insErr) {
    await supabase.storage.from("building-files").remove([path]);
    throw insErr;
  }

  try {
    await supabase.from("building_file_activity").insert({
      file_id: inserted.id,
      user_id: signer.id,
      action: "uploaded",
      details: { signed_from: f.id } as never,
    });
  } catch {
    /* Verlauf ist nur Zusatz */
  }

  await logDocumentSignature({
    context: params.context ?? (isCompany ? "company_file" : "building_file"),
    signer,
    items: params.items,
    source: { bucket: params.sourceBucket, path: f.file_path, name: f.display_name },
    result: { bucket: "building-files", path, name: params.fileName, fileId: inserted.id },
    buildingId: isCompany ? null : f.building_id,
    contractId: params.contractId ?? null,
  });

  return { path, fileId: inserted.id as string };
};

/* ------------------------------------------------------------------ */
/* Hinterlegte Unterschrift                                            */
/* ------------------------------------------------------------------ */

export const MY_SIGNATURE_KEY = ["my-signature"];

export const useMySignature = () =>
  useQuery({
    queryKey: MY_SIGNATURE_KEY,
    queryFn: async (): Promise<string | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await db
        .from("user_signatures")
        .select("signature_png")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) return null;
      return (data?.signature_png as string) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

export const useSaveMySignature = () => {
  const qc = useQueryClient();
  return async (dataUrl: string | null) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Nicht angemeldet");
    if (dataUrl) {
      const { error } = await db
        .from("user_signatures")
        .upsert({ user_id: auth.user.id, signature_png: dataUrl, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      const { error } = await db.from("user_signatures").delete().eq("user_id", auth.user.id);
      if (error) throw error;
    }
    qc.setQueryData(MY_SIGNATURE_KEY, dataUrl);
  };
};
