import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Copy, Loader2, MoreHorizontal, Pause, Pencil, Play, Repeat, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { euro, ibanFormatiert } from "@/lib/bankInfo";
import { hausgeldAm, ladeEigentuemer } from "@/lib/eigentuemer";
import { heuteIso, plusMonate, type Auftrag } from "@/lib/auftraege";

const RHYTHMUS: Record<string, string> = { monatlich: "monatlich", quartal: "vierteljährlich", halbjahr: "halbjährlich", jahr: "jährlich" };
const SCHRITT: Record<string, number> = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 };

export type AuftragMitStand = Auftrag & { gesendet: boolean };

/** Nächster Termin einer Dauerlastschrift ab heute. */
export function naechsterTermin(a: Pick<Auftrag, "art" | "rhythmus" | "faellig_am" | "ende_am">): string | null {
  if (!a.faellig_am) return null;
  if (a.art !== "dauerlastschrift" || !a.rhythmus) return a.faellig_am;
  const heute = heuteIso();
  let d = a.faellig_am;
  for (let n = 1; d < heute && n < 600; n++) d = plusMonate(a.faellig_am, SCHRITT[a.rhythmus] * n);
  return a.ende_am && d > a.ende_am ? null : d;
}

/** Laufende Aufträge; einmalige, die komplett in einem Zahllauf stecken, gelten als gesendet. */
export async function ladeLaufendeAuftraege(): Promise<AuftragMitStand[]> {
  const { data, error } = await (supabase as any)
    .from("payment_orders")
    .select("*, payment_order_items(*)")
    .in("status", ["aktiv", "pausiert"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const einmal = (data ?? []).filter((a: any) => a.art !== "dauerlastschrift").flatMap((a: any) => a.payment_order_items.map((i: any) => i.id));
  const verplant = new Set<string>();
  for (let i = 0; i < einmal.length; i += 100) {
    const { data: r } = await (supabase as any)
      .from("payment_run_items")
      .select("order_item_id, einzel_status, run:payment_runs!inner(status)")
      .in("order_item_id", einmal.slice(i, i + 100));
    (r ?? []).forEach((x: any) => {
      if (["abgebrochen", "fehler"].includes(x.run?.status) && !x.einzel_status) return;
      verplant.add(x.order_item_id);
    });
  }
  return (data ?? []).map((a: any) => {
    const aktiv = a.payment_order_items.filter((i: any) => i.aktiv);
    return { ...a, gesendet: a.art !== "dauerlastschrift" && aktiv.length > 0 && aktiv.every((i: any) => verplant.has(i.id)) };
  });
}

export function useLaufendeAuftraege() {
  return useQuery({ queryKey: ["auftraege"], queryFn: ladeLaufendeAuftraege });
}

type Filter = "alle" | "dauer" | "einmal";

/**
 * Zahlungen › Aufträge: nach Liegenschaft gruppiert. „Bearbeiten“ öffnet
 * dieselbe Seite wie „Neuer Auftrag“ – ändern statt neu anlegen.
 */
export function AuftraegeListe({
  buildingId,
  suche,
  namen,
  onBearbeiten,
  onKopieren,
}: {
  buildingId: string;
  suche: string;
  namen: Record<string, string>;
  onBearbeiten: (id: string) => void;
  onKopieren: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("alle");
  const { data: auftraege = [], isLoading } = useLaufendeAuftraege();

  const q = suche.trim().toLowerCase();
  const offen = auftraege.filter(
    (a) =>
      !a.gesendet &&
      (buildingId === "all" || a.building_id === buildingId) &&
      (!q || [a.titel, a.verwendungszweck, namen[a.building_id], ...a.payment_order_items.map((i) => i.name)].some((t) => t?.toLowerCase().includes(q))),
  );
  const liste = offen.filter((a) => filter === "alle" || (filter === "dauer") === (a.art === "dauerlastschrift"));

  // Für Dauerlastschriften mit Hausgeld: Betrag am nächsten Termin
  const hausgeldGebaeude = [...new Set(liste.filter((a) => a.betragsquelle === "wirtschaftsplan").map((a) => a.building_id))];
  const { data: eigentuemer = {} } = useQuery({
    queryKey: ["auftraege-hausgeld", hausgeldGebaeude.join(",")],
    enabled: hausgeldGebaeude.length > 0,
    queryFn: async () => Object.fromEntries(await Promise.all(hausgeldGebaeude.map(async (b) => [b, await ladeEigentuemer(b)] as const))),
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const gruppen = [...new Set(liste.map((a) => a.building_id))]
    .map((b) => ({ b, name: namen[b] ?? "Liegenschaft", auftraege: liste.filter((a) => a.building_id === b) }))
    .sort((x, y) => x.name.localeCompare(y.name, "de"));
  const anzahl = (f: Filter) => offen.filter((a) => f === "alle" || (f === "dauer") === (a.art === "dauerlastschrift")).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {(
          [
            ["alle", "Alle"],
            ["dauer", "Dauerlastschriften"],
            ["einmal", "Einmalig"],
          ] as [Filter, string][]
        ).map(([f, t]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
              filter === f ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30",
            )}
          >
            {t} · {anzahl(f)}
          </button>
        ))}
      </div>

      {!gruppen.length && (
        <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          Keine offenen Aufträge. Über „Neuer Auftrag“ eine Überweisung, einen Einzug oder eine Dauerlastschrift anlegen.
        </div>
      )}

      {gruppen.map((g) => (
        <section key={g.b} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <div className="text-lg font-bold">{g.name}</div>
          </div>
          {g.auftraege.map((a) => {
            const dauer = a.art === "dauerlastschrift";
            const ein = a.art !== "ueberweisung";
            const items = a.payment_order_items.filter((i) => i.aktiv);
            const termin = naechsterTermin(a);
            let summe = items.reduce((s, i) => s + (Number(i.betrag) || 0), 0);
            let hinweis: string | null = null;
            if (a.betragsquelle === "wirtschaftsplan") {
              const eig = (eigentuemer as any)[a.building_id] ?? [];
              const faktor = a.rhythmus ? SCHRITT[a.rhythmus] : 1;
              const am = (tag: string) =>
                items.reduce((s, i) => {
                  const e = eig.find((x: any) => x.assignmentId === i.assignment_id);
                  return s + (e ? hausgeldAm(e.hausgeldZeilen, tag) * faktor : 0);
                }, 0);
              summe = termin ? am(termin) : 0;
              // Kommt bald eine Hausgeldänderung?
              const spaeter = termin && a.rhythmus ? plusMonate(termin, SCHRITT[a.rhythmus] * 2) : null;
              if (termin && spaeter) {
                for (let n = 1; n <= 2; n++) {
                  const t = plusMonate(termin, SCHRITT[a.rhythmus!] * n);
                  const v = am(t);
                  if (Math.abs(v - summe) > 0.005) {
                    hinweis = `Ab ${format(new Date(t), "MM/yyyy")} neues Hausgeld (${euro(v)}) – wird automatisch übernommen`;
                    break;
                  }
                }
              }
            }
            const Icon = dauer ? Repeat : ein ? ArrowDownLeft : ArrowUpRight;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3.5 last:border-0">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    ein ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.titel}</span>
                    {a.status === "pausiert" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">pausiert</span>
                    ) : dauer ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">aktiv</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">in der Freigabe</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {dauer ? `Dauerlastschrift · ${RHYTHMUS[a.rhythmus ?? "monatlich"]}` : a.betragsquelle === "nachzahlung" ? "Sammelauftrag" : ein ? "Einzug" : "Überweisung"} ·{" "}
                    {items.length} {ein ? "Eigentümer" : "Empfänger"}
                    {a.betragsquelle === "wirtschaftsplan" ? " · Betrag laut Hausgeld" : ""}
                    <span className="hidden sm:inline"> · {ibanFormatiert(a.konto_iban)}</span>
                  </span>
                  {hinweis && <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{hinweis}</span>}
                </span>
                <span className="min-w-[140px] text-right">
                  <span className="block font-bold tabular-nums">
                    {euro(summe)}
                    {dauer && <span className="text-xs font-normal text-muted-foreground"> / {a.rhythmus === "monatlich" ? "Monat" : "Termin"}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {termin ? `${dauer ? "nächster Einzug" : ein ? "Einzug" : "am"} ${format(new Date(termin), "dd.MM.yyyy")}` : "beendet"}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={() => onBearbeiten(a.id)}>
                    <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Weitere Aktionen">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {a.status === "aktiv" ? (
                        <DropdownMenuItem onClick={() => setzen(a, "pausiert")}>
                          <Pause className="mr-2 h-4 w-4" /> Pausieren
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setzen(a, "aktiv")}>
                          <Play className="mr-2 h-4 w-4" /> Fortsetzen
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onKopieren(a.id)}>
                        <Copy className="mr-2 h-4 w-4" /> Kopieren
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setzen(a, "abgebrochen")}>
                        <XCircle className="mr-2 h-4 w-4" /> Beenden
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}
        </section>
      ))}
      <p className="text-sm text-muted-foreground">Gesendete und beendete Aufträge stehen unter „Erledigt“.</p>
    </div>
  );
}
