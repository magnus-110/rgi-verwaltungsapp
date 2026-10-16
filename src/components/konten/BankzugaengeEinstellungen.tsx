import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { KeyRound, Landmark, Loader2, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BankAccountMappingDialog } from "@/components/finance/BankAccountMappingDialog";
import { cn } from "@/lib/utils";
import { cleanIban } from "@/lib/bankInfo";
import { BankzugangAssistent } from "./BankzugangAssistent";
import { ZugangKonten } from "./ZugangKonten";
import { AbrufKnopf } from "./AbrufKnopf";
import { kontenNeuLaden } from "./BewegungsListe";
import type { KontoZeile } from "./kontenTypes";

const STATUS: Record<string, { text: string; stil: string }> = {
  aktiv: { text: "Aktiv", stil: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" },
  tan_noetig: { text: "TAN nötig", stil: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  neu: { text: "Einrichtung offen", stil: "bg-muted text-muted-foreground" },
  fehler: { text: "Fehler", stil: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

export { abrufMeldung, bankAbrufStarten } from "./AbrufKnopf";

/**
 * Einstellungen › „Mein Bankzugang" (bereich="mein") und
 * „Kontoauszüge abrufen" (bereich="buero", nur Admins).
 *
 * Büro-Zugänge (FinTS) holen täglich um 06:00 und 13:00 Uhr die Umsätze;
 * der eigene Zugang dient nur zum Freigeben von Zahlungen per TAN. Die
 * Kontenliste und der Datei-Import stehen unter „Konten".
 */
export function BankzugaengeEinstellungen({ bereich }: { bereich: "mein" | "buero" }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [assistent, setAssistent] = useState(false);
  const [eigenerAssistent, setEigenerAssistent] = useState(false);
  const [pinFuer, setPinFuer] = useState<any | null>(null);
  const [neuePin, setNeuePin] = useState("");
  const [zuordnen, setZuordnen] = useState<{ iban: string; buildingId: string; name?: string | null } | null>(null);

  const { data: alle = [], isLoading } = useQuery({
    queryKey: ["bank-connections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_connections")
        .select("id, blz, bank_name, anmeldename, tan_method_name, status, status_text, sca_bis, letzter_abruf, letzter_abruf_ok, konten, created_at, persoenlich_fuer")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const eigene = useMemo(() => alle.filter((z: any) => z.persoenlich_fuer && z.persoenlich_fuer === user?.id), [alle, user?.id]);
  const zugaenge = useMemo(() => alle.filter((z: any) => !z.persoenlich_fuer), [alle]);
  const { data: protokoll = [] } = useQuery({
    queryKey: ["bank-connections", "protokoll"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_fetch_log")
        .select("id, connection_id, ausloeser, gestartet, ok, ergebnis, fehler")
        .order("gestartet", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: konten = [] } = useQuery({
    queryKey: ["konten-uebersicht"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });
  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const namen: Record<string, string> = useMemo(() => Object.fromEntries(gebaeude.map((g: any) => [g.id, g.name])), [gebaeude]);
  const ibanLiegenschaft = useMemo(() => {
    const m = new Map<string, string>();
    konten.forEach((k) => m.set(cleanIban(k.iban), k.building_id));
    return m;
  }, [konten]);
  const neuLaden = () => {
    queryClient.invalidateQueries({ queryKey: ["bank-connections"] });
    kontenNeuLaden(queryClient);
  };

  const pinSpeichern = async () => {
    if (!pinFuer || !neuePin) return;
    const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "pin_aendern", id: pinFuer.id, pin: neuePin } });
    setNeuePin("");
    if (error || data?.error) {
      toast.error(data?.error || "PIN konnte nicht gespeichert werden");
      return;
    }
    toast.success("PIN gespeichert");
    setPinFuer(null);
  };

  const entfernen = async (z: any) => {
    const frage = z.persoenlich_fuer
      ? `Deinen Bankzugang ${z.bank_name} (${z.anmeldename}) entfernen?\n\nDu kannst dann keine Zahlungen mehr freigeben, bis du ihn neu einrichtest.`
      : `Bankzugang ${z.bank_name} (${z.anmeldename}) entfernen?\n\nDie App holt dann keine Umsätze mehr von dieser Bank. Bisherige Bewegungen bleiben.`;
    if (!window.confirm(frage)) return;
    const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "entfernen", id: z.id } });
    if (error || data?.error) {
      toast.error(data?.error || "Entfernen fehlgeschlagen");
      return;
    }
    toast.success("Bankzugang entfernt");
    neuLaden();
  };

  return (
    <div className="space-y-6">
      {/* Eigener Zugang für Zahlungen */}
      {bereich === "mein" && (
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" /> Deine Zugänge
            </CardTitle>
            <CardDescription>
              Mit deiner eigenen PIN und TAN-App. So ist bei der Bank klar, wer welche Zahlung ausgelöst hat.
            </CardDescription>
          </div>
          <Button onClick={() => setEigenerAssistent(true)} className="shrink-0" variant={eigene.length ? "outline" : "default"}>
            <Plus className="h-4 w-4 mr-1.5" /> {eigene.length ? "Weitere Bank" : "Einrichten"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? null : eigene.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
              <div className="font-medium">Noch kein eigener Bankzugang</div>
              <div className="mt-1 text-muted-foreground">Ohne eigenen Zugang kannst du keine Zahlungen per TAN freigeben.</div>
            </div>
          ) : (
            eigene.map((z: any) => {
              const st = STATUS[z.status === "tan_noetig" ? "aktiv" : z.status] ?? STATUS.neu;
              return (
                <div key={z.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{z.bank_name}</span>
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", st.stil)}>{st.text}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {z.anmeldename}
                      {z.tan_method_name ? ` · ${z.tan_method_name}` : ""}
                      {` · Zugriff auf ${(z.konten ?? []).length} Konten`}
                    </div>
                    {z.status_text && z.status !== "tan_noetig" && <div className="mt-1 text-xs text-muted-foreground">{z.status_text}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" title="PIN ändern" onClick={() => setPinFuer(z)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Entfernen" className="text-muted-foreground hover:text-destructive" onClick={() => entfernen(z)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      )}

      {bereich === "buero" && (<>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" /> Büro-Zugänge
            </CardTitle>
            <CardDescription>
              Abruf jeden Tag um 06:00 und 13:00 Uhr. Pro Bank genügt ein Zugang für alle Konten, die RGI dort führt.
            </CardDescription>
          </div>
          <Button onClick={() => setAssistent(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" /> Hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : zugaenge.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
              <div className="font-medium">Noch kein Bankzugang verbunden</div>
              <div className="text-muted-foreground mt-1">Bis dahin lassen sich Auszüge unter Konten als Datei einlesen.</div>
            </div>
          ) : (
            zugaenge.map((z: any) => {
              const st = STATUS[z.status] ?? STATUS.neu;
              const tageBis = z.sca_bis ? Math.ceil((new Date(z.sca_bis).getTime() - Date.now()) / 86400_000) : null;
              return (
                <div key={z.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{z.bank_name}</span>
                        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", st.stil)}>{st.text}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {z.anmeldename}
                        {z.tan_method_name ? ` · ${z.tan_method_name}` : ""}
                        {` · ${(z.konten ?? []).filter((k: any) => !k.ausgeblendet).length} Konten`}
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="text-xs text-muted-foreground">Letzter Abruf</div>
                      <div className={z.letzter_abruf_ok === false ? "text-destructive" : ""}>
                        {z.letzter_abruf ? formatDistanceToNow(new Date(z.letzter_abruf), { addSuffix: true, locale: de }) : "–"}
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="text-xs text-muted-foreground">Freigabe gültig</div>
                      <div className={tageBis != null && tageBis <= 7 ? "text-amber-700 dark:text-amber-400" : ""}>
                        {z.sca_bis ? `bis ${format(new Date(z.sca_bis), "dd.MM.yyyy")}` : "–"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <AbrufKnopf variant="outline" size="sm" zugangId={z.id} disabled={z.status === "neu"} />
                      <Button variant="ghost" size="icon" title="PIN ändern" onClick={() => setPinFuer(z)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Entfernen" className="text-muted-foreground hover:text-destructive" onClick={() => entfernen(z)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {(z.status_text || z.status === "tan_noetig") && (
                    <div className="border-t bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                      {z.status === "tan_noetig"
                        ? "Die Bank möchte eine neue Freigabe. „Jetzt abrufen“ drücken und in der Banking-App freigeben."
                        : z.status_text}
                    </div>
                  )}
                  <ZugangKonten
                    zugang={z}
                    ibanLiegenschaft={ibanLiegenschaft}
                    namen={namen}
                    gebaeude={gebaeude as any}
                    onLiegenschaft={setZuordnen}
                    onGeaendert={neuLaden}
                  />
                </div>
              );
            })
          )}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            Die Bank-PIN liegt verschlüsselt im Tresor der Datenbank und ist für niemanden lesbar. Geld bewegt die App nie ohne TAN. Etwa alle 90 Tage möchte die Bank eine neue Freigabe in der App – dann erscheint eine Aufgabe.
          </div>
        </CardContent>
      </Card>

      {protokoll.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Protokoll</CardTitle>
            <CardDescription>Die letzten Abrufe</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {protokoll.map((p: any) => {
                const z = zugaenge.find((x: any) => x.id === p.connection_id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", p.ok ? "bg-green-500" : p.ok === false ? "bg-red-500" : "bg-muted-foreground")} />
                    <span className="w-32 shrink-0 text-xs text-muted-foreground">{format(new Date(p.gestartet), "dd.MM. HH:mm")}</span>
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {p.ausloeser === "zeitplan" ? "Zeitplan" : p.ausloeser === "hand" ? "von Hand" : "Einrichtung"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {z?.bank_name ?? "Bank"}:{" "}
                      {p.ok
                        ? p.ausloeser === "einrichtung"
                          ? `${p.ergebnis?.konten ?? 0} Konten gefunden`
                          : `${p.ergebnis?.neu ?? 0} neue Bewegungen`
                        : p.fehler || "läuft …"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      </>)}

      <BankzugangAssistent open={assistent} onOpenChange={setAssistent} />
      <BankzugangAssistent open={eigenerAssistent} onOpenChange={setEigenerAssistent} persoenlich />

      <Dialog open={!!pinFuer} onOpenChange={(o) => !o && (setPinFuer(null), setNeuePin(""))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN ändern</DialogTitle>
            <DialogDescription>
              {pinFuer?.bank_name} · {pinFuer?.anmeldename}. Nur nötig, wenn die PIN im Online-Banking geändert wurde.
            </DialogDescription>
          </DialogHeader>
          <Input type="password" value={neuePin} onChange={(e) => setNeuePin(e.target.value)} autoComplete="new-password" placeholder="Neue PIN" className="h-11" />
          <DialogFooter>
            <Button onClick={pinSpeichern} disabled={!neuePin}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {zuordnen && (
        <BankAccountMappingDialog
          open={!!zuordnen}
          onOpenChange={(o) => {
            if (!o) {
              setZuordnen(null);
              neuLaden();
            }
          }}
          buildingId={zuordnen.buildingId}
          iban={zuordnen.iban}
          bankNameFromStatement={zuordnen.name}
        />
      )}
    </div>
  );
}
