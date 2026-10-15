import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Download, Loader2, Lock, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { bankName, blzAusIban, cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { erzeugePain001, ibanGueltig, naechsterBankarbeitstag, sepaId, type SepaBlock } from "@/lib/sepa";
import type { KontoZeile } from "@/components/konten/kontenTypes";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface Rechnung {
  id: string;
  building_id: string;
  vendor_name: string | null;
  vendor_iban: string | null;
  vendor_bic?: string | null;
  gross_amount: number;
  due_date: string | null;
  invoice_number: string | null;
  payment_purpose: string | null;
}

/** Rechnungen, die schon in einem offenen Zahllauf stecken. */
export function useRechnungenInZahlung() {
  return useQuery({
    queryKey: ["zahllauf-offen"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payment_run_items")
        .select("invoice_id, run:payment_runs!inner(status, created_at)")
        .is("bank_transaction_id", null)
        .in("run.status", ["datei", "gesendet"]);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => r.invoice_id && m.set(r.invoice_id, r.run?.created_at));
      return m;
    },
  });
}

function verwendungszweck(r: Rechnung): string {
  if (r.payment_purpose?.trim()) return r.payment_purpose.trim();
  return r.invoice_number ? `Re. Nr. ${r.invoice_number}` : "Rechnung";
}

/**
 * Freigabe: alle bestätigten, offenen Rechnungen je Konto – mit
 * Kontostand heute, Ausgängen und Kontostand nach Zahlung. Liegt der Stand
 * danach unter dem Puffer (fester Betrag je WEG, sonst ein Monats-Hausgeld),
 * erscheint ein Hinweis mit Vorschlag zum Verschieben.
 *
 * Bis die Überweisung per TAN direkt aus der App freigeschaltet ist, gibt
 * es je Bank eine SEPA-Datei (ein Sammelauftrag, eine TAN im Online-Banking).
 * Kommt die Abbuchung auf dem Konto an, ist die Rechnung automatisch bezahlt.
 */
