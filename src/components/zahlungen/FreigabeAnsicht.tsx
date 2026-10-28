import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, Download, Loader2, Lock, Pencil, ShieldCheck, Smartphone, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { bankName, blzAusIban, cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { erzeugePain001, ibanGueltig, naechsterBankarbeitstag, sepaId, type SepaBlock } from "@/lib/sepa";
import { faelligeAuftragsposten, fruehesterEinzug, postenAuslassen, type FaelligerPosten } from "@/lib/auftraege";
import type { KontoZeile } from "@/components/konten/kontenTypes";
import { TanSendenDialog } from "./TanSendenDialog";

/** Gruppe für Rechnungen der RGI selbst (Firmenkonto, nur Admins). */
const RGI = "rgi";
const RGI_NAME = "RGI Immobilien GmbH & Co. KG";

interface Rechnung {
  id: string;
  building_id: string;
  is_company_invoice?: boolean;
  vendor_name: string | null;
  vendor_iban: string | null;
  gross_amount: number;
  due_date: string | null;
  invoice_number: string | null;
  payment_purpose: string | null;
}

/** Eine Zeile der Freigabe: Rechnung, Überweisung oder Einzug aus einem Auftrag. */
interface Zeile {
  key: string;
  richtung: "aus" | "ein";
  name: string;
  iban: string | null;
  betrag: number;
  zweck: string;
  wann: string;
  faellig: string | null;
  hinweis: string | null;
  rechnung?: Rechnung;
  auftrag?: FaelligerPosten;
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
        .not("invoice_id", "is", null)
        .in("run.status", ["datei", "pruefung", "laeuft", "gesendet", "unklar"]);
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
const datum = (d: string | null) => (d ? format(new Date(d), "dd.MM.yyyy") : "");

/**
 * Freigabe: bestätigte Rechnungen, eigene Aufträge und fällige Lastschriften
 * je Konto – mit Kontostand heute, Ausgängen, Stand nach Zahlung und
 * erwarteten Einzügen. Haken raus bei allem, was warten soll; der Rest geht
 * per TAN raus (je Konto eine Freigabe in der Banking-App). Konten ohne
 * Bankzugang bekommen eine SEPA-Datei für das Online-Banking.
 */
export function FreigabeAnsicht({ onZurueck }: { onZurueck: () => void }) {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { managementMode } = useManagementMode();
  const [ab, setAb] = useState<Record<string, boolean>>({});
  const [kontoWahl, setKontoWahl] = useState<Record<string, string>>({});
  const [pufferEdit, setPufferEdit] = useState<{ id: string; wert: string } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [tanLaeufe, setTanLaeufe] = useState<string[] | null>(null);
  const [rausnehmen, setRausnehmen] = useState<Zeile | null>(null);
  const [nimmtRaus, setNimmtRaus] = useState(false);
  const istAdmin = profile?.role === "admin";

  const { data: inZahlung = new Map<string, string>() } = useRechnungenInZahlung();
  const { data: rechnungen = [], isLoading } = useQuery({
    queryKey: ["freigabe-rechnungen", istAdmin],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, building_id, is_company_invoice, vendor_name, vendor_iban, gross_amount, due_date, invoice_number, payment_purpose, invoice_type")
        .eq("status", "open")
        .eq("review_status", "verified")
        .eq("lastschrift", false)
        .gt("gross_amount", 0)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      // Liegenschafts-Rechnungen für alle, RGI-Rechnungen nur für Admins
      return (data ?? []).filter(
        (r: any) => r.invoice_type !== "credit_note" && (r.is_company_invoice ? istAdmin : !!r.building_id),
      ) as Rechnung[];
    },
  });
  const { data: auftragsPosten = [], isLoading: laedtAuftraege } = useQuery({
    queryKey: ["freigabe-auftraege"],
    queryFn: () => faelligeAuftragsposten(),
  });
  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften", "glaeubiger"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("buildings").select("id, name, management_mode, creditor_id").order("name");
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
  // Firmenkonten der RGI (im Büro-Bankzugang als „RGI intern“ markiert)
  const { data: rgiKonten = [] } = useQuery({
    queryKey: ["rgi-firmenkonten"],
    enabled: istAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bank_connections").select("konten").is("persoenlich_fuer", null);
      if (error) throw error;
      const m = new Map<string, KontoZeile>();
      (data ?? []).forEach((z: any) =>
        (z.konten ?? [])
          .filter((k: any) => k.rgi && k.iban && !k.ausgeblendet)
          .forEach((k: any) =>
            m.set(cleanIban(k.iban), {
              building_id: RGI,
              iban: cleanIban(k.iban),
              display_name: k.name ? `${k.name} (RGI)` : "Firmenkonto RGI",
              bank_name: RGI_NAME,
              saldo: k.saldo ?? null,
              saldo_stand: k.saldoAm ?? null,
            } as any),
          ),
      );
      return [...m.values()];
    },
  });
  const { data: puffer = [] } = useQuery({
    queryKey: ["zahlungspuffer"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_zahlungspuffer").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  // Zahlungen nur über den EIGENEN Bankzugang des angemeldeten Nutzers
  const { data: eigenerZugang } = useQuery({
    queryKey: ["bank-connections", "eigene", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_connections")
        .select("konten, status")
        .eq("persoenlich_fuer", user!.id)
        .in("status", ["aktiv", "tan_noetig"]);
      if (error) throw error;
      const m = new Set<string>();
      (data ?? []).forEach((z: any) => (z.konten ?? []).forEach((k: any) => k.iban && m.add(cleanIban(k.iban))));
      return { anzahl: (data ?? []).length, konten: m };
    },
  });
  const fintsKonten = eigenerZugang?.konten ?? new Set<string>();
  const { data: offeneEntscheidungen = [] } = useQuery({
    queryKey: ["zahllauf-entscheidung"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("payment_runs").select("id").eq("weg", "fints").in("status", ["pruefung", "unklar", "fehler"]);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.id as string);
    },
  });

  const imModus = (id: string) => id === RGI || (gebaeude.find((g: any) => g.id === id)?.management_mode ?? "weg") === managementMode;

  /** Gruppen je Konto: Rechnungen aufs gewählte Konto, Auftragsposten auf ihr eigenes. */
  const gruppen = useMemo(() => {
    const m = new Map<string, { buildingId: string; iban: string; zeilen: Zeile[] }>();
    const gruppe = (buildingId: string, iban: string) => {
      const k = `${buildingId}|${cleanIban(iban)}`;
      if (!m.has(k)) m.set(k, { buildingId, iban: cleanIban(iban), zeilen: [] });
      return m.get(k)!;
    };
    const kontenVon = (b: string) =>
      b === RGI ? rgiKonten : konten.filter((k) => k.building_id === b).sort((x, y) => Number(/r[üu]cklage/i.test(x.display_name ?? "")) - Number(/r[üu]cklage/i.test(y.display_name ?? "")));

    for (const r of rechnungen) {
      const b = r.is_company_invoice ? RGI : r.building_id;
      if (inZahlung.has(r.id) || !imModus(b)) continue;
      const ks = kontenVon(b);
      const konto = ks.find((k) => k.iban === kontoWahl[b]) ?? ks[0];
      if (!konto) continue;
      gruppe(b, konto.iban).zeilen.push({
        key: `r:${r.id}`,
        richtung: "aus",
        name: r.vendor_name || "Empfänger fehlt",
        iban: r.vendor_iban,
        betrag: Number(r.gross_amount),
        zweck: verwendungszweck(r),
        wann: r.due_date ? `fällig ${datum(r.due_date)}` : "ohne Fälligkeit",
        faellig: r.due_date,
        hinweis: ibanGueltig(r.vendor_iban) ? null : "IBAN fehlt oder ist falsch",
        rechnung: r,
      });
    }
    for (const p of auftragsPosten) {
      if (!imModus(p.buildingId)) continue;
      const ein = p.art === "lastschrift";
      const tag = ein && p.faelligAm < fruehesterEinzug() ? fruehesterEinzug() : p.faelligAm;
      gruppe(p.buildingId, p.kontoIban).zeilen.push({
        key: `a:${p.schluessel}`,
        richtung: ein ? "ein" : "aus",
        name: p.name,
        iban: p.iban,
        betrag: p.betrag,
        zweck: p.verwendungszweck,
        wann: `${p.titel} · ${ein ? "Einzug" : "am"} ${datum(tag)}`,
        faellig: tag,
        hinweis: p.hinderung,
        auftrag: { ...p, faelligAm: tag },
      });
    }

    return [...m.values()]
      .map((g) => {
        const haus = gebaeude.find((x: any) => x.id === g.buildingId);
        const konto = kontenVon(g.buildingId).find((k) => k.iban === g.iban) ?? null;
        const p = puffer.find((x: any) => x.building_id === g.buildingId);
        const an = g.zeilen.filter((z) => !ab[z.key] && !z.hinweis);
        const aus = an.filter((z) => z.richtung === "aus");
        const ein = an.filter((z) => z.richtung === "ein");
        const summeAus = aus.reduce((s, z) => s + z.betrag, 0);
        const summeEin = ein.reduce((s, z) => s + z.betrag, 0);
        const saldo = konto?.saldo != null ? Number(konto.saldo) : null;
        const nach = saldo != null ? saldo - summeAus : null;
        const pufferWert = p ? Number(p.puffer) : 0;
        return {
          key: `${g.buildingId}|${g.iban}`,
          buildingId: g.buildingId,
          name: g.buildingId === RGI ? RGI_NAME : haus?.name ?? "Liegenschaft",
          glaeubigerId: haus?.creditor_id ?? null,
          iban: g.iban,
          konto,
          kontenAuswahl: kontenVon(g.buildingId),
          hatRechnungen: g.zeilen.some((z) => z.rechnung),
          zeilen: g.zeilen.sort((x, y) => Number(x.richtung === "ein") - Number(y.richtung === "ein") || (x.faellig ?? "9").localeCompare(y.faellig ?? "9")),
          aus,
          ein,
          summeAus,
          summeEin,
          saldo,
          nach,
          puffer: pufferWert,
          pufferEigen: p?.puffer_eingestellt != null,
          unterPuffer: nach != null && summeAus > 0 && nach < pufferWert,
          fints: fintsKonten.has(g.iban),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [rechnungen, auftragsPosten, inZahlung, gebaeude, konten, rgiKonten, puffer, kontoWahl, ab, fintsKonten, managementMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Vorschlag: Ausgänge mit der spätesten Fälligkeit zurückstellen, bis der Puffer reicht. */
  const vorschlag = (g: (typeof gruppen)[number]) => {
    if (g.nach == null || !g.unterPuffer) return [];
    let fehlt = g.puffer - g.nach;
    const raus: Zeile[] = [];
    for (const z of [...g.aus].sort((a, b) => (b.faellig ?? "9999").localeCompare(a.faellig ?? "9999"))) {
      if (fehlt <= 0) break;
      raus.push(z);
      fehlt -= z.betrag;
    }
    return raus;
  };

  const banken = useMemo(() => {
    const m = new Map<string, typeof gruppen>();
    gruppen.forEach((g) => {
      if (g.aus.length + g.ein.length === 0) return;
      const blz = blzAusIban(g.iban) ?? "?";
      m.set(blz, [...(m.get(blz) ?? []), g]);
    });
    return [...m.entries()].map(([blz, gs]) => ({
      blz,
      name: bankName(gs[0].iban, null),
      gruppen: gs,
      fints: gs.every((g) => g.fints),
      anzahl: gs.reduce((s, g) => s + g.aus.length + g.ein.length, 0),
      aus: gs.reduce((s, g) => s + g.summeAus, 0),
      ein: gs.reduce((s, g) => s + g.summeEin, 0),
      lastschriften: gs.some((g) => g.ein.length > 0),
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

  const neuLaden = () => {
    ["zahllauf-offen", "freigabe-rechnungen", "freigabe-auftraege", "zahllauf-entscheidung", "auftraege"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  /** Zeile ganz aus der Freigabe nehmen: Rechnung zurück auf „offen“, Auftragstermin auslassen. */
  const rausnehmenBestaetigt = async () => {
    const z = rausnehmen;
    if (!z) return;
    setNimmtRaus(true);
    try {
      if (z.rechnung) {
        const { error } = await (supabase as any).from("invoices").update({ review_status: "open" }).eq("id", z.rechnung.id);
        if (error) throw error;
        toast.success("Rechnung ist wieder offen (ungeprüft) und aus der Freigabe raus");
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } else if (z.auftrag) {
        await postenAuslassen(z.auftrag.schluessel);
        toast.success(z.richtung === "ein" ? "Einzug für diesen Termin gelöscht" : "Zahlung für diesen Termin gelöscht");
      }
      setAb((x) => {
        const n = { ...x };
        delete n[z.key];
        return n;
      });
      neuLaden();
      setRausnehmen(null);
    } catch (e: any) {
      toast.error(e?.message || "Konnte nicht herausgenommen werden");
    } finally {
      setNimmtRaus(false);
    }
  };

  /** Zahlläufe anlegen: je Konto einer für Überweisungen und je Einzugstag einer für Lastschriften. */
  const laeufeAnlegen = async (bank: (typeof banken)[number], weg: "datei" | "fints") => {
    const heute = naechsterBankarbeitstag();
    const angelegt: { laufId: string; block?: SepaBlock }[] = [];
    const lauf = async (g: (typeof gruppen)[number], art: "ueberweisung" | "lastschrift", zeilen: Zeile[], faellig: string) => {
      const inhaber = g.buildingId === RGI ? RGI_NAME : g.konto?.bank_name && !/sparkasse|bank/i.test(g.konto.bank_name) ? g.konto.bank_name : `WEG ${g.name}`;
      const posten = zeilen.map((z) => ({
        empfaenger: z.name,
        iban: cleanIban(z.iban),
        betrag: Math.round(z.betrag * 100) / 100,
        verwendungszweck: z.zweck,
        endToEndId: sepaId(art === "lastschrift" ? "EZ" : "RE"),
        invoiceId: z.rechnung?.id ?? null,
        orderItemId: z.auftrag?.orderItemId ?? null,
        mandat: z.auftrag?.mandat ?? null,
      }));
      const summe = posten.reduce((s, p) => s + Math.round(p.betrag * 100), 0) / 100;
      const { data: l, error } = await (supabase as any)
        .from("payment_runs")
        .insert({
          building_id: g.buildingId === RGI ? null : g.buildingId,
          konto_iban: g.iban,
          konto_inhaber: inhaber,
          status: weg === "fints" ? "pruefung" : "datei",
          weg,
          art,
          ausfuehrung_am: art === "lastschrift" ? faellig : heute,
          faellig_am: faellig,
          glaeubiger_id: art === "lastschrift" ? g.glaeubigerId : null,
          summe,
          anzahl: posten.length,
          created_by: profile?.user_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await (supabase as any).from("payment_run_items").insert(
        posten.map((p) => ({
          run_id: l.id,
          invoice_id: p.invoiceId,
          order_item_id: p.orderItemId,
          empfaenger: p.empfaenger,
          iban: p.iban,
          betrag: p.betrag,
          verwendungszweck: p.verwendungszweck,
          end_to_end_id: p.endToEndId,
          mandate_id: p.mandat?.id ?? null,
          mandatsreferenz: p.mandat?.mandatsreferenz ?? null,
          mandat_datum: p.mandat?.unterschrieben_am ?? null,
        })),
      );
      if (e2) {
        await (supabase as any).from("payment_runs").delete().eq("id", l.id);
        throw e2;
      }
      angelegt.push({
        laufId: l.id,
        block: art === "ueberweisung" ? { kontoInhaber: inhaber, kontoIban: g.iban, ausfuehrungAm: heute, zahlungen: posten } : undefined,
      });
    };

    for (const g of bank.gruppen) {
      if (g.aus.length) {
        // Ausführung je Auftrag: der späteste gewünschte Termin, mindestens heute
        const termin = g.aus.map((z) => (z.auftrag ? z.faellig : null)).filter(Boolean).sort().at(-1) as string | undefined;
        await lauf(g, "ueberweisung", g.aus, termin && termin > heute ? termin : heute);
      }
      if (g.ein.length && weg === "fints") {
        const jeTag = new Map<string, Zeile[]>();
        g.ein.forEach((z) => jeTag.set(z.faellig!, [...(jeTag.get(z.faellig!) ?? []), z]));
        for (const [tag, zs] of jeTag) await lauf(g, "lastschrift", zs, tag < fruehesterEinzug() ? fruehesterEinzug() : tag);
      }
    }
    return angelegt;
  };

  const dateiErzeugen = async (bank: (typeof banken)[number]) => {
    setLaeuft(bank.blz);
    try {
      const bloecke = (await laeufeAnlegen(bank, "datei")).map((x) => x.block).filter(Boolean) as SepaBlock[];
      if (!bloecke.length) {
        toast.info("Keine Überweisungen für die SEPA-Datei");
        return;
      }
      const inhalt = erzeugePain001({ absender: "RGI Immobilien GmbH & Co. KG", bloecke, msgId: sepaId("RGI") });
      const url = URL.createObjectURL(new Blob([inhalt], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `SEPA-Ueberweisungen_${bank.name.replace(/[^A-Za-z]+/g, "-")}_${format(new Date(), "yyyy-MM-dd_HHmm")}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`SEPA-Datei für ${bank.name}: im Online-Banking hochladen und mit einer TAN freigeben.`, { duration: 10000 });
      neuLaden();
    } catch (e: any) {
      toast.error(e?.message || "SEPA-Datei konnte nicht erstellt werden");
    } finally {
      setLaeuft(null);
    }
  };

  const perTanSenden = async (bank: (typeof banken)[number]) => {
    setLaeuft(bank.blz);
    try {
      const laeufe = await laeufeAnlegen(bank, "fints");
      neuLaden();
      setTanLaeufe(laeufe.map((x) => x.laufId));
    } catch (e: any) {
      toast.error(e?.message || "Freigabe konnte nicht vorbereitet werden");
    } finally {
      setLaeuft(null);
    }
  };

  const anzahl = banken.reduce((s, b) => s + b.anzahl, 0);
  const summeAus = banken.reduce((s, b) => s + b.aus, 0);
  const summeEin = banken.reduce((s, b) => s + b.ein, 0);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onZurueck} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Zahlungen
      </button>
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Freigabe</h1>
        <p className="mt-2 text-muted-foreground">Bestätigte Rechnungen, eigene Aufträge und fällige Lastschriften. Haken raus bei allem, was diesmal warten soll – mit dem Haken beim Gebäude das ganze Haus. Mit × nimmst du einen Punkt ganz heraus. Der Rest geht per TAN raus.</p>
      </header>

      {offeneEntscheidungen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{offeneEntscheidungen.length === 1 ? "Ein Auftrag per TAN wartet" : `${offeneEntscheidungen.length} Aufträge per TAN warten`} auf Ihre Entscheidung.</span>
          <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => setTanLaeufe(offeneEntscheidungen)}>
            Ansehen
          </Button>
        </div>
      )}

      {isLoading || laedtAuftraege ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : gruppen.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">Nichts zur Freigabe. Rechnungen erst bestätigen oder einen Auftrag anlegen.</div>
      ) : (
        <div className="space-y-4">
          {gruppen.map((g) => {
            const vor = vorschlag(g);
            return (
              <section key={g.key} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 px-4 pb-3 pt-4">
                  <div className="min-w-0">
                    {(() => {
                      const waehlbar = g.zeilen.filter((z) => !z.hinweis);
                      const alleAn = waehlbar.length > 0 && waehlbar.every((z) => !ab[z.key]);
                      const keinesAn = waehlbar.every((z) => ab[z.key]);
                      return (
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={alleAn}
                            ref={(el) => el && (el.indeterminate = !alleAn && !keinesAn)}
                            disabled={!waehlbar.length}
                            onChange={(e) => setAb((x) => ({ ...x, ...Object.fromEntries(waehlbar.map((z) => [z.key, !e.target.checked])) }))}
                            className="h-5 w-5 shrink-0 accent-primary"
                            aria-label={`${g.name} komplett an- oder abwählen`}
                          />
                          <span className={cn("text-lg font-bold", keinesAn && "text-muted-foreground")}>{g.name}</span>
                          {keinesAn && waehlbar.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">diesmal nicht</span>}
                        </label>
                      );
                    })()}
                    {g.hatRechnungen && g.kontenAuswahl.length > 1 ? (
                      <Select value={g.iban} onValueChange={(v) => setKontoWahl((k) => ({ ...k, [g.buildingId]: v }))}>
                        <SelectTrigger className="mt-1 h-8 w-72 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {g.kontenAuswahl.map((k) => (
                            <SelectItem key={k.iban} value={k.iban}>
                              {(k.display_name || "Konto") + " · " + ibanFormatiert(k.iban)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {g.konto?.display_name || "Konto"} · {bankName(g.iban, null)} · {ibanFormatiert(g.iban)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-[280px] text-sm">
                    <Linie label="Kontostand heute" wert={g.saldo == null ? "unbekannt" : euro(g.saldo)} hinweis={g.konto?.saldo_stand ? `Stand ${format(new Date(g.konto.saldo_stand), "dd.MM.")}` : undefined} />
                    {g.aus.length > 0 && <Linie label={`Überweisungen (${g.aus.length})`} wert={euro(-g.summeAus)} />}
                    <div className={cn("mt-1 flex justify-between border-t pt-1.5 font-bold", g.unterPuffer && "text-amber-700 dark:text-amber-400")}>
                      <span>Nach Zahlung</span>
                      <span className="tabular-nums">{g.nach == null ? "unbekannt" : euro(g.nach)}</span>
                    </div>
                    {g.ein.length > 0 && <Linie label={`Einzüge erwartet (${g.ein.length})`} wert={`+${euro(g.summeEin)}`} gruen />}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Puffer</span>
                      {pufferEdit?.id === g.buildingId ? (
                        <span className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={pufferEdit.wert}
                            onChange={(e) => setPufferEdit({ id: g.buildingId, wert: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && pufferSpeichern()}
                            placeholder="leer = 1 Monat"
                            className="h-7 w-28 text-right text-xs"
                          />
                          <Button size="sm" className="h-7" onClick={pufferSpeichern}>
                            OK
                          </Button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!istAdmin || g.buildingId === RGI}
                          onClick={() => setPufferEdit({ id: g.buildingId, wert: g.pufferEigen ? String(g.puffer).replace(".", ",") : "" })}
                          className="inline-flex items-center gap-1 tabular-nums hover:underline disabled:no-underline"
                          title={g.pufferEigen ? "Fester Betrag" : "Ein Monats-Hausgeld (Standard)"}
                        >
                          {euro(g.puffer)}
                          {istAdmin && <Pencil className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {g.unterPuffer && (
                  <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <span className="flex-1 basis-72">
                      Unter dem Puffer von {euro(g.puffer)}.{vor.length > 0 && ` Vorschlag: ${vor.map((z) => z.name).join(", ")} verschieben.`}
                    </span>
                    {vor.length > 0 && (
                      <Button size="sm" variant="outline" className="h-8 border-amber-300 bg-transparent" onClick={() => setAb((x) => ({ ...x, ...Object.fromEntries(vor.map((z) => [z.key, true])) }))}>
                        Vorschlag übernehmen
                      </Button>
                    )}
                  </div>
                )}

                <ul className="divide-y border-t">
                  {g.zeilen.map((z) => {
                    const an = !z.hinweis && !ab[z.key];
                    const ueberfaellig = z.richtung === "aus" && z.faellig && z.faellig < new Date().toISOString().slice(0, 10);
                    return (
                      <li key={z.key} className="flex items-center pr-2">
                        <label className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 pl-4 pr-2 text-sm", !an && "text-muted-foreground")}>
                          <input
                            type="checkbox"
                            checked={an}
                            disabled={!!z.hinweis}
                            onChange={(e) => setAb((x) => ({ ...x, [z.key]: !e.target.checked }))}
                            className="h-5 w-5 shrink-0 accent-primary"
                          />
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", z.richtung === "ein" ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")}>
                            {z.richtung === "ein" ? <ArrowDown className="h-3.5 w-3.5" aria-label="Einzug" /> : <ArrowUp className="h-3.5 w-3.5" aria-label="Überweisung" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{z.name}</span>
                            <span className={cn("block truncate text-xs text-muted-foreground", ueberfaellig && "text-destructive")}>
                              {z.iban ? ibanFormatiert(z.iban) : "–"} · {z.zweck} · {z.wann}
                            </span>
                          </span>
                          {z.hinweis && <span className="hidden rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200 sm:inline">{z.hinweis}</span>}
                          <span className={cn("w-28 text-right font-semibold tabular-nums", z.richtung === "ein" && an && "text-green-700 dark:text-green-400")}>
                            {z.richtung === "ein" ? "+" : "−"}
                            {euro(z.betrag)}
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          title={z.rechnung ? "Aus der Freigabe nehmen (Rechnung wieder auf offen)" : "Diesen Termin löschen"}
                          aria-label={`${z.name} aus der Freigabe nehmen`}
                          onClick={() => setRausnehmen(z)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <div className="sticky bottom-3 space-y-2 rounded-2xl bg-neutral-800 p-4 text-white shadow-xl dark:bg-neutral-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base">
                <b>{anzahl} Aufträge</b> · {euro(summeAus)} raus{summeEin > 0 && ` · ${euro(summeEin)} Einzug`}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/70">
                <ShieldCheck className="h-3.5 w-3.5" /> Geld bewegt sich nur mit TAN. Je Konto eine Freigabe in der Banking-App.
              </span>
            </div>
            {banken.map((b) => {
              const grund = !eigenerZugang?.anzahl
                ? "Für Zahlungen brauchst du deinen eigenen Bankzugang (Einstellungen › Bankzugänge › Mein Bankzugang)."
                : !b.fints
                  ? "Dein Bankzugang hat keinen Zugriff auf mindestens eines dieser Konten. Die Bank kann es für deinen Zugang freischalten."
                  : null;
              const knopf = (
                <Button size="sm" disabled={!!grund || !!laeuft} onClick={() => perTanSenden(b)} className="bg-white text-neutral-900 hover:bg-white/90">
                  {laeuft === b.blz ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : grund ? <Lock className="h-4 w-4 mr-1.5" /> : <Smartphone className="h-4 w-4 mr-1.5" />}
                  Freigeben per TAN
                </Button>
              );
              return (
                <div key={b.blz} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{b.name}</span>
                    <span className="text-white/70">
                      {" "}
                      · {b.anzahl} Aufträge · {euro(b.aus)} raus{b.ein > 0 && ` · ${euro(b.ein)} Einzug`}
                    </span>
                  </span>
                  {grund ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{knopf}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{grund}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    knopf
                  )}
                  {!b.fints && (
                    <Button size="sm" variant="outline" onClick={() => dateiErzeugen(b)} disabled={!!laeuft || b.aus === 0} className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                      <Download className="h-4 w-4 mr-1.5" /> SEPA-Datei
                    </Button>
                  )}
                </div>
              );
            })}
            {eigenerZugang && !eigenerZugang.anzahl && (
              <p className="text-xs text-white/80">
                Zahlungen gibst du mit deinem eigenen Online-Banking-Zugang frei.{" "}
                <a href="/settings?tab=bank" className="underline underline-offset-2">Jetzt einrichten</a>
              </p>
            )}
            {banken.some((b) => !b.fints && b.lastschriften) && <p className="text-xs text-white/70">Lastschriften gehen nur über einen Bankzugang, nicht über die SEPA-Datei.</p>}
          </div>
        </div>
      )}

      <AlertDialog open={!!rausnehmen} onOpenChange={(o) => !o && !nimmtRaus && setRausnehmen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rausnehmen?.rechnung ? "Rechnung aus der Freigabe nehmen?" : rausnehmen?.richtung === "ein" ? "Diesen Einzug löschen?" : "Diese Zahlung löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {rausnehmen?.rechnung
                ? `Die Rechnung von „${rausnehmen.name}“ (${euro(rausnehmen.betrag)}) wird wieder auf „offen“ gesetzt. Sie erscheint erst wieder hier, wenn sie erneut geprüft wurde.`
                : `${rausnehmen?.name} · ${rausnehmen ? euro(rausnehmen.betrag) : ""} · ${rausnehmen?.wann}. Nur dieser Termin wird gelöscht – der Auftrag selbst und spätere Termine bleiben.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={nimmtRaus}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={nimmtRaus}
              onClick={(e) => {
                e.preventDefault();
                rausnehmenBestaetigt();
              }}
            >
              {nimmtRaus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rausnehmen?.rechnung ? "Auf offen setzen" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TanSendenDialog
        laufIds={tanLaeufe}
        onClose={() => {
          setTanLaeufe(null);
          neuLaden();
        }}
      />
    </div>
  );
}

function Linie({ label, wert, hinweis, gruen }: { label: string; wert: string; hinweis?: string; gruen?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">
        {label}
        {hinweis && <span className="ml-1 text-[11px]">({hinweis})</span>}
      </span>
      <span className={cn("tabular-nums", gruen && "text-green-700 dark:text-green-400")}>{wert}</span>
    </div>
  );
}
