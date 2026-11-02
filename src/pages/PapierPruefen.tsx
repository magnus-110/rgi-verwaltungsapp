/**
 * „Papier-Unterschrift prüfen“ (Mockup v08 unten / v09).
 *
 * Links der eingegangene Scan (alle Seiten), rechts Prüfung und Stand.
 * Übernehmen/Ablehnen nur über die Edge-Funktion (accept_paper / reject_paper).
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  aktiveSigner, formatDate, formatDateTime, signAction, signerName, signerStatusLang, SIG, TON_FARBE,
  useSignEvents, useSignInvalidate, useSignRequest, type SignSigner,
} from "@/lib/signatur";
import { Abschnitt, Karte, SigButton } from "@/components/signatur/ui";
import { LinksAnzeigenDialog } from "@/components/signatur/LinkKopieren";
import { PdfDocument, PdfPage, useElementBreite } from "@/components/signatur/pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ZUM_REITER: Record<string, { titel: string; param: string | null }> = {
  ausgehend: { titel: "Ausgehend", param: null },
  eingehend: { titel: "Von uns zu unterschreiben", param: "eingehend" },
  etv_protokoll: { titel: "ETV-Protokolle", param: "etv" },
};

export default function PapierPruefen() {
  const { id, signerId } = useParams<{ id: string; signerId: string }>();
  const navigate = useNavigate();
  const invalidate = useSignInvalidate();
  const { data: r, isLoading } = useSignRequest(id);
  const { data: events = [] } = useSignEvents(id);

  const signer = r?.signers.find((s) => s.id === signerId) ?? null;
  const papierSigner = useMemo(
    () => (r ? aktiveSigner(r).filter((s) => s.paper_path || s.status === "papier_eingegangen" || s.id === signerId) : []),
    [r, signerId],
  );

  // Signierte Adresse des Scans
  const { data: urls, error: urlFehler, isLoading: urlLaedt } = useQuery({
    queryKey: ["signatur", "papier-url", id, signerId],
    enabled: !!id && !!signerId,
    queryFn: () => signAction<{ papier?: string; quelle?: string }>("urls", { request_id: id, signer_id: signerId }),
    staleTime: 8 * 60_000,
  });

  // Absender der Antwort-Mail
  const { data: absender } = useQuery({
    queryKey: ["signatur", "papier-absender", signer?.paper_email_id],
    enabled: !!signer?.paper_email_id,
    queryFn: async () => {
      const { data } = await db.from("emails").select("from_address").eq("id", signer!.paper_email_id).maybeSingle();
      return (data?.from_address as string) ?? null;
    },
  });

  const [haken, setHaken] = useState({ feld: false, seiten: false, keine_aenderungen: false });
  const [seite, setSeite] = useState(1);
  const [anzahl, setAnzahl] = useState(0);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  /** „Nur Link“ ohne E-Mail: neuer Link nach dem Ablehnen, selbst verschicken */
  const [neuerLink, setNeuerLink] = useState<{ name: string; url: string } | null>(null);
  const [grund, setGrund] = useState("");
  const gross = useElementBreite<HTMLDivElement>();

  useEffect(() => {
    setHaken({ feld: false, seiten: false, keine_aenderungen: false });
    setSeite(1);
    setAnzahl(0);
  }, [signerId]);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>;
  }
  if (!r || !signer) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center font-sans text-[#595959]">
        Dieser Vorgang oder Unterzeichner wurde nicht gefunden.{" "}
        <Link to="/unterschriften" className="font-semibold text-[#B35300] underline">Zur Übersicht</Link>
      </div>
    );
  }

  const reiter = ZUM_REITER[r.typ] ?? ZUM_REITER.ausgehend;
  const seitenSoll = r.seitenzahl ?? signer.paper_page_count ?? anzahl;
  const seitenIst = signer.paper_page_count ?? anzahl;
  const perMail = signer.paper_eingang === "email";
  const eingangEvent = events.find((e) => e.ereignis === "scan_eingegangen" && e.signer_id === signer.id);
  const eingangZeit = signer.paper_eingang_at ?? eingangEvent?.created_at ?? null;
  const offen = signer.status === "papier_eingegangen" && r.status === "offen";
  const alleHaken = haken.feld && haken.seiten && haken.keine_aenderungen;
  const zurueck = `/unterschriften${reiter.param ? `?reiter=${reiter.param}&` : "?"}vorgang=${r.id}`;

  const uebernehmen = async () => {
    setBusy("accept");
    try {
      await signAction("accept_paper", { signer_id: signer.id, pruefung: haken });
      toast.success(`Papier-Unterschrift von ${signer.name} übernommen`);
      await invalidate();
      navigate(zurueck);
    } catch (e: any) {
      toast.error(e?.message || "Übernehmen fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const ablehnen = async () => {
    setBusy("reject");
    try {
      const res = await signAction<{ url?: string; name?: string }>("reject_paper", { signer_id: signer.id, grund: grund.trim() || undefined });
      setAblehnenOffen(false);
      await invalidate();
      if (res?.url) {
        // Keine E-Mail-Adresse hinterlegt: neuen Link anzeigen, das Büro schickt ihn selbst
        toast.success(`Abgelehnt – bitte ${signer.name} den neuen Link schicken`);
        setNeuerLink({ name: res.name || signer.name, url: res.url });
        return;
      }
      toast.success(`${signer.name} wurde gebeten, erneut zu unterschreiben`);
      navigate(zurueck);
    } catch (e: any) {
      toast.error(e?.message || "Ablehnen fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  const papierUrl = urls?.papier;
  const thumbW = 40;
  const grossW = Math.min(440, Math.max(260, gross.breite - 80));

  return (
    <div className="mx-auto w-full max-w-[1400px] font-sans text-[#2B2B2B]">
      {/* Brotkrumen */}
      <div className="-mx-3 -mt-3 mb-5 border-b border-[#E5E5E5] bg-white px-4 py-4 lg:-mx-6 lg:-mt-6 lg:px-7">
        <nav className="flex flex-wrap items-center gap-1.5 text-[14px] text-[#595959]" aria-label="Brotkrumen">
          <Link to="/unterschriften" className="hover:text-[#B35300]">Unterschriften</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to={`/unterschriften${reiter.param ? `?reiter=${reiter.param}` : ""}`} className="hover:text-[#B35300]">{reiter.titel}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-[#2B2B2B]">{r.nummer} · {r.titel}</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* ---------- Links: Scan ---------- */}
        <div className="flex min-h-[640px] min-w-0 flex-col overflow-hidden rounded-xl bg-[#EDEDED]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-[13px] text-[#595959]">
            <span>{seitenIst || "–"} von {seitenSoll || "–"} Seiten · aus Scan zusammengefügt</span>
            {eingangZeit && (
              <span>
                Eingegangen {perMail ? "per E-Mail" : "per Upload"} · {formatDateTime(eingangZeit)} Uhr
              </span>
            )}
          </div>
          <div ref={gross.ref} className="min-h-0 flex-1 overflow-auto px-5 pb-6 pt-3">
            {urlFehler ? (
              <Fehler text={(urlFehler as Error).message} />
            ) : urlLaedt ? (
              <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>
            ) : !papierUrl ? (
              <Fehler text="Zu diesem Unterzeichner liegt kein Scan vor." />
            ) : (
              <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>}>
                <PdfDocument
                  file={papierUrl}
                  onLoadSuccess={(pdf: any) => setAnzahl(pdf.numPages)}
                  onLoadError={() => setAnzahl(0)}
                  loading={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" /></div>}
                  error={<Fehler text="Der Scan konnte nicht geladen werden." />}
                >
                  {/* Vorschaubilder */}
                  <div className="flex flex-wrap justify-center gap-2 pb-4">
                    {Array.from({ length: anzahl }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSeite(n)}
                        className={cn(
                          "relative overflow-hidden rounded-[4px] bg-white",
                          n === seite ? "outline outline-2 outline-[#ee7202]" : "outline outline-1 outline-[#D6D6D6]",
                        )}
                        style={{ width: thumbW, minHeight: thumbW * 1.35 }}
                        title={`Seite ${n}`}
                      >
                        <PdfPage pageNumber={n} width={thumbW} renderTextLayer={false} renderAnnotationLayer={false} loading={null} />
                        <span className="absolute inset-x-0 bottom-0.5 text-center text-[10px] font-semibold text-[#595959]">{n}</span>
                      </button>
                    ))}
                  </div>
                  {/* Große Seite */}
                  {anzahl > 0 && (
                    <div className="flex justify-center">
                      <div className="bg-white shadow-[0_4px_18px_rgba(0,0,0,0.16)]">
                        <PdfPage
                          key={seite}
                          pageNumber={Math.min(seite, anzahl)}
                          width={grossW}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={<div style={{ width: grossW, height: grossW * 1.41 }} className="bg-white" />}
                        />
                      </div>
                    </div>
                  )}
                </PdfDocument>
              </Suspense>
            )}
          </div>
        </div>

        {/* ---------- Rechts: Prüfung ---------- */}
        <Karte className="flex flex-col self-start overflow-hidden lg:sticky lg:top-0">
          <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5">
            <h1 className="font-display text-[22px] font-normal leading-tight text-[#2B2B2B]">Papier-Unterschrift prüfen</h1>
            <p className="mt-1.5 text-[13px] leading-snug text-[#595959]">
              {perMail
                ? `Antwort von ${absender || signer.email || "unbekannt"}, automatisch zugeordnet über die Vorgangsnummer im Betreff.`
                : "Hochgeladen über den persönlichen Link."}
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div>
              <label htmlFor="pp-signer" className="mb-1.5 block text-[13px] font-semibold">Unterzeichner</label>
              <select
                id="pp-signer"
                className="h-11 w-full rounded-lg border border-[#D6D6D6] bg-white px-3 text-[14px] outline-none focus:border-[#ee7202]"
                value={signer.id}
                onChange={(e) => navigate(`/unterschriften/${r.id}/papier/${e.target.value}`, { replace: true })}
              >
                {papierSigner.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.rolle ? ` (${s.rolle})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {!offen && (
              <div className="flex items-start gap-2 rounded-lg bg-[#FAFAFA] px-3 py-2.5 text-[13px] text-[#595959]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {signer.status === "papier_uebernommen"
                  ? `Bereits übernommen${signer.signed_at ? ` am ${formatDate(signer.signed_at)}` : ""}.`
                  : r.status !== "offen"
                    ? "Der Vorgang ist nicht mehr offen."
                    : "Für diesen Unterzeichner ist kein Papier zur Prüfung eingegangen."}
              </div>
            )}

            <div>
              <div className="mb-2 text-[13px] font-semibold">Prüfung</div>
              <div className="space-y-2.5">
                <Haken an={haken.feld} onChange={(v) => setHaken((h) => ({ ...h, feld: v }))} disabled={!offen}>
                  Unterschrift am richtigen Feld
                </Haken>
                <Haken an={haken.seiten} onChange={(v) => setHaken((h) => ({ ...h, seiten: v }))} disabled={!offen}>
                  Alle {seitenSoll || ""} Seiten vorhanden und gut lesbar
                </Haken>
                <Haken an={haken.keine_aenderungen} onChange={(v) => setHaken((h) => ({ ...h, keine_aenderungen: v }))} disabled={!offen}>
                  Keine handschriftlichen Änderungen am Text
                </Haken>
              </div>
            </div>

            <div className="rounded-lg bg-[#FFF7ED] px-3.5 py-3 text-[13px] leading-relaxed text-[#2B2B2B]">
              Nach dem Übernehmen wird der vollständige Scan dem Vorgang beigefügt und im Nachweis als „Papier, eingegangen
              {perMail ? " per E-Mail" : " per Upload"} am {eingangZeit ? formatDate(eingangZeit) : "…"}“ vermerkt.
            </div>

            <div>
              <Abschnitt className="mb-2">Stand</Abschnitt>
              <div className="space-y-1.5">
                {aktiveSigner(r).map((s) => (
                  <StandZeile key={s.id} s={s} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-[#E5E5E5] px-6 py-4">
            <SigButton onClick={() => setAblehnenOffen(true)} disabled={!offen || !!busy} className="h-auto min-h-11 py-1.5 leading-tight">
              Ablehnen &amp; neu anfordern
            </SigButton>
            <SigButton
              variante="primaer"
              onClick={uebernehmen}
              disabled={!offen || !alleHaken}
              loading={busy === "accept"}
              className="h-auto min-h-11 py-1.5 leading-tight"
              title={!alleHaken ? "Bitte zuerst alle drei Punkte prüfen" : undefined}
            >
              Papier-Unterschrift übernehmen
            </SigButton>
          </div>
        </Karte>
      </div>

      <Dialog open={ablehnenOffen} onOpenChange={(o) => !busy && setAblehnenOffen(o)}>
        <DialogContent className="max-w-[460px] font-sans">
          <DialogTitle className="font-display text-[20px] font-normal">Ablehnen &amp; neu anfordern</DialogTitle>
          <DialogDescription className="text-[13px] text-[#595959]">
            {signer.name} bekommt einen neuen Link und die Bitte, erneut zu unterschreiben.
          </DialogDescription>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold">Grund (optional, steht in der E-Mail)</span>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-[#D6D6D6] px-3 py-2 text-[14px] outline-none focus:border-[#ee7202]"
              placeholder="z. B. Seite 4 fehlt"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2.5">
            <SigButton onClick={() => setAblehnenOffen(false)} disabled={busy === "reject"}>Abbrechen</SigButton>
            <SigButton variante="primaer" onClick={ablehnen} loading={busy === "reject"}>Neu anfordern</SigButton>
          </div>
        </DialogContent>
      </Dialog>
      <LinksAnzeigenDialog
        titel="Neuer Link zum Verschicken"
        beschreibung={`Für ${neuerLink?.name ?? ""} ist keine E-Mail-Adresse hinterlegt. Bitte den neuen Link selbst schicken und um eine erneute Unterschrift bitten.`}
        links={neuerLink ? [neuerLink] : null}
        onClose={() => {
          setNeuerLink(null);
          navigate(zurueck);
        }}
      />
    </div>
  );
}

function Haken({ an, onChange, disabled, children }: { an: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex items-center gap-3 text-[14px]", disabled ? "text-[#9A9A9A]" : "cursor-pointer text-[#2B2B2B]")}>
      <Checkbox
        checked={an}
        disabled={disabled}
        onCheckedChange={(v) => onChange(!!v)}
        className="h-5 w-5 rounded-[4px] border-[#9A9A9A] data-[state=checked]:border-[#B35300] data-[state=checked]:bg-[#B35300]"
      />
      {children}
    </label>
  );
}

function StandZeile({ s }: { s: SignSigner }) {
  let text: string;
  let farbe: string;
  let check = false;
  if (s.status === "unterschrieben" || s.status === "papier_uebernommen") {
    text = s.status === "papier_uebernommen" ? "Papier" : s.methode === "intern" ? "intern" : "online";
    farbe = SIG.gruen;
    check = true;
  } else if (s.status === "papier_eingegangen") {
    text = "Papier eingegangen";
    farbe = SIG.button;
  } else {
    const st = signerStatusLang(s);
    text = st.text;
    farbe = TON_FARBE[st.ton];
  }
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="truncate text-[#2B2B2B]">{signerName(s)}</span>
      <span className={cn("flex shrink-0 items-center gap-1", (check || s.status === "papier_eingegangen") && "font-semibold")} style={{ color: farbe }}>
        {check && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
        {text}
      </span>
    </div>
  );
}

function Fehler({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center text-[14px] text-[#595959]">
      <AlertCircle className="h-8 w-8 text-[#B35300]" />
      {text}
    </div>
  );
}
