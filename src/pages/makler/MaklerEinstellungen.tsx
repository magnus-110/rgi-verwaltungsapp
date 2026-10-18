import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaklerGuard, Rueckfrage, SeitenKopf } from "@/components/broker/MaklerUi";
import { useBrokerDeputies, useBrokerSettings, useBrokerStaff, useMaklerNeuLaden, type BrokerDeputy } from "@/hooks/useMakler";
import { datum, db, fehler, personName } from "@/lib/makler";

export default function MaklerEinstellungen() {
  return (
    <MaklerGuard nurAdmin>
      <Inhalt />
    </MaklerGuard>
  );
}

function Inhalt() {
  const neuLaden = useMaklerNeuLaden();
  const { data: settings, isLoading } = useBrokerSettings();
  const { data: vertretungen = [] } = useBrokerDeputies();
  const { makler, nachId } = useBrokerStaff();
  const [makl, setMakl] = useState("");
  const [vertreter, setVertreter] = useState("");
  const [bis, setBis] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [loeschen, setLoeschen] = useState<BrokerDeputy | null>(null);

  const teamSiehtAlles = async (v: boolean) => {
    const { data, error } = await db.from("broker_settings").update({ team_sees_all: v, updated_at: new Date().toISOString() }).eq("id", true).select("id");
    if (error) return fehler("Einstellung konnte nicht gespeichert werden", error);
    if (!data || data.length === 0) return void toast.error("Einstellung konnte nicht gespeichert werden", { description: "Keine Berechtigung." });
    toast.success(v ? "Alle Makler sehen jetzt alle Objekte" : "Jeder sieht nur noch eigene Objekte");
    neuLaden();
  };

  const hinzufuegen = async () => {
    if (!makl || !vertreter) return void toast.error("Bitte Makler und Vertretung wählen.");
    if (makl === vertreter) return void toast.error("Eine Person kann sich nicht selbst vertreten.");
    setLaeuft(true);
    const { error } = await db.from("broker_deputies").insert({ broker_id: makl, deputy_id: vertreter, until: bis || null });
    setLaeuft(false);
    if (error) {
      return fehler(
        "Vertretung konnte nicht gespeichert werden",
        error.code === "23505" ? new Error("Diese Vertretung gibt es schon.") : error,
      );
    }
    toast.success("Vertretung eingetragen");
    setMakl("");
    setVertreter("");
    setBis("");
    neuLaden();
  };

  const entfernen = async (d: BrokerDeputy) => {
    setLoeschen(null);
    const { error } = await db.from("broker_deputies").delete().eq("id", d.id);
    if (error) return fehler("Vertretung konnte nicht entfernt werden", error);
    toast.success("Vertretung entfernt");
    neuLaden();
  };

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto">
      <SeitenKopf titel="Makler-Einstellungen" unter="Wer welche Objekte sieht – nur für Administratoren." />

      <section className="rounded-xl border bg-card p-4 sm:p-5 mb-4">
        <div className="flex items-center justify-between gap-4 min-h-11">
          <div>
            <Label htmlFor="team-alle" className="text-base font-semibold cursor-pointer">Alle Makler sehen alle Objekte</Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aus: Jeder sieht nur Objekte, für die er zuständig ist, die er angelegt hat oder für die er Vertretung ist. Administratoren sehen immer alles.
            </p>
          </div>
          <Switch id="team-alle" checked={!!settings?.team_sees_all} disabled={isLoading || !settings} onCheckedChange={teamSiehtAlles} />
        </div>
        <p className="text-sm text-muted-foreground mt-3 border-t pt-3">
          Wer den Makler-Bereich überhaupt nutzen darf, stellen Sie unter{" "}
          <Link to="/settings?tab=team" className="text-primary font-medium underline-offset-2 hover:underline">Einstellungen → Team</Link> ein („Makler-Bereich").
        </p>
      </section>

      <NutzerAppSchalter />

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Vertretungen</h2>
        <p className="text-sm text-muted-foreground mb-4">Die Vertretung sieht und bearbeitet die Objekte des Maklers – bis zum gewählten Tag.</p>

        {vertretungen.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-4">Keine Vertretungen eingetragen.</p>
        ) : (
          <ul className="rounded-lg border divide-y mb-4">
            {vertretungen.map((d) => {
              const abgelaufen = !!d.until && d.until < heute;
              return (
                <li key={d.id} className="flex items-center gap-3 pl-3 min-h-14">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{personName(nachId.get(d.deputy_id)) || "Unbekannt"}</span>
                    <span className="text-muted-foreground"> vertritt </span>
                    <span className="font-medium">{personName(nachId.get(d.broker_id)) || "Unbekannt"}</span>
                    <div className={abgelaufen ? "text-xs text-red-700" : "text-xs text-muted-foreground"}>
                      {d.until ? `${abgelaufen ? "Abgelaufen am" : "Bis"} ${datum(d.until)}` : "Ohne Enddatum"}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" aria-label="Vertretung entfernen" onClick={() => setLoeschen(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Makler</Label>
            <Select value={makl} onValueChange={setMakl}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {makler.map((m) => <SelectItem key={m.user_id} value={m.user_id} className="min-h-10">{personName(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vertretung</Label>
            <Select value={vertreter} onValueChange={setVertreter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {makler.filter((m) => m.user_id !== makl).map((m) => <SelectItem key={m.user_id} value={m.user_id} className="min-h-10">{personName(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-bis">Bis (optional)</Label>
            <Input id="v-bis" type="date" className="h-11" value={bis} min={heute} onChange={(e) => setBis(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button className="h-11" onClick={hinzufuegen} disabled={laeuft}>
            {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}Vertretung eintragen
          </Button>
        </div>
      </section>

      <Rueckfrage
        open={!!loeschen}
        onOpenChange={(o) => !o && setLoeschen(null)}
        titel="Vertretung entfernen?"
        ja="Entfernen"
        onJa={() => loeschen && entfernen(loeschen)}
      />
    </div>
  );
}

/**
 * Hauptschalter für „Immobilien von RGI“ in der Nutzer-App.
 * Aus: Eigentümer sehen nichts davon. RGI-Mitarbeiter sehen die Seiten trotzdem (Vorschau).
 */
function NutzerAppSchalter() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["rgi", "portal-immobilien-aktiv"],
    queryFn: async () => {
      const { data, error } = await db.from("rgi_company_settings").select("id, portal_immobilien_aktiv").limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; portal_immobilien_aktiv: boolean } | null;
    },
  });
  const umschalten = async (v: boolean) => {
    if (!data) return;
    const { data: r, error } = await db.from("rgi_company_settings").update({ portal_immobilien_aktiv: v }).eq("id", data.id).select("id");
    if (error) return fehler("Konnte nicht gespeichert werden", error);
    if (!r || r.length === 0) return void toast.error("Keine Berechtigung.");
    toast.success(v ? "Eigentümer sehen jetzt „Immobilien von RGI“" : "Für Eigentümer wieder ausgeblendet");
    qc.invalidateQueries({ queryKey: ["rgi", "portal-immobilien-aktiv"] });
  };
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between gap-4 min-h-11">
        <div>
          <Label htmlFor="portal-immo" className="text-base font-semibold cursor-pointer">„Immobilien von RGI“ in der Nutzer-App</Label>
          <p className="text-sm text-muted-foreground mt-0.5">
            Angebote, Gesuche und Suchaufträge für Eigentümer. Aus: Eigentümer sehen davon nichts – ihr seht es zur Vorschau trotzdem.
          </p>
        </div>
        <Switch id="portal-immo" checked={!!data?.portal_immobilien_aktiv} disabled={isLoading || !data} onCheckedChange={umschalten} />
      </div>
    </section>
  );
}
