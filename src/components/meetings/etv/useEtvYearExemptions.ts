import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------
// Jahr ohne Versammlung in der App als erledigt (z. B. Versammlung noch
// von der Vorverwaltung oder vor Einführung der App abgehalten).
//
// Quelle ist der Jahreszyklus (annual_cycle_tasks): Ist dort für das
// Wirtschaftsjahr „ETV-Protokoll fertig“ erledigt, aber in der App keine
// Versammlung angelegt, gilt das Jahr im Jahresplan als abgeschlossen.
// Markieren / Aufheben setzt die ETV-Schritte im Jahreszyklus.
// ---------------------------------------------------------------------

const ETV_TASKS = ["tops_abfragen", "etv_einberufen", "etv_protokoll_fertig"] as const;

export interface EtvYearExemption {
  building_id: string;
  year: number;
  note: string | null;
  completed_at: string | null;
}

const startYear = (iso: string) => Number(iso.slice(0, 4));

export const useEtvYearExemptions = () =>
  useQuery({
    queryKey: ["etv-year-exemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("building_id, fiscal_year_start, note, completed_at")
        .eq("task_key", "etv_protokoll_fertig")
        .eq("status", "done");
      if (error) throw error;
      return (data || []).map((t) => ({
        building_id: t.building_id,
        year: startYear(t.fiscal_year_start),
        note: t.note,
        completed_at: t.completed_at,
      })) as EtvYearExemption[];
    },
  });

const pad = (n: number) => String(n).padStart(2, "0");

/** Wirtschaftsjahr der Liegenschaft, das im angegebenen Kalenderjahr beginnt. */
const fiscalYearOf = async (buildingId: string, year: number) => {
  const { data, error } = await supabase
    .from("buildings")
    .select("fiscal_year_start_month, fiscal_year_start_day")
    .eq("id", buildingId)
    .maybeSingle();
  if (error) throw error;
  const m = data?.fiscal_year_start_month || 1;
  const d = data?.fiscal_year_start_day || 1;
  const start = `${year}-${pad(m)}-${pad(d)}`;
  const endDate = new Date(Date.UTC(year + 1, m - 1, d - 1));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
};

const findCycleStart = async (buildingId: string, year: number) => {
  const { data, error } = await supabase
    .from("annual_cycle_tasks")
    .select("fiscal_year_start")
    .eq("building_id", buildingId)
    .eq("task_key", "etv_protokoll_fertig")
    .gte("fiscal_year_start", `${year}-01-01`)
    .lte("fiscal_year_start", `${year}-12-31`)
    .order("fiscal_year_start")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.fiscal_year_start as string | undefined;
};

export const setEtvYearExemption = async (buildingId: string, year: number, note: string | null) => {
  let start = await findCycleStart(buildingId, year);
  if (!start) {
    const fy = await fiscalYearOf(buildingId, year);
    const { error } = await supabase.rpc("seed_annual_cycle_tasks", {
      p_building_id: buildingId, p_fiscal_year_start: fy.start, p_fiscal_year_end: fy.end,
    });
    if (error) throw error;
    start = fy.start;
  }
  const today = new Date();
  const completed = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const { error } = await supabase
    .from("annual_cycle_tasks")
    .update({ status: "done", completed_at: completed })
    .eq("building_id", buildingId)
    .eq("fiscal_year_start", start)
    .in("task_key", [...ETV_TASKS]);
  if (error) throw error;
  const text = note?.trim();
  if (text) {
    const { error: noteError } = await supabase
      .from("annual_cycle_tasks")
      .update({ note: text })
      .eq("building_id", buildingId)
      .eq("fiscal_year_start", start)
      .eq("task_key", "etv_protokoll_fertig");
    if (noteError) throw noteError;
  }
};

export const removeEtvYearExemption = async (buildingId: string, year: number) => {
  const start = await findCycleStart(buildingId, year);
  if (!start) return;
  const { error } = await supabase
    .from("annual_cycle_tasks")
    .update({ status: "open", completed_at: null })
    .eq("building_id", buildingId)
    .eq("fiscal_year_start", start)
    .in("task_key", ["etv_einberufen", "etv_protokoll_fertig"]);
  if (error) throw error;
};
