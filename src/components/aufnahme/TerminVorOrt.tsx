/**
 * Aufnahme › Termin vor Ort – für das Tablet beim Rundgang mit Beirat oder
 * Vorverwaltung. Links die Themen, rechts die Fragen, unten rechts „Festhalten".
 */
import { useState } from "react";
import { Camera, CloudOff, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAufnahme } from "@/hooks/useAufnahme";
import { THEMEN, fortschritt, type ThemaId } from "@/lib/aufnahme";
import { DienstleisterDialog, DienstleisterThema, anzahlJeKategorie, useGebaeudeFirmen } from "./dienstleister";
import { AltAntworten, BeiratThema, HausThema, HeizungThema, SchluesselThema, VerwaltungThema } from "./themen";
import { FesthaltenDialog, FesthaltenListe, useEintraege } from "./FesthaltenDialog";

export interface AufnahmeGebaeude {
  id: string;
  name: string;
  address: string | null;
  management_mode: "weg" | "rent";
  management_start_date: string | null;
}

export function TerminVorOrt({ gebaeude }: { gebaeude: AufnahmeGebaeude }) {
  const { zeile, antworten, laedt, status, setze, aendern } = useAufnahme(gebaeude.id);
  const { data: firmen = [] } = useGebaeudeFirmen(gebaeude.id);
  const { data: eintraege = [] } = useEintraege(gebaeude.id);
  const [thema, setThema] = useState<ThemaId>("dienstleister");
  const [dlOffen, setDlOffen] = useState(false);
  const [dlKategorie, setDlKategorie] = useState<string | undefined>();
  const [festhalten, setFesthalten] = useState(false);

  if (laedt || !zeile) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fs = fortschritt(antworten, anzahlJeKategorie(firmen));
  const gesamt = Object.values(fs).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  const aktiv = THEMEN.find((t) => t.id === thema)!;
  const firmaWaehlen = (k?: string) => {
    setDlKategorie(k);
    setDlOffen(true);
  };

  return (
    <div className="relative pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-2 bg-primary" style={{ width: `${Math.round((gesamt[0] / Math.max(gesamt[1], 1)) * 100)}%` }} />
          </div>
          <span className="text-sm font-semibold">
            {gesamt[0]} von {gesamt[1]} beantwortet
          </span>
        </div>
        <span className={cn("flex items-center gap-1.5 text-sm", status === "offline" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          {status === "speichert" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Speichert …
            </>
          ) : status === "offline" ? (
            <>
              <CloudOff className="h-4 w-4" /> Kein Netz – liegt auf dem Gerät und wird nachgeschickt
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Gespeichert
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Themen" className="min-w-0 md:sticky md:top-4 md:self-start">
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide md:mx-0 md:flex-col md:gap-1.5 md:overflow-visible md:px-0">
            {THEMEN.map((t) => {
              const [x, y] = fs[t.id];
              const fertig = x >= y;
              const an = t.id === thema;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setThema(t.id);
                    window.scrollTo({ top: 0 });
                  }}
                  aria-current={an ? "page" : undefined}
                  className={cn(
                    "flex h-[52px] shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-xl border px-4 text-[15px] md:w-full",
                    an ? "border-primary/30 bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-muted",
                  )}
                >
                  {t.titel}
                  <span className={cn("text-[13px]", an ? "" : fertig ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                    {fertig ? "fertig" : `${x} / ${y}`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 hidden space-y-2 rounded-xl bg-muted/60 p-3.5 text-[13px] md:block">
            <label className="block font-semibold">
              Termin am
              <input
                type="date"
                value={zeile.termin_am ?? ""}
                onChange={(e) => aendern((z) => ({ ...z, termin_am: e.target.value || null }))}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 font-normal"
              />
            </label>
            <label className="block font-semibold">
              Gesprächspartner
              <textarea
                value={zeile.gespraechspartner ?? ""}
                onChange={(e) => aendern((z) => ({ ...z, gespraechspartner: e.target.value }))}
                rows={2}
                placeholder="z. B. Herr Wolf (Beirat)"
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 font-normal"
              />
            </label>
          </div>
        </nav>

        <main className="min-w-0 space-y-3.5">
          <div>
            <h2 className="text-2xl font-semibold">{aktiv.titel}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{aktiv.text}</p>
          </div>

          {thema === "dienstleister" && (
            <DienstleisterThema
              buildingId={gebaeude.id}
              gebaeude={gebaeude}
              antworten={antworten}
              setze={(t) => setze("dienstleister", t as any)}
              onHinzufuegen={firmaWaehlen}
            />
          )}
          {thema === "heizung" && <HeizungThema buildingId={gebaeude.id} antworten={antworten} setze={setze} firmen={firmen} onFirma={firmaWaehlen} />}
          {thema === "haus" && <HausThema antworten={antworten} setze={setze} firmen={firmen} onFirma={firmaWaehlen} />}
          {thema === "schluessel" && <SchluesselThema antworten={antworten} setze={setze} />}
          {thema === "verwaltung" && <VerwaltungThema buildingId={gebaeude.id} antworten={antworten} setze={setze} />}
          {thema === "beirat" && <BeiratThema buildingId={gebaeude.id} antworten={antworten} setze={setze} />}

          <FesthaltenListe buildingId={gebaeude.id} />
          <AltAntworten antworten={antworten} />
        </main>
      </div>

      <button
        type="button"
        onClick={() => setFesthalten(true)}
        className="fixed bottom-5 right-5 z-30 flex h-[60px] items-center gap-2.5 rounded-full bg-foreground px-6 text-base font-semibold text-background shadow-lg md:bottom-7 md:right-8"
      >
        <Camera className="h-6 w-6" /> Festhalten
        {eintraege.length > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[13px] text-primary-foreground">{eintraege.length}</span>
        )}
      </button>

      <DienstleisterDialog open={dlOffen} onOpenChange={setDlOffen} buildingId={gebaeude.id} startKategorie={dlKategorie} />
      <FesthaltenDialog open={festhalten} onOpenChange={setFesthalten} buildingId={gebaeude.id} managementMode={gebaeude.management_mode} />
    </div>
  );
}
