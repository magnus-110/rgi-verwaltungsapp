/**
 * Aufnahme › „Festhalten": was Eigentümer vor Ort zeigen, sofort als Notiz
 * oder Vorgang mit Fotos erfassen.
 *  - Notiz: bleibt in der Aufnahme (aufnahme_eintraege)
 *  - Vorgang: wird zusätzlich als Vorgang beim Gebäude angelegt, Fotos hängen dran
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ORTE } from "@/lib/aufnahme";
import { Chip, TextFeld } from "./teile";

interface Foto {
  datei: File;
  vorschau: string;
  pfad?: string;
  fehler?: boolean;
}

export interface Eintrag {
  id: string;
  art: "notiz" | "vorgang";
  titel: string;
  text: string | null;
  ort: string | null;
  gezeigt_von: string | null;
  eile: string | null;
  fotos: { name: string; path: string; mime: string; size: number }[];
  case_id: string | null;
  created_at: string;
}

export function useEintraege(buildingId: string) {
  return useQuery({
    queryKey: ["aufnahme-eintraege", buildingId],
    queryFn: async (): Promise<Eintrag[]> => {
      const { data, error } = await (supabase as any)
        .from("aufnahme_eintraege")
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const EILE: Record<string, "medium" | "high" | "urgent"> = { normal: "medium", bald: "high", dringend: "urgent" };

export function FesthaltenDialog({
  open,
  onOpenChange,
  buildingId,
  managementMode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  managementMode: "weg" | "rent";
}) {
  const qc = useQueryClient();
  const { data: eintraege = [] } = useEintraege(buildingId);
  const [art, setArt] = useState<"notiz" | "vorgang">("vorgang");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [ort, setOrt] = useState<string | null>(null);
  const [gezeigt, setGezeigt] = useState("");
  const [eile, setEile] = useState<"normal" | "bald" | "dringend">("normal");
  const [laeuft, setLaeuft] = useState(false);
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);

  const leeren = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.vorschau));
    setFotos([]);
    setTitel("");
    setText("");
    setOrt(null);
    setGezeigt("");
    setEile("normal");
  };
  useEffect(() => {
    if (!open) leeren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hochladen = async (liste: FileList | null) => {
    if (!liste?.length) return;
    const neu: Foto[] = Array.from(liste).map((datei) => ({ datei, vorschau: URL.createObjectURL(datei) }));
    setFotos((f) => [...f, ...neu]);
    for (const f of neu) {
      const ext = (f.datei.name.split(".").pop() || "jpg").toLowerCase();
      const pfad = `aufnahme/${buildingId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("building-files").upload(pfad, f.datei, { contentType: f.datei.type || "image/jpeg" });
      setFotos((alle) => alle.map((x) => (x.vorschau === f.vorschau ? { ...x, pfad: error ? undefined : pfad, fehler: !!error } : x)));
      if (error) toast.error("Foto konnte nicht hochgeladen werden: " + error.message);
    }
  };

  const speichern = async () => {
    if (!titel.trim() && !text.trim() && !fotos.length) return toast.error("Bitte kurz beschreiben, was es ist.");
    if (fotos.some((f) => !f.pfad && !f.fehler)) return toast.info("Die Fotos laden noch – gleich nochmal tippen.");
    setLaeuft(true);
    try {
      const anhaenge = fotos
        .filter((f) => f.pfad)
        .map((f) => ({ name: f.datei.name || "Foto.jpg", path: f.pfad!, mime: f.datei.type || "image/jpeg", size: f.datei.size }));
      const titelFertig = titel.trim() || text.trim().split(/[.\n]/)[0].slice(0, 80) || "Vor Ort festgehalten";
      const beschreibung = [text.trim(), ort ? `Wo: ${ort}` : "", gezeigt.trim() ? `Gezeigt von: ${gezeigt.trim()}` : "", "Bei der Aufnahme vor Ort festgehalten."]
        .filter(Boolean)
        .join("\n");
      let caseId: string | null = null;
      if (art === "vorgang") {
        const { data: u } = await supabase.auth.getUser();
        const { data: c, error } = await supabase
          .from("cases")
          .insert([
            {
              building_id: buildingId,
              management_mode: managementMode,
              title: titelFertig,
              description: beschreibung,
              category: "maengel",
              priority: EILE[eile],
              created_by: u.user?.id,
            },
          ] as any)
          .select("id")
          .single();
        if (error) throw error;
        caseId = c.id;
        if (anhaenge.length) {
          const { error: e2 } = await supabase.functions.invoke("case-add-event", {
            body: { case_id: caseId, event_type: "image", title: "Fotos vom Termin vor Ort", body: text.trim() || undefined, attachments: anhaenge },
          });
          if (e2) toast.warning("Vorgang angelegt, Fotos konnten aber nicht angehängt werden.");
        }
        qc.invalidateQueries({ queryKey: ["cases-all"] });
        qc.invalidateQueries({ queryKey: ["cases", buildingId] });
      }
      const { error } = await (supabase as any).from("aufnahme_eintraege").insert({
        building_id: buildingId,
        art,
        titel: titelFertig,
        text: text.trim() || null,
        ort,
        gezeigt_von: gezeigt.trim() || null,
        eile: art === "vorgang" ? eile : null,
        fotos: anhaenge,
        case_id: caseId,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["aufnahme-eintraege", buildingId] });
      toast.success(art === "vorgang" ? "Vorgang angelegt" : "Notiz gespeichert");
      leeren();
    } catch (e: any) {
      toast.error("Konnte nicht gespeichert werden: " + (e?.message ?? ""));
    } finally {
      setLaeuft(false);
    }
  };

  const heute = new Date().toDateString();
  const vonHeute = eintraege.filter((e) => new Date(e.created_at).toDateString() === heute);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[94vh] max-w-5xl grid-rows-[auto] gap-0 overflow-hidden rounded-2xl p-0 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="max-h-[94vh] space-y-4 overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle className="text-xl">Vor Ort festhalten</DialogTitle>
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              {(["notiz", "vorgang"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={art === a}
                  onClick={() => setArt(a)}
                  className={cn("h-11 rounded-lg px-5 text-[15px]", art === a ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
                >
                  {a === "notiz" ? "Notiz" : "Vorgang"}
                </button>
              ))}
            </div>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">
            {art === "vorgang"
              ? "Wird sofort als Vorgang beim Gebäude angelegt – mit Fotos, damit sich jemand darum kümmert."
              : "Bleibt als Notiz in der Aufnahme – zum Nachlesen am Computer."}
          </p>

          <div>
            <div className="mb-2 text-sm font-semibold">Fotos</div>
            <div className="flex flex-wrap gap-2.5">
              {fotos.map((f) => (
                <div key={f.vorschau} className="relative h-24 w-32 overflow-hidden rounded-xl bg-muted">
                  <img src={f.vorschau} alt="" className="h-full w-full object-cover" />
                  {!f.pfad && !f.fehler && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Foto entfernen"
                    onClick={() => setFotos((x) => x.filter((y) => y !== f))}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => kamera.current?.click()}
                className="flex h-24 w-32 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-semibold text-primary"
              >
                <Camera className="h-6 w-6" /> Foto machen
              </button>
              <button
                type="button"
                onClick={() => galerie.current?.click()}
                className="flex h-24 w-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm hover:bg-muted"
              >
                <ImagePlus className="h-5 w-5" /> Aus Galerie
              </button>
              <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (hochladen(e.target.files), (e.target.value = ""))} />
              <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (hochladen(e.target.files), (e.target.value = ""))} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Was ist es?</div>
            <input
              aria-label="Kurztitel"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="Kurz, z. B. Feuchte Stelle im Kellerabgang"
              className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base font-medium outline-none focus:ring-2 focus:ring-primary"
            />
            <TextFeld mehrzeilig label="Beschreibung" platzhalter="Was genau? Tippen oder diktieren" wert={text} onChange={setText} kontext="Schaden oder Wunsch, den ein Eigentümer vor Ort zeigt" />
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Wo?</div>
            <div className="flex flex-wrap gap-2">
              {ORTE.map((o) => (
                <Chip key={o} an={ort === o} onClick={() => setOrt(ort === o ? null : o)}>
                  {o}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold">
              Gezeigt von
              <input
                value={gezeigt}
                onChange={(e) => setGezeigt(e.target.value)}
                placeholder="z. B. Frau Huber, Wohnung 0003"
                className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base font-normal outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            {art === "vorgang" && (
              <div className="space-y-1.5">
                <span className="text-sm font-semibold">Wie eilig?</span>
                <div className="flex gap-1.5">
                  {(["normal", "bald", "dringend"] as const).map((e) => (
                    <Chip key={e} an={eile === e} onClick={() => setEile(e)}>
                      {e[0].toUpperCase() + e.slice(1)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="h-12 rounded-xl px-5" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
            <Button className="h-12 rounded-xl px-6" onClick={speichern} disabled={laeuft}>
              {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {art === "vorgang" ? "Vorgang anlegen" : "Notiz speichern"}
            </Button>
          </div>
        </div>

        <aside className="hidden max-h-[94vh] space-y-2.5 overflow-y-auto border-l bg-muted/40 p-5 md:block">
          <div className="text-[15px] font-semibold">Heute festgehalten · {vonHeute.length}</div>
          <div className="text-[13px] text-muted-foreground">Vorgänge landen gleich im Gebäude, Notizen in der Aufnahme.</div>
          {vonHeute.map((e) => (
            <div key={e.id} className="rounded-xl border bg-card px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold",
                    e.art === "vorgang" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.art === "vorgang" ? "Vorgang" : "Notiz"}
                </span>
                <span className="text-xs text-muted-foreground">{e.fotos.length ? `${e.fotos.length} Foto${e.fotos.length > 1 ? "s" : ""}` : ""}</span>
              </div>
              <div className="mt-1.5 text-sm font-medium">{e.titel}</div>
              <div className="text-xs text-muted-foreground">{[e.ort, e.gezeigt_von && `gezeigt von ${e.gezeigt_von}`].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </aside>
      </DialogContent>
    </Dialog>
  );
}

/** Alles, was beim Termin festgehalten wurde – zum Nachlesen, mit Fotos */
export function FesthaltenListe({ buildingId }: { buildingId: string }) {
  const { data: eintraege = [] } = useEintraege(buildingId);
  const pfade = eintraege.flatMap((e) => e.fotos.map((f) => f.path));
  const { data: urls = {} } = useQuery({
    queryKey: ["aufnahme-foto-urls", pfade.join(",")],
    enabled: pfade.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from("building-files").createSignedUrls(pfade, 3600);
      const m: Record<string, string> = {};
      (data ?? []).forEach((d: any) => d.signedUrl && (m[d.path] = d.signedUrl));
      return m;
    },
  });
  if (!eintraege.length) return null;
  return (
    <section className="rounded-2xl border bg-card px-4 py-3 sm:px-5">
      <div className="pb-2 text-[15px] font-semibold">Vor Ort festgehalten · {eintraege.length}</div>
      {eintraege.map((e) => (
        <div key={e.id} className="border-t py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", e.art === "vorgang" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {e.art === "vorgang" ? "Vorgang" : "Notiz"}
            </span>
            <span className="text-sm font-medium">{e.titel}</span>
            <span className="text-xs text-muted-foreground">
              {[e.ort, e.gezeigt_von && `gezeigt von ${e.gezeigt_von}`, new Date(e.created_at).toLocaleDateString("de-DE")].filter(Boolean).join(" · ")}
            </span>
            {e.case_id && (
              <a href={`/vorgaenge/${e.case_id}`} className="ml-auto text-sm text-primary hover:underline">
                Vorgang öffnen
              </a>
            )}
          </div>
          {e.text && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.text}</p>}
          {e.fotos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {e.fotos.map((f) =>
                urls[f.path] ? (
                  <a key={f.path} href={urls[f.path]} target="_blank" rel="noreferrer">
                    <img src={urls[f.path]} alt={f.name} className="h-20 w-28 rounded-lg object-cover" />
                  </a>
                ) : (
                  <div key={f.path} className="h-20 w-28 rounded-lg bg-muted" />
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
