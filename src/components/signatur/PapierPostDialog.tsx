/**
 * „Papier per Post erhalten“: Das Büro lädt den Scan einer unterschriebenen Papier-Rücksendung hoch
 * (sign-request paper_upload). Danach geht es wie bei Papier per E-Mail/Upload weiter mit
 * „Papier-Unterschrift prüfen“ (Prüfpunkte, handschriftliche Angaben übertragen, übernehmen).
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, Upload as UploadIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSignInvalidate, type SignRequest, type SignSigner } from "@/lib/signatur";
import { DateiFehler, dateiVorbereiten, type Upload } from "./public/dateien";
import { SigButton } from "./ui";

/** Kann das Büro für diesen Unterzeichner ein per Post eingegangenes Papier hochladen? */
export const kannPapierPost = (r: Pick<SignRequest, "status" | "typ">, s: SignSigner) =>
  r.status === "offen" && r.typ !== "eingehend" && s.methode !== "intern" &&
  ["offen", "geoeffnet", "abgelehnt", "wartet"].includes(s.status);

/** sign-request „paper_upload“ (Scan einer per Post eingegangenen Papier-Unterschrift). */
async function papierHochladen(signerId: string, dateien: { name: string; mime: string; base64: string }[]) {
  const { data, error } = await supabase.functions.invoke("sign-request", {
    body: { action: "paper_upload", signer_id: signerId, dateien },
  });
  if (error) {
    let msg = error.message || "Hochladen fehlgeschlagen";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      } catch {
        /* Text bleibt */
      }
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as { seiten: number; warnung: string | null };
}

interface Props {
  request: SignRequest;
  signer: SignSigner | null;
  onClose: () => void;
}

export function PapierPostDialog({ request: r, signer, onClose }: Props) {
  const navigate = useNavigate();
  const invalidate = useSignInvalidate();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [lesen, setLesen] = useState(false);
  const [busy, setBusy] = useState(false);

  const schliessen = () => {
    if (busy) return;
    setUploads([]);
    onClose();
  };

  const hinzufuegen = async (liste: FileList | null) => {
    if (!liste?.length) return;
    setLesen(true);
    try {
      const neu: Upload[] = [];
      for (const f of Array.from(liste)) neu.push(await dateiVorbereiten(f));
      setUploads((u) => [...u, ...neu]);
    } catch (e) {
      toast.error(e instanceof DateiFehler ? e.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      setLesen(false);
      if (input.current) input.current.value = "";
    }
  };

  const seiten = uploads.reduce((a, u) => a + u.seiten, 0);
  const soll = r.seitenzahl ?? null;

  const hochladen = async () => {
    if (!signer || !uploads.length) return;
    setBusy(true);
    try {
      const res = await papierHochladen(signer.id, uploads.map(({ name, mime, base64 }) => ({ name, mime, base64 })));
      if (res?.warnung) toast.warning(res.warnung);
      else toast.success(`Scan von ${signer.name} gespeichert – bitte jetzt prüfen`);
      await invalidate();
      setUploads([]);
      onClose();
      navigate(`/unterschriften/${r.id}/papier/${signer.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hochladen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!signer} onOpenChange={(o) => !o && schliessen()}>
      <DialogContent className="max-w-[480px] font-sans">
        <DialogTitle className="font-display text-[20px] font-normal">Papier per Post erhalten</DialogTitle>
        <DialogDescription className="text-[13px] leading-snug text-[#595959]">
          {signer?.name} hat auf Papier unterschrieben und es per Post zurückgeschickt. Bitte alle Seiten einscannen und hier
          hochladen. Im nächsten Schritt prüfst du die Unterschrift und überträgst handschriftliche Angaben (z. B. die IBAN).
        </DialogDescription>

        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => hinzufuegen(e.target.files)}
        />

        {uploads.length > 0 && (
          <ul className="divide-y divide-[#EEEEEE] rounded-xl border border-[#E5E5E5]">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <FileText className="h-4 w-4 shrink-0 text-[#B35300]" />
                <span className="min-w-0 flex-1 truncate text-[#2B2B2B]">{u.name}</span>
                <span className="shrink-0 text-[#6B6B6B]">{u.seiten} {u.seiten === 1 ? "Seite" : "Seiten"}</span>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-[#6B6B6B] hover:bg-[#F2F2F2]"
                  onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}
                  disabled={busy}
                  aria-label={`${u.name} entfernen`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <SigButton variante="gestrichelt" className="w-full" onClick={() => input.current?.click()} disabled={busy || lesen}>
          {lesen ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
          {uploads.length ? "Weitere Seiten hinzufügen" : "Scan auswählen (PDF, JPG oder PNG)"}
        </SigButton>

        {uploads.length > 0 && soll && seiten !== soll && (
          <p className="rounded-lg bg-[#FFF7ED] px-3 py-2 text-[12.5px] text-[#7A3B00]">
            Das Dokument hat {soll} {soll === 1 ? "Seite" : "Seiten"}, ausgewählt sind {seiten}.
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <SigButton onClick={schliessen} disabled={busy}>Abbrechen</SigButton>
          <SigButton variante="primaer" onClick={hochladen} loading={busy} disabled={!uploads.length || lesen}>
            Hochladen und prüfen
          </SigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
