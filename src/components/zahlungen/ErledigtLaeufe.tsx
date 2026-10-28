import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/bankInfo";

/**
 * Zahlungen › Erledigt: per TAN gesendete Zahlläufe und beendete Aufträge,
 * nach Datum gruppiert. Bezahlte Rechnungen zeigt die Seite darunter.
 */
export function ErledigtLaeufe({
  buildingId,
  namen,
  von,
  bis,
  zeigeLaeufe,
  zeigeBeendet,
  suche,
}: {
  buildingId: string;
  namen: Record<string, string>;
  von: string;
  bis: string;
  zeigeLaeufe: boolean;
  zeigeBeendet: boolean;
  suche: string;
}) {
  const { data: laeufe = [], isLoading } = useQuery({
    queryKey: ["erledigt-laeufe", buildingId, von, bis],
    enabled: zeigeLaeufe,
    queryFn: async () => {
      let q = (supabase as any)
        .from("payment_runs")
        .select("id, art, summe, anzahl, building_id, gesendet_am, faellig_am, ausfuehrung_am, status")
        .eq("status", "gesendet")
        .order("gesendet_am", { ascending: false })
        .limit(200);
      if (buildingId !== "all" && buildingId !== "company") q = q.eq("building_id", buildingId);
      if (von) q = q.gte("gesendet_am", von);
      if (bis) q = q.lte("gesendet_am", `${bis}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: beendet = [] } = useQuery({
    queryKey: ["erledigt-auftraege", buildingId],
    enabled: zeigeBeendet,
    queryFn: async () => {
      let q = (supabase as any)
        .from("payment_orders")
        .select("id, titel, art, building_id, updated_at, betragsquelle")
        .eq("status", "abgebrochen")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (buildingId !== "all" && buildingId !== "company") q = q.eq("building_id", buildingId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const s = suche.trim().toLowerCase();
  const passt = (...t: (string | null | undefined)[]) => !s || t.some((x) => x?.toLowerCase().includes(s));

  type Zeile = { id: string; datum: string; titel: string; info: string; betrag: number | null; ein: boolean; beendet: boolean };
  const zeilen: Zeile[] = [
    ...(zeigeLaeufe ? laeufe : []).map(
      (r: any): Zeile => ({
        id: r.id,
        datum: r.gesendet_am,
        titel: `${r.building_id ? namen[r.building_id] ?? "Liegenschaft" : "RGI Immobilien"} · ${r.art === "lastschrift" ? "Lastschrift" : "Überweisung"}`,
        info: `${r.anzahl} ${r.art === "lastschrift" ? (r.anzahl === 1 ? "Einzug" : "Einzüge") : r.anzahl === 1 ? "Überweisung" : "Überweisungen"}${
          r.faellig_am || r.ausfuehrung_am ? ` · ${r.art === "lastschrift" ? "Einzug" : "Ausführung"} ${format(new Date(r.faellig_am ?? r.ausfuehrung_am), "dd.MM.yyyy")}` : ""
        } · per TAN gesendet ${format(new Date(r.gesendet_am), "HH:mm")} Uhr`,
        betrag: Number(r.summe) || 0,
        ein: r.art === "lastschrift",
        beendet: false,
      }),
    ),
    ...(zeigeBeendet ? beendet : []).map(
      (a: any): Zeile => ({
        id: a.id,
        datum: a.updated_at,
        titel: `${namen[a.building_id] ?? "Liegenschaft"} · ${a.titel}`,
        info: a.art === "dauerlastschrift" ? "Dauerlastschrift beendet" : "Auftrag beendet",
        betrag: null,
        ein: a.art !== "ueberweisung",
        beendet: true,
      }),
    ),
  ]
    .filter((z) => passt(z.titel, z.info))
    .sort((a, b) => b.datum.localeCompare(a.datum));

  const tagText = (d: string) => {
    const x = new Date(d);
    if (isToday(x)) return `Heute · ${format(x, "dd.MM.yyyy")}`;
    if (isYesterday(x)) return `Gestern · ${format(x, "dd.MM.yyyy")}`;
    return format(x, "dd.MM.yyyy");
  };
  const gruppen: { tag: string; zeilen: Zeile[] }[] = [];
  for (const z of zeilen) {
    const t = tagText(z.datum);
    const g = gruppen.find((x) => x.tag === t);
    if (g) g.zeilen.push(z);
    else gruppen.push({ tag: t, zeilen: [z] });
  }

  if (zeigeLaeufe && isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!gruppen.length) {
    return <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Noch nichts per TAN gesendet{zeigeBeendet ? " oder beendet" : ""}.</div>;
  }

  return (
    <div className="space-y-3">
      {gruppen.map((g) => (
        <section key={g.tag} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.tag}</div>
          {g.zeilen.map((z) => {
            const Icon = z.beendet ? XCircle : z.ein ? ArrowDownLeft : ArrowUpRight;
            return (
              <div key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    z.beendet ? "bg-muted text-muted-foreground" : z.ein ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-[220px] flex-1">
                  <span className="block font-semibold">{z.titel}</span>
                  <span className="block text-sm text-muted-foreground">{z.info}</span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    z.beendet ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                  )}
                >
                  {z.beendet ? "beendet" : "gesendet"}
                </span>
                {z.betrag != null && <span className="min-w-[110px] text-right font-bold tabular-nums">{euro(z.betrag)}</span>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
