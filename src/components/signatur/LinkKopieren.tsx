/**
 * „Nur Link erstellen (ich verschicke selbst)“: Link-Zeilen mit „Kopieren“,
 * Dialog „Neuen Link erstellen“ (alter Link wird ungültig) und eine
 * einfache Anzeige für Links, die der Server gerade erzeugt hat.
 *
 * Der Klartext-Link existiert nur in der Antwort der Edge-Funktion –
 * gespeichert wird lediglich sein SHA-256. Deshalb wird er nur jetzt gezeigt.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { signAction, useSignInvalidate, type SignRequest, type SignSigner } from "@/lib/signatur";
import { SigButton } from "./ui";

export const LINK_HINWEIS =
  "Der Link ist 14 Tage gültig. Er wird aus Sicherheitsgründen nur jetzt angezeigt – bei Bedarf können Sie später einen neuen Link erstellen.";

/** In die Zwischenablage kopieren; Ausweichweg für ältere Browser/ohne HTTPS. */
export async function linkKopieren(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        toast.success("Link kopiert");
        return true;
      }
    } catch {
      /* unten */
    }
    toast.error("Kopieren nicht möglich – bitte den Link markieren und mit Strg+C kopieren.");
    return false;
  }
}

/** Eine Zeile: Name, Link-Feld (nur lesen, Klick markiert alles) und „Kopieren“. */
export function LinkZeile({ name, url, zusatz }: { name?: string; url: string; zusatz?: string | null }) {
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => setKopiert(false), [url]);
  return (
    <div className="rounded-[10px] border border-[#E5E5E5] bg-white px-3.5 py-3">
      {name && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-[#2B2B2B]">{name}</span>
          {zusatz && <span className="shrink-0 text-[12px] text-[#6B6B6B]">{zusatz}</span>}
        </div>
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label={name ? `Link für ${name}` : "Link"}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-lg border border-[#D6D6D6] bg-[#FAFAFA] px-3 font-mono text-[12.5px] text-[#2B2B2B] outline-none focus:border-[#ee7202] focus:ring-1 focus:ring-[#ee7202]"
        />
        <SigButton
          variante="primaer"
          className="shrink-0"
          onClick={async () => setKopiert(await linkKopieren(url))}
        >
          {kopiert ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Copy className="h-4 w-4" />}
          {kopiert ? "Kopiert" : "Kopieren"}
        </SigButton>
      </div>
    </div>
  );
}

/** Kasten mit dem Hinweis zur Gültigkeit. */
export function LinkHinweis({ children = LINK_HINWEIS }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[10px] bg-[#FFF7ED] px-3.5 py-2.5 text-[13px] leading-snug text-[#2B2B2B]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B35300]" />
      <span>{children}</span>
    </div>
  );
}

/**
 * „Neuen Link erstellen“ für einen „Nur Link“-Unterzeichner: erst Hinweis
 * (alter Link wird ungültig), dann der neue Link mit „Kopieren“.
 */
export function NeuerLinkDialog({
  request, signer, onClose,
}: { request: Pick<SignRequest, "nummer" | "titel">; signer: SignSigner | null; onClose: () => void }) {
  const invalidate = useSignInvalidate();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const hatLink = !!signer?.token_hash;

  useEffect(() => {
    setUrl(null);
    setFehler(null);
  }, [signer?.id]);

  const erstellen = async () => {
    if (!signer) return;
    setBusy(true);
    setFehler(null);
    try {
      const r = await signAction<{ url: string }>("neuer_link", { signer_id: signer.id });
      setUrl(r.url);
      await invalidate();
    } catch (e: any) {
      setFehler(e?.message || "Link konnte nicht erstellt werden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!signer} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[520px] font-sans">
        <DialogTitle className="font-display text-[20px] font-normal text-[#2B2B2B]">
          {url ? "Link zum Verschicken" : hatLink ? "Neuen Link erstellen" : "Link erstellen"}
        </DialogTitle>
        <DialogDescription className="text-[13px] text-[#595959]">
          {request.titel} · {request.nummer} · {signer?.name}
        </DialogDescription>
        {url ? (
          <div className="space-y-3">
            <LinkZeile name={signer?.name} url={url} zusatz={signer?.email || "ohne E-Mail"} />
            <LinkHinweis />
            <div className="flex justify-end pt-1">
              <SigButton variante="primaer" onClick={onClose} className="px-6">Fertig</SigButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-[10px] border border-[#E5E5E5] bg-[#FAFAFA] px-3.5 py-3 text-[13.5px] leading-snug text-[#2B2B2B]">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#B35300]" />
              <span>
                {hatLink
                  ? <>Es wird ein neuer persönlicher Link für {signer?.name} erstellt. <b className="font-semibold">Der bisherige Link wird damit ungültig.</b> Der neue Link ist wieder 14 Tage gültig. Es wird keine E-Mail versendet.</>
                  : <>Es wird ein persönlicher Link für {signer?.name} erstellt (14 Tage gültig). Es wird keine E-Mail versendet – Sie verschicken den Link selbst.</>}
              </span>
            </div>
            {fehler && (
              <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fehler}
              </div>
            )}
            <div className="flex justify-end gap-2.5 pt-1">
              <SigButton onClick={onClose} disabled={busy}>Abbrechen</SigButton>
              <SigButton variante="primaer" onClick={erstellen} loading={busy}>
                {hatLink ? "Neuen Link erstellen" : "Link erstellen"}
              </SigButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Fertige Links anzeigen (z. B. nach „Papier ablehnen“ bei einem Unterzeichner ohne E-Mail). */
export function LinksAnzeigenDialog({
  titel, beschreibung, links, onClose,
}: { titel: string; beschreibung?: string; links: { name: string; url: string }[] | null; onClose: () => void }) {
  return (
    <Dialog open={!!links?.length} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] font-sans">
        <DialogTitle className="font-display text-[20px] font-normal text-[#2B2B2B]">{titel}</DialogTitle>
        <DialogDescription className="text-[13px] text-[#595959]">{beschreibung ?? "Bitte den Link selbst verschicken."}</DialogDescription>
        <div className="space-y-2.5">
          {links?.map((l) => <LinkZeile key={l.url} name={l.name} url={l.url} />)}
          <LinkHinweis />
          <div className="flex justify-end pt-1">
            <SigButton variante="primaer" onClick={onClose} className="px-6">Fertig</SigButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
