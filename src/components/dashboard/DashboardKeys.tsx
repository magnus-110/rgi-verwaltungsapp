// Startseite: „Ausgegebene Schlüssel“ — alle Schlüssel, die noch nicht zurück sind.
// Überfällige Rückgaben stehen oben.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, fmt, relativTag } from "./dashboardDates";

const MAX_EINTRAEGE = 6;

type Ausleihe = {
  id: string;
  building_id: string;
  borrower_name: string | null;
  issued_at: string | null;
  due_at: string | null;
  key_tags: { tag_number: string | null } | null;
  buildings: { name: string | null } | null;
};

export function DashboardKeys() {
  const navigate = useNavigate();

  const { data: ausleihen = [], isLoading } = useQuery({
    queryKey: ["dashboard-ausgegebene-schluessel"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("key_loans")
        .select("id, building_id, borrower_name, issued_at, due_at, key_tags!key_loans_tag_id_fkey(tag_number), buildings(name)")
        .is("returned_at", null);
      if (error) throw error;
      const rows = (data || []) as Ausleihe[];
      // Mit Rückgabedatum zuerst (früheste oben), ohne Rückgabedatum danach (neueste Ausgabe oben)
      return rows.sort((a, b) => {
        if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        if (a.due_at) return -1;
        if (b.due_at) return 1;
        return new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime();
      });
    },
    staleTime: 60_000,
  });

  const sichtbar = ausleihen.slice(0, MAX_EINTRAEGE);

  return (
    <section aria-labelledby="h-schluessel" className="rounded-xl border bg-card flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 id="h-schluessel" className="text-base font-semibold">Ausgegebene Schlüssel</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "…" : `${ausleihen.length} noch nicht zurück`}
          </p>
        </div>
        <button type="button" onClick={() => navigate("/schluessel")} className="text-sm font-semibold text-primary hover:underline shrink-0">
          Alle Schlüssel
        </button>
      </div>

      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Laden…</p>
      ) : sichtbar.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Aktuell sind keine Schlüssel ausgegeben.</p>
      ) : (
        <ul className="px-2 pb-2">
          {sichtbar.map((a) => {
            const rel = a.due_at ? relativTag(new Date(a.due_at)) : null;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/buildings/${a.building_id}?tab=keys`)}
                  className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 border-t first:border-t-0 border-border/60 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="min-w-0 flex flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">
                      {a.key_tags?.tag_number ? `Nr. ${a.key_tags.tag_number} · ` : ""}
                      {a.borrower_name || "Unbekannt"}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {a.buildings?.name || "—"}
                      {a.issued_at ? ` · seit ${fmt(a.issued_at, "dd.MM.")}` : ""}
                    </span>
                  </span>
                  {rel ? (
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap",
                        TONE_CLASSES[rel.days < 0 ? "red" : "neutral"],
                      )}
                      title={`Rückgabe bis ${fmt(a.due_at, "dd.MM.yyyy")}`}
                    >
                      {rel.days < 0 ? "überfällig" : `bis ${fmt(a.due_at, "dd.MM.")}`}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">ohne Frist</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ausleihen.length > MAX_EINTRAEGE && (
        <p className="px-5 pb-4 text-xs text-muted-foreground">+ {ausleihen.length - MAX_EINTRAEGE} weitere</p>
      )}
    </section>
  );
}
