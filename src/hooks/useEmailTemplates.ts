import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmailTemplate {
  id: string;
  created_by: string;
  name: string;
  category: string | null;
  subject: string | null;
  body: string;
  is_shared: boolean;
  sort_order: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email_templates"],
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("usage_count", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as EmailTemplate[];
    },
  });
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      tpl: Partial<EmailTemplate> & { name: string; body: string }
    ) => {
      if (tpl.id) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            name: tpl.name,
            category: tpl.category ?? null,
            subject: tpl.subject ?? null,
            body: tpl.body,
            is_shared: tpl.is_shared ?? true,
          })
          .eq("id", tpl.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("email_templates").insert({
          created_by: u.user!.id,
          name: tpl.name,
          category: tpl.category ?? null,
          subject: tpl.subject ?? null,
          body: tpl.body,
          is_shared: tpl.is_shared ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates"] }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates"] }),
  });
}

export async function trackTemplateUsage(id: string, currentCount: number) {
  await supabase
    .from("email_templates")
    .update({ usage_count: currentCount + 1, last_used_at: new Date().toISOString() })
    .eq("id", id);
}
