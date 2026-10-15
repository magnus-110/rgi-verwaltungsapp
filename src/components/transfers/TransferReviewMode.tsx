import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { DatevToggle } from "./DatevToggle";
import { LastschriftToggle } from "./LastschriftToggle";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Check, ChevronsUpDown, ArrowDownToLine, Pencil, ExternalLink, MoreHorizontal,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const PdfSeiten = lazy(() => import("@/components/shared/PdfSeiten"));
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
  invoice_type?: string | null;
  datev_upload?: boolean | null;
  datev_sent_at?: string | null;
  datev_status?: string | null;
  datev_error?: string | null;
  lastschrift?: boolean | null;
  ocr_extracted_data?: any;
  buildings?: { name: string } | null;
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

/**
 * Eine Angabe: Beschriftung, Wert, Kopieren und Bearbeiten. Klick auf den
 * Wert öffnet die Bearbeitung; Enter speichert, Escape bricht ab.
 */
function Feld({
  label, wert, anzeige, onSave, type = "text", mono, gross, kopieren = true, hinweis,
}: {
  label: string;
  wert: string;
  anzeige?: string;
  onSave: (val: string) => void | Promise<void>;
  type?: string;
  mono?: boolean;
  gross?: boolean;
  kopieren?: boolean;
  hinweis?: string;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState(wert);
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => { setEntwurf(wert); setBearbeiten(false); }, [wert]);

  const speichern = async () => { setBearbeiten(false); if (entwurf !== wert) await onSave(entwurf); };
  const kopiere = async () => {
    await navigator.clipboard.writeText(anzeige ?? wert);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 1500);
  };
  const zeige = anzeige ?? wert;

  return (
    <div className="group min-w-0 py-2.5">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {hinweis && <span className="text-[11px] text-primary">{hinweis}</span>}
      </div>
      {bearbeiten ? (
        <div className="flex items-center gap-1.5">
          <Input
            type={type}
            value={entwurf}
            onChange={(e) => setEntwurf(e.target.value)}
            step={type === "number" ? "0.01" : undefined}
            className={cn("h-9", mono && "font-mono")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") { setBearbeiten(false); setEntwurf(wert); }
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); speichern(); }
            }}
          />
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={speichern} aria-label="Speichern">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => { setBearbeiten(false); setEntwurf(wert); }} aria-label="Abbrechen">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => { setEntwurf(wert); setBearbeiten(true); }}
            title="Klicken zum Bearbeiten"
            className={cn(
              "min-w-0 flex-1 break-words rounded-md text-left transition-colors hover:text-primary",
              gross ? "text-base font-semibold" : "text-sm font-medium",
              mono && "font-mono tracking-tight",
              !zeige && "font-normal text-muted-foreground",
            )}
          >
            {zeige || "– eintragen"}
          </button>
          <span className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEntwurf(wert); setBearbeiten(true); }} aria-label={`${label} bearbeiten`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {kopieren && zeige && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={kopiere} aria-label={`${label} kopieren`}>
                {kopiert ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function Karte({ titel, rechts, children, className }: { titel: string; rechts?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card px-4 pb-2 pt-3.5", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titel}</h3>
        {rechts}
      </div>
      {children}
    </section>
  );
}

const IBAN_LESBAR = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function EditableFuelSection({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const initial = (invoice.ocr_extracted_data as any) || {};
  const [ocr, setOcr] = useState<any>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOcr((invoice.ocr_extracted_data as any) || {});
  }, [invoice.id]);

  const fuelUnit = ocr.fuel_unit || (ocr.fuel_type === "oil" ? "l" : ocr.fuel_type === "pellets" ? "kg" : "kWh");

  const persist = async (patch: Record<string, any>) => {
    const next = { ...ocr, ...patch };
    setOcr(next);
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ ocr_extracted_data: next } as any)
      .eq("id", invoice.id);
    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
    } else {
      onSaved();
    }
  };

  const NumField = ({ label, field, suffix }: { label: string; field: string; suffix?: string }) => {
    const [val, setVal] = useState<string>(ocr[field] != null ? String(ocr[field]).replace(".", ",") : "");
    useEffect(() => { setVal(ocr[field] != null ? String(ocr[field]).replace(".", ",") : ""); }, [invoice.id, ocr[field]]);
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              const raw = val.trim().replace(/\./g, "").replace(",", ".");
              const num = raw === "" ? null : Number(raw);
              if (raw !== "" && !Number.isFinite(num)) { toast.error("Ungültige Zahl"); return; }
              if ((ocr[field] ?? null) !== num) persist({ [field]: num });
            }}
            className="h-8 text-sm"
            inputMode="decimal"
          />
          {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold">Brennstoffkauf — aus Rechnung erkannt</h4>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Art</label>
          <Select value={ocr.fuel_type || "oil"} onValueChange={(v) => persist({ fuel_type: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="oil">Heizöl</SelectItem>
              <SelectItem value="pellets">Pellets</SelectItem>
              <SelectItem value="gas">Gas</SelectItem>
              <SelectItem value="district_heating">Fernwärme</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumField label="Menge" field="fuel_quantity" suffix={fuelUnit} />
        <NumField label="Energieinhalt" field="energy_content_kwh" suffix="kWh" />
        <NumField label="CO₂-Emissionen" field="co2_emissions_kg" suffix="kg" />
        <NumField label="CO₂-Steueranteil" field="co2_tax_amount_eur" suffix="€" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Lieferdatum</label>
          <Input
            type="date"
            value={ocr.delivery_date || ""}
            onChange={(e) => persist({ delivery_date: e.target.value || null })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Verbrauch von</label>
          <Input
            type="date"
            value={ocr.billing_period_from || ""}
            onChange={(e) => persist({ billing_period_from: e.target.value || null })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Verbrauch bis</label>
          <Input
            type="date"
            value={ocr.billing_period_to || ""}
            onChange={(e) => persist({ billing_period_to: e.target.value || null })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Änderungen werden automatisch gespeichert und beim Buchen in die Brennstoffbestandsführung übernommen.
      </p>
    </div>
  );
}


function SearchableBuildingSelect({
  buildings,
  invoice,
  onUpdate,
}: {
  buildings: { id: string; name: string }[];
  invoice: Invoice;
  onUpdate: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentValue = invoice.is_company_invoice
    ? "__company__"
    : invoice.building_id || "__none__";

  const selectedLabel = (() => {
    if (currentValue === "__company__") return "RGI Immobilien GmbH & Co. KG";
    if (currentValue === "__none__") return "– Keine Zuordnung –";
    const b = buildings.find((x) => x.id === currentValue);
    return b ? b.name : "Liegenschaft wählen";
  })();

  const allOptions = [
    { value: "__none__", label: "– Keine Zuordnung –", search: "keine" },
    { value: "__company__", label: "RGI Immobilien GmbH & Co. KG", search: "rgi immobilien gmbh kg" },
    ...buildings.map((b) => ({
      value: b.id,
      label: b.name,
      search: b.name.toLowerCase(),
    })),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 text-sm"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Liegenschaft suchen…" />
          <CommandList>
            <CommandEmpty>Keine Liegenschaft gefunden.</CommandEmpty>
            <CommandGroup>
              {allOptions.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.search} ${opt.value}`}
                  keywords={[opt.label, opt.search]}
                  onSelect={() => {
                    onUpdate(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentValue === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TransferReviewMode({ invoices, initialIndex, onClose, onRefetch }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [notes, setNotes] = useState("");
  const split = useMobileSplitView();
  const [saving, setSaving] = useState(false);
  const [datei, setDatei] = useState<Blob | null>(null);
  const [dateiUrl, setDateiUrl] = useState<string | null>(null);
  const [pdfFehler, setPdfFehler] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [purpose, setPurpose] = useState<string>("–");
  const [generatingPurpose, setGeneratingPurpose] = useState(false);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [umwandelnOffen, setUmwandelnOffen] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-review"],
    queryFn: async () => {
      const { data } = await supabase.from("buildings").select("id, name").order("name");
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

    if (invoice.payment_purpose) {
      setPurpose(invoice.payment_purpose);
      setGeneratingPurpose(false);
    } else if (invoice.description || invoice.invoice_number) {
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
    setDatei(null);
    setDateiUrl(null);
    setPdfFehler(false);
    if (invoice.file_path) {
      setLoadingPdf(true);
      (async () => {
        try {
          const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(invoice.file_path as string, 600);
          if (!signed?.signedUrl) throw new Error("kein Link");
          const res = await fetch(signed.signedUrl);
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (!cancelled) { setDatei(blob); setDateiUrl(signed.signedUrl); }
        } catch {
          if (!cancelled) setPdfFehler(true);
        } finally {
          if (!cancelled) setLoadingPdf(false);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [invoice?.id]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (isInput || target.tagName === "BUTTON" || target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return;

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

  const handleConvertToIncoming = async () => {
    const { error } = await supabase
      .from("invoices")
      .update({
        invoice_type: "credit_note",
        status: "credit_open",
        paid_at: null,
        review_status: "pending",
      } as any)
      .eq("id", invoice.id);
    if (error) {
      toast.error("Fehler bei der Umwandlung");
      return;
    }
    toast.success("Als Zahlungseingang markiert");
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
    if (invoice.review_status === "verified" || invoice.lastschrift || invoice.status === "paid") return;
    if (!invoice.building_id && !invoice.is_company_invoice) {
      toast.error("Bitte zuerst eine Liegenschaft zuordnen.");
      return;
    }
    setSaving(true);
    await saveNotes();
    await supabase
      .from("invoices")
      .update({ review_status: "verified" } as any)
      .eq("id", invoice.id);
    toast.success("Freigegeben – liegt jetzt in der Freigabe");
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

  const liegenschaftSetzen = async (val: string) => {
    const updates: any =
      val === "__company__"
        ? { is_company_invoice: true, building_id: null }
        : val === "__none__"
          ? { is_company_invoice: false, building_id: null }
          : { is_company_invoice: false, building_id: val };
    const { error } = await supabase.from("invoices").update(updates).eq("id", invoice.id);
    if (error) toast.error("Fehler beim Speichern");
    else { toast.success("Liegenschaft aktualisiert"); onRefetch(); }
  };

  const betragSpeichern = async (val: string) => {
    const num = parseFloat(val.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    if (isNaN(num)) { toast.error("Ungültiger Betrag"); return; }
    await saveField("gross_amount", String(num));
  };
  const zahlFeld = (n: number | null | undefined) => (n == null ? "" : formatCurrency(n));
  const zahlSpeichern = (feld: string) => async (val: string) => {
    const t = val.trim();
    if (!t) return saveField(feld, "");
    const num = parseFloat(t.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    if (isNaN(num)) { toast.error("Ungültige Zahl"); return; }
    await saveField(feld, String(num));
  };
  const datumAnzeige = (d: string | null | undefined) => (d ? format(new Date(d), "dd.MM.yyyy") : "");
  const istGutschrift = invoice.invoice_type === "credit_note";
  const liegenschaftName = invoice.is_company_invoice ? "RGI Immobilien GmbH & Co. KG" : invoice.buildings?.name ?? buildings.find((b: any) => b.id === invoice.building_id)?.name ?? null;
  const istBild = /\.(png|jpe?g|webp|gif)$/i.test(invoice.file_path ?? "");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Kopf */}
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0" onClick={onClose} aria-label="Schließen">
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="truncate font-semibold">{invoice.vendor_name || "Unbekannter Empfänger"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {liegenschaftName ?? "Keine Liegenschaft"}
              {invoice.invoice_number ? ` · Rechnung ${invoice.invoice_number}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {invoices.length > 1 && (
            <>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Vorherige">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[48px] text-center text-sm tabular-nums text-muted-foreground">
                {index + 1} / {invoices.length}
              </span>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" disabled={index === invoices.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label="Nächste">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Weitere Aktionen">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dateiUrl && (
                <DropdownMenuItem onClick={() => window.open(dateiUrl, "_blank", "noopener")}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Rechnung in neuem Tab
                </DropdownMenuItem>
              )}
              {!isPaid && (
                <DropdownMenuItem onClick={handleMarkPaid}>
                  <CreditCard className="mr-2 h-4 w-4" /> Als bezahlt markieren (z. B. bar bezahlt)
                </DropdownMenuItem>
              )}
              {!istGutschrift && (
                <DropdownMenuItem onClick={() => setUmwandelnOffen(true)}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" /> Ist ein Zahlungseingang
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setLoeschenOffen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Rechnung löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <MobileViewSwitcher mobileView={split.mobileView} onChange={split.setMobileView} listLabel="Daten" detailLabel="Rechnung" />

      <div className="flex flex-1 overflow-hidden" onTouchStart={split.touchHandlers.onTouchStart} onTouchEnd={split.touchHandlers.onTouchEnd}>
        {/* Links: Daten */}
        {split.showList && (
          <div className={cn("flex flex-col border-r", split.isMobile ? "w-full" : "w-[46%] min-w-[420px] max-w-[640px]")}>
            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-3 sm:p-5">
              {/* Betrag und Status */}
              <div className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{istGutschrift ? "Gutschrift" : "Zu zahlen"}</div>
                    <div className="text-3xl font-bold tabular-nums">{invoice.gross_amount != null ? `${formatCurrency(invoice.gross_amount)} €` : "–"}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {isPaid && <Badge variant="secondary">Bezahlt{invoice.paid_at ? ` am ${datumAnzeige(invoice.paid_at)}` : ""}</Badge>}
                    {!isPaid && invoice.lastschrift && <Badge variant="outline">Lastschrift</Badge>}
                    {invoice.review_status === "verified" && <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-400">Geprüft</Badge>}
                  </div>
                </div>
                {!isPaid && invoice.due_date && (
                  <div className={cn("mt-2 flex items-center gap-1.5 text-sm", isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {isOverdue && <AlertTriangle className="h-4 w-4" />}
                    {isOverdue ? "Überfällig seit" : "Fällig am"} {datumAnzeige(invoice.due_date)}
                  </div>
                )}
              </div>

              {/* Überweisung: genau die Angaben fürs Banking, mit Kopieren */}
              <Karte titel={istGutschrift ? "Zahlungseingang" : "Überweisung"}>
                <div className="divide-y">
                  <Feld label="Empfänger" wert={invoice.vendor_name || ""} onSave={(v) => saveField("vendor_name", v)} gross />
                  <Feld
                    label="IBAN"
                    wert={invoice.vendor_iban || ""}
                    anzeige={invoice.vendor_iban ? IBAN_LESBAR(invoice.vendor_iban) : ""}
                    onSave={(v) => saveField("vendor_iban", v.replace(/\s+/g, "").toUpperCase())}
                    mono
                    gross
                  />
                  <Feld label="Betrag" wert={invoice.gross_amount != null ? formatCurrency(invoice.gross_amount) : ""} onSave={betragSpeichern} gross />
                  <Feld
                    label="Verwendungszweck"
                    hinweis={generatingPurpose ? "KI schreibt …" : undefined}
                    wert={purpose === "–" ? "" : purpose}
                    onSave={async (val) => {
                      const { error } = await supabase.from("invoices").update({ payment_purpose: val } as any).eq("id", invoice.id);
                      if (error) toast.error("Fehler beim Speichern");
                      else { setPurpose(val); toast.success("Verwendungszweck gespeichert"); onRefetch(); }
                    }}
                    gross
                  />
                </div>
              </Karte>

              {/* Zuordnung */}
              <Karte titel="Zuordnung">
                <div className="space-y-3 pb-2 pt-1">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Liegenschaft</div>
                    <SearchableBuildingSelect buildings={buildings} invoice={invoice} onUpdate={liegenschaftSetzen} />
                  </div>
                  {invoice.is_company_invoice && !istGutschrift && (
                    <DatevToggle invoiceId={invoice.id} enabled={invoice.datev_upload} sentAt={invoice.datev_sent_at} status={invoice.datev_status} error={invoice.datev_error} onChanged={onRefetch} />
                  )}
                  {!istGutschrift && !isPaid && <LastschriftToggle key={invoice.id} invoiceId={invoice.id} an={!!invoice.lastschrift} onChanged={onRefetch} />}
                  {!istGutschrift && !isPaid && invoice.lastschrift && invoice.ocr_extracted_data?.lastschrift_satz && (
                    <p className="text-xs text-muted-foreground">
                      Erkannt aus der Rechnung: „{String(invoice.ocr_extracted_data.lastschrift_satz).slice(0, 160)}“
                    </p>
                  )}
                </div>
              </Karte>

              {/* Rechnung: übrige Angaben, je einmal */}
              <Karte titel="Rechnung">
                <div className="grid grid-cols-2 gap-x-4">
                  <Feld label="Rechnungsnummer" wert={invoice.invoice_number || ""} onSave={(v) => saveField("invoice_number", v)} />
                  <Feld label="Rechnungsdatum" type="date" wert={invoice.invoice_date || ""} anzeige={datumAnzeige(invoice.invoice_date)} onSave={(v) => saveField("invoice_date", v)} kopieren={false} />
                  <Feld label="Fällig am" type="date" wert={invoice.due_date || ""} anzeige={datumAnzeige(invoice.due_date)} onSave={(v) => saveField("due_date", v)} kopieren={false} />
                  <Feld label="Netto" wert={zahlFeld(invoice.net_amount)} onSave={zahlSpeichern("net_amount")} kopieren={false} />
                  <Feld label="MwSt." wert={zahlFeld(invoice.vat_amount)} onSave={zahlSpeichern("vat_amount")} kopieren={false} />
                </div>
                <div className="border-t">
                  <Feld label="Beschreibung" wert={invoice.description || ""} onSave={(v) => saveField("description", v)} kopieren={false} />
                </div>
              </Karte>

              {invoice.ocr_extracted_data?.is_fuel_purchase && <EditableFuelSection invoice={invoice} onSaved={onRefetch} />}

              <Karte titel="Notiz">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interne Notiz zur Zahlung …" rows={2} onBlur={saveNotes} className="mb-2 resize-none" />
              </Karte>
            </div>

            {/* Aktionen */}
            {!isPaid && !istGutschrift && (
              <div className="flex items-center gap-3 border-t bg-background p-3">
                {invoice.review_status === "verified" ? (
                  <>
                    <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-600" /> Freigegeben – liegt in der Freigabe
                    </span>
                    {index < invoices.length - 1 && (
                      <Button variant="outline" onClick={() => setIndex((i) => i + 1)}>
                        Weiter <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    )}
                  </>
                ) : invoice.lastschrift ? (
                  <span className="flex-1 text-sm text-muted-foreground">Wird per Lastschrift eingezogen – nichts zu tun. Kommt die Abbuchung, ist die Rechnung bezahlt.</span>
                ) : (
                  <Button onClick={handleVerify} disabled={saving} className="h-11 flex-1">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Freigeben{invoices.length > 1 && index < invoices.length - 1 ? " & weiter" : ""}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rechts: Rechnung */}
        {split.showDetail && (
          <div className={cn("flex flex-1 flex-col bg-muted/50", split.isMobile && "w-full")}>
            {split.isMobile && (
              <div className="border-b p-2">
                <MobileBackToListButton onClick={split.openList} label="Daten" />
              </div>
            )}
            <div className="relative flex-1 overflow-hidden">
              {loadingPdf ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : datei && istBild && dateiUrl ? (
                <div className="h-full overflow-auto p-4">
                  <img src={dateiUrl} alt="Rechnung" className="mx-auto max-w-full rounded-md shadow-sm" />
                </div>
              ) : datei && !pdfFehler ? (
                <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                  <PdfSeiten datei={datei} onFehler={() => setPdfFehler(true)} />
                </Suspense>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  {invoice.file_path ? "Die Rechnung lässt sich hier nicht anzeigen." : "Keine Rechnung hinterlegt."}
                  {dateiUrl && (
                    <Button variant="outline" size="sm" onClick={() => window.open(dateiUrl, "_blank", "noopener")}>
                      <ExternalLink className="mr-1.5 h-4 w-4" /> In neuem Tab öffnen
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rückfragen */}
      <AlertDialog open={umwandelnOffen} onOpenChange={setUmwandelnOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Als Zahlungseingang markieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Rechnung „{invoice.vendor_name || "Unbekannt"}" wurde fälschlich als Ausgangsrechnung eingelesen und wird zum Zahlungseingang (Gutschrift). Du findest sie danach im Reiter „Gutschriften".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertToIncoming}>Umwandeln</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={loeschenOffen} onOpenChange={setLoeschenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Die Rechnung „{invoice.vendor_name || "Unbekannt"}" wird unwiderruflich gelöscht.</AlertDialogDescription>
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
  );
}
