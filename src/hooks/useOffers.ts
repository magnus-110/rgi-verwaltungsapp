import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Wie in useManagementContracts: die generierte types.ts im Repo ist
// veraltet, deshalb ungetypter Zugriff mit eigenen Interfaces.
const db = supabase as any;

export type OfferStatus = "inquiry" | "drafted" | "sent" | "won" | "lost" | "withdrawn";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  inquiry: "Anfrage",
  drafted: "Entwurf",
  sent: "Versendet",
  won: "Gewonnen",
  lost: "Verloren",
  withdrawn: "Zurückgezogen",
};

export interface OfferItem {
  id?: string;
  offer_id?: string;
  position: number;
  fee_type: string | null;
  label: string;
  basis: string;
  amount: number | null;
  percent: number | null;
  quantity: number | null;
  is_gross: boolean;
  vat_rate: number;
  is_included: boolean;
  threshold?: number | null;
  min_amount?: number | null;
  max_count?: number | null;
  debtor?: string | null;
  halved_if_supervised?: boolean | null;
  tier_from?: number | null;
  tier_to?: number | null;
  note: string | null;
}

export interface Offer {
  id: string;
  offer_no: string | null;
  status: OfferStatus;
  prospect_name: string;
  prospect_contact_id: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  object_address: string | null;
  object_zip: string | null;
  object_city: string | null;
  object_representative: string | null;
  land_register_ref: string | null;
  management_mode: "weg" | "rent";
  units_apartment: number | null;
  units_commercial: number | null;
  units_parking: number | null;
  units_other: number | null;
  desired_start: string | null;
  previous_manager: string | null;
  inquiry_source: string | null;
  inquiry_date: string | null;
  rate_apartment: number | null;
  rate_commercial: number | null;
  rate_parking: number | null;
  rate_other: number | null;
  monthly_net: number | null;
  answers: Record<string, any>;
  contract_defaults: Record<string, any>;
  template_id: string | null;
  docx_storage_path: string | null;
  pdf_storage_path: string | null;
  sent_on: string | null;
  follow_up_on: string | null;
  decided_on: string | null;
  lost_reason: string | null;
  won_contract_id: string | null;
  notes: string | null;
  created_at: string;
  items?: OfferItem[];
}

export interface OfferQuestion {
  id: string;
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "choice";
  options: any;
  help_text: string | null;
  position: number;
  is_active: boolean;
}

