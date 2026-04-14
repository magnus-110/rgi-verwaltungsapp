import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  X, ChevronLeft, ChevronRight, Copy, CheckCircle, CreditCard,
  AlertTriangle, FileText, Loader2, Pencil, Trash2, Save
} from "lucide-react";

interface Invoice {
  id: string;
  vendor_name: string | null;
  vendor_iban: string | null;
  invoice_number: string | null;
  description: string | null;
  due_date: string | null;
  invoice_date: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  vat_amount: number | null;
  file_path: string | null;
  status: string;
  review_status: string;
  paid_at?: string | null;
  payment_notes?: string;
  payment_purpose?: string | null;
  buildings?: { name: string; building_code: string } | null;
}

interface Props {
  invoices: Invoice[];
  initialIndex: number;
  onClose: () => void;
  onRefetch: () => void;
}

const formatCurrency = (val: number | null) => {
  if (val == null) return "–";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const fallbackPurpose = (inv: Invoice) => {
  const parts: string[] = [];
  if (inv.invoice_number) parts.push(`Re. Nr. ${inv.invoice_number}`);
  if (inv.description) {
    const short = inv.description.split(/\s+/).slice(0, 3).join(" ");
    parts.push(short);
  }
  return parts.join(", ") || "–";
};

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-lg font-semibold break-all ${mono ? "font-mono text-base" : ""}`}>
          {value || "–"}
        </p>
      </div>
      {value && value !== "–" && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 mt-3"
          onClick={handleCopy}
        >
          {copied ? <CheckCircle className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function TransferReviewMode({ invoices, initialIndex, onClose, onRefetch }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [purpose, setPurpose] = useState<string>("–");
  const [generatingPurpose, setGeneratingPurpose] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    vendor_name: "",
    vendor_iban: "",
    invoice_number: "",
    description: "",
    gross_amount: "",
    net_amount: "",
    vat_amount: "",
    due_date: "",
    invoice_date: "",
  });

  const invoice = invoices[index];
  const isPaid = invoice?.status === "paid";
  const isOverdue = invoice?.due_date && isPast(new Date(invoice.due_date)) && !isToday(new Date(invoice.due_date));

  useEffect(() => {
    if (!invoice) return;
    setNotes(invoice.payment_notes || "");
    setEditing(false);
    setPdfUrl(null);
    if (invoice.file_path) {
      setLoadingPdf(true);
      supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.file_path, 300)
        .then(({ data }) => {
          setPdfUrl(data?.signedUrl || null);
          setLoadingPdf(false);
        });
    }
  }, [invoice?.id]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editing) return;
    if (e.key === "ArrowLeft" && index > 0) setIndex(i => i - 1);
    if (e.key === "ArrowRight" && index < invoices.length - 1) setIndex(i => i + 1);
    if (e.key === "Escape") onClose();
  }, [index, invoices.length, onClose, editing]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!invoice) return null;

  const startEditing = () => {
    setEditForm({
      vendor_name: invoice.vendor_name || "",
      vendor_iban: invoice.vendor_iban || "",
      invoice_number: invoice.invoice_number || "",
      description: invoice.description || "",
      gross_amount: invoice.gross_amount != null ? String(invoice.gross_amount) : "",
      net_amount: invoice.net_amount != null ? String(invoice.net_amount) : "",
      vat_amount: invoice.vat_amount != null ? String(invoice.vat_amount) : "",
      due_date: invoice.due_date || "",
      invoice_date: invoice.invoice_date || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({
        vendor_name: editForm.vendor_name || null,
        vendor_iban: editForm.vendor_iban || null,
        invoice_number: editForm.invoice_number || null,
        description: editForm.description || null,
        gross_amount: editForm.gross_amount ? parseFloat(editForm.gross_amount) : null,
        net_amount: editForm.net_amount ? parseFloat(editForm.net_amount) : null,
        vat_amount: editForm.vat_amount ? parseFloat(editForm.vat_amount) : null,
        due_date: editForm.due_date || null,
        invoice_date: editForm.invoice_date || null,
      })
      .eq("id", invoice.id);
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Rechnung aktualisiert");
      onRefetch();
    }
    setEditing(false);
    setSaving(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
    if (error) {
      toast.error("Fehler beim Löschen");
      return;
    }
    toast.success("Rechnung gelöscht");
    onRefetch();
    if (invoices.length <= 1) {
      onClose();
    } else if (index >= invoices.length - 1) {
      setIndex(i => i - 1);
    }
  };

  const saveNotes = async () => {
    await supabase
      .from("invoices")
      .update({ payment_notes: notes } as any)
      .eq("id", invoice.id);
  };

  const handleVerify = async () => {
    setSaving(true);
    await saveNotes();
    await supabase
      .from("invoices")
      .update({ review_status: "verified" } as any)
      .eq("id", invoice.id);
    toast.success("Rechnung als geprüft markiert");
    onRefetch();
    if (index < invoices.length - 1) {
      setIndex(i => i + 1);
    } else {
      onClose();
    }
    setSaving(false);
  };

  const handleMarkPaid = async () => {
    setSaving(true);
    await saveNotes();
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() } as any)
      .eq("id", invoice.id);
    toast.success("Rechnung als bezahlt markiert");
    onRefetch();
    setSaving(false);
    if (index >= invoices.length - 1 && index > 0) {
      setIndex(i => i - 1);
    }
  };

  const purpose = generatePurpose(invoice);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">
            {isPaid ? "Rechnungsdetails" : "Prüfmodus — Überweisungen"}
          </h2>
          {isPaid && <Badge variant="secondary">Bezahlt</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums min-w-[60px] text-center">
            {index + 1} / {invoices.length}
          </span>
          <Button variant="outline" size="sm" disabled={index === invoices.length - 1} onClick={() => setIndex(i => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Transfer data */}
        <div className="w-1/2 border-r overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">
              {isPaid ? "Rechnungsinformationen" : "Überweisungsdaten"}
            </h3>
            <div className="flex items-center gap-2">
              {invoice.review_status === "verified" && (
                <Badge variant="default">Geprüft</Badge>
              )}
              {!editing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Bearbeiten
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Die Rechnung „{invoice.vendor_name || "Unbekannt"}" wird unwiderruflich gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {!isPaid && isOverdue && !editing && (
            <div className="flex items-center gap-2 text-sm bg-destructive/10 text-destructive rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4" />
              Überfällig seit {invoice.due_date ? format(new Date(invoice.due_date), "dd.MM.yyyy") : ""}
            </div>
          )}

          {editing ? (
            <div className="space-y-3">
              <EditField label="Empfänger" value={editForm.vendor_name} onChange={v => setEditForm(f => ({ ...f, vendor_name: v }))} />
              <EditField label="IBAN" value={editForm.vendor_iban} onChange={v => setEditForm(f => ({ ...f, vendor_iban: v }))} />
              <EditField label="Bruttobetrag" value={editForm.gross_amount} onChange={v => setEditForm(f => ({ ...f, gross_amount: v }))} type="number" />
              <EditField label="Nettobetrag" value={editForm.net_amount} onChange={v => setEditForm(f => ({ ...f, net_amount: v }))} type="number" />
              <EditField label="MwSt." value={editForm.vat_amount} onChange={v => setEditForm(f => ({ ...f, vat_amount: v }))} type="number" />
              <EditField label="Rechnungsnummer" value={editForm.invoice_number} onChange={v => setEditForm(f => ({ ...f, invoice_number: v }))} />
              <EditField label="Beschreibung" value={editForm.description} onChange={v => setEditForm(f => ({ ...f, description: v }))} />
              <EditField label="Fälligkeitsdatum" value={editForm.due_date} onChange={v => setEditForm(f => ({ ...f, due_date: v }))} type="date" />
              <EditField label="Rechnungsdatum" value={editForm.invoice_date} onChange={v => setEditForm(f => ({ ...f, invoice_date: v }))} type="date" />

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveEdit} disabled={saving} className="flex-1">
                  <Save className="h-4 w-4 mr-2" />
                  Speichern
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                <CopyField label="Empfänger" value={invoice.vendor_name || "–"} />
                <Separator />
                <CopyField label="IBAN" value={invoice.vendor_iban || "–"} mono />
                <Separator />
                <CopyField label="Betrag" value={invoice.gross_amount != null ? formatCurrency(invoice.gross_amount) : "–"} />
                <Separator />
                <CopyField label="Verwendungszweck" value={purpose} />
                <Separator />
                <CopyField label="Rechnungsnummer" value={invoice.invoice_number || "–"} />
              </div>

              <div className="space-y-1.5">
                <InfoRow label="Fällig am" value={invoice.due_date ? format(new Date(invoice.due_date), "dd.MM.yyyy") : "–"} />
                <InfoRow label="Rechnungsdatum" value={invoice.invoice_date ? format(new Date(invoice.invoice_date), "dd.MM.yyyy") : "–"} />
                <InfoRow label="Liegenschaft" value={(invoice as any).buildings?.name || "–"} />
                {invoice.net_amount != null && (
                  <InfoRow label="Netto" value={`${formatCurrency(invoice.net_amount)} €`} />
                )}
                {invoice.vat_amount != null && (
                  <InfoRow label="MwSt." value={`${formatCurrency(invoice.vat_amount)} €`} />
                )}
                {invoice.description && (
                  <InfoRow label="Beschreibung" value={invoice.description} />
                )}
                {isPaid && invoice.paid_at && (
                  <InfoRow label="Bezahlt am" value={format(new Date(invoice.paid_at as string), "dd.MM.yyyy")} />
                )}
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">Notiz</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Zahlungsnotiz..."
              rows={3}
              onBlur={saveNotes}
            />
          </div>

          {!isPaid && !editing && (
            <>
              <Separator />
              <div className="flex gap-2">
                <Button
                  onClick={handleVerify}
                  disabled={saving}
                  className="flex-1"
                  variant={invoice.review_status === "verified" ? "secondary" : "default"}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Geprüft & Weiter
                </Button>
                <Button
                  onClick={handleMarkPaid}
                  disabled={saving}
                  variant="outline"
                  className="flex-1"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Als bezahlt markieren
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right: PDF preview */}
        <div className="w-1/2 flex flex-col bg-muted/30">
          <div className="p-3 border-b flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            Rechnungs-PDF
          </div>
          <div className="flex-1">
            {loadingPdf ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full" title="Rechnung PDF" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Kein PDF vorhanden
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} step={type === "number" ? "0.01" : undefined} />
    </div>
  );
}
