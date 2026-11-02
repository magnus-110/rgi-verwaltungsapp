/**
 * „Zur Unterschrift“ in der Mail-Ansicht (Fall B, eingehende Dokumente).
 *
 * Ein PDF-Anhang wird einem Büro-Mitarbeiter mit Frist zur Unterschrift
 * zugewiesen. Es entsteht ein Vorgang typ „eingehend“ (sign-request
 * create_incoming); er erscheint unter Unterschriften › „Von uns zu
 * unterschreiben“. Es werden dabei keine Mails verschickt.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  addDaysIso, signAction, titelAusDateiname, todayIso, useBueroMitarbeiter, useSignInvalidate,
} from "@/lib/signatur";
import { eingabeKlasse, FeldLabel, SigButton } from "./ui";

export interface PdfAnhang {
  id: string;
  file_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emailId: string;
  anhaenge: PdfAnhang[];
  /** Vorauswahl, z. B. der Anhang, an dem geklickt wurde */
  anhangId?: string | null;
  buildingId?: string | null;
}

export function ZurUnterschriftDialog({ open, onOpenChange, emailId, anhaenge, anhangId, buildingId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidate = useSignInvalidate();
  const { data: mitarbeiter = [] } = useBueroMitarbeiter();
  const { data: objekte = [] } = useQuery({
    queryKey: ["signatur", "objekte-auswahl"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60_000,
  });

  const [anhang, setAnhang] = useState("");
  const [titel, setTitel] = useState("");
  const [wer, setWer] = useState("");
  const [frist, setFrist] = useState(addDaysIso(3));
  const [objekt, setObjekt] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const a = anhaenge.find((x) => x.id === anhangId) ?? anhaenge[0];
    setAnhang(a?.id ?? "");
    setTitel(a ? titelAusDateiname(a.file_name) : "");
    setWer(user?.id ?? "");
    setFrist(addDaysIso(3));
    setObjekt(buildingId ?? "");
    setFehler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const anlegen = async () => {
    if (!anhang) return setFehler("Bitte einen Anhang auswählen.");
    if (!wer) return setFehler("Bitte einen Mitarbeiter auswählen.");
    if (!frist || frist < todayIso()) return setFehler("Die Frist darf nicht in der Vergangenheit liegen.");
    setBusy(true);
    setFehler(null);
    try {
      const r = await signAction<{ id: string; nummer: string }>("create_incoming", {
        email_id: emailId,
        attachment_id: anhang,
        zugewiesen_an: wer,
        frist,
        building_id: objekt || null,
        titel: titel.trim() || undefined,
      });
      await invalidate();
      const ich = wer === user?.id;
      toast.success(`Zur Unterschrift vorgemerkt (${r.nummer})`, {
        description: ich ? "Unter Unterschriften › „Von uns zu unterschreiben“." : `${mitarbeiter.find((m) => m.user_id === wer)?.name ?? "Kollege"} wurde benachrichtigt.`,
        action: { label: "Öffnen", onClick: () => navigate(`/unterschriften?reiter=eingehend&vorgang=${r.id}`) },
      });
      onOpenChange(false);
    } catch (e: any) {
      setFehler(e?.message || "Konnte nicht angelegt werden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-[460px] gap-0 p-0 font-sans">
        <div className="border-b border-[#E5E5E5] px-6 pb-4 pt-5 pr-12">
          <DialogTitle className="font-display text-[20px] font-normal leading-tight text-[#2B2B2B]">Zur Unterschrift</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#595959]">
            Erscheint unter Unterschriften › „Von uns zu unterschreiben“. Es wird keine E-Mail verschickt.
          </DialogDescription>
        </div>
        <div className="space-y-3.5 px-6 py-4">
          {anhaenge.length > 1 && (
            <div>
              <FeldLabel htmlFor="zu-anhang">Anhang</FeldLabel>
              <select
                id="zu-anhang"
                className={eingabeKlasse}
                value={anhang}
                onChange={(e) => {
                  setAnhang(e.target.value);
                  const a = anhaenge.find((x) => x.id === e.target.value);
                  if (a) setTitel(titelAusDateiname(a.file_name));
                }}
              >
                {anhaenge.map((a) => (
                  <option key={a.id} value={a.id}>{a.file_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <FeldLabel htmlFor="zu-titel">Dokument</FeldLabel>
            <input id="zu-titel" className={eingabeKlasse} value={titel} onChange={(e) => setTitel(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div>
              <FeldLabel htmlFor="zu-wer">Wer unterschreibt?</FeldLabel>
              <select id="zu-wer" className={eingabeKlasse} value={wer} onChange={(e) => setWer(e.target.value)}>
                {!mitarbeiter.some((m) => m.user_id === wer) && wer && <option value={wer}>Ich</option>}
                {mitarbeiter.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                    {m.user_id === user?.id ? " (ich)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FeldLabel htmlFor="zu-frist">Frist</FeldLabel>
              <input id="zu-frist" type="date" className={eingabeKlasse} value={frist} min={todayIso()} onChange={(e) => setFrist(e.target.value)} />
            </div>
          </div>
          <div>
            <FeldLabel htmlFor="zu-objekt">Objekt</FeldLabel>
            <select id="zu-objekt" className={eingabeKlasse} value={objekt} onChange={(e) => setObjekt(e.target.value)}>
              <option value="">Kein Objekt</option>
              {objekte.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          {fehler && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#B35300]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {fehler}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-[#E5E5E5] px-6 py-4">
          <SigButton onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</SigButton>
          <SigButton variante="primaer" onClick={anlegen} loading={busy}>Zur Unterschrift</SigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
