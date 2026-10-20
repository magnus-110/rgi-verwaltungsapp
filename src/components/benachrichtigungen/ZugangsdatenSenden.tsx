import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PSEUDO = "@users.rgi-immobilien.app";
const gueltig = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/**
 * Neue Zugangsdaten an einen Eigentümer schicken: neues Startpasswort,
 * Mail mit Anmeldename und Passwort an eine frei wählbare Adresse.
 */
export function ZugangsdatenSenden({
  offen,
  onOffen,
  gebaeude,
  startGebaeude,
}: {
  offen: boolean;
  onOffen: (o: boolean) => void;
  gebaeude: { id: string; name: string }[];
  startGebaeude: string;
}) {
  const qc = useQueryClient();
  const [buildingId, setBuildingId] = useState("");
  const [userId, setUserId] = useState("");
  const [wahl, setWahl] = useState("");
  const [andere, setAndere] = useState("");
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (offen) {
      setBuildingId(startGebaeude !== "alle" ? startGebaeude : "");
      setUserId("");
      setWahl("");
      setAndere("");
    }
  }, [offen, startGebaeude]);

  // Eigentümer mit App-Zugang in diesem Gebäude
  const { data: eigentuemer = [], isFetching: laedt } = useQuery({
    queryKey: ["zugang-eigentuemer", buildingId],
    enabled: offen && !!buildingId,
    queryFn: async () => {
      const { data: wob } = await (supabase as any).from("weg_owner_buildings").select("user_id").eq("building_id", buildingId);
      const ids = [...new Set((wob ?? []).map((r: any) => r.user_id))] as string[];
      if (!ids.length) return [];
      const [{ data: profile }, { data: kontakte }] = await Promise.all([
        supabase.from("profiles").select("user_id, email, username, first_name, last_name").in("user_id", ids),
        (supabase as any).from("contacts").select("id, user_id, first_name, last_name, company_name, contact_emails(email, label, is_primary)").in("user_id", ids),
      ]);
      return (profile ?? [])
        .map((p: any) => {
          const k = (kontakte ?? []).find((x: any) => x.user_id === p.user_id);
          const name = k?.company_name || [k?.first_name ?? p.first_name, k?.last_name ?? p.last_name].filter(Boolean).join(" ") || p.email || "Eigentümer";
          const echt = p.email && !String(p.email).toLowerCase().endsWith(PSEUDO) ? String(p.email) : null;
          const adressen = new Map<string, string>();
          if (echt) adressen.set(echt.toLowerCase(), `${echt} (Anmelde-E-Mail)`);
          for (const e of k?.contact_emails ?? []) {
            if (e?.email && !adressen.has(String(e.email).toLowerCase())) adressen.set(String(e.email).toLowerCase(), `${e.email}${e.label ? ` (${e.label})` : ""}`);
          }
          return {
            userId: p.user_id as string,
            name,
            anmeldung: echt ?? p.username ?? p.email ?? "",
            adressen: [...adressen.entries()].map(([wert, text]) => ({ wert, text })),
          };
        })
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "de"));
    },
  });
  const person = useMemo(() => eigentuemer.find((e: any) => e.userId === userId) ?? null, [eigentuemer, userId]);
  useEffect(() => {
    setWahl(person?.adressen[0]?.wert ?? (person ? "andere" : ""));
    setAndere("");
  }, [person]);

  const ziel = wahl === "andere" ? andere.trim() : wahl;
  const fehler = !person ? "Bitte einen Eigentümer wählen." : !ziel || !gueltig(ziel) ? "Bitte eine gültige E-Mail-Adresse wählen oder eintragen." : null;

  const senden = async () => {
    if (fehler || !person) return;
    setSendet(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { target_user_id: person.userId, force_change: true, send_to_email: ziel },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Neue Zugangsdaten an ${ziel} geschickt`);
      qc.invalidateQueries({ queryKey: ["system-mail-protokoll"] });
      onOffen(false);
    } catch (e: any) {
      toast.error(e?.message || "Zugangsdaten konnten nicht geschickt werden");
    } finally {
      setSendet(false);
    }
  };

  return (
    <Dialog open={offen} onOpenChange={onOffen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Zugangsdaten senden</DialogTitle>
          <DialogDescription>Für Eigentümer, die ihre Zugangsdaten nicht mehr haben. Sie bekommen ein neues Startpasswort per E-Mail.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Gebäude</span>
            <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setUserId(""); }}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Gebäude wählen" />
              </SelectTrigger>
              <SelectContent>
                {gebaeude.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Eigentümer</span>
            <Select value={userId} onValueChange={setUserId} disabled={!buildingId || laedt}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={laedt ? "Lädt …" : buildingId ? (eigentuemer.length ? "Eigentümer wählen" : "Niemand mit App-Zugang") : "Zuerst das Gebäude wählen"} />
              </SelectTrigger>
              <SelectContent>
                {eigentuemer.map((e: any) => (
                  <SelectItem key={e.userId} value={e.userId}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {buildingId && !laedt && !eigentuemer.length && (
              <span className="block text-xs text-muted-foreground">In diesem Gebäude hat noch niemand einen App-Zugang. Einladen geht über Adressen bei der Zuordnung zum Gebäude („Einladung mit Zugangsdaten senden“).</span>
            )}
          </label>

          {person && (
            <>
              <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
                <div className="text-muted-foreground">Anmeldung mit</div>
                <div className="font-semibold">{person.anmeldung || "–"}</div>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-medium">An welche E-Mail?</legend>
                {[...person.adressen, { wert: "andere", text: "Andere Adresse" }].map((a: any) => (
                  <label
                    key={a.wert}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", wahl === a.wert && "border-foreground ring-1 ring-foreground")}
                  >
                    <input type="radio" name="ziel" value={a.wert} checked={wahl === a.wert} onChange={() => setWahl(a.wert)} className="h-4 w-4 accent-current" />
                    <span className="min-w-0 truncate">{a.text}</span>
                  </label>
                ))}
                {wahl === "andere" && (
                  <Input type="email" value={andere} onChange={(e) => setAndere(e.target.value)} placeholder="name@beispiel.de" className="h-11" aria-label="Andere E-Mail-Adresse" autoFocus />
                )}
              </fieldset>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Das bisherige Passwort gilt danach nicht mehr. Beim ersten Anmelden legt der Eigentümer ein eigenes Passwort fest. Die E-Mail erscheint danach unter „Weitere automatische Mails“.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOffen(false)}>
            Abbrechen
          </Button>
          <Button onClick={senden} disabled={!!fehler || sendet}>
            {sendet ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Zugangsdaten senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
