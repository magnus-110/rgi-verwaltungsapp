import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type RgiClient = Tables["rgi_clients"]["Row"];
export type RgiProject = Tables["rgi_projects"]["Row"];
export type RgiTimeEntry = Tables["rgi_time_entries"]["Row"];
export type RgiInvoice = Tables["rgi_invoices"]["Row"];
export type RgiInvoiceItem = Tables["rgi_invoice_items"]["Row"];
export type RgiTemplate = Tables["rgi_invoice_templates"]["Row"];
export type RgiCompanySettings = Tables["rgi_company_settings"]["Row"];
export type RgiPayment = Tables["rgi_payments"]["Row"];
export type RgiItemPreset = Tables["rgi_item_presets"]["Row"];
export type RgiSparte = Database["public"]["Enums"]["rgi_sparte"];

export type RgiPresetItem = {
  kind: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_net: number;
  vat_rate: number;
};

const K = {
  settings: ["rgi", "settings"] as const,
  clients: ["rgi", "clients"] as const,
  projects: ["rgi", "projects"] as const,
  time: ["rgi", "time"] as const,
  invoices: ["rgi", "invoices"] as const,
  invoiceItems: (id: string) => ["rgi", "invoice-items", id] as const,
  templates: ["rgi", "templates"] as const,
  payments: (id: string) => ["rgi", "payments", id] as const,
};

// ---------- Settings ----------
export function useRgiSettings() {
  return useQuery({
    queryKey: K.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_company_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as RgiCompanySettings | null;
    },
  });
}

export function useUpsertRgiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiCompanySettings> & { id?: string }) => {
      const { data, error } = await supabase.from("rgi_company_settings").upsert(payload as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.settings });
      toast.success("Firmendaten gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Clients ----------
export function useRgiClients() {
  return useQuery({
    queryKey: K.clients,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_clients").select("*").order("name");
      if (error) throw error;
      return data as RgiClient[];
    },
  });
}

export function useUpsertRgiClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiClient> & { id?: string; name: string }) => {
      const { data, error } = await supabase.from("rgi_clients").upsert(payload as any).select().single();
      if (error) throw error;
      return data as RgiClient;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.clients });
      toast.success("Kunde gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRgiClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rgi_clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.clients });
      toast.success("Kunde gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Projects ----------
export function useRgiProjects() {
  return useQuery({
    queryKey: K.projects,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_projects").select("*").order("name");
      if (error) throw error;
      return data as RgiProject[];
    },
  });
}

export function useUpsertRgiProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiProject> & { name: string; client_id: string }) => {
      const { data, error } = await supabase.from("rgi_projects").upsert(payload as any).select().single();
      if (error) throw error;
      return data as RgiProject;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.projects });
      toast.success("Projekt gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRgiProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rgi_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.projects });
      toast.success("Projekt gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Time Entries ----------
export function useRgiTimeEntries(filters?: { projectId?: string; from?: string; to?: string; onlyOpen?: boolean }) {
  return useQuery({
    queryKey: [...K.time, filters],
    queryFn: async () => {
      let q = supabase.from("rgi_time_entries").select("*").order("date", { ascending: false });
      if (filters?.projectId) q = q.eq("project_id", filters.projectId);
      if (filters?.from) q = q.gte("date", filters.from);
      if (filters?.to) q = q.lte("date", filters.to);
      if (filters?.onlyOpen) q = q.is("invoice_item_id", null).eq("billable", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as RgiTimeEntry[];
    },
  });
}

export function useUpsertRgiTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiTimeEntry> & { project_id: string; description: string; minutes: number; user_id: string }) => {
      const { data, error } = await supabase.from("rgi_time_entries").upsert(payload as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.time });
      toast.success("Stunden gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRgiTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rgi_time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.time });
      toast.success("Eintrag gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Templates ----------
export function useRgiTemplates() {
  return useQuery({
    queryKey: K.templates,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_invoice_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as RgiTemplate[];
    },
  });
}

export function useDeleteRgiTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: RgiTemplate) => {
      await supabase.storage.from("rgi-invoice-templates").remove([t.storage_path]);
      const { error } = await supabase.from("rgi_invoice_templates").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.templates });
      toast.success("Vorlage gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Invoices ----------
export function useRgiInvoices() {
  return useQuery({
    queryKey: K.invoices,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_invoices").select("*").order("issue_date", { ascending: false });
      if (error) throw error;
      return data as RgiInvoice[];
    },
  });
}

export function useRgiInvoice(id: string | null) {
  return useQuery({
    queryKey: ["rgi", "invoice", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_invoices").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as RgiInvoice;
    },
  });
}

export function useRgiInvoiceItems(invoiceId: string | null) {
  return useQuery({
    queryKey: invoiceId ? K.invoiceItems(invoiceId) : ["rgi", "invoice-items", "none"],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_invoice_items").select("*").eq("invoice_id", invoiceId!).order("position");
      if (error) throw error;
      return data as RgiInvoiceItem[];
    },
  });
}

