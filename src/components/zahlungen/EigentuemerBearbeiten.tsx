import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bankName, cleanIban, ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import type { Eigentuemer } from "@/lib/eigentuemer";

/**
 * Name und Konto eines Eigentümers für den Hausgeld-Einzug ändern.
 * Name: am Kontakt (bzw. an der abweichenden Angabe der Einheit, falls gesetzt).
 * Konto: Bankverbindung der Einheit; ein bestehendes Mandat behält seine Referenz
 * und bekommt das neue Konto (Kontowechsel unter demselben Mandat).
 */
export function EigentuemerBearbeiten({ eigentuemer, onClose }: { eigentuemer: Eigentuemer | null; onClose: () => void }) {
  const qc = useQueryClient();
  const e = eigentuemer;
  const [laedt, setLaedt] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [mitOverride, setMitOverride] = useState(false);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [firma, setFirma] = useState("");
  const [inhaber, setInhaber] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [kontoId, setKontoId] = useState<string | null>(null);

  useEffect(() => {
    if (!e) return;
    setLaedt(true);
    (async () => {
      const { data: a } = await (supabase as any)
        .from("contact_building_assignments")
        .select("bank_account_id, first_name_override, last_name_override, company_name_override, iban_override, iban_holder_override, contacts(first_name, last_name, company_name)")
        .eq("id", e.assignmentId)
        .maybeSingle();
      const ov = !!(a?.first_name_override || a?.last_name_override || a?.company_name_override);
      setMitOverride(ov);
      setVorname((ov ? a?.first_name_override : a?.contacts?.first_name) ?? "");
      setNachname((ov ? a?.last_name_override : a?.contacts?.last_name) ?? "");
      setFirma((ov ? a?.company_name_override : a?.contacts?.company_name) ?? "");
      setInhaber(e.mandat?.kontoinhaber ?? e.kontoinhaber ?? "");
      setIban(ibanFormatiert(e.mandat?.iban ?? e.iban ?? ""));
      setBic(e.mandat?.bic ?? e.bic ?? "");
      setKontoId(a?.bank_account_id ?? null);
      setLaedt(false);
    })();
  }, [e]);

  const sauber = cleanIban(iban);
  const ibanFehler = sauber && !ibanGueltig(sauber) ? "IBAN ist nicht gültig – bitte prüfen" : null;
  const kontoGeaendert = !!e && (sauber !== cleanIban(e.mandat?.iban ?? e.iban ?? "") || inhaber.trim() !== (e.mandat?.kontoinhaber ?? e.kontoinhaber ?? ""));

  const speichern = async () => {
    if (!e || ibanFehler) return;
    if (!vorname.trim() && !nachname.trim() && !firma.trim()) return toast.error("Bitte einen Namen eintragen.");
    setSpeichert(true);
    try {
      const db = supabase as any;
      // 1) Name
      if (mitOverride) {
        const { error } = await db.from("contact_building_assignments").update({
          first_name_override: vorname.trim() || null,
          last_name_override: nachname.trim() || null,
          company_name_override: firma.trim() || null,
        }).eq("id", e.assignmentId);
        if (error) throw error;
      } else if (e.contactId) {
        const { error } = await db.from("contacts").update({
          first_name: vorname.trim() || null,
          last_name: nachname.trim() || null,
          company_name: firma.trim() || null,
        }).eq("id", e.contactId);
        if (error) throw error;
      }

      // 2) Konto
      if (kontoGeaendert && sauber) {
        const daten = { account_holder: inhaber.trim() || null, iban: sauber, bic: bic.trim().toUpperCase().replace(/\s+/g, "") || null, bank_name: bankName(sauber, "") || null };
        let id = kontoId;
        if (!id && e.contactId) {
          const { data: vorhanden } = await db.from("contact_bank_accounts").select("id, iban").eq("contact_id", e.contactId);
          id = (vorhanden ?? []).find((k: any) => cleanIban(k.iban) === sauber)?.id ?? null;
        }
        if (id) {
          const { error } = await db.from("contact_bank_accounts").update(daten).eq("id", id);
          if (error) throw error;
        } else if (e.contactId) {
          const { data: neu, error } = await db.from("contact_bank_accounts").insert({ ...daten, contact_id: e.contactId, is_default: false }).select("id").single();
          if (error) throw error;
          id = neu.id;
        }
        await db.from("contact_building_assignments").update({ bank_account_id: id, iban_override: null, iban_holder_override: null }).eq("id", e.assignmentId);

        // Mandat: Referenz bleibt, Konto wird umgestellt
        if (e.mandat?.id) {
          const notiz = [e.mandat.notiz, `Kontowechsel am ${new Date().toLocaleDateString("de-DE")}: vorher ${ibanFormatiert(e.mandat.iban ?? "")}`].filter(Boolean).join(" | ");
          const { error } = await db.from("sepa_mandates").update({ iban: sauber, bic: daten.bic, kontoinhaber: daten.account_holder, notiz, updated_at: new Date().toISOString() }).eq("id", e.mandat.id);
          if (error) throw error;
        }
      }
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["mandate"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Speichern fehlgeschlagen");
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={!!e} onOpenChange={(o) => !o && !speichert && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Eigentümer bearbeiten</DialogTitle>
          <DialogDescription>
            {e ? `Einheit ${e.einheit || "–"}${e.lage ? ` · ${e.lage}` : ""}` : ""} – Name und Konto für den Hausgeld-Einzug.
          </DialogDescription>
        </DialogHeader>
        {laedt ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Name</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={vorname} onChange={(x) => setVorname(x.target.value)} placeholder="Vorname(n), z. B. Edith und Franz-Josef" aria-label="Vorname" />
                <Input value={nachname} onChange={(x) => setNachname(x.target.value)} placeholder="Nachname" aria-label="Nachname" />
              </div>
              <Input value={firma} onChange={(x) => setFirma(x.target.value)} placeholder="Firma / Gemeinschaft (statt Name, optional)" aria-label="Firma" />
              <p className="text-xs text-muted-foreground">
                {mitOverride ? "Gilt nur für diese Einheit (abweichende Angabe)." : "Gilt für den Kontakt – also überall in der App."}
              </p>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Konto für den Einzug</legend>
              <Input value={inhaber} onChange={(x) => setInhaber(x.target.value)} placeholder="Kontoinhaber" aria-label="Kontoinhaber" />
              <Input
                value={iban}
                onChange={(x) => setIban(x.target.value)}
                onBlur={() => sauber && ibanGueltig(sauber) && setIban(ibanFormatiert(sauber))}
                placeholder="IBAN"
                aria-label="IBAN"
                className={ibanFehler ? "border-destructive font-mono" : "font-mono"}
              />
              {ibanFehler && <p className="text-xs text-destructive">{ibanFehler}</p>}
              <Input value={bic} onChange={(x) => setBic(x.target.value)} placeholder="BIC (optional)" aria-label="BIC" className="font-mono" />
              {e?.mandat && kontoGeaendert && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Das Mandat {e.mandat.mandatsreferenz} bleibt bestehen und zieht künftig vom neuen Konto ein. Am besten liegt dafür eine schriftliche Mitteilung des Eigentümers vor.
                </p>
              )}
            </fieldset>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={speichert}>
            Abbrechen
          </Button>
          <Button onClick={speichern} disabled={speichert || laedt || !!ibanFehler}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
