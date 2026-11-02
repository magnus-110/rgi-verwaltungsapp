/**
 * Unterschriften-Box (Mockup v11) — der wiederverwendbare Baustein an
 * jeder Quelle (DMS-Datei, Angebot, Verwaltervertrag, Mail-Anhang, ETV).
 * Zeigt den neuesten Vorgang zur Quelle, ältere einklappbar, und startet
 * neue Anforderungen über den Dialog.
 */
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useMySignature } from "@/lib/documentSigning";
import { cn } from "@/lib/utils";
import {
  aktiveSigner, erinnernMeldung, formatDate, fortschritt, kannNeuenLink, oeffneSignUrl, signAction, signerKopf,
  signerMethodeText, signerStatusKurz, SIG, TON_FARBE, useSignInvalidate, useSignRequestsForQuelle,
  type QuelleTyp, type SignRequest, type SignSigner,
} from "@/lib/signatur";
import { Pill } from "./SignaturStatusBadge";
import { SigButton } from "./ui";
import { NeuerLinkDialog } from "./LinkKopieren";
import { UnterschriftAnfordernDialog, type UnterschriftStartInfo } from "./UnterschriftAnfordernDialog";
import { VorgangDetailSheet } from "./VorgangDetailSheet";

interface Props {
  quelleTyp: QuelleTyp;
  quelleId: string | null | undefined;
  /** Angaben zum Start; `null` = (noch) kein PDF vorhanden → `ohnePdfHinweis` zeigen. */
  startInfo: UnterschriftStartInfo | null;
  ohnePdfHinweis?: string;
  /**
   * Optional: Angaben erst beim Klick ermitteln (z. B. ETV-Protokoll als PDF erzeugen).
   * Hat Vorrang vor `startInfo`; der Knopf zeigt solange einen Ladezustand.
   */
  vorbereiten?: () => Promise<UnterschriftStartInfo>;
  /** Beschriftung des Startknopfs (Standard „Unterschrift anfordern“). */
  startText?: string;
  /** Inhalt, wenn es noch keinen Vorgang gibt (statt „Noch keine Unterschriften angefordert.“). */
  ohneVorgang?: ReactNode;
  /** Hinweis unter den Unterzeichnern, sobald der aktuelle Vorgang abgeschlossen ist. */
  abgeschlossenHinweis?: ReactNode;
  className?: string;
}

