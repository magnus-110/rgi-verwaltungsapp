/**
 * Aufnahme neuer Liegenschaften.
 *  /aufnahme              – laufende Aufnahmen und neue starten
 *  /aufnahme/:buildingId  – Termin vor Ort (Tablet) und Eigentümer (Computer)
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, ClipboardList, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TerminVorOrt, type AufnahmeGebaeude } from "@/components/aufnahme/TerminVorOrt";
import { EigentuemerReiter } from "@/components/aufnahme/EigentuemerReiter";

export default function Aufnahme() {
  const { buildingId } = useParams();
  return buildingId ? <AufnahmeGebaeudeSeite key={buildingId} buildingId={buildingId} /> : <AufnahmeListe />;
}

function AufnahmeListe() {
  const navigate = useNavigate();
  const [neu, setNeu] = useState<string>("");

  const { data: gebaeude = [] } = useQuery({
    queryKey: ["aufnahme-gebaeude-auswahl"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      return data ?? [];
    },
  });
  const { data: laufend = [], isLoading } = useQuery({
    queryKey: ["aufnahmen-liste"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("aufnahmen")
        .select("building_id, termin_am, updated_at, abgeschlossen_am, buildings(name, management_mode, management_start_date)")
        .order("updated_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const vorhanden = useMemo(() => new Set(laufend.map((a) => a.building_id)), [laufend]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-3 md:p-0">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Aufnahme</h1>
        <p className="mt-1.5 text-sm text-muted-foreground md:text-base">
          Neue Liegenschaften aufnehmen: Termin vor Ort mit Beirat oder Vorverwaltung am Tablet, dazu der Fragebogen der Eigentümer in der App.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <div className="text-sm font-semibold">Neue Aufnahme</div>
          <Select value={neu} onValueChange={setNeu}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Gebäude wählen" />
            </SelectTrigger>
            <SelectContent>
              {gebaeude.map((g: any) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                  {vorhanden.has(g.id) ? " · läuft schon" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="h-12 rounded-xl px-6" disabled={!neu} onClick={() => navigate(`/aufnahme/${neu}`)}>
          Aufnahme öffnen
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Laufende Aufnahmen</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : laufend.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Noch keine Aufnahme angefangen.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {laufend.map((a) => (
              <Link
                key={a.building_id}
                to={`/aufnahme/${a.building_id}`}
                className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0 hover:bg-muted/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.buildings?.name ?? "Gebäude"}</div>
                  <div className="truncate text-[13px] text-muted-foreground">
                    {[
                      a.buildings?.management_mode === "rent" ? "Miete" : "WEG",
                      a.termin_am ? `Termin am ${new Date(a.termin_am).toLocaleDateString("de-DE")}` : null,
                      a.buildings?.management_start_date ? `Übernahme zum ${new Date(a.buildings.management_start_date).toLocaleDateString("de-DE")}` : null,
                      `zuletzt ${formatDistanceToNow(new Date(a.updated_at), { addSuffix: true, locale: de })}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AufnahmeGebaeudeSeite({ buildingId }: { buildingId: string }) {
  const [params, setParams] = useSearchParams();
  const { data: gebaeude, isLoading } = useQuery({
    queryKey: ["aufnahme-gebaeude", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, management_mode, management_start_date" as any)
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data as unknown as AufnahmeGebaeude;
    },
  });
  const { data: einheiten } = useQuery({
    queryKey: ["aufnahme-einheiten", buildingId],
    queryFn: async () => {
      const { count } = await supabase
        .from("contact_building_assignments")
        .select("id", { count: "exact", head: true })
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer" as any)
        .neq("is_active", false);
      return count ?? 0;
    },
  });

  if (isLoading || !gebaeude) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const istWeg = gebaeude.management_mode === "weg";
  const reiter = istWeg && params.get("reiter") === "eigentuemer" ? "eigentuemer" : "termin";

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 md:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/aufnahme" aria-label="Zur Übersicht" className="flex h-11 w-11 items-center justify-center rounded-xl border hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="text-[13px] text-muted-foreground">Aufnahme</div>
            <h1 className="text-xl font-bold md:text-2xl">
              {gebaeude.name}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                · {istWeg ? "WEG" : "Miete"}
                {einheiten ? `, ${einheiten} Einheiten` : ""}
              </span>
            </h1>
          </div>
        </div>
        {istWeg && (
          <div className="flex gap-2">
            {(
              [
                ["termin", "Termin vor Ort"],
                ["eigentuemer", "Eigentümer"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setParams(id === "termin" ? {} : { reiter: id }, { replace: true })}
                className={cn(
                  "h-11 rounded-full border px-5 text-[15px]",
                  reiter === id ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card font-medium hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {reiter === "termin" ? <TerminVorOrt gebaeude={gebaeude} /> : <EigentuemerReiter buildingId={buildingId} managementMode={gebaeude.management_mode} />}
    </div>
  );
}
