import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, Loader2, Search, Upload } from "lucide-react";
import { AbrufKnopf } from "@/components/konten/AbrufKnopf";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { betragAusSuche, euro } from "@/lib/bankInfo";
import { KontoAnsicht } from "@/components/konten/KontoAnsicht";
import { AuszugImport } from "@/components/konten/AuszugImport";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BewegungsListe } from "@/components/konten/BewegungsListe";
import { BEWEGUNG_SELECT, type KontoZeile } from "@/components/konten/kontenTypes";

const STORAGE_KEY = "konten:auswahl:v1";

function ladeAuswahl(): { filter?: string; offen?: string[]; tab?: Record<string, string> } {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Konten (Umbau 15.10.2026, Phase 1 der Bank-Automatisierung)
 *
 * Alle Kontobewegungen je Liegenschaft, jede verknüpft mit Rechnung und
 * Buchung. Eine Karte je Liegenschaft, standardmäßig zugeklappt; darin die
 * Konten als Reiter. Ersetzt in der Buchhaltung die Reiter „Kontoauszüge"
 * und „Kontenabgleich". Auszüge einlesen (Notlösung, bis der Abruf über
 * die Bank läuft) liegt unter Einstellungen › Bankzugänge.
 */
export default function Konten() {
  const { managementMode } = useManagementMode();
  const [importOffen, setImportOffen] = useState(false);
  const gespeichert = useMemo(ladeAuswahl, []);
  const [filter, setFilter] = useState<string>(gespeichert.filter ?? "alle");
  const [offen, setOffen] = useState<Set<string>>(new Set(gespeichert.offen ?? []));
  const [tabs, setTabs] = useState<Record<string, string>>(gespeichert.tab ?? {});
  const [suche, setSuche] = useState("");
  const [sucheAktiv, setSucheAktiv] = useState("");

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filter, offen: [...offen], tab: tabs }));
    } catch {
      /* egal */
    }
  }, [filter, offen, tabs]);

  // Suche erst nach kurzer Pause starten
  useEffect(() => {
    const t = setTimeout(() => setSucheAktiv(suche.trim()), 350);
    return () => clearTimeout(t);
  }, [suche]);

  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, management_mode")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: konten = [], isLoading } = useQuery({
    queryKey: ["konten-uebersicht"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });

  const liegenschaften = useMemo(() => {
    const kontenJe = new Map<string, KontoZeile[]>();
    konten.forEach((k) => {
      const l = kontenJe.get(k.building_id) ?? [];
      l.push(k);
      kontenJe.set(k.building_id, l);
    });
    return gebaeude
      .filter((g: any) => (g.management_mode ?? "weg") === managementMode && kontenJe.has(g.id))
      .map((g: any) => {
        const ks = (kontenJe.get(g.id) ?? []).sort((a, b) => kontoSortierung(a) - kontoSortierung(b) || (a.display_name ?? "").localeCompare(b.display_name ?? ""));
        const saldo = ks.reduce((s, k) => s + (k.saldo != null ? Number(k.saldo) : 0), 0);
        const offenGesamt = ks.reduce((s, k) => s + (k.offen ?? 0), 0);
        const stand = ks.map((k) => k.saldo_stand).filter(Boolean).sort().pop() ?? null;
        return { id: g.id as string, name: g.name as string, konten: ks, saldo, offen: offenGesamt, stand };
      });
  }, [gebaeude, konten, managementMode]);

  const namen = useMemo(() => Object.fromEntries(gebaeude.map((g: any) => [g.id, g.name])), [gebaeude]);
  const sichtbar = filter === "alle" ? liegenschaften : liegenschaften.filter((l) => l.id === filter);
  const offenAlle = liegenschaften.reduce((s, l) => s + l.offen, 0);
  const letzterStand = liegenschaften.map((l) => l.stand).filter(Boolean).sort().pop() as string | undefined;

  // Filter zurücksetzen, wenn die gewählte Liegenschaft im anderen Modus liegt
  useEffect(() => {
    if (filter !== "alle" && liegenschaften.length > 0 && !liegenschaften.some((l) => l.id === filter)) setFilter("alle");
  }, [filter, liegenschaften]);



  const umschalten = (id: string) =>
    setOffen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Konten</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">
            {letzterStand ? `Auszüge bis ${format(new Date(letzterStand), "dd.MM.yyyy")}` : "Noch keine Auszüge"}
            {offenAlle > 0 ? ` · ${offenAlle} noch nicht gebucht` : " · alles gebucht"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOffen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Auszug einlesen
          </Button>
          <AbrufKnopf />
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-11 sm:w-72" aria-label="Liegenschaft">
            <SelectValue placeholder="Alle Liegenschaften" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Liegenschaften</SelectItem>
            {liegenschaften.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Name, Verwendungszweck, Betrag, Rechnungsnummer …"
            className="h-11 pl-9"
            aria-label="Kontobewegungen suchen"
          />
        </div>
      </div>

      {sucheAktiv.length >= 2 ? (
        <SuchErgebnisse
          q={sucheAktiv}
          buildingIds={sichtbar.map((l) => l.id)}
          namen={namen}
        />
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sichtbar.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          Für {managementMode === "weg" ? "die WEGs" : "die Mietobjekte"} sind noch keine Bankkonten hinterlegt.
        </div>
      ) : (
        <div className="space-y-3">
          {sichtbar.map((l) => {
            const istOffen = offen.has(l.id) || sichtbar.length === 1;
            const aktiverTab = tabs[l.id] && l.konten.some((k) => k.iban === tabs[l.id]) ? tabs[l.id] : l.konten[0]?.iban;
            const konto = l.konten.find((k) => k.iban === aktiverTab);
            return (
              <section key={l.id} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => umschalten(l.id)}
                  aria-expanded={istOffen}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30 min-h-[68px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.konten.length} {l.konten.length === 1 ? "Konto" : "Konten"}
                      {l.stand ? ` · Stand ${format(new Date(l.stand), "dd.MM.yyyy")}` : ""}
                    </span>
                  </span>
                  {l.offen > 0 && (
                    <span className="hidden sm:inline rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {l.offen} noch nicht gebucht
                    </span>
                  )}
                  <span className="text-right font-semibold tabular-nums">{euro(l.saldo)}</span>
                  <ChevronRight className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", istOffen && "rotate-90")} />
                </button>

                {istOffen && (
                  <div className="border-t">
                    <div role="tablist" aria-label="Konto wählen" className="flex flex-wrap gap-x-6 border-b px-4">
                      {l.konten.map((k) => {
                        const aktiv = k.iban === aktiverTab;
                        return (
                          <button
                            key={k.iban}
                            type="button"
                            role="tab"
                            aria-selected={aktiv}
                            onClick={() => setTabs((t) => ({ ...t, [l.id]: k.iban }))}
                            className={cn(
                              "-mb-px inline-flex min-h-[46px] items-center gap-2 border-b-2 text-sm transition-colors",
                              aktiv ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {k.display_name || "Konto"}
                            <span className="tabular-nums text-xs text-muted-foreground">{k.saldo != null ? euro(k.saldo) : ""}</span>
                            {k.offen > 0 && (
                              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                                {k.offen}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {konto && <KontoAnsicht key={konto.iban} konto={konto} buildingName={l.name} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Hausgeld-/Girokonto vor Rücklage, Rest danach. */
function kontoSortierung(k: KontoZeile): number {
  const n = (k.display_name ?? "").toLowerCase();
  if (n.includes("rücklage") || n.includes("ruecklage") || n.includes("instandhaltung")) return 2;
  if (n.includes("kaution")) return 3;
  return 1;
}

/**
 * Suche über alle Kontobewegungen der sichtbaren Liegenschaften:
 * Name, Verwendungszweck, IBAN, Betrag oder Rechnungsnummer.
 */
function SuchErgebnisse({ q, buildingIds, namen }: { q: string; buildingIds: string[]; namen: Record<string, string> }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["konten-suche", q, buildingIds.join(",")],
    enabled: buildingIds.length > 0,
    queryFn: async () => {
      const betrag = betragAusSuche(q);
      const muster = `%${q.replace(/[%,()]/g, " ").trim()}%`;
      const bedingungen = [
        `purpose.ilike.${muster}`,
        `creditor_name.ilike.${muster}`,
        `debtor_name.ilike.${muster}`,
        `creditor_iban.ilike.${muster.replace(/\s/g, "")}`,
        `debtor_iban.ilike.${muster.replace(/\s/g, "")}`,
      ];
      if (betrag != null) bedingungen.push(`amount.eq.${betrag}`, `amount.eq.${-betrag}`);

      // Rechnungsnummer → verknüpfte Bewegungen
      const { data: rechnungen } = await supabase
        .from("invoices")
        .select("id")
        .ilike("invoice_number", muster)
        .in("building_id", buildingIds)
        .limit(50);
      const rIds = (rechnungen ?? []).map((r: any) => r.id);
      if (rIds.length) bedingungen.push(`matched_invoice_id.in.(${rIds.join(",")})`);

      const { data, error } = await supabase
        .from("bank_transactions")
        .select(BEWEGUNG_SELECT)
        .in("building_id", buildingIds)
        .or(bedingungen.join(","))
        .order("booking_date", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3 text-sm text-muted-foreground">
        {isLoading ? "Suche läuft …" : `${data.length}${data.length === 150 ? "+" : ""} Treffer für „${q}"`}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BewegungsListe txns={data} liegenschaftsNamen={namen} zeigeLiegenschaft leerText="Nichts gefunden. Suche oder Liegenschaft ändern." />
      )}
    </div>
  );
}
