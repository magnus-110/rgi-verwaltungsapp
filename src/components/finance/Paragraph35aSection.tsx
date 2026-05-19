import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { FileText, Download, Loader2, Package, Upload, FileType, X, Trash2, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  splitLaborByType,
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
  const queryClient = useQueryClient();
  const [busyOwnerId, setBusyOwnerId] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState<{ done: number; total: number } | null>(null);
  const [previewOwner, setPreviewOwner] = useState<OwnerAssignment | null>(null);
  const [logoCache, setLogoCache] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [docxBusy, setDocxBusy] = useState<"single" | "zip" | null>(null);
  const [pdfBusy, setPdfBusy] = useState<"zip" | string | null>(null);
  const [uploadingTpl, setUploadingTpl] = useState(false);
  const tplFileInputRef = useRef<HTMLInputElement>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const handleTplFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingTpl(true);
    try {
      const safeName = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
      const path = `${crypto.randomUUID()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("billing-templates")
        .upload(path, file, {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
      if (upErr) throw upErr;
      const displayName = file.name.replace(/\.docx$/i, "");
      const { data: inserted, error: insErr } = await supabase
        .from("billing_templates")
        .insert({
          name: displayName,
          storage_path: path,
          scope: "paragraph_35a",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      await queryClient.invalidateQueries({ queryKey: ["35a-templates-select"] });
      await queryClient.invalidateQueries({ queryKey: ["billing-templates"] });
      if (inserted?.id) setTemplateId(inserted.id);
      toast({ title: "Vorlage hochgeladen" });
    } catch (err) {
      console.error("[35a-template upload]", err);
      toast({ title: "Upload fehlgeschlagen", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setUploadingTpl(false);
    }
  };

  const refreshBookings = () =>
    queryClient.invalidateQueries({ queryKey: ["35a-bookings-v3", buildingId, fiscalYear] });

  const updateBookingType = async (bookingId: string, type: "dienste" | "handwerker") => {
    setBusyBookingId(bookingId);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ settlement_35a_type: type })
        .eq("id", bookingId);
      if (error) throw error;
      await refreshBookings();
      toast({ title: type === "handwerker" ? "Als Handwerker markiert" : "Als Dienstleister markiert" });
    } catch (e) {
      toast({ title: "Aktualisierung fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyBookingId(null);
    }
  };

  const removeFrom35a = async (bookingId: string) => {
    if (!confirm("Diese Position wirklich aus der §35a-Bescheinigung entfernen?")) return;
    setBusyBookingId(bookingId);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ is_35a_relevant: false, amount_35a: null, settlement_35a_type: null })
        .eq("id", bookingId);
      if (error) throw error;
      await refreshBookings();
      toast({ title: "Position aus §35a entfernt" });
    } catch (e) {
      toast({ title: "Entfernen fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyBookingId(null);
    }
  };

  const { data: templates = [] } = useQuery({
    queryKey: ["35a-templates-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_templates")
        .select("id, name, storage_path")
        .eq("scope", "paragraph_35a")
        .order("name");
      return data || [];
    },
  });

  // Auto-Select: erste verfügbare §35a-Vorlage (verwaltet im globalen "Dokumente"-Dialog).
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const deleteTemplate = async (t: { id: string; name: string; storage_path: string }) => {
    if (!confirm(`Vorlage "${t.name}" löschen?`)) return;
    try {
      if (t.storage_path) await supabase.storage.from("billing-templates").remove([t.storage_path]);
      const { error } = await supabase.from("billing_templates").delete().eq("id", t.id);
      if (error) throw error;
      if (templateId === t.id) setTemplateId("");
      await queryClient.invalidateQueries({ queryKey: ["35a-templates-select"] });
      await queryClient.invalidateQueries({ queryKey: ["billing-templates"] });
      toast({ title: "Vorlage gelöscht" });
    } catch (e) {
      toast({ title: "Löschen fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const downloadFromTemplate = async (
    assignmentIds: string[] | undefined,
    format: "docx" | "pdf",
  ) => {
    if (!templateId) {
      toast({ title: "Bitte zuerst eine Vorlage auswählen", variant: "destructive" });
      return;
    }
    const isSingle = !!(assignmentIds && assignmentIds.length === 1);
    if (format === "docx") setDocxBusy(isSingle ? "single" : "zip");
    else setPdfBusy(isSingle ? assignmentIds![0] : "zip");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-35a-docx`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          template_id: templateId,
          building_id: buildingId,
          fiscal_year: fiscalYear,
          period_id: periodId,
          assignment_ids: assignmentIds,
          format,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const ext = format === "pdf" ? "pdf" : "docx";
      const fname = m?.[1] || (isSingle ? `35a.${ext}` : `35a_${fiscalYear}.zip`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast({
        title: format === "pdf" ? "PDF-Export fehlgeschlagen" : "DOCX-Export fehlgeschlagen",
        description: String((e as Error).message),
        variant: "destructive",
      });
    } finally {
      if (format === "docx") setDocxBusy(null);
      else setPdfBusy(null);
    }
  };

  const downloadDocx = (assignmentIds?: string[]) => downloadFromTemplate(assignmentIds, "docx");
  const downloadWordPdf = (assignmentIds?: string[]) => downloadFromTemplate(assignmentIds, "pdf");


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

  // Bookings flagged with §35a position. Embedded invoice fields are loaded
  // separately to avoid the parent query being affected by the join.
  const { data: bookingsRaw = [], error: bookingsError } = useQuery({
    queryKey: ["35a-bookings-v3", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, booking_date, description, amount, amount_35a, is_35a_relevant, settlement_35a_type,
           account_id, counter_account_id, invoice_id`
        )
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("is_35a_relevant", true)
        .order("booking_date", { ascending: false })
        .limit(2000);
      if (error) {
        console.error("[§35a] bookings query failed", error);
        throw error;
      }
      return (data || []) as unknown as BookingRow[];
    },
  });

  // Optional invoice metadata (used only for line item splitting). Failure must
  // not hide bookings.
  const invoiceIds = useMemo(
    () => Array.from(new Set(bookingsRaw.map((b) => b.invoice_id).filter(Boolean) as string[])),
    [bookingsRaw],
  );

  const { data: invoiceMap = {} } = useQuery({
    queryKey: ["35a-invoices-v1", invoiceIds.sort().join(",")],
    queryFn: async () => {
      if (invoiceIds.length === 0) return {} as Record<string, BookingRow["invoices"]>;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, vendor_name, line_items_detail, vat_rate")
        .in("id", invoiceIds);
      if (error) {
        console.warn("[§35a] invoices fetch failed (non-blocking)", error);
        return {} as Record<string, BookingRow["invoices"]>;
      }
      const m: Record<string, BookingRow["invoices"]> = {};
      for (const r of data || []) m[(r as any).id] = r as any;
      return m;
    },
    enabled: invoiceIds.length > 0,
  });

  // Show every flagged booking. Per the user, "is_35a_relevant=true" alone
  // qualifies a booking for the certificate; amount_35a falls back to amount
  // when the labor share has not been entered yet.
  const bookings = useMemo(
    () =>
      bookingsRaw.map((b) => ({
        ...b,
        invoices: b.invoice_id ? invoiceMap[b.invoice_id] ?? null : null,
      })),
    [bookingsRaw, invoiceMap],
  );

  const accountIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (b.account_id) s.add(b.account_id);
      if (b.counter_account_id) s.add(b.counter_account_id);
    }
    return Array.from(s);
  }, [bookings]);

  const { data: accountsList = [] } = useQuery({
    queryKey: ["35a-accounts-v3", accountIds.sort().join(",")],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, default_distribution_key, is_35a_relevant, settlement_35a_type, default_vat_rate")
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
    () => buildAccountBlocks(bookings, accountsMap, owners, shareCtx),
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
          {bookingsError ? (
            <div className="text-center text-sm text-destructive py-8">
              Fehler beim Laden der §35a-Buchungen: {String((bookingsError as Error).message)}
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Keine Buchungen mit §35a-Position für {fiscalYear} gefunden.
            </div>
          ) : blocks.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {bookings.length} §35a-Buchungen gefunden, aber keinem Aufwandskonto zuordenbar.
              Bitte Konto-Zuordnung der Buchungen prüfen.
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
                        <TableHead className="text-xs text-right w-24">Gesamt</TableHead>
                        <TableHead className="text-xs text-right w-28">Lohnanteil</TableHead>
                        <TableHead className="text-xs text-right w-24 text-emerald-700">davon Dienste</TableHead>
                        <TableHead className="text-xs text-right w-28 text-blue-700">davon Handwerker</TableHead>
                        <TableHead className="text-xs w-[170px]">Typ</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bl.bookings.map((b) => {
                        const split = splitLaborByType(b, bl.account);
                        const currentType: "dienste" | "handwerker" =
                          (b.settlement_35a_type as any) ||
                          (split.handwerker > split.dienste ? "handwerker" : "dienste");
                        const isOverride = !!b.settlement_35a_type;
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="text-xs">
                              {new Date(b.booking_date).toLocaleDateString("de-DE")}
                            </TableCell>
                            <TableCell className="text-xs">{formatBookingLabel(b)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatCurrency(Math.abs(Number(b.amount)))}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">
                              {formatCurrency(split.dienste + split.handwerker)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-700">
                              {split.dienste > 0 ? formatCurrency(split.dienste) : "–"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-blue-700">
                              {split.handwerker > 0 ? formatCurrency(split.handwerker) : "–"}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={currentType}
                                onValueChange={(v) => updateBookingType(b.id, v as any)}
                                disabled={busyBookingId === b.id}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="dienste" className="text-xs">
                                    Dienstleister{!isOverride && currentType === "dienste" ? " (auto)" : ""}
                                  </SelectItem>
                                  <SelectItem value="handwerker" className="text-xs">
                                    Handwerker{!isOverride && currentType === "handwerker" ? " (auto)" : ""}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Aus §35a entfernen"
                                onClick={() => removeFrom35a(b.id)}
                                disabled={busyBookingId === b.id}
                              >
                                {busyBookingId === b.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="text-xs font-medium">Summe Konto</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatCurrency(bl.totalGross)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{formatCurrency(bl.totalLabor)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium text-emerald-700">{formatCurrency(bl.totalLaborDienste)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium text-blue-700">{formatCurrency(bl.totalLaborHandwerker)}</TableCell>
                        <TableCell colSpan={2} />
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
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Bescheinigungen je Eigentümer</CardTitle>
            <p className="text-xs text-muted-foreground">
              Vorlage und Bulk-Download über den Button „Dokumente" oben rechts.
              Einzeldownloads direkt in der Zeile.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-20">Einheit</TableHead>
                  <TableHead className="text-xs">Eigentümer</TableHead>
                  <TableHead className="text-xs text-right w-28">Gesamt §35a</TableHead>
                  <TableHead className="text-xs text-right w-28 text-emerald-700">Dienste</TableHead>
                  <TableHead className="text-xs text-right w-28 text-blue-700">Handwerker</TableHead>
                  <TableHead className="text-xs text-right w-56">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerCertificates.map(({ owner, total, totalDienste, totalHandwerker }) => (
                  <TableRow
                    key={owner.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setPreviewOwner(owner)}
                  >
                    <TableCell className="font-mono text-xs">{owner.unit_number || "–"}</TableCell>
                    <TableCell className="text-sm">{ownerDisplayName(owner)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(total)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-700">{formatCurrency(totalDienste)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-blue-700">{formatCurrency(totalHandwerker)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={!templateId || pdfBusy === owner.id || docxBusy === "single" || pdfBusy === "zip" || docxBusy === "zip"}
                              title={templateId ? "Download" : "Bitte zuerst eine Word-Vorlage wählen"}
                            >
                              {pdfBusy === owner.id || (docxBusy === "single" && busyOwnerId === owner.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => downloadDocx([owner.id])}>
                              <FileType className="h-4 w-4 mr-2" /> DOCX
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadWordPdf([owner.id])}>
                              <FileText className="h-4 w-4 mr-2" /> PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium text-sm">Gesamt</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">
                    {formatCurrency(ownerCertificates.reduce((s, c) => s + c.total, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-xs text-emerald-700">
                    {formatCurrency(ownerCertificates.reduce((s, c) => s + c.totalDienste, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-xs text-blue-700">
                    {formatCurrency(ownerCertificates.reduce((s, c) => s + c.totalHandwerker, 0))}
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