export function FreigabeDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [ab, setAb] = useState<Record<string, boolean>>({}); // abgewählte Rechnungen
  const [kontoWahl, setKontoWahl] = useState<Record<string, string>>({});
  const [pufferEdit, setPufferEdit] = useState<{ id: string; wert: string } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const istAdmin = profile?.role === "admin";

  const { data: inZahlung = new Map<string, string>() } = useRechnungenInZahlung();

  const { data: rechnungen = [], isLoading } = useQuery({
    queryKey: ["freigabe-rechnungen"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, building_id, vendor_name, vendor_iban, gross_amount, due_date, invoice_number, payment_purpose, invoice_type")
        .eq("status", "open")
        .eq("review_status", "verified")
        .not("building_id", "is", null)
        .gt("gross_amount", 0)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.invoice_type !== "credit_note") as Rechnung[];
    },
  });
  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: konten = [] } = useQuery({
    queryKey: ["konten-uebersicht"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });
  const { data: puffer = [] } = useQuery({
    queryKey: ["zahlungspuffer"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_zahlungspuffer").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) {
      setAb({});
      setPufferEdit(null);
    }
  }, [open]);

  const gruppen = useMemo(() => {
    const offen = rechnungen.filter((r) => !inZahlung.has(r.id));
    const je = new Map<string, Rechnung[]>();
    offen.forEach((r) => je.set(r.building_id, [...(je.get(r.building_id) ?? []), r]));
    return gebaeude
      .filter((g: any) => je.has(g.id) && (g.management_mode ?? "weg") === managementMode)
      .map((g: any) => {
        const ks = konten
          .filter((k) => k.building_id === g.id)
          .sort((a, b) => Number(/r[üu]cklage/i.test(a.display_name ?? "")) - Number(/r[üu]cklage/i.test(b.display_name ?? "")));
        const gewaehlt = ks.find((k) => k.iban === kontoWahl[g.id]) ?? ks[0] ?? null;
        const p = puffer.find((x: any) => x.building_id === g.id);
        const posten = je.get(g.id)!;
        const ausgewaehlt = posten.filter((r) => !ab[r.id] && ibanGueltig(r.vendor_iban));
        const summe = ausgewaehlt.reduce((s, r) => s + Number(r.gross_amount), 0);
        const saldo = gewaehlt?.saldo != null ? Number(gewaehlt.saldo) : null;
        const nach = saldo != null ? saldo - summe : null;
        const pufferWert = p ? Number(p.puffer) : 0;
        return {
          id: g.id as string,
          name: g.name as string,
          konten: ks,
          konto: gewaehlt,
          posten,
          ausgewaehlt,
          summe,
          saldo,
          nach,
          puffer: pufferWert,
          pufferEigen: p?.puffer_eingestellt != null,
          unterPuffer: nach != null && nach < pufferWert,
        };
      });
  }, [rechnungen, inZahlung, gebaeude, konten, puffer, kontoWahl, ab, managementMode]);

  /** Vorschlag: Rechnungen mit der spätesten Fälligkeit zurückstellen, bis der Puffer reicht. */
  const vorschlag = (g: (typeof gruppen)[number]) => {
    if (g.nach == null || !g.unterPuffer) return [];
    let fehlt = g.puffer - g.nach;
    const kandidaten = [...g.ausgewaehlt].sort((a, b) => (b.due_date ?? "9999").localeCompare(a.due_date ?? "9999"));
    const raus: Rechnung[] = [];
    for (const r of kandidaten) {
      if (fehlt <= 0) break;
      raus.push(r);
      fehlt -= Number(r.gross_amount);
    }
    return raus;
  };

  const banken = useMemo(() => {
    const m = new Map<string, typeof gruppen>();
    gruppen.forEach((g) => {
      if (!g.konto || g.ausgewaehlt.length === 0) return;
      const blz = blzAusIban(g.konto.iban) ?? "?";
      m.set(blz, [...(m.get(blz) ?? []), g]);
    });
    return [...m.entries()].map(([blz, gs]) => ({
      blz,
      name: bankName(gs[0].konto!.iban, null),
      gruppen: gs,
      anzahl: gs.reduce((s, g) => s + g.ausgewaehlt.length, 0),
      summe: gs.reduce((s, g) => s + g.summe, 0),
    }));
  }, [gruppen]);

  const pufferSpeichern = async () => {
    if (!pufferEdit) return;
    const t = pufferEdit.wert.trim();
    const wert = t === "" ? null : Number(t.replace(/\./g, "").replace(",", "."));
    if (wert != null && (!Number.isFinite(wert) || wert < 0)) {
      toast.error("Bitte einen Betrag eingeben (oder leer lassen für ein Monats-Hausgeld)");
      return;
    }
    const { error } = await (supabase as any).from("buildings").update({ zahlungspuffer: wert }).eq("id", pufferEdit.id);
    if (error) {
      toast.error("Puffer konnte nicht gespeichert werden");
      return;
    }
    setPufferEdit(null);
    queryClient.invalidateQueries({ queryKey: ["zahlungspuffer"] });
  };

  const dateiErzeugen = async (bank: (typeof banken)[number]) => {
    setLaeuft(bank.blz);
    try {
      const ausfuehrungAm = naechsterBankarbeitstag();
      const msgId = sepaId("RGI");
      const bloecke: SepaBlock[] = [];
      for (const g of bank.gruppen) {
        const konto = g.konto!;
        const inhaber = konto.bank_name && !/sparkasse|bank/i.test(konto.bank_name) ? konto.bank_name : `WEG ${g.name}`;
        const zahlungen = g.ausgewaehlt.map((r) => ({
          empfaenger: r.vendor_name || "Empfänger",
          iban: cleanIban(r.vendor_iban),
          betrag: Number(r.gross_amount),
          verwendungszweck: verwendungszweck(r),
          endToEndId: sepaId("RE"),
          invoiceId: r.id,
        }));
        // Zahllauf merken, damit die Abbuchung die Rechnung später automatisch bezahlt
        const { data: lauf, error } = await (supabase as any)
          .from("payment_runs")
          .insert({
            building_id: g.id,
            konto_iban: konto.iban,
            konto_inhaber: inhaber,
            status: "datei",
            weg: "datei",
            ausfuehrung_am: ausfuehrungAm,
            summe: g.summe,
            anzahl: zahlungen.length,
            created_by: profile?.user_id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        const { error: e2 } = await (supabase as any).from("payment_run_items").insert(
          zahlungen.map((z) => ({
            run_id: lauf.id,
            invoice_id: z.invoiceId,
            empfaenger: z.empfaenger,
            iban: z.iban,
            betrag: z.betrag,
            verwendungszweck: z.verwendungszweck,
            end_to_end_id: z.endToEndId,
          })),
        );
        if (e2) {
          await (supabase as any).from("payment_runs").delete().eq("id", lauf.id);
          throw e2;
        }
        bloecke.push({ kontoInhaber: inhaber, kontoIban: konto.iban, ausfuehrungAm, zahlungen });
      }
      const inhalt = erzeugePain001({ absender: "RGI Immobilien GmbH & Co. KG", bloecke, msgId });
      const blob = new Blob([inhalt], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SEPA-Ueberweisungen_${bank.name.replace(/[^A-Za-z]+/g, "-")}_${format(new Date(), "yyyy-MM-dd_HHmm")}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`SEPA-Datei für ${bank.name}: ${bank.anzahl} Zahlungen, ${euro(bank.summe)}. Im Online-Banking hochladen und mit einer TAN freigeben.`, { duration: 10000 });
      queryClient.invalidateQueries({ queryKey: ["zahllauf-offen"] });
      queryClient.invalidateQueries({ queryKey: ["freigabe-rechnungen"] });
    } catch (e: any) {
      toast.error(e?.message || "SEPA-Datei konnte nicht erstellt werden");
    } finally {
      setLaeuft(null);
    }
  };

  const gesamtAnzahl = banken.reduce((s, b) => s + b.anzahl, 0);
  const gesamtSumme = banken.reduce((s, b) => s + b.summe, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Freigabe</DialogTitle>
          <DialogDescription>
            Bestätigte Rechnungen je Konto. Haken raus bei allem, was noch warten soll.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : gruppen.length === 0 ? (
          <div className="rounded-lg border px-4 py-10 text-center text-sm text-muted-foreground">
            Keine bestätigten Rechnungen zur Freigabe. Rechnungen erst im Prüfmodus bestätigen.
          </div>
        ) : (
          <div className="space-y-4">
            {gruppen.map((g) => {
              const vor = vorschlag(g);
              return (
                <section key={g.id} className="overflow-hidden rounded-xl border">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-muted/30 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{g.name}</div>
                      {g.konten.length > 1 ? (
                        <Select value={g.konto?.iban ?? ""} onValueChange={(v) => setKontoWahl((k) => ({ ...k, [g.id]: v }))}>
                          <SelectTrigger className="mt-1 h-8 w-72 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {g.konten.map((k) => (
                              <SelectItem key={k.iban} value={k.iban}>
                                {(k.display_name || "Konto") + " · " + ibanFormatiert(k.iban)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {g.konto ? `${g.konto.display_name || "Konto"} · ${bankName(g.konto.iban, null)} · ${ibanFormatiert(g.konto.iban)}` : "Kein Bankkonto hinterlegt"}
                        </div>
                      )}
                    </div>
                    <Zahl label="Kontostand heute" wert={g.saldo} hinweis={g.konto?.saldo_stand ? `Stand ${format(new Date(g.konto.saldo_stand), "dd.MM.")}` : undefined} />
                    <Zahl label="Ausgänge" wert={-g.summe} />
                    <Zahl label="Nach Zahlung" wert={g.nach} warn={g.unterPuffer} fett />
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Puffer</div>
                      {pufferEdit?.id === g.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={pufferEdit.wert}
                            onChange={(e) => setPufferEdit({ id: g.id, wert: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && pufferSpeichern()}
                            placeholder="leer = 1 Monat"
                            className="h-8 w-28 text-right"
                          />
                          <Button size="sm" className="h-8" onClick={pufferSpeichern}>
                            OK
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!istAdmin}
                          onClick={() => setPufferEdit({ id: g.id, wert: g.pufferEigen ? String(g.puffer).replace(".", ",") : "" })}
                          className="inline-flex items-center gap-1 tabular-nums hover:underline disabled:no-underline"
                          title={g.pufferEigen ? "Fester Betrag" : "Ein Monats-Hausgeld (Standard)"}
                        >
                          {euro(g.puffer)}
                          {istAdmin && <Pencil className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {g.unterPuffer && (
                    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="flex-1">
                        Nach den Zahlungen bliebe weniger als der Puffer.
                        {vor.length > 0 && ` Vorschlag: ${vor.map((r) => r.vendor_name || "Rechnung").join(", ")} verschieben.`}
                      </span>
                      {vor.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-amber-300 bg-transparent"
                          onClick={() => setAb((x) => ({ ...x, ...Object.fromEntries(vor.map((r) => [r.id, true])) }))}
                        >
                          Vorschlag übernehmen
                        </Button>
                      )}
                    </div>
                  )}

                  <ul className="divide-y">
                    {g.posten.map((r) => {
                      const ibanOk = ibanGueltig(r.vendor_iban);
                      const an = ibanOk && !ab[r.id];
                      const ueberfaellig = r.due_date && r.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <li key={r.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", !an && "text-muted-foreground")}>
                          <Checkbox
                            checked={an}
                            disabled={!ibanOk}
                            onCheckedChange={(v) => setAb((x) => ({ ...x, [r.id]: !v }))}
                            aria-label="Zur Freigabe"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{r.vendor_name || "Empfänger fehlt"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {ibanOk ? ibanFormatiert(r.vendor_iban) : <span className="text-destructive">IBAN fehlt oder ist falsch</span>}
                              {" · "}
                              {verwendungszweck(r)}
                            </span>
                          </span>
                          <span className={cn("hidden w-28 text-xs sm:block", ueberfaellig && "text-destructive")}>
                            {r.due_date ? `fällig ${format(new Date(r.due_date), "dd.MM.yyyy")}` : "ohne Fälligkeit"}
                          </span>
                          <span className="w-28 text-right tabular-nums font-medium">{euro(r.gross_amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            <div className="sticky bottom-0 space-y-3 rounded-xl border bg-background p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {gesamtAnzahl} Zahlungen · {euro(gesamtSumme)}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Geld geht nur mit TAN raus. Eine zweite Person muss nicht freigeben.
                </span>
              </div>
              {banken.map((b) => (
                <div key={b.blz} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground"> · {b.anzahl} Zahlungen · {euro(b.summe)}</span>
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button size="sm" disabled>
                            <Lock className="h-4 w-4 mr-1.5" /> Per TAN senden
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Kommt, sobald der Abruf über die Bank bei euch sicher läuft. Bis dahin die SEPA-Datei im Online-Banking hochladen.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button size="sm" variant="outline" onClick={() => dateiErzeugen(b)} disabled={!!laeuft}>
                    {laeuft === b.blz ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                    SEPA-Datei
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Die SEPA-Datei ist ein Sammelauftrag: im Online-Banking unter „Datei-Upload" hochladen und mit einer TAN freigeben. Sobald die
                Abbuchung auf dem Konto ankommt, steht die Rechnung von selbst auf „bezahlt".
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Zahl({ label, wert, hinweis, warn, fett }: { label: string; wert: number | null; hinweis?: string; warn?: boolean; fett?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", fett && "font-semibold", warn && "text-amber-700 dark:text-amber-400")}>{wert == null ? "unbekannt" : euro(wert)}</div>
      {hinweis && <div className="text-[11px] text-muted-foreground">{hinweis}</div>}
    </div>
  );
}
