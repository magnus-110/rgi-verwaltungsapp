// Datenzugriff für das Abrechnungsblatt.
//
// Wie bei den Verträgen greifen wir hier ungetypt zu: die generierte
// types.ts im Repo kennt die Sicht rgi_building_billing_overview und
// die neuen Spalten von billable_events noch nicht.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BillableEvent, BillingOverviewRow, BillingRow } from "@/types/rgiBilling";
import type { BillableStatus } from "@/types/rgiContracts";

const db = supabase as any;

const K = {
  overview: ["rgi", "billing", "overview"] as const,
  building: (id: string) => ["rgi", "billing", "building", id] as const,
  openTime: (id: string) => ["rgi", "billing", "time", id] as const,
};

// ---------------------------------------------------------------
// Ebene 1: Objektliste
// ---------------------------------------------------------------

export function useBillingOverview() {
  return useQuery({
    queryKey: K.overview,
    queryFn: async (): Promise<BillingOverviewRow[]> => {
      const { data, error } = await db
        .from("rgi_building_billing_overview")
        .select("*")
        .order("building_name");
      if (error) throw error;
      return (data ?? []) as BillingOverviewRow[];
    },
  });
}

// ---------------------------------------------------------------
// Ebene 2: Posten einer Liegenschaft
// ---------------------------------------------------------------

export function useBuildingBillables(buildingId: string | null) {
  return useQuery({
    queryKey: buildingId ? K.building(buildingId) : ["rgi", "billing", "building", "none"],
    enabled: !!buildingId,
    queryFn: async (): Promise<BillableEvent[]> => {
      const { data, error } = await db
        .from("billable_events")
        .select("*, invoice:rgi_invoices(id, invoice_number, issue_date, status)")
        .eq("building_id", buildingId!)
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BillableEvent[];
    },
  });
}

/**
 * Offene Stunden einer Liegenschaft: abrechenbar und noch keiner
 * Rechnungsposition zugeordnet.
 *
 * Ein Projekt gehört auf zwei Wegen zu einem Objekt: direkt über
 * rgi_projects.building_id oder indirekt über seinen Kunden. In der
 * Praxis ist fast nur der zweite Weg gefüllt, weil building_id an den
 * Projekten erst später dazugekommen ist. Beide Wege werden gesucht,
 * sonst bleiben die Stunden unsichtbar.
 */
export function useOpenTimeForBuilding(buildingId: string | null) {
  return useQuery({
    queryKey: buildingId ? K.openTime(buildingId) : ["rgi", "billing", "time", "none"],
    enabled: !!buildingId,
    queryFn: async () => {
      // Kunden dieses Objekts — über sie hängen die meisten Projekte.
      const { data: clients, error: cErr } = await db
        .from("rgi_clients")
        .select("id, default_hourly_rate")
        .eq("building_id", buildingId!);
      if (cErr) throw cErr;
      const clientIds = (clients ?? []).map((c: any) => c.id);

      const filters = [`building_id.eq.${buildingId}`];
      if (clientIds.length) filters.push(`client_id.in.(${clientIds.join(",")})`);

      const { data: projects, error: pErr } = await db
        .from("rgi_projects")
        .select("id, name, client_id, building_id, default_hourly_rate, sparte, status")
        .or(filters.join(","))
        .order("name");
      if (pErr) throw pErr;

      const ids = (projects ?? []).map((p: any) => p.id);
      if (!ids.length) return { projects: [], entries: [] as any[], clients: clients ?? [] };

      const { data: entries, error: tErr } = await db
        .from("rgi_time_entries")
        .select("*")
        .in("project_id", ids)
        .is("invoice_item_id", null)
        .eq("billable", true)
        .order("date", { ascending: false });
      if (tErr) throw tErr;
      return { projects: projects ?? [], entries: entries ?? [], clients: clients ?? [] };
    },
  });
}

// ---------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------

function invalidate(qc: ReturnType<typeof useQueryClient>, buildingId?: string) {
  qc.invalidateQueries({ queryKey: ["rgi", "billing"] });
  qc.invalidateQueries({ queryKey: ["rgi", "invoices"] });
  if (buildingId) qc.invalidateQueries({ queryKey: K.building(buildingId) });
}

