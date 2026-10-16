/**
 * Aufnahme › Dienstleister: Firmen des Gebäudes mit ihren Aufgaben,
 * offene Kategorien und der Dialog „Dienstleister hinzufügen".
 * Gespeichert wird wie überall in der App in contact_building_assignments.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DL_KATEGORIEN, kategorieZuLabel, labelZuKategorie, type AufnahmeAntworten } from "@/lib/aufnahme";
import { Chip, Karte } from "./teile";

export interface Firma {
  contactId: string;
  name: string;
  ort: string | null;
  email: string | null;
  zuordnungen: { id: string; kategorie: string }[];
}

const firmenName = (c: any) =>
  c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Ohne Namen";

export function useGebaeudeFirmen(buildingId: string) {
  return useQuery({
    queryKey: ["aufnahme-firmen", buildingId],
    queryFn: async (): Promise<Firma[]> => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("id, service_category, contact_id, contacts(id, company_name, first_name, last_name, address_city, contact_emails(email))")
        .eq("building_id", buildingId)
        .eq("role_in_building", "dienstleister" as any);
      if (error) throw error;
      const m = new Map<string, Firma>();
      (data ?? []).forEach((z: any) => {
        if (!z.contact_id) return;
        const f = m.get(z.contact_id) ?? {
          contactId: z.contact_id,
          name: firmenName(z.contacts),
          ort: z.contacts?.address_city ?? null,
          email: z.contacts?.contact_emails?.[0]?.email ?? null,
          zuordnungen: [],
        };
        f.zuordnungen.push({ id: z.id, kategorie: z.service_category ?? "Sonstiges" });
        m.set(z.contact_id, f);
      });
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Anzahl Firmen je Kategorie – für Fortschritt und „noch offen" */
export function anzahlJeKategorie(firmen: Firma[]) {
  const n: Record<string, number> = {};
  firmen.forEach((f) => f.zuordnungen.forEach((z) => (n[z.kategorie] = (n[z.kategorie] ?? 0) + 1)));
  return n;
}

