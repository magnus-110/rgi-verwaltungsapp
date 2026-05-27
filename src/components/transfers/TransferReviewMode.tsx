import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  X, ChevronLeft, ChevronRight, Copy, CheckCircle, CreditCard,
  AlertTriangle, FileText, Loader2, Trash2, Save, Flame,
  Check, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileSplitView, MobileViewSwitcher, MobileBackToListButton } from "@/components/shared/MobileSplitView";

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
  building_id?: string | null;
  is_company_invoice?: boolean;
  ocr_extracted_data?: any;
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

function InlineEditField({ label, value, onSave, type = "text", mono }: {
  label: string;
  value: string;
  onSave: (val: string) => void;
  type?: string;
  mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);

  if (editing) {
    return (
      <div className="py-2">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <Input
            type={type}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            step={type === "number" ? "0.01" : undefined}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Escape") { setEditing(false); setEditVal(value); }
            }}
          />
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { onSave(editVal); setEditing(false); }}>
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setEditing(false); setEditVal(value); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="py-2 cursor-pointer rounded px-1 -mx-1 hover:bg-muted/80 transition-colors"
      onClick={() => { setEditVal(value); setEditing(true); }}
      title="Klicken zum Bearbeiten"
    >
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium break-all ${mono ? "font-mono" : ""}`}>
        {value || "–"}
      </p>
    </div>
  );
}

function PurposeEditCopyField({ label, value, onSave, mono }: { label: string; value: string; onSave: (val: string) => void; mono?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setEditVal(value); }, [value]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (editing) {
    return (
      <div className="py-2">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <Input
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Escape") { setEditing(false); setEditVal(value); }
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onSave(editVal); setEditing(false); }
            }}
          />
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { onSave(editVal); setEditing(false); }}>
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setEditing(false); setEditVal(value); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div
        className="min-w-0 flex-1 cursor-pointer rounded px-1 -mx-1 hover:bg-muted/80 transition-colors"
        onClick={() => { setEditVal(value); setEditing(true); }}
        title="Klicken zum Bearbeiten"
      >
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-lg font-semibold break-all ${mono ? "font-mono text-base" : ""}`}>{value || "–"}</p>
      </div>
      {value && value !== "–" && (
        <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0 mt-3" onClick={handleCopy}>
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
  const split = useMobileSplitView();
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [purpose, setPurpose] = useState<string>("–");
  const [generatingPurpose, setGeneratingPurpose] = useState(false);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-review"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name, building_code").order("name");
      return data || [];
    },
  });

  const invoice = invoices[index];
  const isPaid = invoice?.status === "paid";
  const isOverdue = invoice?.due_date && isPast(new Date(invoice.due_date)) && !isToday(new Date(invoice.due_date));

  useEffect(() => {
    if (!invoice) return;
    setNotes(invoice.payment_notes || "");
    setHasUnsavedEdits(false);
    setPdfUrl(null);

    if (invoice.payment_purpose) {
      setPurpose(invoice.payment_purpose);
      setGeneratingPurpose(false);
    } else if (invoice.description) {
      setPurpose(fallbackPurpose(invoice));
      setGeneratingPurpose(true);
      supabase.functions.invoke("generate-payment-purpose", {
        body: {
          invoice_id: invoice.id,
          description: invoice.description,
          vendor_name: invoice.vendor_name,
          invoice_number: invoice.invoice_number,
        },
      }).then(({ data, error }) => {
        if (!error && data?.purpose) {
          setPurpose(data.purpose);
        }
        setGeneratingPurpose(false);
      });
    } else {
      setPurpose(fallbackPurpose(invoice));
      setGeneratingPurpose(false);
    }

    let cancelled = false;
    let createdBlobUrl: string | null = null;
    if (invoice.file_path) {
      setLoadingPdf(true);
      (async () => {
        try {
          const { data: signed } = await supabase.storage
            .from("invoices")
            .createSignedUrl(invoice.file_path as string, 300);
          if (!signed?.signedUrl) {
            if (!cancelled) { setPdfUrl(null); setLoadingPdf(false); }
            return;
          }
          // Fetch as blob and force inline application/pdf to prevent
          // browser-triggered downloads (Content-Disposition: attachment).
          const res = await fetch(signed.signedUrl);
          const buf = await res.arrayBuffer();
          const blob = new Blob([buf], { type: "application/pdf" });
          createdBlobUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setPdfUrl(createdBlobUrl);
            setLoadingPdf(false);
          } else {
            URL.revokeObjectURL(createdBlobUrl);
          }
        } catch {
          if (!cancelled) { setPdfUrl(null); setLoadingPdf(false); }
        }
      })();
    }
    return () => {
      cancelled = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [invoice?.id]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (isInput) return;

    if (e.key === "Enter") {
      e.preventDefault();
      handleVerify();
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) setIndex(i => i - 1);
    if (e.key === "ArrowRight" && index < invoices.length - 1) setIndex(i => i + 1);
    if (e.key === "Escape") onClose();
  }, [index, invoices.length, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!invoice) return null;

  const saveField = async (field: string, value: string) => {
    let parsed: any = value || null;
    if (["gross_amount", "net_amount", "vat_amount"].includes(field)) {
      parsed = value ? parseFloat(value) : null;
    }
    const { error } = await supabase
      .from("invoices")
      .update({ [field]: parsed } as any)
      .eq("id", invoice.id);
    if (error) {
      toast.error("Fehler beim Speichern");
    } else {
      toast.success("Gespeichert");
      onRefetch();
    }
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
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        review_status: "verified",
      } as any)
      .eq("id", invoice.id);
    toast.success("Bezahlt & geprüft");
    onRefetch();
    setSaving(false);
    if (index < invoices.length - 1) {
      setIndex(i => i + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">
            {isPaid ? "Rechnungsdetails" : "Prüfmodus — Zahlungen"}
          </h2>
          {isPaid && <Badge variant="secondary">Bezahlt</Badge>}
          {!isPaid && (
            <span className="text-xs text-muted-foreground">
              Enter = Geprüft & Weiter
            </span>
          )}
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

      {/* Mobile View Switcher */}
      <MobileViewSwitcher
        mobileView={split.mobileView}
        onChange={split.setMobileView}
        listLabel="Daten"
        detailLabel="PDF"
      />

      {/* Content */}
      <div
        className="flex-1 flex overflow-hidden"
        onTouchStart={split.touchHandlers.onTouchStart}
        onTouchEnd={split.touchHandlers.onTouchEnd}
      >
        {/* Left: Transfer data */}
        {split.showList && (
        <div className={cn("border-r overflow-y-auto p-6 space-y-4", split.isMobile ? "w-full" : "w-1/2")}>
          {split.isMobile && (
            <MobileBackToListButton onClick={split.openDetail} label="PDF anzeigen" />
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">
              {isPaid ? "Rechnungsinformationen" : "Überweisungsdaten"}
            </h3>
            <div className="flex items-center gap-2">
              {invoice.review_status === "verified" && (
                <Badge variant="default">Geprüft</Badge>
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

          {!isPaid && isOverdue && (
            <div className="flex items-center gap-2 text-sm bg-destructive/10 text-destructive rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4" />
              Überfällig seit {invoice.due_date ? format(new Date(invoice.due_date), "dd.MM.yyyy") : ""}
            </div>
          )}

          {/* Copy fields for bank transfer */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <PurposeEditCopyField
              label="Empfänger"
              value={invoice.vendor_name || "–"}
              onSave={async (val) => {
                await saveField("vendor_name", val);
              }}
            />
            <Separator />
            <PurposeEditCopyField
              label="IBAN"
              value={invoice.vendor_iban || "–"}
              onSave={async (val) => {
                await saveField("vendor_iban", val);
              }}
              mono
            />
            <Separator />
            <PurposeEditCopyField
              label="Betrag"
              value={invoice.gross_amount != null ? formatCurrency(invoice.gross_amount) : "–"}
              onSave={async (val) => {
                const num = parseFloat(val.replace(/[^\d,.-]/g, "").replace(",", "."));
                if (!isNaN(num)) {
                  await saveField("gross_amount", String(num));
                } else {
                  toast.error("Ungültiger Betrag");
                }
              }}
            />
            <Separator />
            <PurposeEditCopyField
              label={`Verwendungszweck${generatingPurpose ? " (KI generiert…)" : ""}`}
              value={purpose}
              onSave={async (val) => {
                const { error } = await supabase.from("invoices").update({ payment_purpose: val } as any).eq("id", invoice.id);
                if (error) { toast.error("Fehler beim Speichern"); } else {
                  setPurpose(val);
                  toast.success("Verwendungszweck gespeichert");
                  onRefetch();
                }
              }}
            />
            <Separator />
            <PurposeEditCopyField
              label="Rechnungsnummer"
              value={invoice.invoice_number || "–"}
              onSave={async (val) => {
                await saveField("invoice_number", val);
              }}
            />
          </div>

          {/* Inline editable fields */}
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Details · Klicken zum Bearbeiten</p>
            <InlineEditField label="Empfänger" value={invoice.vendor_name || ""} onSave={v => saveField("vendor_name", v)} />
            <InlineEditField label="IBAN" value={invoice.vendor_iban || ""} onSave={v => saveField("vendor_iban", v)} mono />
            <InlineEditField label="Bruttobetrag" value={invoice.gross_amount != null ? String(invoice.gross_amount) : ""} onSave={v => saveField("gross_amount", v)} type="number" />
            <InlineEditField label="Nettobetrag" value={invoice.net_amount != null ? String(invoice.net_amount) : ""} onSave={v => saveField("net_amount", v)} type="number" />
            <InlineEditField label="MwSt." value={invoice.vat_amount != null ? String(invoice.vat_amount) : ""} onSave={v => saveField("vat_amount", v)} type="number" />
            <InlineEditField label="Rechnungsnummer" value={invoice.invoice_number || ""} onSave={v => saveField("invoice_number", v)} />
            <InlineEditField label="Beschreibung" value={invoice.description || ""} onSave={v => saveField("description", v)} />
            <InlineEditField label="Fälligkeitsdatum" value={invoice.due_date || ""} onSave={v => saveField("due_date", v)} type="date" />
            <InlineEditField label="Rechnungsdatum" value={invoice.invoice_date || ""} onSave={v => saveField("invoice_date", v)} type="date" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Liegenschaft</label>
            <SearchableBuildingSelect
              buildings={buildings}
              invoice={invoice}
              onUpdate={async (val) => {
                const updates: any = {};
                if (val === "__company__") {
                  updates.is_company_invoice = true;
                  updates.building_id = null;
                } else if (val === "__none__") {
                  updates.is_company_invoice = false;
                  updates.building_id = null;
                } else {
                  updates.is_company_invoice = false;
                  updates.building_id = val;
                }
                const { error } = await supabase.from("invoices").update(updates).eq("id", invoice.id);
                if (error) toast.error("Fehler beim Speichern");
                else { toast.success("Liegenschaft aktualisiert"); onRefetch(); }
              }}
            />
            {isPaid && invoice.paid_at && (
              <InfoRow label="Bezahlt am" value={format(new Date(invoice.paid_at as string), "dd.MM.yyyy")} />
            )}
          </div>

          {(() => {
            const ocr = invoice.ocr_extracted_data as any;
            if (!ocr?.is_fuel_purchase) return null;
            const fuelLabel = ocr.fuel_type === "pellets" ? "Pellets"
              : ocr.fuel_type === "gas" ? "Gas"
              : ocr.fuel_type === "district_heating" ? "Fernwärme"
              : "Heizöl";
            const fuelUnit = ocr.fuel_unit || (ocr.fuel_type === "oil" ? "l"
              : ocr.fuel_type === "pellets" ? "kg"
              : "kWh");
            const fmtNum = (v: any, suffix = "") =>
              v != null && v !== "" ? `${typeof v === "number" ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v) : v}${suffix}` : "–";
            return (
              <>
                <Separator />
                <div className="rounded-lg border border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <h4 className="text-sm font-semibold">Brennstoffkauf — aus Rechnung erkannt</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-1">
                    <InfoRow label="Art" value={fuelLabel} />
                    <InfoRow label="Menge" value={fmtNum(ocr.fuel_quantity, ` ${fuelUnit}`)} />
                    <InfoRow label="Energieinhalt" value={fmtNum(ocr.energy_content_kwh, " kWh")} />
                    <InfoRow label="CO₂-Emissionen" value={fmtNum(ocr.co2_emissions_kg, " kg")} />
                    <InfoRow label="CO₂-Steueranteil" value={ocr.co2_tax_amount_eur != null ? `${formatCurrency(ocr.co2_tax_amount_eur)} €` : "–"} />
                    <InfoRow label="Lieferdatum" value={ocr.delivery_date || invoice.invoice_date || "–"} />
                  </div>
                  {(ocr.billing_period_from || ocr.billing_period_to) && (() => {
                    const periodTo = ocr.billing_period_to || ocr.billing_period_from;
                    const heizjahr = periodTo ? new Date(periodTo).getFullYear() : null;
                    const invoiceYear = invoice.invoice_date ? new Date(invoice.invoice_date).getFullYear() : null;
                    const yearMismatch = heizjahr && invoiceYear && heizjahr !== invoiceYear;
                    return (
                      <div className={`mt-2 rounded-md border p-2 text-xs ${yearMismatch ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "border-border bg-muted/30"}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">
                            Verbrauchszeitraum: {ocr.billing_period_from || "?"} – {ocr.billing_period_to || "?"}
                          </span>
                          {heizjahr && (
                            <Badge variant={yearMismatch ? "default" : "secondary"} className={yearMismatch ? "bg-amber-600 hover:bg-amber-600" : ""}>
                              Heizjahr {heizjahr}
                            </Badge>
                          )}
                        </div>
                        {yearMismatch && (
                          <p className="mt-1 text-amber-900 dark:text-amber-200">
                            Rechnungsdatum {invoiceYear} · Verbrauch wird Heizjahr {heizjahr} zugeordnet.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground pt-1">
                    Diese Daten werden beim Buchen in die Brennstoffbestandsführung übernommen.
                  </p>
                </div>
              </>
            );
          })()}

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

          {!isPaid && (
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
        )}

        {/* Right: PDF preview */}
        {split.showDetail && (
        <div className={cn("flex flex-col bg-muted/30", split.isMobile ? "w-full" : "w-1/2")}>
          <div className="p-3 border-b flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {split.isMobile && (
              <MobileBackToListButton onClick={split.openList} label="Daten" />
            )}
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
        )}
      </div>
    </div>
  );
}
