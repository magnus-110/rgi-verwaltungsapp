/**
 * Aufnahme › Eigentümer (am Computer): wer den Fragebogen ausgefüllt hat,
 * was den Eigentümern am Gebäude aufgefallen ist und was ihnen wichtig ist.
 * Darunter Einladung, Fortschritt und Freigaben wie bisher.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BuildingOnboardingTab } from "@/components/buildings/BuildingOnboardingTab";

const BEREICHE: Record<string, string> = {
  dach: "Dach",
  fassade: "Fassade",
  treppenhaus: "Treppenhaus",
  keller: "Keller",
  eingang: "Eingang",
  sonstiges: "Sonstiges",
};

interface Zeile {
  assignmentId: string;
  einheit: string | null;
  name: string;
  status: "fertig" | "angefangen" | "offen" | "ohne Zugang";
  zusatz: string;
  step: any;
}

export function EigentuemerReiter({ buildingId, managementMode }: { buildingId: string; managementMode: "weg" | "rent" }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [details, setDetails] = useState(false);
  const [legtAn, setLegtAn] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["aufnahme-eigentuemer-fragebogen", buildingId],
    queryFn: async () => {
      const [{ data: zuord }, { data: prog }] = await Promise.all([
        supabase
          .from("contact_building_assignments")
          .select("id, unit_number, first_name_override, last_name_override, company_name_override, contacts(user_id, first_name, last_name, company_name)")
          .eq("building_id", buildingId)
          .eq("role_in_building", "eigentuemer" as any)
          .neq("is_active", false)
          .order("unit_number"),
        (supabase as any).from("onboarding_progress").select("*").eq("building_id", buildingId),
      ]);
      return { zuord: zuord ?? [], prog: (prog ?? []) as any[] };
    },
  });

  const zeilen: Zeile[] = useMemo(() => {
    if (!data) return [];
    return data.zuord.map((z: any) => {
      const name =
        z.company_name_override ||
        [z.first_name_override, z.last_name_override].filter(Boolean).join(" ") ||
        z.contacts?.company_name ||
        [z.contacts?.first_name, z.contacts?.last_name].filter(Boolean).join(" ") ||
        "Eigentümer";
      const uid = z.contacts?.user_id;
      const p = uid ? data.prog.find((x) => x.user_id === uid) : null;
      const sd = p?.step_data ?? {};
      let status: Zeile["status"] = "offen";
      let zusatz = "Noch nicht angefangen";
      if (!uid) {
        status = "ohne Zugang";
        zusatz = "Hat noch keinen Zugang zur App";
      } else if (p?.fully_completed_at || p?.step5_completed_at) {
        status = "fertig";
        const teile = [];
        if (sd.step1?.sepa_mandate_accepted) teile.push("Mandat erteilt");
        if ((sd.step3?.problem_areas ?? []).length) teile.push(`${sd.step3.problem_areas.length} Hinweise`);
        zusatz = teile.join(" · ") || "Ausgefüllt";
      } else if (p?.step1_completed_at) {
        status = "angefangen";
        zusatz = p.step3_completed_at ? "Schritt 3 von 3 offen" : "Schritt 2 von 3 offen";
      }
      return { assignmentId: z.id, einheit: z.unit_number, name, status, zusatz, step: sd };
    });
  }, [data]);

  const hinweise = useMemo(() => {
    const m = new Map<string, { bereich: string; wer: string[]; texte: string[]; fotos: { path: string; name: string }[] }>();
    zeilen.forEach((z) => {
      const s3 = z.step?.step3 ?? {};
      (s3.problem_areas ?? []).forEach((a: string) => {
        const e = m.get(a) ?? { bereich: BEREICHE[a] ?? a, wer: [], texte: [], fotos: [] };
        e.wer.push(z.name);
        const t = s3.problem_notes?.[a];
        if (t) e.texte.push(t);
        e.fotos.push(...(s3.problem_fotos?.[a] ?? []));
        m.set(a, e);
      });
      if (s3.notes) {
        const e = m.get("_frei") ?? { bereich: "Weitere Hinweise", wer: [], texte: [], fotos: [] };
        e.wer.push(z.name);
        e.texte.push(s3.notes);
        m.set("_frei", e);
      }
    });
    return [...m.values()].sort((a, b) => b.wer.length - a.wer.length);
  }, [zeilen]);

  const wichtig = useMemo(() => {
    const texte: { text: string; wer: string }[] = [];
    const beirat: string[] = [];
    const kasse: string[] = [];
    const orte: string[] = [];
    zeilen.forEach((z) => {
      const s1 = z.step?.step1 ?? {};
      const s5 = z.step?.step5 ?? {};
      if (s1.expectations) texte.push({ text: s1.expectations, wer: z.name });
      if (s5.notes) texte.push({ text: s5.notes, wer: z.name });
      if (s5.is_beirat_member || s5.willing_beirat) beirat.push(z.name);
      if (s5.willing_cash_audit) kasse.push(z.name);
      if (s5.etv_location) orte.push(s5.etv_location);
    });
    return { texte, beirat, kasse, orte };
  }, [zeilen]);

  const vorgangAnlegen = async (h: { bereich: string; wer: string[]; texte: string[] }) => {
    setLegtAn(h.bereich);
    const { data: u } = await supabase.auth.getUser();
    const { data: c, error } = await supabase
      .from("cases")
      .insert([
        {
          building_id: buildingId,
          management_mode: managementMode,
          title: `${h.bereich}: Hinweis von Eigentümern`,
          description: `Aus dem Fragebogen der Eigentümer (${h.wer.join(", ")}):\n\n${h.texte.map((t) => `– ${t}`).join("\n") || "ohne Beschreibung"}`,
          category: "maengel",
          priority: "medium",
          created_by: u.user?.id,
        },
      ] as any)
      .select("id")
      .single();
    setLegtAn(null);
    if (error) return toast.error("Vorgang konnte nicht angelegt werden: " + error.message);
    qc.invalidateQueries({ queryKey: ["cases-all"] });
    toast.success("Vorgang angelegt", { action: { label: "Öffnen", onClick: () => navigate(`/vorgaenge/${c.id}`) } });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fertig = zeilen.filter((z) => z.status === "fertig").length;
  const mandate = zeilen.filter((z) => z.step?.step1?.sepa_mandate_accepted).length;
  const stil: Record<Zeile["status"], string> = {
    fertig: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    angefangen: "bg-primary/10 text-primary",
    offen: "bg-muted text-muted-foreground",
    "ohne Zugang": "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Fragebogen ausgefüllt", `${fertig} von ${zeilen.length}`],
          ["Mandate erteilt", String(mandate)],
          ["Hinweise am Gebäude", String(hinweise.reduce((n, h) => n + h.wer.length, 0))],
          ["Bereit für Beirat / Kasse", String(wichtig.beirat.length + wichtig.kasse.length)],
        ].map(([l, w]) => (
          <div key={l} className="rounded-xl border bg-card px-4 py-3">
            <div className="text-[13px] text-muted-foreground">{l}</div>
            <div className="text-2xl font-semibold">{w}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="min-w-0 flex-[1_1_380px] overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <div className="font-semibold">Eigentümer</div>
            <div className="text-[13px] text-muted-foreground">Fragebogen: Daten · Aufgefallen · Wichtig</div>
          </div>
          {zeilen.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Noch keine Eigentümer angelegt.</div>
          ) : (
            zeilen.map((z) => (
              <div key={z.assignmentId} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-4 py-2.5 last:border-b-0">
                <span className="text-[13px] text-muted-foreground">{z.einheit ?? "–"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{z.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{z.zusatz}</span>
                </span>
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", stil[z.status])}>{z.status}</span>
              </div>
            ))
          )}
        </section>

        <div className="min-w-0 flex-[1.4_1_420px] space-y-5">
          <section className="rounded-xl border bg-card px-4 pb-2">
            <div className="pt-3 font-semibold">Das ist den Eigentümern aufgefallen</div>
            <div className="pb-2 text-[13px] text-muted-foreground">Gleiche Bereiche sind zusammengefasst.</div>
            {hinweise.length === 0 ? (
              <div className="border-t py-4 text-sm text-muted-foreground">Bisher nichts gemeldet.</div>
            ) : (
              hinweise.map((h) => (
                <div key={h.bereich} className="flex flex-wrap items-start justify-between gap-3 border-t py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{h.bereich}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.wer.length} {h.wer.length === 1 ? "Eigentümer" : "Eigentümer"}: {h.wer.join(", ")}
                    </div>
                    {h.fotos.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {h.fotos.map((f, i) => (
                          <button
                            key={f.path}
                            type="button"
                            onClick={async () => {
                              const { data } = await supabase.storage.from("onboarding-attachments").createSignedUrl(f.path, 600);
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                              else toast.error("Foto konnte nicht geöffnet werden");
                            }}
                            className="rounded-full border px-2.5 py-0.5 text-xs text-primary hover:bg-primary/5"
                          >
                            Foto {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {h.texte.map((t, i) => (
                      <div key={i} className="mt-1 text-sm text-muted-foreground">
                        „{t}“
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="h-9 border-primary text-primary" onClick={() => vorgangAnlegen(h)} disabled={legtAn === h.bereich}>
                    {legtAn === h.bereich && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Vorgang anlegen
                  </Button>
                </div>
              ))
            )}
          </section>

          <section className="rounded-xl border bg-card px-4 pb-2">
            <div className="py-3 font-semibold">Das ist ihnen wichtig</div>
            {wichtig.texte.length === 0 && !wichtig.beirat.length && !wichtig.kasse.length && !wichtig.orte.length ? (
              <div className="border-t py-4 text-sm text-muted-foreground">Bisher keine Angaben.</div>
            ) : (
              <>
                {wichtig.texte.map((t, i) => (
                  <div key={i} className="border-t py-2.5 text-sm">
                    „{t.text}“ <span className="text-xs text-muted-foreground">– {t.wer}</span>
                  </div>
                ))}
                {wichtig.beirat.length > 0 && <div className="border-t py-2.5 text-sm">Bereit für den Beirat: {wichtig.beirat.join(", ")}</div>}
                {wichtig.kasse.length > 0 && <div className="border-t py-2.5 text-sm">Bereit für die Kassenprüfung: {wichtig.kasse.join(", ")}</div>}
                {wichtig.orte.length > 0 && <div className="border-t py-2.5 text-sm">Wunsch-Ort für die Versammlung: {[...new Set(wichtig.orte)].join(", ")}</div>}
              </>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        <button type="button" onClick={() => setDetails(!details)} className="flex w-full items-center justify-between px-4 py-3.5 text-left">
          <span>
            <span className="font-semibold">Einladung, Willkommensbriefe und Freigaben</span>
            <span className="block text-[13px] text-muted-foreground">Fragebogen ein- oder ausschalten, Briefe mit Zugangsdaten erstellen, Angaben übernehmen</span>
          </span>
          <ChevronDown className={cn("h-5 w-5 transition-transform", details && "rotate-180")} />
        </button>
        {details && (
          <div className="border-t p-3 md:p-5">
            <BuildingOnboardingTab buildingId={buildingId} />
          </div>
        )}
      </section>
    </div>
  );
}