export function DienstleisterThema({
  buildingId,
  gebaeude,
  antworten,
  setze,
  onHinzufuegen,
}: {
  buildingId: string;
  gebaeude: { name: string; address?: string | null; management_start_date?: string | null };
  antworten: AufnahmeAntworten;
  setze: (teil: Record<string, "selbst" | "keiner" | undefined>) => void;
  onHinzufuegen: (kategorie?: string) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: firmen = [], isLoading } = useGebaeudeFirmen(buildingId);
  const [entwurfLaeuft, setEntwurfLaeuft] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);
  const anzahl = anzahlJeKategorie(firmen);
  const wahl = antworten.dienstleister ?? {};
  const offen = DL_KATEGORIEN.filter((k) => !anzahl[k.kategorie]);

  const umschalten = async (f: Firma, label: string) => {
    const kat = labelZuKategorie(label);
    const vorhanden = f.zuordnungen.find((z) => z.kategorie === kat);
    const { error } = vorhanden
      ? await supabase.from("contact_building_assignments").delete().eq("id", vorhanden.id)
      : await supabase.from("contact_building_assignments").insert({
          contact_id: f.contactId,
          building_id: buildingId,
          role_in_building: "dienstleister" as any,
          service_category: kat,
        } as any);
    if (error) return toast.error("Konnte nicht gespeichert werden: " + error.message);
    if (!vorhanden && wahl[label]) setze({ [label]: undefined });
    qc.invalidateQueries({ queryKey: ["aufnahme-firmen", buildingId] });
  };

  const entwuerfe = async () => {
    if (!user) return;
    const mitMail = firmen.filter((f) => f.email);
    if (!mitMail.length) return toast.error("Bei keiner Firma ist eine E-Mail-Adresse hinterlegt.");
    setEntwurfLaeuft(true);
    const ab = gebaeude.management_start_date
      ? new Date(gebaeude.management_start_date).toLocaleDateString("de-DE")
      : "[Datum]";
    const zeilen = mitMail.map((f) => {
      const aufgaben = f.zuordnungen.map((z) => kategorieZuLabel(z.kategorie)).join(", ");
      return {
        user_id: user.id,
        account_id: null,
        to_addresses: [f.email],
        subject: `Verwalterwechsel WEG ${gebaeude.name}`,
        body_text:
          `Sehr geehrte Damen und Herren,\n\n` +
          `zum ${ab} übernimmt die RGI Immobilien GmbH & Co. KG die Verwaltung der Wohnungseigentümergemeinschaft ${gebaeude.name}${gebaeude.address && gebaeude.address !== gebaeude.name ? `, ${gebaeude.address}` : ""}.\n\n` +
          `Sie sind für die Gemeinschaft tätig (${aufgaben}). Damit die Zusammenarbeit nahtlos weiterläuft, bitten wir Sie:\n` +
          `– Rechnungen ab sofort an uns zu senden (Rechnungsempfänger bleibt die WEG ${gebaeude.name}),\n` +
          `– uns eine Kopie des bestehenden Vertrags bzw. Leistungsverzeichnisses zu schicken,\n` +
          `– uns Ihren Ansprechpartner und eine Notfallnummer mitzuteilen.\n\n` +
          `Vielen Dank und freundliche Grüße`,
        attachments: [],
      };
    });
    const { error } = await supabase.from("email_drafts").insert(zeilen as any);
    setEntwurfLaeuft(false);
    if (error) return toast.error("Entwürfe konnten nicht angelegt werden: " + error.message);
    qc.invalidateQueries({ queryKey: ["email-drafts"] });
    const ohne = firmen.length - mitMail.length;
    toast.success(
      `${mitMail.length} ${mitMail.length === 1 ? "Entwurf liegt" : "Entwürfe liegen"} im Postfach unter Entwürfe.` +
        (ohne ? ` ${ohne} ohne E-Mail-Adresse übersprungen.` : ""),
      { duration: 7000 },
    );
  };

  return (
    <div className="space-y-3.5">
      <div className="flex justify-end">
        <Button onClick={() => onHinzufuegen()} className="h-12 gap-2 rounded-xl px-5 text-[15px]">
          <Plus className="h-5 w-5" /> Dienstleister hinzufügen
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        firmen.map((f) => {
          const eigene = f.zuordnungen.map((z) => kategorieZuLabel(z.kategorie));
          const offenGezeigt = aufgeklappt === f.contactId;
          const weitere = offenGezeigt ? DL_KATEGORIEN.map((k) => k.label).filter((l) => !eigene.includes(l)) : [];
          return (
            <Karte key={f.contactId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold">{f.name}</div>
                  <div className="truncate text-[13px] text-muted-foreground">
                    {[f.ort, f.email].filter(Boolean).join(" · ") || "Kontaktdaten unter Adressen ergänzen"}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 pb-1">
                {eigene.map((l) => (
                  <Chip key={l} an onClick={() => umschalten(f, l)}>
                    {l}
                  </Chip>
                ))}
                {weitere.map((l) => (
                  <Chip key={l} gestrichelt onClick={() => umschalten(f, l)}>
                    {l}
                  </Chip>
                ))}
                <button
                  type="button"
                  onClick={() => setAufgeklappt(offenGezeigt ? null : f.contactId)}
                  className="h-11 rounded-full px-4 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  {offenGezeigt ? "Fertig" : "+ Aufgabe"}
                </button>
              </div>
            </Karte>
          );
        })
      )}

      {offen.length > 0 && (
        <Karte titel="Noch nicht geklärt">
          {offen.map((k, i) => (
            <div key={k.label} className={cn("flex flex-wrap items-center justify-between gap-2 py-2.5", i < offen.length - 1 && "border-b border-border/60")}>
              <span className="text-[15px] font-medium">{k.label}</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onHinzufuegen(k.label)} className="h-11 rounded-lg border px-3.5 text-sm hover:bg-muted">
                  Firma …
                </button>
                {(["selbst", "keiner"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={wahl[k.label] === w}
                    onClick={() => setze({ [k.label]: wahl[k.label] === w ? undefined : w })}
                    className={cn(
                      "h-11 rounded-lg border px-3.5 text-sm",
                      wahl[k.label] === w ? "border-foreground bg-foreground font-medium text-background" : "hover:bg-muted",
                    )}
                  >
                    {w === "selbst" ? "Eigentümer selbst" : "Gibt es nicht"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Karte>
      )}

      {firmen.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3.5">
          <div className="text-sm leading-snug">
            <span className="font-semibold">Anschreiben vorbereiten</span>
            <br />
            Für jede Firma mit E-Mail ein Entwurf „Wir sind die neue Verwaltung …“ – liegt danach im Postfach unter Entwürfe.
          </div>
          <Button variant="outline" className="h-12 gap-2 rounded-xl" onClick={entwuerfe} disabled={entwurfLaeuft}>
            {entwurfLaeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Entwürfe erstellen
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Dialog ───────────────────────── */

interface Vorschlag {
  id: string;
  name: string;
  info: string;
}

export function DienstleisterDialog({
  open,
  onOpenChange,
  buildingId,
  startKategorie,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  startKategorie?: string;
}) {
  const qc = useQueryClient();
  const [kats, setKats] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [offenFuer, setOffenFuer] = useState<string | undefined>(undefined);

  // Beim Öffnen zurücksetzen
  if (open && offenFuer !== (startKategorie ?? "")) {
    setOffenFuer(startKategorie ?? "");
    setKats(startKategorie ? [startKategorie] : []);
    setName("");
    setGewaehlt(null);
  }
  if (!open && offenFuer !== undefined) setOffenFuer(undefined);

  const suche = name.trim();
  const { data: treffer = [], isFetching } = useQuery({
    queryKey: ["aufnahme-firmensuche", suche],
    enabled: open && suche.length >= 2,
    queryFn: async (): Promise<Vorschlag[]> => {
      const q = suche.replace(/[%,()]/g, " ");
      const { data, error } = await supabase
        .from("contacts")
        .select("id, company_name, first_name, last_name, address_city, service_provider_categories, contact_building_assignments(role_in_building, service_category, buildings(name))")
        .or(`company_name.ilike.%${q}%,last_name.ilike.%${q}%,short_name.ilike.%${q}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((c: any) => {
        const dl = (c.contact_building_assignments ?? []).filter((z: any) => z.role_in_building === "dienstleister");
        const haeuser = [...new Set(dl.map((z: any) => z.buildings?.name).filter(Boolean))] as string[];
        const aufgaben = [...new Set([...dl.map((z: any) => kategorieZuLabel(z.service_category)), ...((c.service_provider_categories ?? []) as string[]).map(kategorieZuLabel)])];
        return {
          id: c.id,
          name: firmenName(c),
          info: [c.address_city, aufgaben.slice(0, 3).join(", "), haeuser.length ? `bei ${haeuser.slice(0, 3).join(", ")}${haeuser.length > 3 ? " …" : ""}` : null]
            .filter(Boolean)
            .join(" · "),
        };
      });
    },
  });

  const umschalten = (l: string) => setKats((k) => (k.includes(l) ? k.filter((x) => x !== l) : [...k, l]));

  const uebernehmen = async () => {
    if (!kats.length) return toast.error("Bitte erst auswählen, was die Firma macht.");
    if (!gewaehlt && !suche) return toast.error("Bitte den Namen eintragen.");
    setLaeuft(true);
    try {
      let contactId = gewaehlt;
      if (!contactId) {
        const { data, error } = await supabase
          .from("contacts")
          .insert({ company_name: suche, contact_type: "company" as any, notes: "Bei der Aufnahme angelegt – Kontaktdaten ergänzen" } as any)
          .select("id")
          .single();
        if (error) throw error;
        contactId = data.id;
      }
      const { data: schon } = await supabase
        .from("contact_building_assignments")
        .select("service_category")
        .eq("building_id", buildingId)
        .eq("contact_id", contactId!)
        .eq("role_in_building", "dienstleister" as any);
      const vorhanden = new Set((schon ?? []).map((z: any) => z.service_category));
      const neu = kats.map(labelZuKategorie).filter((k) => !vorhanden.has(k));
      if (neu.length) {
        const { error } = await supabase.from("contact_building_assignments").insert(
          neu.map((k) => ({ contact_id: contactId, building_id: buildingId, role_in_building: "dienstleister", service_category: k })) as any,
        );
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["aufnahme-firmen", buildingId] });
      toast.success("Dienstleister übernommen");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Konnte nicht gespeichert werden: " + (e?.message ?? ""));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Dienstleister hinzufügen</DialogTitle>
          <DialogDescription>Erst antippen, was die Firma macht, dann den Namen so eintragen, wie er im Gespräch fällt.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            1 · Was macht die Firma? <span className="font-normal text-muted-foreground">(mehrere möglich · bei Versicherung auch mehrere Firmen)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DL_KATEGORIEN.map((k) => (
              <Chip key={k.label} an={kats.includes(k.label)} onClick={() => umschalten(k.label)}>
                {k.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="dl-name" className="text-sm font-semibold">
            2 · Wer ist es?
          </label>
          <input
            id="dl-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setGewaehlt(null);
            }}
            placeholder="z. B. „der Nix“"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {suche.length >= 2 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Passende Firmen aus euren Adressen {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
            {treffer.map((v) => {
              const an = gewaehlt === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setGewaehlt(an ? null : v.id)}
                  className={cn(
                    "flex min-h-[60px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left",
                    an ? "border-2 border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{v.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{v.info || "Noch keine Aufgaben hinterlegt"}</span>
                  </span>
                  {an ? <Check className="h-5 w-5 shrink-0 text-primary" /> : <span className="text-sm text-muted-foreground">Wählen</span>}
                </button>
              );
            })}
            {!isFetching && !treffer.length && <div className="text-sm text-muted-foreground">Keine passende Firma gefunden.</div>}
            {!gewaehlt && (
              <div className="rounded-xl border border-dashed px-4 py-3 text-sm">
                Ohne Auswahl wird „{suche}“ neu angelegt – Telefon und E-Mail später unter Adressen ergänzen.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button className="h-12 rounded-xl px-6" onClick={uebernehmen} disabled={laeuft}>
            {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useFirmaFuer(firmen: Firma[], label: string) {
  return useMemo(() => firmen.filter((f) => f.zuordnungen.some((z) => z.kategorie === labelZuKategorie(label))), [firmen, label]);
}