export function useUpsertBillable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BillableEvent> & { building_id: string; label: string }) => {
      const { data, error } = await db.from("billable_events").upsert(payload).select().single();
      if (error) throw error;
      return data as BillableEvent;
    },
    onSuccess: (_d, v) => {
      invalidate(qc, v.building_id);
      toast.success("Posten gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSetBillableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      buildingId: string;
      status: BillableStatus;
      dismissed_reason?: string | null;
    }) => {
      const patch: Record<string, unknown> = { status: v.status };
      if (v.status === "dismissed") patch.dismissed_reason = v.dismissed_reason ?? null;
      if (v.status === "settled") patch.settled_on = new Date().toISOString().slice(0, 10);
      const { error } = await db.from("billable_events").update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(qc, v.buildingId),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteBillable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; buildingId: string }) => {
      const { error } = await db.from("billable_events").delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate(qc, v.buildingId);
      toast.success("Posten gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------
// Ebene 3: Rechnung aus ausgewählten Posten
// ---------------------------------------------------------------

/**
 * Sorgt dafür, dass es für eine Liegenschaft einen Rechnungsempfänger
 * gibt. Ist keiner hinterlegt, wird einer aus den Gebäudedaten
 * angelegt — sichtbar und danach frei änderbar.
 */
async function ensureClientForBuilding(buildingId: string): Promise<string> {
  const { data: existing, error: eErr } = await db
    .from("rgi_clients")
    .select("id")
    .eq("building_id", buildingId)
    .limit(1)
    .maybeSingle();
  if (eErr) throw eErr;
  if (existing?.id) return existing.id;

  const { data: b, error: bErr } = await db
    .from("buildings")
    .select("id, name, address, postal_code, city, management_mode")
    .eq("id", buildingId)
    .single();
  if (bErr) throw bErr;

  const name = b.management_mode === "weg" ? `WEG ${b.name}` : b.name;
  const { data: created, error: cErr } = await db
    .from("rgi_clients")
    .insert({
      name,
      type: "weg",
      building_id: buildingId,
      address_line1: b.address ?? null,
      zip: b.postal_code ?? null,
      city: b.city ?? null,
      country: "DE",
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  toast.info(`Rechnungsempfänger „${name}“ wurde angelegt`);
  return created.id;
}

export interface CreateInvoiceInput {
  buildingId: string;
  rows: BillingRow[];
  /** Selbstentnahme vom Objektkonto statt Überweisung. */
  paidByWithdrawal: boolean;
  issueDate: string;
  dueDate: string | null;
  servicePeriodFrom: string | null;
  servicePeriodTo: string | null;
  introText: string;
  templateId: string | null;
  createdBy?: string;
}

/**
 * Legt aus den ausgewählten Zeilen einen Rechnungsentwurf an.
 *
 * Reihenfolge ist wichtig: erst die Vorschlagszeilen als Datensätze
 * festschreiben, dann die Rechnung, dann die Verknüpfung. Bricht ein
 * Schritt ab, bleiben keine halb verbuchten Posten zurück, die als
 * abgerechnet gälten, ohne auf einer Rechnung zu stehen.
 */
export function useCreateInvoiceFromBillables() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { buildingId, rows } = input;
      if (!rows.length) throw new Error("Keine Posten ausgewählt");

      const clientId = await ensureClientForBuilding(buildingId);

      // 1) Vorschläge und Stundenzeilen zu Datensätzen machen.
      const eventIds: string[] = [];
      for (const r of rows) {
        if (r.eventId) {
          eventIds.push(r.eventId);
          continue;
        }
        const { data, error } = await db
          .from("billable_events")
          .insert({
            building_id: buildingId,
            contract_id: r.contractId,
            fee_id: r.feeId,
            status: "approved",
            occurred_on: r.occurredOn,
            label: r.label,
            quantity: r.quantity,
            unit: r.unit,
            amount_net: r.unitPriceNet ?? 0,
            vat_rate: r.vatRate,
            debtor: r.debtor,
            source_kind: r.sourceKind,
            source_id: r.sourceId,
            period_key: r.periodKey,
            notes: r.hint ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        eventIds.push(data.id);
      }

      // 2) Rechnungskopf.
      const { data: invoice, error: iErr } = await db
        .from("rgi_invoices")
        .insert({
          client_id: clientId,
          building_id: buildingId,
          status: "draft",
          issue_date: input.issueDate,
          due_date: input.paidByWithdrawal ? null : input.dueDate,
          service_period_from: input.servicePeriodFrom,
          service_period_to: input.servicePeriodTo,
          intro_text: input.introText,
          template_id: input.templateId,
          paid_by_withdrawal: input.paidByWithdrawal,
          created_by: input.createdBy ?? null,
        })
        .select()
        .single();
      if (iErr) throw iErr;

      // 3) Positionen.
      const itemRows = rows.map((r, idx) => ({
        invoice_id: invoice.id,
        position: idx + 1,
        kind: r.unit === "Std" ? "hours" : "flat",
        description: r.label,
        quantity: r.quantity,
        unit: r.unit,
        unit_price_net: r.unitPriceNet ?? 0,
        vat_rate: r.vatRate,
        source_time_entry_ids: r.timeEntryIds ?? [],
      }));
      const { data: items, error: itErr } = await db
        .from("rgi_invoice_items")
        .insert(itemRows)
        .select("id, position");
      if (itErr) throw itErr;

      // 4) Posten mit der Rechnung verknüpfen.
      const sorted = (items ?? []).sort((a: any, b: any) => a.position - b.position);
      for (let i = 0; i < eventIds.length; i++) {
        await db
          .from("billable_events")
          .update({
            status: "invoiced",
            settled_via: "rgi_invoice",
            rgi_invoice_id: invoice.id,
            rgi_invoice_item_id: sorted[i]?.id ?? null,
          })
          .eq("id", eventIds[i]);
      }

      // 5) Verbrauchte Stunden markieren, damit sie nicht doppelt kommen.
      for (let i = 0; i < rows.length; i++) {
        const tids = rows[i].timeEntryIds ?? [];
        if (!tids.length) continue;
        await db
          .from("rgi_time_entries")
          .update({ invoice_item_id: sorted[i]?.id ?? null })
          .in("id", tids);
      }

      return invoice;
    },
    onSuccess: (_d, v) => {
      invalidate(qc, v.buildingId);
      qc.invalidateQueries({ queryKey: ["rgi", "time"] });
      toast.success("Rechnungsentwurf erstellt");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------
// Entwurf verwerfen
// ---------------------------------------------------------------

/**
 * Löscht einen Rechnungsentwurf und gibt frei, was er verbraucht hat.
 *
 * Die Fremdschlüssel räumen fast alles von selbst auf: Positionen und
 * Zahlungen verschwinden mit der Rechnung, und die Zeiterfassungen
 * verlieren ihre Zuordnung, tauchen also wieder unter den offenen
 * Stunden auf.
 *
 * Eine Sache aber nicht: billable_events behalten ihren Status
 * „invoiced". Ohne die Rechnung dahinter wären diese Posten dauerhaft
 * als abgerechnet markiert und würden nie wieder im Abrechnungsblatt
 * erscheinen. Deshalb werden sie hier zuerst zurückgesetzt.
 *
 * Festgeschriebene Rechnungen sind ausgenommen: eine vergebene Nummer
 * darf nicht spurlos verschwinden, dafür gibt es die Stornierung.
 */
export function useDeleteInvoiceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoice: { id: string; invoice_number?: string | null }) => {
      if (invoice.invoice_number) {
        throw new Error(
          "Diese Rechnung hat schon eine Nummer und lässt sich nicht mehr löschen. Dafür gibt es die Stornierung.",
        );
      }

      // Welche Posten hängen daran? Nur zum Mitzählen für die Meldung.
      const { data: linked, error: lErr } = await db
        .from("billable_events")
        .select("id")
        .eq("rgi_invoice_id", invoice.id);
      if (lErr) throw lErr;

      // 1) Posten freigeben — muss vor dem Löschen passieren, danach
      //    ist die Verknüpfung weg und sie wären nicht mehr auffindbar.
      if ((linked ?? []).length > 0) {
        const { error: relErr } = await db
          .from("billable_events")
          .update({
            status: "approved",
            settled_via: null,
            settled_on: null,
            rgi_invoice_id: null,
            rgi_invoice_item_id: null,
          })
          .eq("rgi_invoice_id", invoice.id);
        if (relErr) throw relErr;
      }

      // 2) Rechnung löschen. Positionen, Zahlungen und die Zuordnung
      //    der Stunden räumen die Fremdschlüssel selbst ab.
      const { error } = await db.from("rgi_invoices").delete().eq("id", invoice.id);
      if (error) throw error;

      return { released: (linked ?? []).length };
    },
    onSuccess: (r) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["rgi", "time"] });
      toast.success(
        r.released > 0
          ? `Entwurf gelöscht — ${r.released} ${r.released === 1 ? "Posten ist" : "Posten sind"} wieder offen`
          : "Entwurf gelöscht",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });
}
