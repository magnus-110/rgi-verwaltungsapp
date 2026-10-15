import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Pause, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { euro } from "@/lib/bankInfo";
import { heuteIso, plusMonate, type Auftrag } from "@/lib/auftraege";

const ART: Record<string, string> = { ueberweisung: "Überweisung", einzug: "Einzug", dauerlastschrift: "Dauerlastschrift" };
const RHYTHMUS: Record<string, string> = { monatlich: "monatlich", quartal: "vierteljährlich", halbjahr: "halbjährlich", jahr: "jährlich" };
const SCHRITT: Record<string, number> = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 };

/** Nächster Termin einer Dauerlastschrift ab heute. */
function naechster(a: Auftrag): string | null {
  if (!a.faellig_am) return null;
  if (a.art !== "dauerlastschrift" || !a.rhythmus) return a.faellig_am;
  const heute = heuteIso();
  let d = a.faellig_am;
  for (let n = 1; d < heute && n < 600; n++) d = plusMonate(a.faellig_am, SCHRITT[a.rhythmus] * n);
  return a.ende_am && d > a.ende_am ? null : d;
}

/**
 * Zahlungen › Aufträge: eigene Überweisungen, Einzüge und
 * Dauerlastschriften. Einmalige Aufträge verschwinden, sobald sie gesendet
 * sind; Dauerlastschriften laufen, bis man sie beendet.
 */
export function AuftraegeListe({ buildingId, suche, namen }: { buildingId: string; suche: string; namen: Record<string, string> }) {
  const queryClient = useQueryClient();
  const { data: auftraege = [], isLoading } = useQuery({
    queryKey: ["auftraege"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payment_orders")
        .select("*, payment_order_items(id, name, betrag, aktiv)")
        .in("status", ["aktiv", "pausiert"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      // einmalige Aufträge, die schon komplett in einem Zahllauf stecken, gelten als erledigt
      const einmal = (data ?? []).filter((a: any) => a.art !== "dauerlastschrift").flatMap((a: any) => a.payment_order_items.map((i: any) => i.id));
      const verplant = new Set<string>();
      for (let i = 0; i < einmal.length; i += 100) {
        const { data: r } = await (supabase as any)
          .from("payment_run_items")
          .select("order_item_id, run:payment_runs!inner(status)")
          .in("order_item_id", einmal.slice(i, i + 100))
          .not("run.status", "in", "(abgebrochen,fehler)");
        (r ?? []).forEach((x: any) => verplant.add(x.order_item_id));
      }
      return (data ?? []).map((a: any) => ({
        ...a,
        gesendet: a.art !== "dauerlastschrift" && a.payment_order_items.length > 0 && a.payment_order_items.every((i: any) => verplant.has(i.id)),
      })) as (Auftrag & { gesendet: boolean })[];
    },
  });

  const setzen = async (a: Auftrag, status: string) => {
    const { error } = await (supabase as any).from("payment_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) toast.error("Konnte nicht gespeichert werden");
    else {
      toast.success(status === "abgebrochen" ? "Auftrag beendet" : status === "pausiert" ? "Auftrag pausiert" : "Auftrag läuft wieder");
      queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["freigabe-auftraege"] });
    }
  };

  const q = suche.trim().toLowerCase();
  const liste = auftraege.filter(
    (a) =>
      !a.gesendet &&
      (buildingId === "all" || a.building_id === buildingId) &&
      (!q || [a.titel, a.verwendungszweck, namen[a.building_id], ...a.payment_order_items.map((i) => i.name)].some((t) => t?.toLowerCase().includes(q))),
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!liste.length) {
    return <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">Keine offenen Aufträge. Über „Neuer Auftrag“ eine Überweisung, einen Einzug oder eine Dauerlastschrift anlegen.</div>;
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Aufträge">
      {liste.map((a) => {
        const ein = a.art !== "ueberweisung";
        const n = a.payment_order_items.filter((i) => i.aktiv).length;
        const summe = a.payment_order_items.filter((i) => i.aktiv).reduce((s, i) => s + (Number(i.betrag) || 0), 0);
        const termin = naechster(a);
        return (
          <div key={a.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ein ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
              {ein ? <ArrowDown className="h-4 w-4" aria-label="Einzug" /> : <ArrowUp className="h-4 w-4" aria-label="Überweisung" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-semibold">{a.titel}</span>
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{ART[a.art]}</span>
                <span>
                  {namen[a.building_id] ?? "Liegenschaft"} · {n} {ein ? "Eigentümer" : n === 1 ? "Empfänger" : "Empfänger"}
                  {a.art === "dauerlastschrift" && a.rhythmus ? ` · ${RHYTHMUS[a.rhythmus]}` : ""}
                </span>
                {a.status === "pausiert" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">pausiert</span>}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className={`whitespace-nowrap font-semibold tabular-nums ${ein ? "text-green-700 dark:text-green-400" : ""}`}>
                {a.betragsquelle === "wirtschaftsplan" ? "Hausgeld" : `${ein ? "+" : "−"}${euro(summe)}`}
              </span>
              <span className="text-xs text-muted-foreground">{termin ? `${a.art === "dauerlastschrift" ? "nächster Einzug" : ein ? "Einzug am" : "am"} ${format(new Date(termin), "dd.MM.yyyy")}` : "beendet"}</span>
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Aktionen">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {a.status === "aktiv" ? (
                  <DropdownMenuItem onClick={() => setzen(a, "pausiert")}>
                    <Pause className="h-4 w-4 mr-2" /> Pausieren
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setzen(a, "aktiv")}>
                    <Play className="h-4 w-4 mr-2" /> Fortsetzen
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => setzen(a, "abgebrochen")}>
                  <XCircle className="h-4 w-4 mr-2" /> Beenden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </section>
  );
}
