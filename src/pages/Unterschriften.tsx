/**
 * Übersicht „Unterschriften“ (Mockup v02 + Reiter aus v09).
 *
 * Angelegt wird in der Regel dort, wo das Dokument entsteht (Unterschriften-Box
 * an DMS-Datei, Angebot, Vertrag, Mail-Anhang, ETV). Zusätzlich oben rechts
 * „Neue Unterschrift“: PDF hochladen oder aus den Dokumenten eines Objekts wählen.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FolderInput, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  formatDate, fortschritt, istFirmenQuelle, nochNichtImDms, oeffneQuellePdf, quellePfad, SIG, tageBisFrist, todayIso,
  useSignRequests, type SignRequest,
} from "@/lib/signatur";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { Pill } from "@/components/signatur/SignaturStatusBadge";
import { NeueUnterschriftDialog } from "@/components/signatur/NeueUnterschriftDialog";
import { SignaturStatusBadge } from "@/components/signatur/SignaturStatusBadge";
import { VorgangDetail, VorgangDetailSheet } from "@/components/signatur/VorgangDetailSheet";
import { Karte, SigButton } from "@/components/signatur/ui";
import { EingehendAnsicht } from "@/components/signatur/EingehendAnsicht";

type Reiter = "ausgehend" | "eingehend" | "etv" | "abgeschlossen";

const REITER: { id: Reiter; titel: string }[] = [
  { id: "ausgehend", titel: "Ausgehend" },
  { id: "eingehend", titel: "Von uns zu unterschreiben" },
  { id: "etv", titel: "ETV-Protokolle" },
  { id: "abgeschlossen", titel: "Abgeschlossen" },
];

const inReiter = (r: SignRequest, reiter: Reiter) => {
  const erledigt = r.status === "abgeschlossen" || r.status === "zurueckgezogen";
  switch (reiter) {
    case "ausgehend":
      return r.typ === "ausgehend" && !erledigt;
    case "eingehend":
      return r.typ === "eingehend" && !erledigt;
    case "etv":
      return r.typ === "etv_protokoll" && !erledigt;
    case "abgeschlossen":
      return erledigt;
  }
};

function useBreit(query = "(min-width: 1280px)") {
  const [an, setAn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setAn(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return an;
}

export default function Unterschriften() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reiter = (REITER.some((r) => r.id === params.get("reiter")) ? params.get("reiter") : "ausgehend") as Reiter;
  const objekt = params.get("objekt") ?? "alle";
  const [auswahl, setAuswahl] = useState<string | null>(params.get("vorgang"));
  const breit = useBreit();
  const [neuOffen, setNeuOffen] = useState(false);
  const istAdmin = useIsRgiAdmin();

  const { data: alle = [], isLoading } = useSignRequests({});

  // Link aus einer Meldung (/unterschriften?vorgang=…): passenden Reiter wählen
  const vorgangParam = params.get("vorgang");
  useEffect(() => {
    if (!vorgangParam || params.get("reiter") || isLoading) return;
    const r = alle.find((x) => x.id === vorgangParam);
    if (!r) return;
    const ziel: Reiter | null =
      r.status !== "offen" ? "abgeschlossen" : r.typ === "eingehend" ? "eingehend" : r.typ === "etv_protokoll" ? "etv" : null;
    if (ziel) setParam({ reiter: ziel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgangParam, alle, isLoading]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };

  // Objekte, die überhaupt vorkommen (für den Filter)
  const objekte = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of alle) if (r.building) m.set(r.building.id, r.building.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "de"));
  }, [alle]);

  const gefiltert = useMemo(() => (objekt === "alle" ? alle : alle.filter((r) => r.building_id === objekt)), [alle, objekt]);

  const zaehler = useMemo(() => {
    const offen = (t: SignRequest["typ"]) => gefiltert.filter((r) => r.typ === t && r.status === "offen").length;
    return {
      ausgehend: offen("ausgehend"),
      eingehend: offen("eingehend"),
      etv: offen("etv_protokoll"),
      // Abgeschlossen, Endfassung aber noch nicht im DMS (wird seit 02.11.2026 von Hand abgelegt)
      nichtImDms: gefiltert.filter(nochNichtImDms).length,
    };
  }, [gefiltert]);

  const kacheln = useMemo(() => {
    const heute = todayIso();
    const vor30 = Date.now() - 30 * 86_400_000;
    const offen = gefiltert.filter((r) => r.status === "offen");
    return {
      offen: offen.length,
      bald: offen.filter((r) => {
        const t = tageBisFrist(r.frist);
        return t !== null && t >= 0 && t <= 3;
      }).length,
      abgeschlossen: gefiltert.filter((r) => r.status === "abgeschlossen" && r.completed_at && new Date(r.completed_at).getTime() >= vor30).length,
      abgelaufen:
        gefiltert.filter((r) => r.status === "abgelaufen").length + offen.filter((r) => r.frist && r.frist < heute).length,
    };
  }, [gefiltert]);

  const zeilen = useMemo(() => gefiltert.filter((r) => inReiter(r, reiter)), [gefiltert, reiter]);

  // Auf breiten Bildschirmen steht der erste Vorgang gleich rechts (wie im Mockup)
  useEffect(() => {
    if (!breit || isLoading || reiter === "eingehend") return;
    if (!auswahl || !zeilen.some((z) => z.id === auswahl)) setAuswahl(zeilen[0]?.id ?? null);
  }, [breit, zeilen, auswahl, isLoading]);

  const zurQuelle = async (r: SignRequest) => {
    if (r.quelle_typ === "upload" || (istFirmenQuelle(r) && !istAdmin)) {
      // Hochgeladene PDFs haben keine eigene Seite → Datei öffnen
      try {
        await oeffneQuellePdf(r.id);
      } catch (e: any) {
        toast.error(e?.message || "Datei nicht verfügbar");
      }
      return;
    }
    const pfad = await quellePfad(r);
    if (pfad) navigate(pfad);
    else toast.info("Zu diesem Vorgang ist keine Quelle hinterlegt.");
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] font-sans text-[#2B2B2B]">
      {/* Kopf + Reiter */}
      <div className="-mx-3 -mt-3 mb-5 border-b border-[#E5E5E5] bg-white px-4 pt-5 lg:-mx-6 lg:-mt-6 lg:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[26px] font-normal leading-tight text-[#2B2B2B]">Unterschriften</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Nach Objekt filtern"
              className="h-11 min-w-[220px] rounded-lg border border-[#D6D6D6] bg-white px-3 text-[14px] text-[#2B2B2B] outline-none focus:border-[#ee7202]"
              value={objekt}
              onChange={(e) => setParam({ objekt: e.target.value === "alle" ? null : e.target.value })}
            >
              <option value="alle">Alle Objekte</option>
              {objekte.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <SigButton variante="primaer" onClick={() => setNeuOffen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Neue Unterschrift
            </SigButton>
          </div>
        </div>
        <nav className="-mb-px mt-3 flex gap-7 overflow-x-auto" aria-label="Reiter">
          {REITER.map((t) => {
            const an = t.id === reiter;
            const n = t.id === "abgeschlossen" ? null : zaehler[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setParam({ reiter: t.id === "ausgehend" ? null : t.id });
                  setAuswahl(null);
                }}
                className={cn(
                  "whitespace-nowrap border-b-[3px] pb-2.5 pt-1 text-[14.5px] transition-colors",
                  an ? "border-[#B35300] font-semibold text-[#B35300]" : "border-transparent text-[#595959] hover:text-[#2B2B2B]",
                )}
              >
                {t.titel}
                {n !== null && ` (${n})`}
                {t.id === "abgeschlossen" && zaehler.nichtImDms > 0 && (
                  <span
                    className="ml-1.5 inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#ee7202] px-1.5 align-[1px] text-[11.5px] font-bold text-white"
                    title={`${zaehler.nichtImDms} noch nicht im DMS abgelegt`}
                    aria-label={`${zaehler.nichtImDms} noch nicht im DMS abgelegt`}
                  >
                    {zaehler.nichtImDms}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {reiter === "eingehend" ? (
        isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
        ) : (
          <EingehendAnsicht vorgaenge={zeilen} auswahl={auswahl} onAuswahl={setAuswahl} />
        )
      ) : (
      <div className={cn("grid gap-6", breit && auswahl ? "grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-1")}>
        <div className="min-w-0 space-y-5">
          {/* Kacheln */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <Kachel label="Offen" wert={kacheln.offen} farbe={SIG.button} />
            <Kachel label="Frist in ≤ 3 Tagen" wert={kacheln.bald} />
            <Kachel label="Abgeschlossen (30 Tage)" wert={kacheln.abgeschlossen} farbe={SIG.gruen} />
            <Kachel label="Abgelaufen" wert={kacheln.abgelaufen} />
          </div>

          {reiter === "abgeschlossen" && zaehler.nichtImDms > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#F5C79A] bg-[#FFF7ED] px-4 py-3 text-[13.5px] leading-snug text-[#2B2B2B]">
              <FolderInput className="mt-0.5 h-4 w-4 shrink-0 text-[#B35300]" />
              <span>
                {zaehler.nichtImDms === 1 ? "1 Endfassung ist" : `${zaehler.nichtImDms} Endfassungen sind`} noch nicht im DMS.
                Vorgang anklicken und „Im DMS ablegen“ wählen – Objekt, Ordner und Dateiname werden vorgeschlagen.
              </span>
            </div>
          )}

          {/* Tabelle */}
          <Karte className="overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
            ) : zeilen.length === 0 ? (
              <div className="px-6 py-14 text-center text-[14px] text-[#6B6B6B]">
                {reiter === "abgeschlossen" ? "Noch keine abgeschlossenen Vorgänge." : "Keine offenen Vorgänge."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[#FAFAFA] text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#595959]">
                      <th className="px-5 py-3.5 font-bold">Dokument</th>
                      <th className="px-3 py-3.5 font-bold">Objekt / Quelle</th>
                      <th className="px-3 py-3.5 font-bold">Unterschriften</th>
                      <th className="px-3 py-3.5 font-bold">Status</th>
                      <th className="px-5 py-3.5 font-bold">Frist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((r) => {
                      const f = fortschritt(r);
                      const an = r.id === auswahl;
                      const t = tageBisFrist(r.frist);
                      const ueberfaellig = r.status === "offen" && t !== null && t < 0;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setAuswahl(r.id)}
                          className={cn(
                            "cursor-pointer border-t border-[#EFEFEF] text-[14px] transition-colors",
                            an ? "bg-[#FFF7ED]" : "hover:bg-[#FAFAFA]",
                          )}
                        >
                          <td className="px-5 py-3.5 align-middle">
                            <div className="font-semibold leading-snug text-[#2B2B2B]" title={r.nummer}>{r.titel}</div>
                          </td>
                          <td className="px-3 py-3.5 align-middle text-[#595959]">
                            <button
                              type="button"
                              className="text-left leading-snug hover:text-[#B35300] hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                zurQuelle(r);
                              }}
                              title="Zur Quelle springen"
                            >
                              {r.quelle_label || r.building?.name || "—"}
                            </button>
                          </td>
                          <td className="px-3 py-3.5 align-middle tabular-nums text-[#2B2B2B]">
                            {f.fertig} / {f.gesamt}
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <SignaturStatusBadge request={r} />
                              {r.ergaenzungen_pruefen && (
                                <Pill color="#1F3A93" bg="#EEF1FA" className="border border-[#C9D3EE]">Ergänzt – prüfen</Pill>
                              )}
                              {nochNichtImDms(r) && (
                                <Pill color={SIG.button} bg="#FDEBD8" className="border border-[#F5C79A]">Noch nicht im DMS</Pill>
                              )}
                            </div>
                          </td>
                          <td className={cn("px-5 py-3.5 align-middle tabular-nums", ueberfaellig ? "font-semibold text-[#B35300]" : "text-[#595959]")}>
                            {formatDate(r.frist)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Karte>
        </div>

        {breit && auswahl && (
          <Karte className="sticky top-0 flex max-h-[calc(100vh-150px)] min-h-[560px] flex-col self-start overflow-hidden">
            <VorgangDetail key={auswahl} requestId={auswahl} />
          </Karte>
        )}
      </div>
      )}

      {!breit && reiter !== "eingehend" && <VorgangDetailSheet requestId={auswahl} onOpenChange={(o) => !o && setAuswahl(null)} />}
      <NeueUnterschriftDialog open={neuOffen} onOpenChange={setNeuOffen} />
    </div>
  );
}

function Kachel({ label, wert, farbe }: { label: string; wert: number; farbe?: string }) {
  return (
    <Karte className="px-4 py-4">
      <div className="text-[13px] leading-snug text-[#595959]">{label}</div>
      <div className="mt-1.5 text-[28px] font-semibold leading-none tabular-nums" style={{ color: farbe ?? SIG.text }}>
        {wert}
      </div>
    </Karte>
  );
}
