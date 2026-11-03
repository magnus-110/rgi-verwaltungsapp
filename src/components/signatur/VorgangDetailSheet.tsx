/**
 * Seitenleiste „Vorgangsdetail“ (Mockup v02 rechts): Stand je
 * Unterzeichner, Ablage im DMS, Protokoll-Zeitleiste und Aktionen.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, FolderInput, FolderOpen, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatDate, formatDateTime, fortschritt, oeffneSignUrl, protokollEintraege, quellePfad, signAction,
  signerName, signerStatusLang, SIG, TON_FARBE, useSignEvents, useSignInvalidate, useSignRequest,
  aktiveSigner, erinnernMeldung, istNurLink, kannNeuenLink, oeffneQuellePdf, istFirmenQuelle, nochNichtImDms,
  type SignEvent, type SignRequest, type SignSigner, FELD_TYP_LABEL, feldWertText, useSignFields,
  type SignErgaenzung, ERGAENZUNG_ART_LABEL, useSignErgaenzungen,
} from "@/lib/signatur";
import { DmsAblegenDialog, FIRMA_NAME } from "./DmsAblegenDialog";
import { NeuerLinkDialog } from "./LinkKopieren";
import { InternUnterschreibenDialog } from "./UnterschriftenBox";
import { useAuth } from "@/hooks/useAuth";
import { Pill } from "./SignaturStatusBadge";
import { Abschnitt, SigButton } from "./ui";

interface Props {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function VorgangDetailSheet({ requestId, onOpenChange }: Props) {
  return (
    <Sheet open={!!requestId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 bg-white p-0 font-sans sm:max-w-[420px]">
        {requestId && <VorgangDetail imSheet requestId={requestId} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

/** Inhalt der Seitenleiste — auch ohne Sheet einsetzbar (z. B. als Spalte). */
export function VorgangDetail({ requestId, onClose, imSheet }: { requestId: string; onClose?: () => void; imSheet?: boolean }) {
  // Titel/Beschreibung des Sheets nur innerhalb des Sheets (Radix verlangt den Dialog-Kontext)
  const Titel = imSheet ? SheetTitle : "h2";
  const navigate = useNavigate();
  const invalidate = useSignInvalidate();
  const { data: r, isLoading } = useSignRequest(requestId);
  const { data: events = [] } = useSignEvents(requestId);
  const { data: felder = [] } = useSignFields(requestId);
  const { data: ergaenzungen = [] } = useSignErgaenzungen(requestId);
  const [busy, setBusy] = useState<string | null>(null);
  const [zurueckFrage, setZurueckFrage] = useState(false);
  const [linkSigner, setLinkSigner] = useState<SignSigner | null>(null);
  const [internSigner, setInternSigner] = useState<SignSigner | null>(null);
  const { user } = useAuth();
  const istAdmin = useIsRgiAdmin();
  const [ablegenOffen, setAblegenOffen] = useState(false);
  const [erneutFrage, setErneutFrage] = useState(false);
  const [erneut, setErneut] = useState(false);

  if (isLoading || !r) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /> : <span className="text-sm text-[#6B6B6B]">Vorgang nicht gefunden.</span>}
        {imSheet && <SheetTitle className="sr-only">Vorgang</SheetTitle>}
      </div>
    );
  }

  const f = fortschritt(r);
  const fertig = r.status === "abgeschlossen";
  const objekt = r.building ? [r.building.name, r.building.city].filter(Boolean).join(", ") : r.quelle_label;
  const eintraege = protokollEintraege(r, events);

  const ausfuehren = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message || "Aktion fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const erinnern = () =>
    ausfuehren("erinnern", async () => {
      const res = await signAction<{ erinnert: number; selbst_erinnern?: string[] }>("remind", { request_id: r.id });
      erinnernMeldung(res);
      await invalidate();
    });

  const zurueckziehen = () =>
    ausfuehren("zurueck", async () => {
      await signAction("withdraw", { request_id: r.id });
      toast.success(`${r.nummer} zurückgezogen`);
      setZurueckFrage(false);
      await invalidate();
    });

  const endfassung = () =>
    ausfuehren("final", () => oeffneSignUrl(async () => (await signAction<{ final?: string }>("urls", { request_id: r.id }))?.final));

  /** Endfassung (bzw. Kopie des Unterzeichners) an der Seite der Ergänzung öffnen. */
  const ergaenzungOeffnen = (e: SignErgaenzung) =>
    ausfuehren(`erg-${e.id}`, () =>
      oeffneSignUrl(async () => {
        const u = await signAction<{ final_ansicht?: string | null; kopie?: string | null }>("urls", { request_id: r.id, signer_id: e.signer_id });
        const url = u?.final_ansicht || u?.kopie;
        return url ? `${url}#page=${e.page + 1}` : null;
      }));

  const geprueft = () =>
    ausfuehren("geprueft", async () => {
      await signAction("ergaenzungen_geprueft", { request_id: r.id });
      toast.success("Als geprüft markiert");
      await invalidate();
    });

  const nachweis = () =>
    ausfuehren("nachweis", () => oeffneSignUrl(async () => (await signAction<{ url: string }>("nachweis", { request_id: r.id }))?.url));

  const quelle = () =>
    ausfuehren("quelle", async () => {
      // Hochgeladene PDFs haben keine eigene Seite → Datei öffnen; Firmen-DMS nur für Administratoren
      if (r.quelle_typ === "upload" || (istFirmenQuelle(r) && !istAdmin)) return oeffneQuellePdf(r.id);
      const pfad = await quellePfad(r);
      if (!pfad) throw new Error("Zu diesem Vorgang ist keine Quelle hinterlegt.");
      onClose?.();
      navigate(pfad);
    });

  return (
    <>
      {/* Kopf */}
      <div className="border-b border-[#E5E5E5] px-5 pb-4 pt-5 pr-12">
        <div className="text-[12.5px] text-[#595959]">
          {objekt || "Ohne Objekt"} · {r.nummer}
        </div>
        <Titel className="mt-1 font-display text-[19px] font-normal leading-snug text-[#2B2B2B]">{r.titel}</Titel>
        {imSheet && <SheetDescription className="sr-only">Stand und Protokoll des Unterschriften-Vorgangs</SheetDescription>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill color={fertig ? SIG.gruen : SIG.button} bg={fertig ? SIG.gruenBg : SIG.orangeBg}>
            {f.fertig} von {f.gesamt} unterschrieben
          </Pill>
          {r.ergaenzungen_pruefen && <Pill color="#1F3A93" bg="#EEF1FA">Ergänzt – prüfen</Pill>}
          {r.status === "zurueckgezogen" && <Pill color={SIG.grau} bg="#EFEFEF">Zurückgezogen</Pill>}
          {r.status === "abgelaufen" && <Pill color={SIG.grau} bg="#EFEFEF">Abgelaufen</Pill>}
          {r.frist && r.status === "offen" && <span className="text-[12.5px] text-[#6B6B6B]">Frist {formatDate(r.frist)}</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* UNTERZEICHNER */}
        <div>
          <Abschnitt className="mb-2">Unterzeichner</Abschnitt>
          <div className="space-y-2">
            {aktiveSigner(r).map((s) => {
              const st = signerStatusLang(s);
              const pruefen = s.status === "papier_eingegangen";
              return (
                <div key={s.id}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="min-w-0 truncate text-[#2B2B2B]">
                    {signerName(s)}
                    {s.methode === "intern" && s.name && s.name !== signerName(s) && <span className="text-[#6B6B6B]"> · {s.name}</span>}
                    {istNurLink(s) && <span className="ml-1.5 text-[12px] text-[#6B6B6B]">· Link selbst verschickt{s.email ? "" : ", ohne E-Mail"}</span>}
                  </span>
                  {pruefen ? (
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-[#B35300] underline-offset-2 hover:underline"
                      onClick={() => {
                        onClose?.();
                        navigate(`/unterschriften/${r.id}/papier/${s.id}`);
                      }}
                    >
                      Papier eingegangen – prüfen
                    </button>
                  ) : (
                    <span
                      className={`flex shrink-0 items-center gap-1 ${st.ton === "gruen" ? "font-semibold" : ""}`}
                      style={{ color: TON_FARBE[st.ton] }}
                    >
                      {st.check && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      {st.text}
                    </span>
                  )}
                </div>
                {s.methode === "intern" && s.status === "offen" && r.status === "offen" && (!s.user_id || s.user_id === user?.id) && (
                  <SigButton variante="primaer" klein className="mt-1.5" onClick={() => setInternSigner(s)}>
                    Jetzt unterschreiben
                  </SigButton>
                )}
                {s.methode === "intern" && s.status === "offen" && r.status === "offen" && s.user_id && s.user_id !== user?.id && (
                  <div className="mt-0.5 text-[12px] text-[#6B6B6B]">Unterschreibt {s.name} selbst in der App</div>
                )}
                {kannNeuenLink(r, s) && (
                  <SigButton klein className="mt-1.5" onClick={() => setLinkSigner(s)}>
                    <Link2 className="h-3.5 w-3.5" /> {s.token_hash ? "Neuen Link erstellen" : "Link erstellen"}
                  </SigButton>
                )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ABLAGE IM DMS (Endfassung) */}
        {fertig && r.final_path && (r.typ === "ausgehend" || r.final_file_id) && (
          <DmsAblage
            request={r}
            events={events}
            istAdmin={istAdmin}
            onAblegen={() => {
              setErneut(false);
              setAblegenOffen(true);
            }}
            onErneut={() => setErneutFrage(true)}
            onOeffnen={(pfad) => {
              onClose?.();
              navigate(pfad);
            }}
            onEndfassung={endfassung}
          />
        )}

        {/* ERGÄNZUNGEN DER UNTERZEICHNER */}
        {ergaenzungen.length > 0 && (
          <div>
            <Abschnitt className="mb-2">Ergänzungen des Unterzeichners ({ergaenzungen.length})</Abschnitt>
            {r.ergaenzungen_pruefen && (
              <div className="mb-2 rounded-[10px] border border-[#C9D3EE] bg-[#EEF1FA] px-3 py-2.5">
                <p className="text-[13px] leading-snug text-[#1F3A93]">
                  Diese Angaben hat der Unterzeichner selbst ergänzt bzw. korrigiert. Bitte prüfen und übernehmen
                  (z. B. Stammdaten, Bankverbindung).
                </p>
                <SigButton variante="primaer" klein className="mt-2" onClick={geprueft} loading={busy === "geprueft"}>
                  <Check className="h-3.5 w-3.5" /> Geprüft
                </SigButton>
              </div>
            )}
            <ul className="divide-y divide-[#EEEEEE] rounded-xl border border-[#E5E5E5] bg-white">
              {ergaenzungen.map((e) => {
                const wer = r.signers.find((x) => x.id === e.signer_id)?.name ?? e.erstellt_von;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => ergaenzungOeffnen(e)}
                      disabled={busy === `erg-${e.id}`}
                      title="Im Dokument an dieser Seite öffnen"
                      className="flex w-full items-start gap-3 px-3 py-2 text-left text-[13px] hover:bg-[#FAFAFA]"
                    >
                      <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-[#1F3A93]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-[#1F3A93]">
                          {e.art === "korrektur" ? <>ersetzt durch „{e.text}“</> : <>„{e.text}“</>}
                        </div>
                        <div className="text-[12px] text-[#6B6B6B]">
                          Seite {e.page + 1} · {ERGAENZUNG_ART_LABEL[e.art]} · {wer} · {formatDateTime(e.erstellt_am)}
                        </div>
                      </div>
                      {busy === `erg-${e.id}` ? (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#6B6B6B]" />
                      ) : (
                        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#B35300]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* AUSFÜLLFELDER */}
        {felder.length > 0 && (
          <div>
            <Abschnitt className="mb-2">Ausfüllfelder ({felder.filter((f) => f.wert).length} von {felder.length} ausgefüllt)</Abschnitt>
            <ul className="divide-y divide-[#EEEEEE] rounded-xl border border-[#E5E5E5] bg-white">
              {felder.map((f) => {
                const wer = f.ausfueller === "rgi" ? "RGI (vorab)" : r.signers.find((x) => x.id === f.signer_id)?.name ?? "Unterzeichner";
                return (
                  <li key={f.id} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[#2B2B2B]">{f.beschriftung || FELD_TYP_LABEL[f.typ]}</div>
                      <div className="text-[12px] text-[#6B6B6B]">
                        {FELD_TYP_LABEL[f.typ]} · {wer}{f.pflicht ? " · Pflicht" : ""}
                        {f.wert && f.wert_gesetzt_am ? ` · ${f.wert_gesetzt_von ?? ""} am ${formatDateTime(f.wert_gesetzt_am)}` : ""}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-semibold ${f.wert ? "text-[#2B2B2B]" : "text-[#9A9A9A]"}`}>
                      {f.wert ? feldWertText(f) : "offen"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* PROTOKOLL */}
        <div>
          <Abschnitt className="mb-2.5">Protokoll</Abschnitt>
          {eintraege.length === 0 ? (
            <div className="text-[13px] text-[#6B6B6B]">Noch keine Einträge.</div>
          ) : (
            <ol className="space-y-3">
              {eintraege.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SIG.orange }} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] leading-snug text-[#2B2B2B]">{e.text}</div>
                    <div className="mt-0.5 text-[12px] text-[#6B6B6B]">{formatDateTime(e.zeit)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Fuß */}
      <div className="space-y-2.5 border-t border-[#E5E5E5] px-5 py-4">
        {r.status === "offen" && (
          <div className="grid grid-cols-2 gap-2.5">
            <SigButton onClick={erinnern} loading={busy === "erinnern"}>Erinnern</SigButton>
            <SigButton onClick={() => setZurueckFrage(true)} disabled={!!busy}>Zurückziehen</SigButton>
          </div>
        )}
        {fertig && (
          <div className="grid grid-cols-2 gap-2.5">
            <SigButton variante="primaer" onClick={endfassung} loading={busy === "final"}>Endfassung öffnen</SigButton>
            <SigButton onClick={nachweis} loading={busy === "nachweis"}>Nachweis als PDF</SigButton>
          </div>
        )}
        {r.quelle_typ && (
          <SigButton className="w-full" onClick={quelle} loading={busy === "quelle"}>
            <ExternalLink className="h-4 w-4" /> Quelle öffnen
          </SigButton>
        )}
      </div>

      <InternUnterschreibenDialog signer={internSigner} request={r} onClose={() => setInternSigner(null)} />
      {r.typ === "ausgehend" && fertig && (
        <DmsAblegenDialog request={r} open={ablegenOffen} onOpenChange={setAblegenOffen} erneut={erneut} />
      )}

      <AlertDialog open={erneutFrage} onOpenChange={setErneutFrage}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display font-normal">Erneut im DMS ablegen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Endfassung von {r.nummer} liegt bereits im DMS. Es wird eine weitere Datei angelegt, die bisherige bleibt
              unverändert. Nur nötig, wenn sie an einem anderen Ort zusätzlich gebraucht wird.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#B35300] text-white hover:bg-[#9A4700]"
              onClick={() => {
                setErneut(true);
                setAblegenOffen(true);
              }}
            >
              Weiter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <NeuerLinkDialog request={r} signer={linkSigner} onClose={() => setLinkSigner(null)} />

      <AlertDialog open={zurueckFrage} onOpenChange={setZurueckFrage}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display font-normal">Vorgang zurückziehen?</AlertDialogTitle>
            <AlertDialogDescription>
              {r.nummer} · {r.titel}: Alle offenen Links werden gesperrt. Wer noch nicht unterschrieben hat, kann danach nicht
              mehr unterschreiben. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "zurueck"}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#B35300] text-white hover:bg-[#9A4700]"
              onClick={(e) => {
                e.preventDefault();
                zurueckziehen();
              }}
              disabled={busy === "zurueck"}
            >
              {busy === "zurueck" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Zurückziehen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Wo liegt die Endfassung im DMS? (Datei lesen; im Firmen-DMS ohne Adminrechte: aus dem Protokoll) */
function useDmsOrt(r: SignRequest, events: SignEvent[]) {
  const { data: datei, isLoading } = useQuery({
    queryKey: ["signatur", "dms-ort", r.final_file_id],
    enabled: !!r.final_file_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("building_files")
        .select("id, building_id, is_company, deleted_at, building:buildings(name), ordner:building_file_categories(name)")
        .eq("id", r.final_file_id)
        .maybeSingle();
      return (data ?? null) as {
        id: string; building_id: string | null; is_company: boolean; deleted_at: string | null;
        building: { name: string } | null; ordner: { name: string } | null;
      } | null;
    },
    staleTime: 60_000,
  });
  const ev = events.find((e) => e.ereignis === "dms_abgelegt" && e.details?.file_id === r.final_file_id);
  if (!r.final_file_id) return { laedt: false, ort: null };
  if (datei) {
    return {
      laedt: false,
      ort: {
        firma: datei.is_company,
        building_id: datei.building_id,
        ziel: datei.is_company ? FIRMA_NAME : datei.building?.name ?? "Objekt",
        ordner: datei.ordner?.name ?? null,
        geloescht: !!datei.deleted_at,
      },
    };
  }
  if (isLoading) return { laedt: true, ort: null };
  return {
    laedt: false,
    ort: {
      firma: ev?.details?.firma === true || !r.building_id,
      building_id: (ev?.details?.building_id as string | null) ?? r.building_id,
      ziel: (ev?.details?.ziel as string) || (r.building_id ? "Objekt" : FIRMA_NAME),
      ordner: (ev?.details?.ordner as string | null) ?? null,
      geloescht: false,
    },
  };
}

function DmsAblage({
  request: r, events, istAdmin, onAblegen, onErneut, onOeffnen, onEndfassung,
}: {
  request: SignRequest;
  events: SignEvent[];
  istAdmin: boolean;
  onAblegen: () => void;
  onErneut: () => void;
  onOeffnen: (pfad: string) => void;
  onEndfassung: () => void;
}) {
  const { laedt, ort } = useDmsOrt(r, events);
  const offen = r.typ === "ausgehend" && (nochNichtImDms(r) || !!ort?.geloescht);

  if (offen) {
    return (
      <div>
        <Abschnitt className="mb-2">Ablage im DMS</Abschnitt>
        <div className="rounded-[10px] border border-[#E5E5E5] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Pill>Noch nicht im DMS</Pill>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-[#595959]">
            {ort?.geloescht
              ? "Die abgelegte Datei wurde im DMS gelöscht. Die Endfassung liegt weiter im Vorgang."
              : "Die Endfassung liegt bisher nur im Vorgang. Objekt, Ordner und Dateiname werden vorgeschlagen."}
          </p>
          <SigButton variante="primaer" className="mt-2.5 w-full" onClick={onAblegen}>
            <FolderInput className="h-4 w-4" /> Im DMS ablegen
          </SigButton>
        </div>
      </div>
    );
  }

  const oeffnen = () => {
    if (!ort) return;
    if (ort.firma) {
      if (istAdmin) onOeffnen(`/rgi-intern?bereich=documents&datei=${r.final_file_id}`);
      else onEndfassung();
      return;
    }
    if (ort.building_id) onOeffnen(`/buildings/${ort.building_id}?tab=documents`);
  };

  return (
    <div>
      <Abschnitt className="mb-2">Ablage im DMS</Abschnitt>
      {laedt || !ort ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#6B6B6B]" />
      ) : (
        <div className="rounded-[10px] border border-[#E5E5E5] px-3.5 py-3 text-[13.5px] leading-snug">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SIG.gruen }} strokeWidth={2.5} />
            <div className="min-w-0">
              <span className="text-[#2B2B2B]">Im DMS: {ort.ziel}{ort.ordner ? ` › ${ort.ordner}` : ""}</span>
              {" – "}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-[#B35300] underline-offset-2 hover:underline"
                onClick={oeffnen}
              >
                <FolderOpen className="h-3.5 w-3.5" /> öffnen
              </button>
            </div>
          </div>
          {r.typ === "ausgehend" && (
            <button
              type="button"
              className="mt-1.5 text-[12.5px] text-[#595959] underline-offset-2 hover:text-[#B35300] hover:underline"
              onClick={onErneut}
            >
              Erneut ablegen …
            </button>
          )}
        </div>
      )}
    </div>
  );
}
