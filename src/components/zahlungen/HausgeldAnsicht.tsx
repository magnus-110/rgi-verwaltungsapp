import { useEffect, useMemo, useState } from "react";
import { gebaeudeMerken, gemerktesGebaeude } from "@/lib/gemerktesGebaeude";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Pencil, Plus, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { euro, ibanFormatiert } from "@/lib/bankInfo";
import { hausgeldAm, ladeEigentuemer, mandatBereit, type Eigentuemer } from "@/lib/eigentuemer";
import { heuteIso } from "@/lib/auftraege";
import { EigentuemerBearbeiten } from "./EigentuemerBearbeiten";
import { naechsterTermin, useLaufendeAuftraege } from "./AuftraegeListe";

const RHYTHMUS: Record<string, string> = { monatlich: "Monatlich", quartal: "Vierteljährlich", halbjahr: "Halbjährlich", jahr: "Jährlich" };
const SCHRITT: Record<string, number> = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 };
const datum = (d: string | null) => (d ? format(new Date(d), "dd.MM.yyyy") : "–");

/** Nächste künftige Änderung des Hausgelds (Zeile, die nach heute beginnt). */
export function naechsteAenderung(e: Eigentuemer): { ab: string; betrag: number } | null {
  const heute = heuteIso();
  const ab = e.hausgeldZeilen
    .map((z) => z.valid_from)
    .filter((d): d is string => !!d && d > heute)
    .sort()[0];
  return ab ? { ab, betrag: hausgeldAm(e.hausgeldZeilen, ab) } : null;
}

/**
 * Zahlungen › Hausgeld: das Hausgeld je Eigentümer an einer Stelle. Die
 * Dauerlastschrift zieht immer den Betrag ein, der am Einzugstag gilt –
 * eine Änderung hier braucht also keinen neuen Auftrag.
 */
