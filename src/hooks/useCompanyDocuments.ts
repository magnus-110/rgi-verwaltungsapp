import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CompanyFile,
  CompanyFolder,
  COMPANY_BUCKET,
  COMPANY_PREFIX,
  companyFileBucket,
} from "@/components/rgi-intern/documents/types";

// Die generierte types.ts kennt `is_company` noch nicht, deshalb ungetypter
// Zugriff mit eigenen Interfaces — wie schon bei den Angeboten und Vertraegen.
const db = supabase as any;

export const COMPANY_FOLDERS_KEY = ["rgi", "company-folders"];
export const COMPANY_FILES_KEY = ["rgi", "company-files"];

/** Ordner der Firmenablage. Legt beim ersten Aufruf die Standardordner an. */
export function useCompanyFolders() {
  return useQuery({
    queryKey: COMPANY_FOLDERS_KEY,
    queryFn: async () => {
      // Idempotent, die Funktion legt nur an, was fehlt. Schlaegt sie fehl,
      // wird trotzdem gelesen — vorhandene Ordner sollen sichtbar bleiben.
      try {
        await db.rpc("ensure_rgi_categories");
      } catch {
        /* still weiter */
      }
      const { data, error } = await db
        .from("building_file_categories")
        .select("id, name, slug, parent_id, sort_order")
        .eq("is_company", true)
        .is("archived_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyFolder[];
    },
  });
}

/** Dateien der Firmenablage, optional auf einen Ordner oder eine Suche begrenzt. */
export function useCompanyFiles(categoryId: string | null, search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: [...COMPANY_FILES_KEY, categoryId, term],
    queryFn: async () => {
      let q = db
        .from("building_files")
        .select(
          "id, display_name, description, file_path, file_size, mime_type, category_id, source, tags, created_at, updated_at, deleted_at",
        );

      if (term) {
        const like = `%${term}%`;
        q = q.or(
          `display_name.ilike.${like},description.ilike.${like},extracted_text.ilike.${like}`,
        );
      }

      q = q
        .eq("is_company", true)
        .eq("is_current_version", true)
        .is("deleted_at", null)
        .is("archived_at", null);

      // Bei aktiver Suche wird ordnerübergreifend gesucht.
      if (!term && categoryId) q = q.eq("category_id", categoryId);

      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyFile[];
    },
  });
}

/** Anzahl Dokumente je Ordner, für die Zähler im Ordnerbaum. */
export function useCompanyFileCounts() {
  return useQuery({
    queryKey: [...COMPANY_FILES_KEY, "counts"],
    queryFn: async () => {
      const { data, error } = await db
        .from("building_files")
        .select("category_id")
        .eq("is_company", true)
        .eq("is_current_version", true)
        .is("deleted_at", null)
        .is("archived_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { category_id: string | null }[]) {
        const key = row.category_id ?? "__none__";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useInvalidateCompanyDocuments() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: COMPANY_FOLDERS_KEY });
    qc.invalidateQueries({ queryKey: COMPANY_FILES_KEY });
  };
}

/** Signierte Adresse zum Öffnen oder Herunterladen einer Firmendatei. */
export async function companyFileUrl(file: {
  file_path: string;
  source?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.storage
    .from(companyFileBucket(file.source))
    .createSignedUrl(file.file_path, 600);
  if (error) throw error;
  return data.signedUrl;
}

function extensionOf(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
}

/** Lädt eine Datei in die Firmenablage hoch und legt den Eintrag an. */
export async function uploadCompanyFile(params: {
  file: File;
  categoryId: string | null;
  description?: string | null;
  displayName?: string;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Nicht angemeldet");

  const path = `${COMPANY_PREFIX}/${crypto.randomUUID()}.${extensionOf(params.file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(COMPANY_BUCKET)
    .upload(path, params.file, { contentType: params.file.type || undefined });
  if (upErr) throw upErr;

  const { error: insErr } = await db.from("building_files").insert({
    display_name: params.displayName?.trim() || params.file.name,
    description: params.description?.trim() || null,
    file_path: path,
    file_size: params.file.size,
    mime_type: params.file.type || null,
    category_id: params.categoryId,
    building_id: null,
    is_company: true,
    management_mode: "weg",
    visibility_role: "intern",
    visible_to_users: false,
    source: "manual",
    uploaded_by: userId,
  });

  if (insErr) {
    // Verwaiste Datei im Speicher wieder entfernen.
    await supabase.storage.from(COMPANY_BUCKET).remove([path]);
    throw insErr;
  }
}

export function useCreateCompanyFolder() {
  const invalidate = useInvalidateCompanyDocuments();
  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: string | null }) => {
      const { error } = await db.from("building_file_categories").insert({
        name: name.trim(),
        parent_id: parentId,
        building_id: null,
        is_company: true,
        management_mode: "weg",
        sort_order: 999,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ordner angelegt");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Anlegen fehlgeschlagen"),
  });
}

export function useRenameCompanyFolder() {
  const invalidate = useInvalidateCompanyDocuments();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db
        .from("building_file_categories")
        .update({ name: name.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ordner umbenannt");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Umbenennen fehlgeschlagen"),
  });
}

/** Löscht einen leeren Ordner. Ordner mit Inhalt bleiben bestehen. */
export function useDeleteCompanyFolder() {
  const invalidate = useInvalidateCompanyDocuments();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: cErr } = await db
        .from("building_files")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id)
        .is("deleted_at", null);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error("Der Ordner enthält noch Dokumente.");
      }
      const { count: childCount, error: chErr } = await db
        .from("building_file_categories")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", id);
      if (chErr) throw chErr;
      if ((childCount ?? 0) > 0) {
        throw new Error("Der Ordner enthält noch Unterordner.");
      }
      const { error } = await db.from("building_file_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ordner gelöscht");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Löschen fehlgeschlagen"),
  });
}

export function useUpdateCompanyFile() {
  const invalidate = useInvalidateCompanyDocuments();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<CompanyFile, "display_name" | "description" | "category_id">>;
    }) => {
      const { error } = await db.from("building_files").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Speichern fehlgeschlagen"),
  });
}

/** Verschiebt Dokumente in den Papierkorb (kein endgültiges Löschen). */
export function useDeleteCompanyFiles() {
  const invalidate = useInvalidateCompanyDocuments();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db
        .from("building_files")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} Dokument(e) gelöscht`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Löschen fehlgeschlagen"),
  });
}