export function UnterschriftenBox({
  quelleTyp, quelleId, startInfo, ohnePdfHinweis, vorbereiten, startText, ohneVorgang, abgeschlossenHinweis, className,
}: Props) {
  const { data: vorgaenge = [], isLoading } = useSignRequestsForQuelle(quelleTyp, quelleId);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [aeltereOffen, setAeltereOffen] = useState(false);
  const [vorbereitet, setVorbereitet] = useState<UnterschriftStartInfo | null>(null);
  const [bereitet, setBereitet] = useState(false);
  const info = vorbereitet ?? startInfo;
  const kannStarten = !!startInfo || !!vorbereiten;

  const starten = async () => {
    if (!vorbereiten) {
      setDialogOffen(true);
      return;
    }
    setBereitet(true);
    try {
      setVorbereitet(await vorbereiten());
      setDialogOffen(true);
    } catch (e: any) {
      toast.error(e?.message || "Dokument konnte nicht vorbereitet werden");
    } finally {
      setBereitet(false);
    }
  };

  const relevant = vorgaenge.filter((v) => v.status === "offen" || v.status === "abgeschlossen");
  const aktuell = relevant[0] ?? null;
  const aeltere = vorgaenge.filter((v) => v.id !== aktuell?.id);
  const aktiv = aktuell?.status === "offen";

  return (
    <div className={cn("font-sans", className)}>
      <div
        className="rounded-xl bg-white"
        style={{ border: `2px solid ${aktiv ? SIG.orange : SIG.rand}` }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /></div>
        ) : aktuell ? (
          <VorgangInhalt
            r={aktuell}
            onDetails={() => setDetailId(aktuell.id)}
            onNeu={kannStarten ? starten : undefined}
            abgeschlossenHinweis={abgeschlossenHinweis}
          />
        ) : (
          <>
            <div className="px-5 pb-3 pt-4">
              <h3 className="font-display text-[18px] font-normal leading-tight text-[#2B2B2B]">Unterschriften</h3>
            </div>
            <div className="border-t border-[#E5E5E5] px-5 py-4">
              {ohneVorgang ?? (
                <p className="text-[14px] text-[#595959]">
                  {kannStarten ? "Noch keine Unterschriften angefordert." : ohnePdfHinweis || "Noch kein PDF vorhanden."}
                </p>
              )}
              {kannStarten && (
                <SigButton variante="primaer" className="mt-3 w-full" onClick={starten} loading={bereitet}>
                  {startText || "Unterschrift anfordern"}
                </SigButton>
              )}
            </div>
          </>
        )}
      </div>

      {aeltere.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAeltereOffen((v) => !v)}
            className="flex items-center gap-1 text-[12.5px] font-medium text-[#595959] hover:text-[#2B2B2B]"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aeltereOffen && "rotate-180")} />
            Frühere Vorgänge ({aeltere.length})
          </button>
          {aeltereOffen && (
            <div className="mt-2 space-y-1.5">
              {aeltere.map((v) => {
                const f = fortschritt(v);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setDetailId(v.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-left hover:bg-[#FAFAFA]"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[#2B2B2B]">{v.nummer}</span>
                      <span className="block text-[12px] text-[#6B6B6B]">
                        {statusWort(v)} · {formatDate(v.created_at)}
                      </span>
                    </span>
                    <span className="text-[12px] text-[#595959]">{f.fertig} / {f.gesamt}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {info && (
        <UnterschriftAnfordernDialog
          open={dialogOffen}
          onOpenChange={setDialogOffen}
          quelleTyp={quelleTyp}
          quelleId={quelleId ?? null}
          startInfo={info}
        />
      )}
      <VorgangDetailSheet requestId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
    </div>
  );
}

const statusWort = (v: SignRequest) =>
  ({ offen: "offen", abgeschlossen: "abgeschlossen", zurueckgezogen: "zurückgezogen", abgelaufen: "abgelaufen", entwurf: "Entwurf" })[v.status];

function VorgangInhalt({
  r, onDetails, onNeu, abgeschlossenHinweis,
}: { r: SignRequest; onDetails: () => void; onNeu?: () => void; abgeschlossenHinweis?: ReactNode }) {
  const navigate = useNavigate();
  const invalidate = useSignInvalidate();
  const { user, profile } = useAuth();
  const [erinnert, setErinnert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [internSigner, setInternSigner] = useState<SignSigner | null>(null);
  const [linkSigner, setLinkSigner] = useState<SignSigner | null>(null);
  const f = fortschritt(r);
  const fertig = r.status === "abgeschlossen";

  const erinnern = async () => {
    setBusy("erinnern");
    try {
      const res = await signAction<{ erinnert: number; selbst_erinnern?: string[] }>("remind", { request_id: r.id });
      erinnernMeldung(res);
      setErinnert(true);
      await invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Erinnern fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const endfassung = async () => {
    setBusy("final");
    try {
      await oeffneSignUrl(async () => (await signAction<{ final?: string }>("urls", { request_id: r.id }))?.final);
    } catch (e: any) {
      toast.error(e?.message || "Endfassung nicht verfügbar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-normal leading-tight text-[#2B2B2B]">Unterschriften</h3>
          <div className="mt-1 text-[12.5px] text-[#595959]">
            {r.nummer}
            {r.frist && !fertig && <> · Frist {formatDate(r.frist)}</>}
            {fertig && r.completed_at && <> · abgeschlossen {formatDate(r.completed_at)}</>}
          </div>
        </div>
        <Pill color={fertig ? SIG.gruen : SIG.button} bg={fertig ? SIG.gruenBg : SIG.orangeBg} className="mt-0.5">
          {f.fertig} von {f.gesamt}
        </Pill>
      </div>

      <div className="space-y-3 border-t border-[#E5E5E5] px-5 py-3.5">
        {aktiveSigner(r).map((s) => {
          const st = signerStatusKurz(s);
          const methode = signerMethodeText(s);
          const pruefen = s.status === "papier_eingegangen";
          const darfIntern =
            s.methode === "intern" && s.status === "offen" && r.status === "offen" && (!s.user_id || s.user_id === user?.id);
          return (
            <div key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-[14px] font-semibold leading-snug text-[#2B2B2B]">{signerKopf(s)}</div>
                  {pruefen ? (
                    <button
                      type="button"
                      className="text-[12.5px] font-medium text-[#B35300] underline underline-offset-2"
                      onClick={() => navigate(`/unterschriften/${r.id}/papier/${s.id}`)}
                    >
                      {methode}
                    </button>
                  ) : (
                    <div className="text-[12.5px] leading-snug text-[#6B6B6B]">{methode}</div>
                  )}
                </div>
                <span
                  className="flex shrink-0 items-center gap-1 pt-0.5 text-[13px] font-semibold"
                  style={{ color: TON_FARBE[st.ton] }}
                >
                  {st.check && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {st.text}
                </span>
              </div>
              {darfIntern && (
                <SigButton variante="primaer" klein className="mt-2" onClick={() => setInternSigner(s)}>
                  Jetzt unterschreiben
                </SigButton>
              )}
              {kannNeuenLink(r, s) && (
                <SigButton klein className="mt-2" onClick={() => setLinkSigner(s)}>
                  <Link2 className="h-3.5 w-3.5" /> {s.token_hash ? "Neuen Link erstellen" : "Link erstellen"}
                </SigButton>
              )}
            </div>
          );
        })}
      </div>

      {fertig && abgeschlossenHinweis && (
        <div className="mx-5 mb-3.5 rounded-lg bg-[#D4EDDA] px-3.5 py-2.5 text-[13px] leading-snug text-[#1E6B34]">
          {abgeschlossenHinweis}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 border-t border-[#E5E5E5] px-5 py-3.5">
        {fertig ? (
          <SigButton onClick={endfassung} loading={busy === "final"}>Endfassung</SigButton>
        ) : (
          <SigButton onClick={erinnern} loading={busy === "erinnern"} disabled={erinnert}>
            {erinnert ? "Erinnert" : "Erinnern"}
          </SigButton>
        )}
        <SigButton onClick={onDetails}>Details</SigButton>
        {fertig && onNeu && (
          <button type="button" onClick={onNeu} className="col-span-2 text-[12.5px] font-medium text-[#B35300] underline underline-offset-2">
            Erneut Unterschrift anfordern
          </button>
        )}
      </div>

      <InternUnterschreibenDialog signer={internSigner} request={r} onClose={() => setInternSigner(null)} />
      <NeuerLinkDialog request={r} signer={linkSigner} onClose={() => setLinkSigner(null)} />
    </>
  );
}

const ORT_KEY = "rgi-sign-place";
const leseOrt = () => {
  try {
    return localStorage.getItem(ORT_KEY) || "Pfronten";
  } catch {
    return "Pfronten";
  }
};

/** „Jetzt unterschreiben“: zeigt die hinterlegte Unterschrift und setzt sie über sign_internal ein. */
function InternUnterschreibenDialog({
  signer, request, onClose,
}: { signer: SignSigner | null; request: SignRequest; onClose: () => void }) {
  const { data: meineUnterschrift, isLoading } = useMySignature();
  const invalidate = useSignInvalidate();
  const [ort, setOrt] = useState(leseOrt);
  const [busy, setBusy] = useState(false);

  const unterschreiben = async () => {
    if (!signer) return;
    setBusy(true);
    try {
      const res = await signAction<{ ok: boolean; abgeschlossen?: boolean }>("sign_internal", { signer_id: signer.id, ort: ort.trim() || undefined });
      try {
        localStorage.setItem(ORT_KEY, ort.trim());
      } catch {
        /* egal */
      }
      toast.success(res?.abgeschlossen ? `Unterschrieben – ${request.nummer} ist abgeschlossen` : "Unterschrieben");
      await invalidate();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Unterschreiben fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!signer} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[460px] font-sans">
        <DialogTitle className="font-display text-[20px] font-normal text-[#2B2B2B]">Jetzt unterschreiben</DialogTitle>
        <DialogDescription className="text-[13px] text-[#595959]">
          {request.titel} · {request.nummer}. Ihre hinterlegte Unterschrift wird an der vorgesehenen Stelle eingesetzt.
        </DialogDescription>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /></div>
        ) : meineUnterschrift ? (
          <div className="space-y-3">
            <div className="flex h-28 items-center justify-center rounded-lg border border-[#E5E5E5] bg-[#FAFAFA]">
              <img src={meineUnterschrift} alt="Hinterlegte Unterschrift" className="max-h-24 max-w-[80%] object-contain" />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-[#2B2B2B]">Ort (wird mit Datum davor gesetzt)</span>
              <input
                className="h-11 w-full rounded-lg border border-[#D6D6D6] px-3 text-[14px] outline-none focus:border-[#ee7202]"
                value={ort}
                onChange={(e) => setOrt(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2.5 pt-1">
              <SigButton onClick={onClose} disabled={busy}>Abbrechen</SigButton>
              <SigButton variante="primaer" onClick={unterschreiben} loading={busy}>Verbindlich unterschreiben</SigButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#FFF7ED] px-3.5 py-3 text-[13.5px] text-[#2B2B2B]">
              Sie haben noch keine eigene Unterschrift hinterlegt. Bitte zuerst in den Einstellungen anlegen.
            </div>
            <div className="flex justify-end gap-2.5">
              <SigButton onClick={onClose}>Schließen</SigButton>
              <Link
                to="/settings?tab=profil"
                className="inline-flex h-11 items-center rounded-lg bg-[#B35300] px-4 text-[14px] font-semibold text-white hover:bg-[#9A4700]"
              >
                Eigene Unterschrift hinterlegen
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
