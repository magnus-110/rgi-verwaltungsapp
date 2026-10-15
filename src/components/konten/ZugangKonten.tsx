import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Briefcase, Eye, EyeOff, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";

type Filter = "offen" | "zugeordnet" | "ausgeblendet";

interface Props {
  zugang: any;
  /** IBAN → Liegenschaft (aus building_bank_accounts) */
  ibanLiegenschaft: Map<string, string>;
  namen: Record<string, string>;
  gebaeude: { id: string; name: string }[];
  /** Liegenschaft wählen → Dialog für Konto im Kontenrahmen öffnen */
  onLiegenschaft: (k: { iban: string; buildingId: string; name?: string | null }) => void;
  onGeaendert: () => void;
}

/**
 * Alle Konten eines Bankzugangs: zuordnen (Liegenschaft oder RGI intern),
 * ausblenden (z. B. private Konten – sie werden nie abgerufen) und den
 * Kontostand anzeigen, damit man ein Konto sicher erkennt.
 */
export function ZugangKonten({ zugang, ibanLiegenschaft, namen, gebaeude, onLiegenschaft, onGeaendert }: Props) {
  const [filter, setFilter] = useState<Filter>("offen");
  const [auswahl, setAuswahl] = useState<Record<string, string>>({});
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [saldenLaden, setSaldenLaden] = useState(false);

  const konten = useMemo(
    () =>
      ((zugang.konten ?? []) as any[])
        .filter((k) => k.iban)
        .map((k) => {
          const iban = cleanIban(k.iban);
          const buildingId = ibanLiegenschaft.get(iban) ?? null;
          const art: Filter = k.ausgeblendet ? "ausgeblendet" : buildingId || k.rgi ? "zugeordnet" : "offen";
          return { ...k, iban, buildingId, art };
        }),
    [zugang.konten, ibanLiegenschaft],
  );
  const anzahl = (f: Filter) => konten.filter((k) => k.art === f).length;
  const liste = konten.filter((k) => k.art === filter);
  const mitSaldo = konten.some((k) => k.saldo != null);

  const setzen = async (iban: string, werte: { ausgeblendet?: boolean; rgi?: boolean }) => {
    setArbeitet(iban);
    const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "konto_setzen", id: zugang.id, iban, ...werte } });
    setArbeitet(null);
    if (error || data?.error) {
      toast.error(data?.error || "Konnte nicht gespeichert werden");
      return;
    }
    onGeaendert();
  };

  const zuordnen = (k: any) => {
    const ziel = auswahl[k.iban];
    if (!ziel) return;
    if (ziel === "rgi") setzen(k.iban, { rgi: true });
    else onLiegenschaft({ iban: k.iban, buildingId: ziel, name: k.inhaber });
  };

  const kontostaendeLaden = async () => {
    setSaldenLaden(true);
    const t = toast.loading("Kontostände werden geholt … Falls die Bank fragt: bitte in der App freigeben.");
    const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "salden", id: zugang.id } });
    toast.dismiss(t);
    setSaldenLaden(false);
    if (error || data?.error || data?.ok === false) {
      toast.error(data?.error || data?.fehler || "Kontostände konnten nicht geholt werden");
    } else toast.success("Kontostände aktualisiert");
    onGeaendert();
  };

  if (konten.length === 0) return null;

  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {(["offen", "zugeordnet", "ausgeblendet"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "offen" ? "Nicht zugeordnet" : f === "zugeordnet" ? "Zugeordnet" : "Ausgeblendet"} ({anzahl(f)})
          </button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={kontostaendeLaden} disabled={saldenLaden || zugang.status === "neu"}>
          {saldenLaden ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5 mr-1.5" />}
          {mitSaldo ? "Kontostände aktualisieren" : "Kontostände laden"}
        </Button>
      </div>
      <p className="px-4 pt-1 text-xs text-muted-foreground">
        {filter === "offen" && "Werden nicht abgerufen, bis sie einer Liegenschaft oder RGI intern zugeordnet sind. Private Konten einfach ausblenden."}
        {filter === "zugeordnet" && "Diese Konten holt die App zweimal täglich ab."}
        {filter === "ausgeblendet" && "Ausgeblendete Konten werden nie abgerufen und nirgends angezeigt."}
      </p>
      {liste.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">Keine Konten.</div>
      ) : (
        <ul className="mt-2 divide-y">
          {liste.map((k) => (
            <li key={k.iban} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 basis-56">
                <span className="block truncate">{k.inhaber || "Konto"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{ibanFormatiert(k.iban)}</span>
                  {k.name ? ` · ${k.name}` : ""}
                </span>
              </span>
              <span className="w-32 text-right">
                <span className="block tabular-nums">{k.saldo != null ? euro(k.saldo) : "–"}</span>
                {k.saldoAm && <span className="block text-[11px] text-muted-foreground">{format(new Date(k.saldoAm), "dd.MM.yyyy")}</span>}
              </span>
              {k.art === "zugeordnet" ? (
                <span className="flex w-64 items-center justify-end gap-2">
                  <span className="truncate text-green-700 dark:text-green-400">
                    {k.rgi ? (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> RGI intern
                      </span>
                    ) : (
                      namen[k.buildingId] ?? "Liegenschaft"
                    )}
                  </span>
                  {k.rgi && (
                    <Button size="sm" variant="ghost" className="h-8" disabled={arbeitet === k.iban} onClick={() => setzen(k.iban, { rgi: false })}>
                      Lösen
                    </Button>
                  )}
                </span>
              ) : k.art === "offen" ? (
                <span className="flex items-center gap-2">
                  <Select value={auswahl[k.iban] ?? ""} onValueChange={(v) => setAuswahl((a) => ({ ...a, [k.iban]: v }))}>
                    <SelectTrigger className="h-9 w-52">
                      <SelectValue placeholder="Zuordnen zu …" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rgi">RGI intern</SelectItem>
                      <SelectSeparator />
                      {gebaeude.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!auswahl[k.iban] || arbeitet === k.iban} onClick={() => zuordnen(k)}>
                    Zuordnen
                  </Button>
                </span>
              ) : null}
              {k.art !== "zugeordnet" || k.rgi ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  disabled={arbeitet === k.iban}
                  title={k.ausgeblendet ? "Wieder einblenden" : "Ausblenden"}
                  onClick={() => setzen(k.iban, { ausgeblendet: !k.ausgeblendet })}
                >
                  {arbeitet === k.iban ? <Loader2 className="h-4 w-4 animate-spin" /> : k.ausgeblendet ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              ) : (
                <span className="w-8" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
