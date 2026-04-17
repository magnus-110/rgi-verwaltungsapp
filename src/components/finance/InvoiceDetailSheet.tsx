import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, FileText, ExternalLink, CheckCircle, CreditCard, Sparkles, Plus, Trash2, Fuel, ChevronDown, ChevronRight } from "lucide-react";

const PAYMENT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Offen", variant: "destructive" },
  paid: { label: "Bezahlt", variant: "default" },
};

const REVIEW_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Offen", variant: "outline" },
  verified: { label: "Geprüft", variant: "default" },
};

interface LineItem {
  description: string;
  amount: number | null;
}

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  buildings: { id: string; name: string }[];
}

export function InvoiceDetailSheet({ invoiceId, onClose, buildings }: Props) {
  const queryClient = useQueryClient();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("*, buildings(name, building_code)")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceId,
  });

  const [form, setForm] = useState<Record<string, any>>({});
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [loadedForInvoiceId, setLoadedForInvoiceId] = useState<string | null>(null);

  const inv = invoice as any;

  // Initialize form whenever a new invoice is opened (only once per invoiceId,
  // so user edits are not overwritten by background refetches after save).
  useEffect(() => {
    if (!inv || !invoiceId) return;
    if (loadedForInvoiceId === invoiceId) return;
    setForm({
      vendor_name: inv.vendor_name || "",
      vendor_iban: inv.vendor_iban || "",
      invoice_number: inv.invoice_number || "",
      invoice_date: inv.invoice_date || "",
      due_date: inv.due_date || "",
      net_amount: inv.net_amount ?? "",
      vat_amount: inv.vat_amount ?? "",
      gross_amount: inv.gross_amount ?? "",
      description: inv.description || "",
      building_id: inv.building_id || "",
    });
    const items = (inv.line_items as any[] || []).map((item: any) => ({
      description: item.description || "",
      amount: item.amount ?? null,
    }));
    setEditLineItems(items);
    setLoadedForInvoiceId(invoiceId);
  }, [inv, invoiceId, loadedForInvoiceId]);

  const handleClose = () => {
    setForm({});
    setEditLineItems([]);
    setPdfUrl(null);
    setLoadedForInvoiceId(null);
    onClose();
  };

  const set = (key: string, value: any) => setForm(p => ({ ...p, [key]: value }));

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setEditLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addLineItem = () => {
    setEditLineItems(prev => [...prev, { description: "", amount: null }]);
  };

  const removeLineItem = (index: number) => {
    setEditLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const loadPdf = async () => {
    if (!inv?.file_path) return;
    setLoadingPdf(true);
    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(inv.file_path, 3600);
      if (error) throw error;
      setPdfUrl(data.signedUrl);
    } catch {
      toast.error("PDF konnte nicht geladen werden");
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleSave = async () => {
    if (!invoiceId) return;
    setSaving(true);

    // Clean line items: remove empty ones, parse amounts
    const cleanedLineItems = editLineItems
      .filter(item => item.description.trim() !== "")
      .map(item => ({
        description: item.description.trim(),
        amount: item.amount !== null && item.amount !== undefined && String(item.amount).trim() !== ""
          ? parseFloat(String(item.amount))
          : null,
      }));

    const { error } = await supabase.from("invoices").update({
      vendor_name: form.vendor_name || null,
      vendor_iban: form.vendor_iban || null,
      invoice_number: form.invoice_number || null,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      net_amount: form.net_amount !== "" ? parseFloat(form.net_amount) : null,
      vat_amount: form.vat_amount !== "" ? parseFloat(form.vat_amount) : null,
      gross_amount: form.gross_amount !== "" ? parseFloat(form.gross_amount) : null,
      description: form.description || null,
      building_id: form.building_id || null,
      line_items: cleanedLineItems,
    }).eq("id", invoiceId);
    setSaving(false);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Rechnung gespeichert");
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
  };


  const handleDelete = async () => {
    if (!invoiceId || !inv) return;
    setDeleting(true);
    try {
      // 1. Delete related bookings
      await supabase.from("bookings").delete().eq("invoice_id", invoiceId);
      // 2. Unlink bank transactions
      await supabase.from("bank_transactions").update({ matched_invoice_id: null, match_status: "unmatched" }).eq("matched_invoice_id", invoiceId);
      // 3. Delete file from storage if exists
      if (inv.file_path) {
        await supabase.storage.from("invoices").remove([inv.file_path]);
      }
      // 4. Delete invoice record
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
      toast.success("Rechnung und zugehörige Daten gelöscht");
      invalidateAll();
      handleClose();
    } catch (e: any) {
      toast.error("Fehler beim Löschen: " + (e.message || "Unbekannt"));
    } finally {
      setDeleting(false);
    }
  };

  const togglePaymentStatus = async () => {
    if (!invoiceId || !inv) return;
    const newStatus = inv.status === "paid" ? "open" : "paid";
    const updates: any = { status: newStatus };
    if (newStatus === "paid") updates.paid_at = new Date().toISOString();
    else updates.paid_at = null;
    const { error } = await supabase.from("invoices").update(updates).eq("id", invoiceId);
    if (error) { toast.error("Fehler beim Aktualisieren"); return; }
    toast.success(`Bezahlung: ${PAYMENT_STATUS[newStatus].label}`);
    invalidateAll();
  };

  const toggleReviewStatus = async () => {
    if (!invoiceId || !inv) return;
    const currentReview = inv.review_status || "open";
    const newReview = currentReview === "verified" ? "open" : "verified";
    const { error } = await supabase.from("invoices").update({ review_status: newReview } as any).eq("id", invoiceId);
    if (error) { toast.error("Fehler beim Aktualisieren"); return; }
    toast.success(`Prüfung: ${REVIEW_STATUS[newReview].label}`);
    invalidateAll();
  };

  const paymentConfig = inv ? PAYMENT_STATUS[inv.status] || PAYMENT_STATUS.open : null;
  const reviewConfig = inv ? REVIEW_STATUS[inv.review_status || "open"] || REVIEW_STATUS.open : null;

  return (
    <Sheet open={!!invoiceId} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {inv?.file_name || "Rechnungsdetails"}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : inv ? (
          <div className="space-y-6 mt-4">
            {/* Dual Status Badges */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={togglePaymentStatus}
                className="flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Bezahlung:</span>
                <Badge
                  variant={paymentConfig?.variant}
                  className={inv.status === "paid" ? "bg-green-600 text-white hover:bg-green-700" : ""}
                >
                  {paymentConfig?.label}
                </Badge>
              </button>
              <button
                onClick={toggleReviewStatus}
                className="flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
              >
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Prüfung:</span>
                <Badge
                  variant={reviewConfig?.variant}
                  className={(inv.review_status || "open") === "verified" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                >
                  {reviewConfig?.label}
                </Badge>
              </button>
            </div>

            {/* OCR Status */}
            {inv.ocr_status === "processing" && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                OCR-Extraktion läuft...
              </div>
            )}
            {inv.ocr_status === "error" && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                OCR-Fehler: {inv.ocr_error || "Unbekannt"}
              </div>
            )}
            {inv.ocr_status === "done" && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                Daten wurden per OCR extrahiert – bitte prüfen
              </div>
            )}

            {/* PDF Preview */}
            {inv.file_path && (
              <div>
                {pdfUrl ? (
                  <div className="space-y-2">
                    <iframe src={pdfUrl} className="w-full h-[400px] rounded-lg border" />
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      <ExternalLink className="h-3 w-3" /> In neuem Tab öffnen
                    </a>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={loadPdf} disabled={loadingPdf}>
                    {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                    PDF anzeigen
                  </Button>
                )}
              </div>
            )}

            <Separator />

            {/* Editable Fields */}
            <div className="space-y-4">
              <div>
                <Label>Liegenschaft</Label>
                <Select value={form.building_id} onValueChange={v => set("building_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                  <SelectContent>
                    {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lieferant</Label>
                  <Input value={form.vendor_name} onChange={e => set("vendor_name", e.target.value)} />
                </div>
                <div>
                  <Label>IBAN</Label>
                  <Input value={form.vendor_iban} onChange={e => set("vendor_iban", e.target.value)} placeholder="DE..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Rechnungsnummer</Label>
                  <Input value={form.invoice_number} onChange={e => set("invoice_number", e.target.value)} />
                </div>
                <div>
                  <Label>Rechnungsdatum</Label>
                  <Input type="date" value={form.invoice_date} onChange={e => set("invoice_date", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Brutto (€)</Label>
                  <Input type="number" step="0.01" value={form.gross_amount} onChange={e => set("gross_amount", e.target.value)} />
                </div>
                <div>
                  <Label>Netto (€)</Label>
                  <Input type="number" step="0.01" value={form.net_amount} onChange={e => set("net_amount", e.target.value)} />
                </div>
                <div>
                  <Label>MwSt. (€)</Label>
                  <Input type="number" step="0.01" value={form.vat_amount} onChange={e => set("vat_amount", e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Fälligkeitsdatum</Label>
                <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
              </div>

              <div>
                <Label>Beschreibung</Label>
                <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
              </div>
            </div>

            {/* Editable Line Items */}
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-sm font-medium">Positionen ({editLineItems.length})</Label>
                  <p className="text-xs text-muted-foreground">Rechnungspositionen bearbeiten, hinzufügen oder löschen</p>
                </div>
                <Button variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Position
                </Button>
              </div>
              <div className="space-y-2">
                {editLineItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.description}
                      onChange={e => updateLineItem(i, "description", e.target.value)}
                      placeholder="Beschreibung"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={item.amount ?? ""}
                      onChange={e => updateLineItem(i, "amount", e.target.value === "" ? null : e.target.value)}
                      placeholder="Betrag €"
                      className="w-28"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLineItem(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {editLineItems.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">Keine Positionen vorhanden</p>
                )}
              </div>
            </div>

            {/* Fuel Data Collapsible */}
            <Separator />
            <FuelDataSection invoice={inv} buildingId={form.building_id} />

            <Separator />

            {/* Save & Delete */}
            <div className="flex flex-wrap gap-2 justify-between">
              <Button onClick={handleSave} disabled={saving || deleting}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Speichern
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Die Rechnung, das zugehörige PDF, alle verknüpften Buchungen und Zuordnungen werden unwiderruflich gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Endgültig löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const FUEL_TYPES = [
  { value: "oil", label: "Heizöl", unit: "l" },
  { value: "pellets", label: "Pellets", unit: "kg" },
  { value: "gas", label: "Gas", unit: "kWh" },
  { value: "district_heating", label: "Fernwärme", unit: "kWh" },
];

function FuelDataSection({ invoice, buildingId }: { invoice: any; buildingId: string }) {
  const extracted = invoice?.ocr_extracted_data as any;
  const isFuelDetected = extracted?.is_fuel_purchase === true;

  const [isOpen, setIsOpen] = useState(isFuelDetected);
  const [fuelType, setFuelType] = useState(extracted?.fuel_type || "oil");
  const [fuelQuantity, setFuelQuantity] = useState(extracted?.fuel_quantity?.toString() || "");
  const [fuelUnit, setFuelUnit] = useState(extracted?.fuel_unit || FUEL_TYPES.find(f => f.value === (extracted?.fuel_type || "oil"))?.unit || "l");
  const [fuelPrice, setFuelPrice] = useState(invoice?.gross_amount?.toString() || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isFuelDetected) setIsOpen(true);
  }, [isFuelDetected]);

  const saveFuelEntry = async () => {
    if (!buildingId) { toast.error("Bitte zuerst eine Liegenschaft zuweisen"); return; }
    if (!fuelQuantity) { toast.error("Bitte Menge angeben"); return; }

    setSaving(true);
    // Find the billing period for this invoice's date
    const invoiceDate = invoice?.invoice_date;
    let periodId: string | null = null;
    if (invoiceDate && buildingId) {
      const { data: periods } = await supabase
        .from("billing_periods")
        .select("id")
        .eq("building_id", buildingId)
        .lte("period_from", invoiceDate)
        .gte("period_to", invoiceDate)
        .maybeSingle();
      periodId = periods?.id || null;
    }

    if (!periodId) {
      // Try to find any period for this building
      const year = invoiceDate ? new Date(invoiceDate).getFullYear() : new Date().getFullYear();
      const { data: periods } = await supabase
        .from("billing_periods")
        .select("id")
        .eq("building_id", buildingId)
        .eq("fiscal_year", year)
        .maybeSingle();
      periodId = periods?.id || null;
    }

    if (!periodId) {
      toast.error("Kein passender Abrechnungszeitraum gefunden. Bitte zuerst einen anlegen.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("fuel_inventory").insert({
      building_id: buildingId,
      billing_period_id: periodId,
      fuel_type: fuelType,
      entry_type: "purchase",
      quantity: parseFloat(fuelQuantity),
      unit: fuelUnit,
      total_price: fuelPrice ? parseFloat(fuelPrice) : null,
      entry_date: invoice?.invoice_date || new Date().toISOString().split("T")[0],
      notes: `Aus Rechnung: ${invoice?.file_name || invoice?.invoice_number || ""}`,
    });

    setSaving(false);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Brennstoff-Eintrag gespeichert");
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 hover:bg-muted/30 rounded-md px-2 transition-colors">
        <Fuel className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Brennstoffdaten</span>
        {isFuelDetected && (
          <Badge className="bg-amber-100 text-amber-800 text-xs mr-2">Erkannt</Badge>
        )}
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-3 pl-6">
          {isFuelDetected && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              Die OCR hat diese Rechnung als Brennstofflieferung erkannt. Bitte prüfen und ggf. als Eintrag speichern.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Brennstoffart</Label>
              <Select value={fuelType} onValueChange={(v) => {
                setFuelType(v);
                setFuelUnit(FUEL_TYPES.find(f => f.value === v)?.unit || "l");
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Menge ({fuelUnit})</Label>
              <Input className="h-8 text-xs" type="number" step="0.01" value={fuelQuantity} onChange={e => setFuelQuantity(e.target.value)} placeholder="z.B. 3000" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Gesamtpreis (€)</Label>
            <Input className="h-8 text-xs" type="number" step="0.01" value={fuelPrice} onChange={e => setFuelPrice(e.target.value)} />
          </div>
          <Button size="sm" onClick={saveFuelEntry} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Fuel className="h-4 w-4 mr-1" />}
            Als Brennstoff-Eintrag speichern
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}