import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { bankName, cleanIban, ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import type { Eigentuemer, Mandat } from "@/lib/eigentuemer";

type Modus = "behalten" | "neu" | "aktivieren" | "keins";

const STATUS_TEXT: Record<string, string> = {
  aktiv: "aktiv",
  pruefen: "zur Freigabe",
  ersetzt: "ersetzt",
  verworfen: "verworfen",
  widerrufen: "widerrufen",
};

const datumDe = (d: string | null | undefined) => (d ? new Date(d + "T12:00:00").toLocaleDateString("de-DE") : "–");

/**
 * Zahler eines Eigentümers für den Hausgeld-Einzug bearbeiten: Name, Konto und SEPA-Mandat.
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
  // Mandat
  const [mandate, setMandate] = useState<Mandat[]>([]);
  const [aktiv, setAktiv] = useState<Mandat | null>(null);
  const [modus, setModus] = useState<Modus>("keins");
  const [aktivierenId, setAktivierenId] = useState<string | null>(null);
  const [referenz, setReferenz] = useState("");
  const [datum, setDatum] = useState("");

  useEffect(() => {
    if (!e) return;
    setLaedt(true);
    (async () => {
      const db = supabase as any;
      const [{ data: a }, { data: ms }] = await Promise.all([
        db
          .from("contact_building_assignments")
          .select("bank_account_id, first_name_override, last_name_override, company_name_override, contacts(first_name, last_name, company_name)")
          .eq("id", e.assignmentId)
          .maybeSingle(),
        db.from("sepa_mandates").select("*").eq("assignment_id", e.assignmentId).order("created_at", { ascending: false }),
      ]);
      const ov = !!(a?.first_name_override || a?.last_name_override || a?.company_name_override);
      setMitOverride(ov);
      setVorname((ov ? a?.first_name_override : a?.contacts?.first_name) ?? "");
      setNachname((ov ? a?.last_name_override : a?.contacts?.last_name) ?? "");
      setFirma((ov ? a?.company_name_override : a?.contacts?.company_name) ?? "");
      const liste: Mandat[] = ms ?? [];
      const akt = liste.find((m) => m.status === "aktiv") ?? null;
      setMandate(liste);
      setAktiv(akt);
      setModus(akt ? "behalten" : "keins");
      setAktivierenId(null);
      setReferenz(akt?.mandatsreferenz ?? "");
      setDatum(akt?.unterschrieben_am ?? "");
      setInhaber(akt?.kontoinhaber ?? e.kontoinhaber ?? "");
      setIban(ibanFormatiert(akt?.iban ?? e.iban ?? ""));
      setBic(akt?.bic ?? e.bic ?? "");
      setKontoId(a?.bank_account_id ?? null);
      setLaedt(false);
    })();
  }, [e]);

  const sauber = cleanIban(iban);
  const ibanFehler = sauber && !ibanGueltig(sauber) ? "IBAN ist nicht gültig – bitte prüfen" : null;
  const vorher = { iban: cleanIban(aktiv?.iban ?? e?.iban ?? ""), inhaber: (aktiv?.kontoinhaber ?? e?.kontoinhaber ?? "").trim() };
  const kontoGeaendert = !!e && (sauber !== vorher.iban || inhaber.trim() !== vorher.inhaber);
  const inhaberGeaendert = !!aktiv && inhaber.trim().toLowerCase() !== (aktiv.kontoinhaber ?? "").trim().toLowerCase();

  // Anderer Zahler → neues Mandat vorschlagen
  useEffect(() => {
    if (laedt || !aktiv || modus === "aktivieren") return;
    if (inhaberGeaendert && modus === "behalten") {
      setModus("neu");
      setReferenz("");
      setDatum("");
    }
  }, [inhaberGeaendert, laedt]); // eslint-disable-line react-hooks/exhaustive-deps

  const modusWaehlen = (m: Modus) => {
    setModus(m);
    setAktivierenId(null);
    if (m === "behalten" && aktiv) {
      setReferenz(aktiv.mandatsreferenz ?? "");
      setDatum(aktiv.unterschrieben_am ?? "");
    } else if (m === "neu") {
      setReferenz("");
      setDatum("");
    }
  };

  const mandatUebernehmen = (m: Mandat) => {
    setModus("aktivieren");
    setAktivierenId(m.id);
    setReferenz(m.mandatsreferenz ?? "");
    setDatum(m.unterschrieben_am ?? "");
    if (m.iban) setIban(ibanFormatiert(m.iban));
    if (m.kontoinhaber) setInhaber(m.kontoinhaber);
    setBic(m.bic ?? "");
  };

  const mandatNoetig = modus === "neu" || modus === "aktivieren";
  const mandatFehler = mandatNoetig && (!sauber || !datum) ? "Für das Mandat werden IBAN und Unterschriftsdatum gebraucht." : null;

  const speichern = async () => {
    if (!e || ibanFehler || mandatFehler) return;
    if (!vorname.trim() && !nachname.trim() && !firma.trim()) return toast.error("Bitte einen Namen eintragen.");
    setSpeichert(true);
    try {
      const db = supabase as any;
      const jetzt = new Date().toISOString();
      const heute = new Date().toLocaleDateString("de-DE");
      const bicSauber = bic.trim().toUpperCase().replace(/\s+/g, "") || null;

      // 1) Name
      if (mitOverride) {
        const { error } = await db
          .from("contact_building_assignments")
          .update({ first_name_override: vorname.trim() || null, last_name_override: nachname.trim() || null, company_name_override: firma.trim() || null })
          .eq("id", e.assignmentId);
        if (error) throw error;
      } else if (e.contactId) {
        const { error } = await db
          .from("contacts")
          .update({ first_name: vorname.trim() || null, last_name: nachname.trim() || null, company_name: firma.trim() || null })
          .eq("id", e.contactId);
        if (error) throw error;
      }

      // 2) Konto der Einheit
      if (kontoGeaendert && sauber) {
        const daten = { account_holder: inhaber.trim() || null, iban: sauber, bic: bicSauber, bank_name: bankName(sauber, "") || null };
        let id: string | null = null;
        if (e.contactId) {
          const { data: vorhanden } = await db.from("contact_bank_accounts").select("id, iban").eq("contact_id", e.contactId);
          id = (vorhanden ?? []).find((k: any) => cleanIban(k.iban) === sauber)?.id ?? null;
        }
        // Gleiches Mandat (nur Kontowechsel): bisheriges Konto überschreiben, sonst neues Konto anlegen
        if (!id && modus === "behalten" && kontoId) id = kontoId;
        if (id) {
          const { error } = await db.from("contact_bank_accounts").update(daten).eq("id", id);
          if (error) throw error;
        } else if (e.contactId) {
          const { data: neu, error } = await db.from("contact_bank_accounts").insert({ ...daten, contact_id: e.contactId, is_default: false }).select("id").single();
          if (error) throw error;
          id = neu.id;
        }
        await db.from("contact_building_assignments").update({ bank_account_id: id, iban_override: null, iban_holder_override: null }).eq("id", e.assignmentId);
      }

      // 3) SEPA-Mandat
      const mandatDaten = { iban: sauber || null, bic: bicSauber, kontoinhaber: inhaber.trim() || null, unterschrieben_am: datum || null, updated_at: jetzt };
      if (modus === "behalten" && aktiv) {
        const aenderung: Record<string, unknown> = { ...mandatDaten, mandatsreferenz: referenz.trim() || aktiv.mandatsreferenz };
        if (kontoGeaendert) aenderung.notiz = [aktiv.notiz, `Kontowechsel am ${heute}: vorher ${ibanFormatiert(aktiv.iban ?? "")}`].filter(Boolean).join(" | ");
        const { error } = await db.from("sepa_mandates").update(aenderung).eq("id", aktiv.id);
        if (error) throw error;
      } else if (modus === "aktivieren" && aktivierenId) {
        if (aktiv && aktiv.id !== aktivierenId) await db.from("sepa_mandates").update({ status: "ersetzt", updated_at: jetzt }).eq("id", aktiv.id);
        const { error } = await db
          .from("sepa_mandates")
          .update({ ...mandatDaten, status: "aktiv", mandatsreferenz: referenz.trim() || undefined })
          .eq("id", aktivierenId);
        if (error) throw error;
      } else if (modus === "neu") {
        let ref = referenz.trim();
        if (!ref) {
          const { data, error } = await db.rpc("neue_mandatsreferenz", { p_building: aktiv?.building_id ?? mandate[0]?.building_id ?? (await gebaeudeVon(e.assignmentId)), p_unit: e.einheit });
          if (error || !data) throw new Error("Mandatsreferenz konnte nicht vergeben werden");
          ref = data;
        }
        if (aktiv) await db.from("sepa_mandates").update({ status: "ersetzt", updated_at: jetzt }).eq("id", aktiv.id);
        const buildingId = aktiv?.building_id ?? mandate[0]?.building_id ?? (await gebaeudeVon(e.assignmentId));
        const { error } = await db.from("sepa_mandates").insert({
          ...mandatDaten,
          building_id: buildingId,
          assignment_id: e.assignmentId,
          contact_id: e.contactId,
          mandatsreferenz: ref,
          quelle: "buero",
          status: "aktiv",
          notiz: `Angelegt am ${heute}`,
        });
        if (error) throw error;
      }

      // Daueraufträge auf das neue Mandat umhängen
      if ((modus === "neu" || modus === "aktivieren") && aktiv) {
        const { data: neuM } = await db.from("sepa_mandates").select("id").eq("assignment_id", e.assignmentId).eq("status", "aktiv").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (neuM?.id) {
          await db
            .from("payment_order_items")
            .update({ mandate_id: neuM.id, iban: sauber || null, bic: bicSauber, name: inhaber.trim() || undefined })
            .eq("mandate_id", aktiv.id);
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

  const andere = mandate.filter((m) => m.id !== aktiv?.id);

  return (
    <Dialog open={!!e} onOpenChange={(o) => !o && !speichert && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zahler bearbeiten</DialogTitle>
          <DialogDescription>
            {e ? `Einheit ${e.einheit || "–"}${e.lage ? ` · ${e.lage}` : ""}` : ""} – Name, Konto und SEPA-Mandat für den Hausgeld-Einzug.
          </DialogDescription>
        </DialogHeader>
        {laedt ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Eigentümer</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={vorname} onChange={(x) => setVorname(x.target.value)} placeholder="Vorname(n)" aria-label="Vorname" />
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
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold">SEPA-Mandat</legend>
              <div className="grid gap-2">
                {aktiv && (
                  <Wahl an={modus === "behalten"} onClick={() => modusWaehlen("behalten")} titel={`Bisheriges Mandat behalten (${aktiv.mandatsreferenz})`}>
                    Gleicher Zahler, z. B. nur neue Bankverbindung. Referenz und Datum lassen sich unten korrigieren.
                  </Wahl>
                )}
                <Wahl an={modus === "neu"} onClick={() => modusWaehlen("neu")} titel="Neues Mandat anlegen">
                  Anderer Zahler oder neu unterschriebenes Mandat.{aktiv ? " Das bisherige gilt dann als ersetzt." : ""}
                </Wahl>
                {!aktiv && (
                  <Wahl an={modus === "keins"} onClick={() => modusWaehlen("keins")} titel="Kein Mandat">
                    Der Eigentümer überweist selbst.
                  </Wahl>
                )}
              </div>

              {andere.length > 0 && (
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">Weitere Mandate dieser Einheit</div>
                  {andere.map((m) => (
                    <div key={m.id} className={cn("flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0", aktivierenId === m.id && "bg-primary/5")}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {m.mandatsreferenz} <span className="font-normal text-muted-foreground">· {STATUS_TEXT[m.status] ?? m.status}</span>
                        </div>
                        <div className="truncate text-muted-foreground">
                          {m.kontoinhaber || "–"} · {ibanFormatiert(m.iban ?? "") || "keine IBAN"} · unterschr. {datumDe(m.unterschrieben_am)}
                        </div>
                      </div>
                      <Button type="button" size="sm" variant={aktivierenId === m.id ? "default" : "outline"} onClick={() => mandatUebernehmen(m)}>
                        {aktivierenId === m.id ? "Wird verwendet" : "Verwenden"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {modus !== "keins" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Mandatsreferenz
                    <Input
                      value={referenz}
                      onChange={(x) => setReferenz(x.target.value)}
                      placeholder={modus === "neu" ? "wird automatisch vergeben" : ""}
                      className="font-mono text-foreground"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Unterschrieben am
                    <Input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} className="text-foreground" />
                  </label>
                </div>
              )}
              {mandatFehler && <p className="text-xs text-destructive">{mandatFehler}</p>}
              {modus === "behalten" && kontoGeaendert && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Das Mandat zieht künftig vom neuen Konto ein. Das passt nur, wenn derselbe Zahler sein Konto gewechselt hat – bei einem anderen Zahler bitte „Neues Mandat“ wählen.
                </p>
              )}
              <p className="text-xs text-muted-foreground">Änderungen gelten für künftige Einzüge. Bereits an die Bank gesendete Einzüge ändern sich nicht.</p>
            </fieldset>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={speichert}>
            Abbrechen
          </Button>
          <Button onClick={speichern} disabled={speichert || laedt || !!ibanFehler || !!mandatFehler}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Wahl({ an, onClick, titel, children }: { an: boolean; onClick: () => void; titel: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors", an ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
    >
      <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", an ? "border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--background))]" : "border-muted-foreground/40")} />
      <span>
        <span className="block text-sm font-medium">{titel}</span>
        <span className="block text-xs text-muted-foreground">{children}</span>
      </span>
    </button>
  );
}

async function gebaeudeVon(assignmentId: string): Promise<string | null> {
  const { data } = await (supabase as any).from("contact_building_assignments").select("building_id").eq("id", assignmentId).maybeSingle();
  return data?.building_id ?? null;
}
