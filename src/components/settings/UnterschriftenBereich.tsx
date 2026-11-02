/**
 * Einstellungen › Unterschriften: Mail-Vorlagen je Dokumentart (Betreff,
 * Text, Frist, Erinnerung) und der Weg zur eigenen hinterlegten Unterschrift.
 * Die Vorlagen werden direkt in sign_mail_templates gespeichert.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMySignature } from "@/lib/documentSigning";
import { SIGNATUR_KEY, useMailTemplates, type MailTemplate } from "@/lib/signatur";
import { Abschnitt, eingabeKlasse, FeldLabel, Karte, SigButton } from "@/components/signatur/ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function UnterschriftenBereich() {
  const { data: vorlagen = [], isLoading } = useMailTemplates();
  const { data: meine } = useMySignature();
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const aktiv = vorlagen.find((v) => v.dokumentart === auswahl) ?? vorlagen[0] ?? null;

  return (
    <div className="space-y-5 font-sans text-[#2B2B2B]">
      <Karte className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-[#E5E5E5] bg-[#FAFAFA]">
          {meine ? (
            <img src={meine} alt="Hinterlegte Unterschrift" className="max-h-14 max-w-[90%] object-contain" />
          ) : (
            <PenLine className="h-5 w-5 text-[#6B6B6B]" />
          )}
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="text-[14px] font-semibold">Eigene Unterschrift</div>
          <div className="text-[13px] text-[#595959]">
            {meine
              ? "Wird eingesetzt, wenn RGI intern unterschreibt („Jetzt unterschreiben“)."
              : "Noch nicht hinterlegt. Ohne hinterlegte Unterschrift kann RGI nicht intern unterschreiben."}
          </div>
        </div>
        <Link
          to="/settings?tab=profil"
          className="inline-flex h-11 items-center rounded-lg border border-[#D6D6D6] bg-white px-4 text-[14px] font-semibold hover:bg-[#FAFAFA]"
        >
          Eigene Unterschrift hinterlegen
        </Link>
      </Karte>

      <Karte className="overflow-hidden">
        <div className="border-b border-[#E5E5E5] px-5 py-4">
          <h3 className="font-display text-[18px] font-normal">E-Mail-Vorlagen je Dokumentart</h3>
          <p className="mt-1 text-[13px] text-[#595959]">
            Werden im Dialog „Unterschrift anfordern“ vorausgefüllt und können dort vor dem Versand geändert werden.
            Platzhalter: {"{Anrede} {Dokument} {Objekt} {Frist}"}. Button „Unterschreiben“ und Papier-Link werden immer
            automatisch angefügt.
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#6B6B6B]" /></div>
        ) : vorlagen.length === 0 ? (
          <div className="px-5 py-8 text-[14px] text-[#6B6B6B]">Keine Vorlagen gefunden.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="border-b border-[#E5E5E5] py-2 md:border-b-0 md:border-r">
              {vorlagen.map((v) => {
                const an = v.dokumentart === aktiv?.dokumentart;
                return (
                  <button
                    key={v.dokumentart}
                    type="button"
                    onClick={() => setAuswahl(v.dokumentart)}
                    className={`block w-full px-5 py-2.5 text-left text-[14px] ${an ? "bg-[#FFF7ED] font-semibold text-[#B35300]" : "hover:bg-[#FAFAFA]"}`}
                  >
                    {v.bezeichnung}
                    <span className="block text-[12px] font-normal text-[#6B6B6B]">
                      Frist {v.frist_tage} Tage · Erinnerung nach {v.erinnerung_nach_tagen} Tagen
                    </span>
                  </button>
                );
              })}
            </div>
            {aktiv && <VorlageForm key={aktiv.dokumentart} vorlage={aktiv} />}
          </div>
        )}
      </Karte>
    </div>
  );
}

function VorlageForm({ vorlage }: { vorlage: MailTemplate }) {
  const qc = useQueryClient();
  const [f, setF] = useState(vorlage);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => setF(vorlage), [vorlage]);
  const geaendert =
    f.betreff !== vorlage.betreff || f.text !== vorlage.text ||
    f.frist_tage !== vorlage.frist_tage || f.erinnerung_nach_tagen !== vorlage.erinnerung_nach_tagen;

  const speichern = async () => {
    if (!f.betreff.trim() || !f.text.trim()) {
      toast.error("Betreff und Text dürfen nicht leer sein.");
      return;
    }
    if (f.frist_tage < 1 || f.erinnerung_nach_tagen < 1) {
      toast.error("Frist und Erinnerung müssen mindestens 1 Tag sein.");
      return;
    }
    setSpeichert(true);
    try {
      const { error } = await db
        .from("sign_mail_templates")
        .update({
          betreff: f.betreff.trim(),
          text: f.text,
          frist_tage: f.frist_tage,
          erinnerung_nach_tagen: f.erinnerung_nach_tagen,
          updated_at: new Date().toISOString(),
        })
        .eq("dokumentart", vorlage.dokumentart);
      if (error) throw error;
      toast.success(`Vorlage „${vorlage.bezeichnung}“ gespeichert`);
      await qc.invalidateQueries({ queryKey: [...SIGNATUR_KEY, "vorlagen"] });
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e?.message || e));
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <Abschnitt>{vorlage.bezeichnung}</Abschnitt>
      <div>
        <FeldLabel htmlFor="v-betreff">Betreff</FeldLabel>
        <input id="v-betreff" className={eingabeKlasse} value={f.betreff} onChange={(e) => setF({ ...f, betreff: e.target.value })} />
      </div>
      <div>
        <FeldLabel htmlFor="v-text">Text</FeldLabel>
        <textarea
          id="v-text"
          rows={7}
          className={`${eingabeKlasse} h-auto py-2.5 leading-relaxed`}
          value={f.text}
          onChange={(e) => setF({ ...f, text: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FeldLabel htmlFor="v-frist">Frist (Tage)</FeldLabel>
          <input
            id="v-frist"
            type="number"
            min={1}
            className={eingabeKlasse}
            value={f.frist_tage}
            onChange={(e) => setF({ ...f, frist_tage: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <FeldLabel htmlFor="v-erinnerung">Erinnerung nach (Tagen)</FeldLabel>
          <input
            id="v-erinnerung"
            type="number"
            min={1}
            className={eingabeKlasse}
            value={f.erinnerung_nach_tagen}
            onChange={(e) => setF({ ...f, erinnerung_nach_tagen: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {geaendert && <span className="text-[12.5px] text-[#6B6B6B]">Nicht gespeichert</span>}
        <SigButton onClick={() => setF(vorlage)} disabled={!geaendert || speichert}>Verwerfen</SigButton>
        <SigButton variante="primaer" onClick={speichern} disabled={!geaendert} loading={speichert}>Speichern</SigButton>
      </div>
    </div>
  );
}
