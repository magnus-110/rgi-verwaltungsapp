import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { FileText, Download, Loader2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AccountInfo,
  BookingRow,
  HeatingShareLookup,
  OwnerAssignment,
  buildAccountBlocks,
  buildOwnerCertificate,
  formatBookingLabel,
  getExtraMeaByContact,
  getMainOwners,
  getStellplatzCountByContact,
  ownerDisplayName,
  
  DISTRIBUTION_LABELS,
} from "./lib/paragraph35aDistribution";
import {
  CertificateContext,
  generate35aPdf,
  generate35aZip,
  loadLogoBase64,
} from "./Paragraph35aCertificatePdf";
import { Paragraph35aCertificatePreviewDialog } from "./Paragraph35aCertificatePreviewDialog";

interface Paragraph35aSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function Paragraph35aSection({ buildingId, periodId, fiscalYear }: Paragraph35aSectionProps) {
  const { toast } = useToast();
  const [busyOwnerId, setBusyOwnerId] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState<{ done: number; total: number } | null>(null);
  const [previewOwner, setPreviewOwner] = useState<OwnerAssignment | null>(null);
  const [logoCache, setLogoCache] = useState<string | null>(null);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // Building + period
  const { data: building } = useQuery({
    queryKey: ["35a-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("id", buildingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: period } = useQuery({
    queryKey: ["35a-period", periodId],
    queryFn: async () => {
      if (!periodId) return null;
      const { data, error } = await supabase
        .from("billing_periods")
        .select("id, period_from, period_to")
        .eq("id", periodId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  // Bookings flagged with §35a position
  const { data: bookingsRaw = [] } = useQuery({
    queryKey: ["35a-bookings-v2", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, booking_date, description, amount, amount_35a, is_35a_relevant,
           account_id, counter_account_id, invoice_id,
           invoices(invoice_number, invoice_date, vendor_name)`
        )
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .or("is_35a_relevant.eq.true,amount_35a.not.is.null");
      if (error) throw error;
      return (data || []) as unknown as BookingRow[];
    },
  });

  // Strict filter: must have a positive labor amount (amount_35a > 0).
  // is_35a_relevant alleine reicht NICHT — sonst tauchen Konten wie "Streusalz"
  // mit 0,00 € Lohnanteil in der Bescheinigung auf.
  const bookings = useMemo(
    () =>
      bookingsRaw.filter(
        (b) => b.amount_35a != null && Math.abs(Number(b.amount_35a)) > 0,
      ),
    [bookingsRaw],
  );

  // Account ids referenced by these bookings
  const accountIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (b.account_id) s.add(b.account_id);
      if (b.counter_account_id) s.add(b.counter_account_id);
    }
    return Array.from(s);
  }, [bookings]);

  const { data: accountsList = [] } = useQuery({
    queryKey: ["35a-accounts-v2", accountIds.sort().join(",")],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, default_distribution_key, is_35a_relevant")
        .in("id", accountIds);
      if (error) throw error;
      return data as AccountInfo[];
    },
    enabled: accountIds.length > 0,
  });

  const accountsMap = useMemo(() => {
    const m = new Map<string, AccountInfo>();
    for (const a of accountsList) m.set(a.id, a);
    return m;
  }, [accountsList]);

  // Owners with shares + addresses
  const { data: ownersRaw = [] } = useQuery({
    queryKey: ["35a-owners-v2", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(
          `id, contact_id, unit_number, floor_location, unit_kind, billing_mode, parent_assignment_id,
           area_sqm_override, salutation_override, first_name_override, last_name_override, company_name_override,
           address_street_override, address_zip_override, address_city_override,
           contacts(salutation, first_name, last_name, company_name, address_street, address_zip, address_city),
           contact_building_shares(share_type, share_value)`
        )
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "eigentuemer");
      if (error) throw error;
      return (data || []) as unknown as OwnerAssignment[];
    },
  });

  // Heating shares (Brunata)
  const { data: heatingShares = {} } = useQuery({
    queryKey: ["35a-heating-shares", periodId],
    queryFn: async () => {
      if (!periodId) return {} as HeatingShareLookup;
      const { data, error } = await supabase
        .from("heating_distribution_values")
        .select("assignment_id, amount")
        .eq("billing_period_id", periodId);
      if (error) throw error;
      const out: HeatingShareLookup = {};
      for (const r of data || []) {
        out[r.assignment_id as string] = (out[r.assignment_id as string] || 0) + Number(r.amount || 0);
      }
      return out;
    },
    enabled: !!periodId,
  });

  const owners = useMemo(() => {
    const main = getMainOwners(ownersRaw);
    return main.sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || ""));
  }, [ownersRaw]);

  const shareCtx = useMemo(
    () => ({
      extraMeaByContact: getExtraMeaByContact(ownersRaw),
      stellplatzByContact: getStellplatzCountByContact(ownersRaw),
      heatingShares,
    }),
    [ownersRaw, heatingShares],
  );

  const blocks = useMemo(
    () =>
      buildAccountBlocks(bookings, accountsMap, owners, shareCtx).filter(
        (bl) => Math.abs(bl.totalLabor) > 0,
      ),
    [bookings, accountsMap, owners, shareCtx],
  );

  const totalLabor = useMemo(() => blocks.reduce((s, b) => s + b.totalLabor, 0), [blocks]);

  const ownerCertificates = useMemo(
    () => owners.map((o) => ({ owner: o, ...buildOwnerCertificate(o, blocks, shareCtx) })),
    [owners, blocks, shareCtx],
  );

  // Preload logo once for the in-app preview iframe
  useEffect(() => {
    let cancelled = false;
    loadLogoBase64().then((logo) => {
      if (!cancelled) setLogoCache(logo);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewCtx = useMemo<CertificateContext | null>(() => {
    if (!building) return null;
    return {
      building: { name: building?.name, address: building?.address },
      fiscalYear,
      periodFrom: period?.period_from,
      periodTo: period?.period_to,
      blocks,
      shareCtx,
      logoBase64: logoCache,
    };
  }, [building, fiscalYear, period, blocks, shareCtx, logoCache]);

  const handleSinglePdf = async (owner: OwnerAssignment) => {
    setBusyOwnerId(owner.id);
    try {
      const logo = await loadLogoBase64();
      const ctx: CertificateContext = {
        building: { name: building?.name, address: building?.address },
        fiscalYear,
        periodFrom: period?.period_from,
        periodTo: period?.period_to,
        blocks,
        shareCtx,
        logoBase64: logo,
      };
      await generate35aPdf(owner, ctx);
    } catch (e) {
      toast({ title: "PDF-Erstellung fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyOwnerId(null);
    }
  };

  const handleZip = async () => {
    setZipBusy({ done: 0, total: owners.length });
    try {
      const logo = await loadLogoBase64();
      const ctx: CertificateContext = {
        building: { name: building?.name, address: building?.address },
        fiscalYear,
        periodFrom: period?.period_from,
        periodTo: period?.period_to,
        blocks,
        shareCtx,
        logoBase64: logo,
      };
      await generate35aZip(owners, ctx, (done, total) => setZipBusy({ done, total }));
      toast({ title: "ZIP erstellt", description: `${owners.length} Bescheinigungen exportiert.` });
    } catch (e) {
      toast({ title: "ZIP-Erstellung fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setZipBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quelle: Buchungen mit gesetzter §35a-Position. Verteilung pro Konto nach hinterlegtem Verteilerschlüssel.
      </p>

      {/* Bookings grouped by account */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> §35a-Buchungen ({bookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {blocks.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Keine Buchungen mit §35a-Position für {fiscalYear} gefunden.
            </div>
          ) : (
            <div className="divide-y">
              {blocks.map((bl) => (
                <div key={bl.account.id} className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs">{bl.account.account_number}</span>
                    <span className="text-sm font-medium">{bl.account.account_name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {DISTRIBUTION_LABELS[bl.key] || bl.key}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-24">Datum</TableHead>
                        <TableHead className="text-xs">Beleg</TableHead>
                        <TableHead className="text-xs text-right w-28">Gesamt</TableHead>
                        <TableHead className="text-xs text-right w-32">§35a-Lohnanteil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bl.bookings.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-xs">
                            {new Date(b.booking_date).toLocaleDateString("de-DE")}
                          </TableCell>
                          <TableCell className="text-xs">{formatBookingLabel(b)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatCurrency(Math.abs(Number(b.amount)))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {formatCurrency(
                              b.amount_35a != null ? Math.abs(Number(b.amount_35a)) : Math.abs(Number(b.amount)),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="text-xs font-medium">
                          Summe Konto
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">
                          {formatCurrency(bl.totalGross)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">
                          {formatCurrency(bl.totalLabor)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3 bg-muted/30">
                <span className="font-medium text-sm">Gesamt §35a Lohnkosten</span>
                <span className="font-mono font-semibold text-sm">{formatCurrency(totalLabor)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner overview */}
      {owners.length > 0 && blocks.length > 0 && (
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">Bescheinigungen je Eigentümer</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={handleZip}
              disabled={!!zipBusy}
            >
              {zipBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {zipBusy.done}/{zipBusy.total}
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Alle als ZIP
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-20">Einheit</TableHead>
                  <TableHead className="text-xs">Eigentümer</TableHead>
                  <TableHead className="text-xs text-right w-32">Ihre Kosten §35a</TableHead>
                  <TableHead className="text-xs text-right w-32">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerCertificates.map(({ owner, total }) => (
                  <TableRow
                    key={owner.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setPreviewOwner(owner)}
                  >
                    <TableCell className="font-mono text-xs">{owner.unit_number || "–"}</TableCell>
                    <TableCell className="text-sm">{ownerDisplayName(owner)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {formatCurrency(total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSinglePdf(owner);
                        }}
                        disabled={busyOwnerId === owner.id || !!zipBusy}
                      >
                        {busyOwnerId === owner.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" /> PDF
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">
                    Gesamt
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">
                    {formatCurrency(ownerCertificates.reduce((s, c) => s + c.total, 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Paragraph35aCertificatePreviewDialog
        open={!!previewOwner}
        onOpenChange={(o) => !o && setPreviewOwner(null)}
        owner={previewOwner}
        ctx={previewCtx}
      />
    </div>
  );
}
