import { useState } from "react";
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
import { toast } from "sonner";
import { Loader2, FileText, ExternalLink, CheckCircle, CreditCard, Sparkles } from "lucide-react";

const PAYMENT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Offen", variant: "destructive" },
  paid: { label: "Bezahlt", variant: "default" },
};

const REVIEW_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Offen", variant: "outline" },
  verified: { label: "Geprüft", variant: "default" },
};

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

  const inv = invoice as any;
  if (inv && !form._initialized) {
    setForm({
      _initialized: true,
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
  }

  const handleClose = () => {
    setForm({});
    setPdfUrl(null);
    onClose();
  };

  const set = (key: string, value: any) => setForm(p => ({ ...p, [key]: value }));

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
  const lineItems = inv?.line_items as any[] || [];

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

            {/* Line Items */}
            {lineItems.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-sm font-medium">Positionen ({lineItems.length})</Label>
                  <p className="text-xs text-muted-foreground mb-2">Automatisch aus dem PDF extrahierte Rechnungspositionen</p>
                  <div className="space-y-1">
                    {lineItems.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm p-2 rounded bg-muted">
                        <span className="truncate mr-2">{item.description}</span>
                        <span className="font-mono whitespace-nowrap">
                          {item.amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(item.amount) : "–"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Save */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Speichern
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