export function useRgiPayments(invoiceId: string | null) {
  return useQuery({
    queryKey: invoiceId ? K.payments(invoiceId) : ["rgi", "payments", "none"],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_payments").select("*").eq("invoice_id", invoiceId!).order("paid_on");
      if (error) throw error;
      return data as RgiPayment[];
    },
  });
}

/**
 * Der Zahlungsposten, der beim Objekt aus dieser Rechnung entstanden
 * ist. Damit man in RGI Intern sieht, ob sie im Überweisungslauf der
 * WEG schon erledigt wurde — ohne den Bereich zu wechseln.
 */
export function useLinkedPayment(invoiceId: string | null) {
  return useQuery({
    queryKey: invoiceId ? ["rgi", "linked-payment", invoiceId] : ["rgi", "linked-payment", "none"],
    enabled: !!invoiceId,
    queryFn: async () => {
      // `as any`: rgi_invoice_id kam mit der Migration dazu, die
      // generierten Supabase-Typen kennen die Spalte noch nicht.
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, status, paid_at, due_date, building_id, buildings(name)")
        .eq("rgi_invoice_id", invoiceId!)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
}

export function useCreateRgiInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiInvoice> & { client_id: string }) => {
      const { data, error } = await supabase.from("rgi_invoices").insert(payload as any).select().single();
      if (error) throw error;
      return data as RgiInvoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.invoices }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateRgiInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RgiInvoice> }) => {
      const { data, error } = await supabase.from("rgi_invoices").update(patch as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: K.invoices });
      qc.invalidateQueries({ queryKey: ["rgi", "invoice", v.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpsertRgiInvoiceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, items }: { invoiceId: string; items: Partial<RgiInvoiceItem>[] }) => {
      // Replace all items
      await supabase.from("rgi_invoice_items").delete().eq("invoice_id", invoiceId);
      if (items.length > 0) {
        const rows = items.map((it, idx) => ({
          ...it,
          invoice_id: invoiceId,
          position: idx + 1,
        }));
        const { error } = await supabase.from("rgi_invoice_items").insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: K.invoiceItems(v.invoiceId) });
      qc.invalidateQueries({ queryKey: ["rgi", "invoice", v.invoiceId] });
      qc.invalidateQueries({ queryKey: K.invoices });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddRgiPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { invoice_id: string; amount: number; paid_on: string; note?: string }) => {
      const { error } = await supabase.from("rgi_payments").insert(payload as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: K.payments(v.invoice_id) });
      qc.invalidateQueries({ queryKey: K.invoices });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export async function rgiNextInvoiceNumber(sparte?: RgiSparte) {
  const { data, error } = await supabase.rpc("rgi_next_invoice_number", { p_sparte: sparte ?? undefined } as any);
  if (error) throw error;
  return data as string;
}

export async function rgiRenderInvoice(invoiceId: string, formats?: ("docx" | "pdf")[]) {
  const { data, error } = await supabase.functions.invoke("rgi-render-invoice", {
    body: { invoice_id: invoiceId, ...(formats ? { formats } : {}) },
  });
  if (error) throw error;
  return data as {
    docx_path: string;
    pdf_path?: string | null;
    pdf_error?: string | null;
    /** "created" | "updated" | "skipped" — Posten in der Zahlungsliste des Objekts. */
    payment?: string | null;
    payment_error?: string | null;
  };
}

export async function rgiSignedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- Item Presets (Inhalts-Vorlagen) ----------
const KP = ["rgi", "item-presets"] as const;

export function useRgiItemPresets() {
  return useQuery({
    queryKey: KP,
    queryFn: async () => {
      const { data, error } = await supabase.from("rgi_item_presets").select("*").order("name");
      if (error) throw error;
      return data as RgiItemPreset[];
    },
  });
}

export function useUpsertRgiItemPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<RgiItemPreset> & { name: string; items: RgiPresetItem[] }) => {
      const { data, error } = await supabase.from("rgi_item_presets").upsert(payload as any).select().single();
      if (error) throw error;
      return data as RgiItemPreset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KP });
      toast.success("Rechnungsvorlage gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRgiItemPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rgi_item_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KP });
      toast.success("Vorlage gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