export function useOffers() {
  return useQuery({
    queryKey: ["rgi", "offers"],
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await db
        .from("offers")
        .select("*, items:offer_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Offer[];
      for (const r of rows) {
        r.items = (r.items ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      }
      return rows;
    },
  });
}

export function useOfferQuestions() {
  return useQuery({
    queryKey: ["rgi", "offer-questions"],
    queryFn: async (): Promise<OfferQuestion[]> => {
      const { data, error } = await db
        .from("offer_questions")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return (data ?? []) as OfferQuestion[];
    },
  });
}

/** Die hinterlegten Word-Vorlagen einer Art, z. B. 'contract'. */
export function useTemplatesOfKind(kind: string) {
  return useQuery({
    queryKey: ["rgi", "templates", kind],
    queryFn: async () => {
      const { data, error } = await db
        .from("rgi_invoice_templates")
        .select("id, name, is_default, template_kind, created_at")
        .eq("template_kind", kind)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Offer>) => {
      const { items: _drop, ...rest } = payload as any;
      const { data, error } = await db.from("offers").upsert(rest).select().single();
      if (error) throw error;
      return data as Offer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "offers"] });
      toast.success("Angebot gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "offers"] });
      toast.success("Angebot gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Ersetzt alle Positionen eines Angebots. */
export function useSaveOfferItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId, items }: { offerId: string; items: Partial<OfferItem>[] }) => {
      const { error: delErr } = await db.from("offer_items").delete().eq("offer_id", offerId);
      if (delErr) throw delErr;
      if (!items.length) return;
      const rows = items.map((it, i) => ({
        offer_id: offerId,
        position: i,
        fee_type: it.fee_type ?? null,
        label: it.label || "Position",
        basis: it.basis ?? "case",
        amount: it.amount ?? null,
        percent: it.percent ?? null,
        quantity: it.quantity ?? 1,
        is_gross: !!it.is_gross,
        vat_rate: it.vat_rate ?? 19,
        is_included: it.is_included !== false,
        threshold: it.threshold ?? null,
        min_amount: it.min_amount ?? null,
        max_count: it.max_count ?? null,
        debtor: it.debtor ?? "community",
        halved_if_supervised: !!it.halved_if_supervised,
        tier_from: it.tier_from ?? null,
        tier_to: it.tier_to ?? null,
        note: it.note ?? null,
      }));
      const { error } = await db.from("offer_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rgi", "offers"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

/** Erzeugt den Vertragsentwurf als Word-Datei und optional als PDF. */
export async function renderOffer(offerId: string, formats: ("docx" | "pdf")[] = ["docx", "pdf"]) {
  const { data, error } = await supabase.functions.invoke("rgi-render-offer", {
    body: { offer_id: offerId, formats },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { ok: boolean; docx_path?: string; pdf_path?: string; pdf_error?: string };
}

export async function offerSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Aus einem gewonnenen Angebot einen Vertrag anlegen — ohne dass eine
 * Zahl neu eingegeben werden muss.
 */
export function useConvertOfferToContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ offer, buildingId }: { offer: Offer; buildingId: string }) => {
      const { data: contract, error: cErr } = await db
        .from("management_contracts")
        .insert({
          building_id: buildingId,
          status: "active",
          appointed_from: offer.desired_start,
          appointed_until: offer.contract_defaults?.["bestellung.bis"] ?? null,
          parking_billed_separately: (offer.units_parking ?? 0) > 0 && offer.rate_parking != null,
          units_apartment: offer.units_apartment,
          units_commercial: offer.units_commercial,
          units_parking: offer.units_parking,
          units_other: offer.units_other,
          approval_limit_amount: Number(offer.contract_defaults?.["freigabe.grenze"] ?? 1500) || 1500,
          template_version: "rgi_2026",
          notes: `Aus Angebot ${offer.offer_no ?? offer.prospect_name} übernommen.`,
        })
        .select()
        .single();
      if (cErr) throw cErr;

      const feeRows: any[] = [];
      const base = [
        { kind: "apartment", rate: offer.rate_apartment, count: offer.units_apartment, label: "Grundvergütung Wohnungen" },
        { kind: "commercial", rate: offer.rate_commercial, count: offer.units_commercial, label: "Grundvergütung Teileigentum" },
        { kind: "parking", rate: offer.rate_parking, count: offer.units_parking, label: "Grundvergütung Garagen und Stellplätze" },
        { kind: "other", rate: offer.rate_other, count: offer.units_other, label: "Grundvergütung Sonstige" },
      ];
      let pos = 0;
      for (const b of base) {
        if (b.rate == null || !b.count) continue;
        feeRows.push({
          contract_id: contract.id, fee_type: "base", label: b.label, unit_kind: b.kind,
          basis: "unit_month", amount: b.rate, quantity: b.count, is_gross: false,
          vat_rate: 19, debtor: "community", position: pos++, is_active: true,
        });
      }
      for (const it of offer.items ?? []) {
        if (it.is_included === false) continue;
        feeRows.push({
          contract_id: contract.id, fee_type: it.fee_type ?? "custom", label: it.label,
          basis: it.basis, amount: it.amount, percent: it.percent,
          threshold: it.threshold ?? null, min_amount: it.min_amount ?? null,
          max_count: it.max_count ?? null, tier_from: it.tier_from ?? null,
          tier_to: it.tier_to ?? null, halved_if_supervised: !!it.halved_if_supervised,
          is_gross: it.is_gross, vat_rate: it.vat_rate, debtor: it.debtor ?? "community",
          position: pos++, is_active: true,
        });
      }
      if (feeRows.length) {
        const { error: fErr } = await db.from("management_contract_fees").insert(feeRows);
        if (fErr) throw fErr;
      }

      const { error: uErr } = await db
        .from("offers")
        .update({ status: "won", decided_on: new Date().toISOString().slice(0, 10), won_contract_id: contract.id })
        .eq("id", offer.id);
      if (uErr) throw uErr;

      return contract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "offers"] });
      qc.invalidateQueries({ queryKey: ["rgi", "contracts"] });
      toast.success("Vertrag aus dem Angebot angelegt");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/**
 * Was die App zu einem Gebäude schon weiß: Einheitenzahl aus den
 * Stammdaten und die tatsächlich erfassten Zuordnungen je Art.
 */
export function useBuildingUnitStats(buildingId: string | null | undefined) {
  return useQuery({
    queryKey: ["rgi", "building-units", buildingId],
    enabled: !!buildingId,
    queryFn: async () => {
      const [{ data: b, error: bErr }, { data: rows, error: aErr }] = await Promise.all([
        db.from("buildings").select("unit_count, unit_count_for_billing").eq("id", buildingId).maybeSingle(),
        db.from("contact_building_assignments")
          .select("unit_kind, unit_number")
          .eq("building_id", buildingId)
          .eq("is_active", true)
          .eq("role_in_building", "eigentuemer"),
      ]);
      if (bErr) throw bErr;
      if (aErr) throw aErr;

      const seen = new Set<string>();
      let apartment = 0, commercial = 0, parking = 0, other = 0;
      for (const r of rows ?? []) {
        const dedupe = `${r.unit_kind}|${r.unit_number ?? ""}`;
        if (r.unit_number && seen.has(dedupe)) continue;
        if (r.unit_number) seen.add(dedupe);
        switch (r.unit_kind) {
          case "apartment": apartment++; break;
          case "commercial": commercial++; break;
          case "parking_garage":
          case "parking_outdoor": parking++; break;
          default: other++;
        }
      }
      return {
        unitCount: b?.unit_count ?? null,
        unitCountForBilling: b?.unit_count_for_billing ?? null,
        assigned: { apartment, commercial, parking, other },
        assignedTotal: apartment + commercial + parking + other,
      };
    },
  });
}
