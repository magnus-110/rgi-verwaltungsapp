import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Check, Flag, Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { VendorAliasDialog } from "@/components/finance/VendorAliasDialog";
import { useBookingLearning } from "@/hooks/useBookingLearning";

/**
 * Lernsignale: was die KI aus Handkorrekturen mitnehmen soll.
 *
 * Zwei Seiten derselben Medaille:
 * - Korrekturen, die als Regel markiert wurden, aber noch keine dauerhafte
 *   Regel geworden sind (`applied_at IS NULL`).
 * - Buchungen mit Pruefkennzeichen. Eine Bestaetigung ist genauso wertvoll
 *   wie eine Korrektur — ohne sie sieht die KI nur ihre Fehlgriffe.
 */
export default function Lernsignale() {
  const qc = useQueryClient();
  const { alsGeprueftBestaetigen } = useBookingLearning();
  const [gebaeudeId, setGebaeudeId] = useState<string>("alle");
  const [aliasFuer, setAliasFuer] = useState<{ vendor: string; buildingId: string | null } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const { data: gebaeude } = useQuery({
    queryKey: ["buildings", "lernsignale"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: signale, isLoading: signaleLaden } = useQuery({
    queryKey: ["ai-booking-feedback", "offen", gebaeudeId],
    queryFn: async () => {
      let q = supabase
        .from("ai_booking_feedback")
        .select("*, buildings(name)")
        .neq("learn_scope", "einmalig")
        .is("applied_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (gebaeudeId !== "alle") q = q.eq("building_id", gebaeudeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: zuPruefen, isLoading: pruefenLaden } = useQuery({
    queryKey: ["bookings", "needs-review", gebaeudeId],
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select("id, building_id, booking_date, amount, booking_type, description, booking_reference, account_id, counter_account_id, is_35a_relevant, review_note, ai_confidence_unsicher, bank_transaction_id, buildings(name)")
        .eq("needs_review", true)
        .order("booking_date", { ascending: false })
        .limit(100);
      if (gebaeudeId !== "alle") q = q.eq("building_id", gebaeudeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const kontoIds = useMemo(() => {
    const s = new Set<string>();
    for (const z of signale ?? []) {
      for (const f of ["ai_suggested_account_id", "user_corrected_account_id", "ai_suggested_counter_account_id", "user_corrected_counter_account_id"]) {
        if (z[f]) s.add(z[f]);
      }
    }
    return [...s];
  }, [signale]);

  const { data: konten } = useQuery({
    queryKey: ["chart-of-accounts", "lernsignale", kontoIds.join(",")],
    enabled: kontoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts").select("id, account_number, account_name").in("id", kontoIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const kontoLabel = (id: string | null) => {
    if (!id) return "—";
    const k = (konten ?? []).find((x: any) => x.id === id) as any;
    return k ? `${k.account_number} ${k.account_name}` : "unbekanntes Konto";
  };

  const erledigen = async (id: string, als: string) => {
    setLaeuft(id);
    try {
      const { error } = await supabase
        .from("ai_booking_feedback")
        .update({ applied_at: new Date().toISOString(), applied_as: als } as never)
        .eq("id", id);
      if (error) throw error;
      toast.success(als === "verworfen" ? "Signal verworfen" : "Als umgesetzt markiert");
      qc.invalidateQueries({ queryKey: ["ai-booking-feedback"] });
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message ?? "unbekannt"));
    } finally {
      setLaeuft(null);
    }
  };

  const bestaetigen = async (b: any) => {
    setLaeuft(b.id);
    try {
      await alsGeprueftBestaetigen({
        bookingId: b.id,
        buildingId: b.building_id,
        bankTransactionId: b.bank_transaction_id,
        stand: {
          account_id: b.account_id,
          counter_account_id: b.counter_account_id,
          booking_type: b.booking_type,
          description: b.description,
          booking_reference: b.booking_reference,
          is_35a_relevant: b.is_35a_relevant,
        },
      });
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message ?? "unbekannt"));
    } finally {
      setLaeuft(null);
    }
  };

  const geld = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Math.abs(n ?? 0));

  const zeileFeld = (label: string, vor: string, nach: string) => (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="line-through text-muted-foreground break-all">{vor || "—"}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium break-all">{nach || "—"}</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lernsignale</h1>
          <p className="text-sm text-muted-foreground">
            Was die KI aus deinen Korrekturen und Bestätigungen mitnehmen soll.
          </p>
        </div>
        <Select value={gebaeudeId} onValueChange={setGebaeudeId}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Objekte</SelectItem>
            {(gebaeude ?? []).map((g: any) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="signale">
        <TabsList>
          <TabsTrigger value="signale">
            Offene Regeln {signale?.length ? <Badge variant="secondary" className="ml-2">{signale.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="pruefen">
            Zu prüfen {zuPruefen?.length ? <Badge variant="secondary" className="ml-2">{zuPruefen.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signale" className="space-y-3 mt-4">
          {signaleLaden && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {!signaleLaden && (signale ?? []).length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Keine offenen Lernsignale. Korrekturen, die du mit „immer so“ bestätigst, landen hier.
            </CardContent></Card>
          )}
          {(signale ?? []).map((z: any) => {
            const kontoGeaendert = z.ai_suggested_counter_account_id !== z.user_corrected_counter_account_id;
            const textGeaendert = z.ai_suggested_description !== z.user_corrected_description;
            return (
              <Card key={z.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{z.vendor_name || "Ohne Lieferant"}</CardTitle>
                      <CardDescription>
                        {z.buildings?.name || "Alle Objekte"}
                        {" · "}
                        {z.created_at ? format(new Date(z.created_at), "dd.MM.yyyy", { locale: de }) : ""}
                      </CardDescription>
                    </div>
                    <Badge variant={z.learn_scope === "global" ? "default" : "secondary"}>
                      {z.learn_scope === "global" ? "alle Objekte" : "dieses Objekt"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {z.ai_suggested_account_id !== z.user_corrected_account_id &&
                      zeileFeld("Konto", kontoLabel(z.ai_suggested_account_id), kontoLabel(z.user_corrected_account_id))}
                    {kontoGeaendert &&
                      zeileFeld("Gegenkonto", kontoLabel(z.ai_suggested_counter_account_id), kontoLabel(z.user_corrected_counter_account_id))}
                    {textGeaendert &&
                      zeileFeld("Buchungstext", z.ai_suggested_description, z.user_corrected_description)}
                    {z.ai_suggested_reference !== z.user_corrected_reference &&
                      zeileFeld("Beleg", z.ai_suggested_reference, z.user_corrected_reference)}
                    {z.ai_suggested_35a !== z.user_corrected_35a &&
                      zeileFeld("§35a", z.ai_suggested_35a ? "ja" : "nein", z.user_corrected_35a ? "ja" : "nein")}
                  </div>

                  {z.learn_reason && (
                    <div className="text-sm bg-muted/40 rounded px-2 py-1.5">{z.learn_reason}</div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {textGeaendert && z.vendor_name && (
                      <Button size="sm" variant="outline"
                        onClick={() => setAliasFuer({ vendor: z.vendor_name, buildingId: z.building_id })}>
                        <Tag className="h-3.5 w-3.5 mr-1.5" /> Alias anlegen
                      </Button>
                    )}
                    {kontoGeaendert && (
                      <Button size="sm" variant="outline" disabled={laeuft === z.id}
                        onClick={() => erledigen(z.id, "vorlage")}>
                        Als Vorlage erledigt
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={laeuft === z.id}
                      onClick={() => erledigen(z.id, "billing_cycle")}>
                      Abrechnungsturnus gepflegt
                    </Button>
                    <Button size="sm" variant="ghost" disabled={laeuft === z.id}
                      onClick={() => erledigen(z.id, "verworfen")}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Verwerfen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="pruefen" className="space-y-3 mt-4">
          {pruefenLaden && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {!pruefenLaden && (zuPruefen ?? []).length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Keine Buchung mit Prüfkennzeichen.
            </CardContent></Card>
          )}
          {(zuPruefen ?? []).map((b: any) => (
            <Card key={b.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Flag className={b.ai_confidence_unsicher ? "h-3.5 w-3.5 text-destructive" : "h-3.5 w-3.5 text-amber-500"} />
                      <span className="font-medium break-all">{b.description || "ohne Text"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {b.buildings?.name} · {b.booking_date ? format(new Date(b.booking_date), "dd.MM.yyyy", { locale: de }) : ""}
                      {" · Beleg "}{b.booking_reference || "—"}
                      {" · "}{b.booking_type === "expense" ? "−" : "+"}{geld(b.amount)}
                    </div>
                  </div>
                  <Button size="sm" disabled={laeuft === b.id} onClick={() => bestaetigen(b)}>
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Passt so
                  </Button>
                </div>
                {b.review_note && (
                  <div className="text-sm text-muted-foreground bg-muted/40 rounded px-2 py-1.5">{b.review_note}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <VendorAliasDialog
        open={!!aliasFuer}
        onOpenChange={(o) => { if (!o) setAliasFuer(null); }}
        rawVendorName={aliasFuer?.vendor ?? ""}
        buildingId={aliasFuer?.buildingId ?? null}
      />
    </div>
  );
}
