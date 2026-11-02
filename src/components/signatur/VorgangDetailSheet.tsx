/**
 * Seitenleiste „Vorgangsdetail“ (Mockup v02 rechts): Stand je
 * Unterzeichner, Protokoll-Zeitleiste und Aktionen.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatDate, formatDateTime, fortschritt, oeffneSignUrl, protokollEintraege, quellePfad, signAction,
  signerName, signerStatusLang, SIG, TON_FARBE, useSignEvents, useSignInvalidate, useSignRequest,
  aktiveSigner, erinnernMeldung, istNurLink, kannNeuenLink, oeffneQuellePdf, type SignSigner,
} from "@/lib/signatur";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [zurueckFrage, setZurueckFrage] = useState(false);
  const [linkSigner, setLinkSigner] = useState<SignSigner | null>(null);
  const [internSigner, setInternSigner] = useState<SignSigner | null>(null);
  const { user } = useAuth();

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

  const nachweis = () =>
    ausfuehren("nachweis", () => oeffneSignUrl(async () => (await signAction<{ url: string }>("nachweis", { request_id: r.id }))?.url));

  const quelle = () =>
    ausfuehren("quelle", async () => {
      // Hochgeladene PDFs haben keine eigene Seite → Datei öffnen
      if (r.quelle_typ === "upload") return oeffneQuellePdf(r.id);
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
