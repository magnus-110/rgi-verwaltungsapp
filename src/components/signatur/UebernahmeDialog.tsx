/**
 * „In Stammdaten übernehmen“ für Vorgänge aus einer fertigen Vorlage (SEPA-Mandat, Stammdatenblatt).
 * Nichts passiert automatisch: Der Mitarbeiter sieht je Angabe Vorher/Nachher, wählt per Haken aus
 * und übernimmt. Geschrieben wird über sign-request (stammdaten_uebernehmen), mit Eintrag im Protokoll.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, DatabaseZap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDateTime, signAction, useSignInvalidate, VORLAGE_LABEL, type SignRequest } from "@/lib/signatur";
import { Abschnitt, SigButton } from "./ui";

interface Angabe {
  key: string;
  label: string;
  alt: string | null;
  neu: string | null;
  ziel: string;
  anwendbar: boolean;
  hinweis?: string;
}

interface Vorschau {
  art: "sepa_mandat" | "stammdatenblatt";
  name: string | null;
  uebernommen_am: string | null;
  angaben: Angabe[];
}

/** Bereich in der Vorgangs-Seitenleiste (nur bei Vorgängen aus einer Vorlage). */
export function StammdatenBereich({ r }: { r: SignRequest }) {
  const [offen, setOffen] = useState(false);
  if (!r.vorlage?.art) return null;
  const fertig = r.status === "abgeschlossen";
  return (
    <div>
      <Abschnitt className="mb-2">Stammdaten</Abschnitt>
      <div className="rounded-xl border border-[#E5E5E5] bg-white p-3 text-[13px] leading-snug text-[#2B2B2B]">
        <div className="text-[#595959]">
          {VORLAGE_LABEL[r.vorlage.art]}
          {r.vorlage.mandatsreferenz ? ` · Mandatsreferenz ${r.vorlage.mandatsreferenz}` : ""}
          {r.vorlage.einheiten?.length ? ` · Einheit ${r.vorlage.einheiten.join(", ")}` : ""}
        </div>
        {r.vorlage.uebernommen_am ? (
          <div className="mt-1 font-semibold text-[#1E6B34]">Übernommen am {formatDateTime(r.vorlage.uebernommen_am)}</div>
        ) : (
          <div className="mt-1 text-[#6B6B6B]">
            {fertig ? "Angaben noch nicht übernommen – bitte prüfen und übernehmen." : "Übernehmen geht, sobald alle unterschrieben haben."}
          </div>
        )}
        {fertig && (
          <SigButton klein variante={r.vorlage.uebernommen_am ? "sekundaer" : "primaer"} className="mt-2.5 w-full" onClick={() => setOffen(true)}>
            <DatabaseZap className="h-4 w-4" /> In Stammdaten übernehmen
          </SigButton>
        )}
      </div>
      {fertig && <UebernahmeDialog r={r} open={offen} onOpenChange={setOffen} />}
    </div>
  );
}

export function UebernahmeDialog({ r, open, onOpenChange }: { r: SignRequest; open: boolean; onOpenChange: (v: boolean) => void }) {
  const invalidate = useSignInvalidate();
  const qc = useQueryClient();
  const [haken, setHaken] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["signatur", "stammdaten-vorschau", r.id, open],
    enabled: open,
    queryFn: () => signAction<Vorschau>("stammdaten_vorschau", { request_id: r.id }),
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (data) setHaken(Object.fromEntries(data.angaben.filter((a) => a.anwendbar).map((a) => [a.key, true])));
  }, [data]);

  const gewaehlt = (data?.angaben ?? []).filter((a) => a.anwendbar && haken[a.key]);
  const uebernehmen = async () => {
    setBusy(true);
    try {
      const res = await signAction<{ uebernommen: string[] }>("stammdaten_uebernehmen", { request_id: r.id, keys: gewaehlt.map((a) => a.key) });
      toast.success(`Übernommen: ${res.uebernommen.length} Angabe${res.uebernommen.length === 1 ? "" : "n"}`);
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["mandate"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Übernehmen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 font-sans sm:max-h-[88vh] sm:w-[96vw] sm:max-w-[640px] sm:rounded-xl">
        <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
          <DialogTitle className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">In Stammdaten übernehmen</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#595959]">
            {r.nummer} · {r.vorlage?.name ?? r.titel}. Bitte jede Angabe prüfen – übernommen wird nur, was angehakt ist.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {data?.uebernommen_am && (
            <div className="rounded-lg bg-[#D4EDDA] px-3 py-2 text-[12.5px] text-[#1E6B34]">Schon einmal übernommen am {formatDateTime(data.uebernommen_am)}. Unten steht nur, was noch abweicht.</div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {(error as Error).message}</div>
          ) : !data?.angaben.length ? (
            <div className="py-10 text-center text-[13.5px] text-[#6B6B6B]">Alles ist schon so gespeichert – nichts zu übernehmen.</div>
          ) : (
            data.angaben.map((a) => (
              <label
                key={a.key}
                className={cn(
                  "flex gap-3 rounded-xl border px-3 py-2.5",
                  a.anwendbar ? "cursor-pointer border-[#E5E5E5] bg-white" : "border-dashed border-[#E5E5E5] bg-[#FAFAFA]",
                  a.anwendbar && haken[a.key] && "border-[#ee7202] bg-[#FFFBF6]",
                )}
              >
                <Checkbox
                  checked={a.anwendbar && !!haken[a.key]}
                  disabled={!a.anwendbar}
                  onCheckedChange={(v) => setHaken((h) => ({ ...h, [a.key]: !!v }))}
                  className="mt-0.5 data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
                  aria-label={a.label}
                />
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="block font-semibold text-[#2B2B2B]">{a.label}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className={cn("break-words", a.alt ? "text-[#6B6B6B] line-through decoration-[#9A9A9A]" : "italic text-[#9A9A9A]")}>{a.alt || "bisher leer"}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#B35300]" />
                    <span className="break-words font-medium text-[#1F3A93]">{a.neu || "–"}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[#6B6B6B]">
                    {a.anwendbar ? `Wird gespeichert: ${a.ziel}` : a.hinweis || "Nur zur Information"}
                    {a.anwendbar && a.hinweis ? ` · ${a.hinweis}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-[#E5E5E5] px-6 py-4">
          <SigButton onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</SigButton>
          <SigButton variante="primaer" loading={busy} disabled={!gewaehlt.length} onClick={uebernehmen} className="px-5">
            Übernehmen ({gewaehlt.length})
          </SigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