export function HausgeldAnsicht({
  buildingFilter,
  onAendern,
  onBearbeiten,
  onDauerlastschriftNeu,
  onGebaeude,
}: {
  buildingFilter: string;
  /** gewähltes Gebäude an die Zahlungen-Seite melden (gilt dann auch für die anderen Reiter) */
  onGebaeude?: (buildingId: string) => void;
  onAendern: (buildingId: string) => void;
  onBearbeiten: (orderId: string) => void;
  onDauerlastschriftNeu: (buildingId: string) => void;
}) {
  const { managementMode } = useManagementMode();
  const { data: gebaeude = [] } = useQuery({
    queryKey: ["hausgeld-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const liste = gebaeude.filter((g: any) => (g.management_mode ?? "weg") === managementMode);
  const [buildingId, setBuildingIdRoh] = useState("");
  const [bearbeiten, setBearbeiten] = useState<Eigentuemer | null>(null);
  const setBuildingId = (id: string) => {
    setBuildingIdRoh(id);
    gebaeudeMerken(id);
    onGebaeude?.(id);
  };
  useEffect(() => {
    const gemerkt = gemerktesGebaeude();
    if (buildingFilter !== "all" && buildingFilter !== "company" && liste.some((g: any) => g.id === buildingFilter)) setBuildingIdRoh(buildingFilter);
    else if (!buildingId && gemerkt && liste.some((g: any) => g.id === gemerkt)) setBuildingIdRoh(gemerkt);
    else if (!buildingId && liste.length) setBuildingIdRoh(liste[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingFilter, liste.length]);

  const { data: eigentuemer = [], isLoading } = useQuery({
    queryKey: ["mandate", buildingId],
    enabled: !!buildingId,
    queryFn: () => ladeEigentuemer(buildingId),
  });
  const { data: auftraege = [] } = useLaufendeAuftraege();
  const dauer = auftraege.filter((a) => a.art === "dauerlastschrift" && a.building_id === buildingId);

  const summe = eigentuemer.reduce((s, e) => s + e.hausgeldMonat, 0);
  const aenderungen = useMemo(() => eigentuemer.map((e) => naechsteAenderung(e)), [eigentuemer]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={buildingId} onValueChange={setBuildingId}>
          <SelectTrigger className="h-11 w-full max-w-sm text-sm" aria-label="Liegenschaft">
            <SelectValue placeholder="Liegenschaft wählen" />
          </SelectTrigger>
          <SelectContent>
            {liste.map((g: any) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dauerlastschrift(en) */}
      {buildingId &&
        dauer.map((a) => {
          const termin = naechsterTermin(a);
          const faktor = a.rhythmus ? SCHRITT[a.rhythmus] : 1;
          const items = a.payment_order_items.filter((i) => i.aktiv);
          const betrag = (tag: string | null) =>
            !tag
              ? 0
              : a.betragsquelle === "wirtschaftsplan"
                ? items.reduce((s, i) => {
                    const e = eigentuemer.find((x) => x.assignmentId === i.assignment_id);
                    return s + (e ? hausgeldAm(e.hausgeldZeilen, tag) * faktor : 0);
                  }, 0)
                : items.reduce((s, i) => s + (Number(i.betrag) || 0), 0);
          const tag = a.faellig_am ? Number(a.faellig_am.slice(8, 10)) : 1;
          return (
            <section key={a.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Repeat className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{a.titel || "Dauerlastschrift"}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        a.status === "pausiert" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                      )}
                    >
                      {a.status === "pausiert" ? "pausiert" : "aktiv"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {RHYTHMUS[a.rhythmus ?? "monatlich"]} am {tag}. · {items.length} Eigentümer ·{" "}
                    {a.betragsquelle === "wirtschaftsplan" ? "nimmt immer das Hausgeld, das am Einzugstag gilt" : "fester Betrag"}
                  </div>
                  {a.verwendungszweck && <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{a.verwendungszweck}</div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nächster Einzug</div>
                  <div className="font-bold tabular-nums">{datum(termin)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Betrag</div>
                  <div className="font-bold tabular-nums">{euro(betrag(termin))}</div>
                </div>
                <Button variant="outline" className="h-11" onClick={() => onBearbeiten(a.id)}>
                  Bearbeiten
                </Button>
              </div>
            </section>
          );
        })}
      {buildingId && !dauer.length && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card px-5 py-4">
          <div className="text-sm text-muted-foreground">Für diese Liegenschaft gibt es noch keine Dauerlastschrift für das Hausgeld.</div>
          <Button variant="outline" className="h-11" onClick={() => onDauerlastschriftNeu(buildingId)}>
            <Plus className="mr-2 h-4 w-4" /> Dauerlastschrift anlegen
          </Button>
        </section>
      )}

      {/* Eigentümer */}
      {buildingId && (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <div className="text-lg font-bold">Hausgeld je Eigentümer</div>
              <div className="text-sm text-muted-foreground">Was heute gilt – Änderungen mit „gültig ab“.</div>
            </div>
            <Button className="h-11" onClick={() => onAendern(buildingId)} disabled={!eigentuemer.length}>
              <Pencil className="mr-2 h-4 w-4" /> Hausgeld ändern
            </Button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !eigentuemer.length ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Keine Eigentümer hinterlegt.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm md:text-[15px]">
                <thead>
                  <tr className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5">Einheit</th>
                    <th className="px-3 py-2.5">Eigentümer</th>
                    <th className="px-3 py-2.5">Mandat</th>
                    <th className="px-3 py-2.5 text-right">Hausgeld / Monat</th>
                    <th className="px-5 py-2.5">Gültig ab</th>
                  </tr>
                </thead>
                <tbody>
                  {eigentuemer.map((e, i) => {
                    const neu = aenderungen[i];
                    return (
                      <tr key={e.assignmentId} className="border-t">
                        <td className="px-5 py-3">
                          <div className="font-semibold tabular-nums">{e.einheit || "–"}</div>
                          {e.lage && <div className="text-xs text-muted-foreground">{e.lage}</div>}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          <button type="button" onClick={() => setBearbeiten(e)} className="group inline-flex items-center gap-1.5 text-left hover:text-primary" title="Name und Konto bearbeiten">
                            {e.name}
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {mandatBereit(e.mandat) ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">✓ Mandat</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">kein Mandat</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="font-bold tabular-nums">{euro(e.hausgeldMonat)}</div>
                          {neu && (
                            <div className="text-xs font-medium tabular-nums text-blue-700 dark:text-blue-300">
                              ab {format(new Date(neu.ab), "MM/yyyy")}: {euro(neu.betrag)}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-muted-foreground">{datum(e.hausgeldAb)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40">
                    <td colSpan={3} className="px-5 py-3 font-bold">
                      Summe
                    </td>
                    <td className="px-3 py-3 text-right font-extrabold tabular-nums">{euro(summe)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}
      {dauer[0] && <p className="text-sm text-muted-foreground">Konto der Dauerlastschrift: {ibanFormatiert(dauer[0].konto_iban)}</p>}
      <EigentuemerBearbeiten eigentuemer={bearbeiten} onClose={() => setBearbeiten(null)} />
    </div>
  );
}
