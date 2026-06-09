import type { RgiTimeEntry, RgiProject, RgiClient, RgiInvoiceItem } from "@/hooks/useRgi";

export type RgiGrouping = "per_entry" | "per_day" | "sum";

export function getRgiRate(
  entry: RgiTimeEntry,
  projects: RgiProject[],
  clients: RgiClient[],
  clientId: string,
): number {
  if (entry.hourly_rate != null) return Number(entry.hourly_rate);
  const proj = projects.find((p) => p.id === entry.project_id);
  if (proj?.default_hourly_rate != null) return Number(proj.default_hourly_rate);
  const c = clients.find((x) => x.id === clientId);
  if (c?.default_hourly_rate != null) return Number(c.default_hourly_rate);
  return 0;
}

export function buildRgiItemsFromTime(
  entries: RgiTimeEntry[],
  projects: RgiProject[],
  clients: RgiClient[],
  clientId: string,
  grouping: RgiGrouping,
): Partial<RgiInvoiceItem>[] {
  if (entries.length === 0) return [];
  if (grouping === "per_entry") {
    return entries.map((e) => ({
      kind: "time",
      description: e.date ? `${e.date} — ${e.description}` : e.description,
      quantity: Number((e.minutes / 60).toFixed(2)),
      unit: "Std",
      unit_price_net: getRgiRate(e, projects, clients, clientId),
      vat_rate: 19,
      source_time_entry_ids: [e.id],
    }));
  }
  if (grouping === "per_day") {
    const groups = new Map<string, RgiTimeEntry[]>();
    for (const e of entries) {
      const key = `${e.date ?? ""}|${getRgiRate(e, projects, clients, clientId)}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return [...groups.entries()].map(([key, es]) => {
      const [date] = key.split("|");
      const totalMin = es.reduce((s, e) => s + e.minutes, 0);
      const descs = es.map((e) => e.description).join("; ");
      return {
        kind: "time",
        description: date ? `${date} — ${descs}` : descs,
        quantity: Number((totalMin / 60).toFixed(2)),
        unit: "Std",
        unit_price_net: getRgiRate(es[0], projects, clients, clientId),
        vat_rate: 19,
        source_time_entry_ids: es.map((e) => e.id),
      };
    });
  }
  // sum
  const totalMin = entries.reduce((s, e) => s + e.minutes, 0);
  const totalCost = entries.reduce(
    (s, e) => s + (e.minutes / 60) * getRgiRate(e, projects, clients, clientId),
    0,
  );
  const totalHours = totalMin / 60;
  const rate = totalHours > 0 ? totalCost / totalHours : 0;
  const dates = [...new Set(entries.map((e) => e.date).filter(Boolean) as string[])].sort();
  const range = dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0];
  return [
    {
      kind: "time",
      description: range ? `Geleistete Stunden ${range}` : `Geleistete Stunden`,
      quantity: Number(totalHours.toFixed(2)),
      unit: "Std",
      unit_price_net: Number(rate.toFixed(2)),
      vat_rate: 19,
      source_time_entry_ids: entries.map((e) => e.id),
    },
  ];
}
