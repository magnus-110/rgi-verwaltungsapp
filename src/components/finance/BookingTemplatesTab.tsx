import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, LayoutTemplate, Loader2, Check, ChevronsUpDown, FileText, Building2, CreditCard, Receipt, CalendarDays, Settings2, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TemplateForm {
  name: string;
  vendor_name: string;
  vendor_iban: string;
  expected_amount: string;
  amount_tolerance: string;
  account_id: string;
  building_id: string;
  is_35a_relevant: boolean;
  interval: string;
  category: string;
  description: string;
  vat_rate: string;
  valid_from: string;
  valid_to: string;
  linked_invoice_id: string;
}

const emptyForm: TemplateForm = {
  name: "",
  vendor_name: "",
  vendor_iban: "",
  expected_amount: "",
  amount_tolerance: "",
  account_id: "",
  building_id: "",
  is_35a_relevant: false,
  interval: "monatlich",
  category: "",
  description: "",
  vat_rate: "",
  valid_from: "",
  valid_to: "",
  linked_invoice_id: "",
};

interface BookingTemplatesTabProps {
  sharedBuildingId?: string | null;
  onBuildingChange?: (id: string | null) => void;
}

export function BookingTemplatesTab({ sharedBuildingId, onBuildingChange }: BookingTemplatesTabProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [accountOpen, setAccountOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [internalFilterBuildingId, setInternalFilterBuildingId] = useState<string>("");
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", vendor_name: "", category: "", interval: "monatlich", vat_rate: "", is_35a_relevant: false, description: "" });
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const filterBuildingId = sharedBuildingId || internalFilterBuildingId;

  const handleFilterBuildingChange = (v: string) => {
    setInternalFilterBuildingId(v);
    onBuildingChange?.(v || null);
  };

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["booking-templates", filterBuildingId],
    queryFn: async () => {
      if (!filterBuildingId) return [];
      const { data, error } = await supabase
        .from("booking_templates")
        .select("*, buildings(name), chart_of_accounts(account_number, account_name), invoices(id, invoice_number, vendor_name, invoice_date, gross_amount)")
        .eq("building_id", filterBuildingId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Load presets
  const { data: presets = [] } = useQuery({
    queryKey: ["booking-template-presets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_template_presets")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const selectedPreset = presets.find((preset: any) => preset.id === selectedPresetId);

  // Load invoices for the selected building (for linking)
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-for-linking", form.building_id],
    queryFn: async () => {
      if (!form.building_id) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, vendor_name, invoice_date, gross_amount")
        .eq("building_id", form.building_id)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: isDialogOpen && !!form.building_id,
  });

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p: any) => p.id === presetId);
    if (!preset) return;

    setSelectedPresetId(presetId);
    setPresetPickerOpen(false);

    setForm(prev => ({
      ...prev,
      name: preset.name,
      vendor_name: preset.vendor_name || prev.vendor_name,
      category: preset.category || prev.category,
      interval: preset.interval || prev.interval,
      vat_rate: preset.vat_rate != null ? String(preset.vat_rate) : prev.vat_rate,
      is_35a_relevant: preset.is_35a_relevant ?? prev.is_35a_relevant,
      description: preset.description || prev.description,
    }));
  };

  const openPresetEdit = (preset: any) => {
    setPresetPickerOpen(false);
    setEditingPresetId(preset.id);
    setPresetForm({
      name: preset.name || "",
      vendor_name: preset.vendor_name || "",
      category: preset.category || "",
      interval: preset.interval || "monatlich",
      vat_rate: preset.vat_rate != null ? String(preset.vat_rate) : "",
      is_35a_relevant: preset.is_35a_relevant ?? false,
      description: preset.description || "",
    });
    setPresetDialogOpen(true);
  };

  const openPresetCreate = () => {
    setPresetPickerOpen(false);
    setEditingPresetId(null);
    setPresetForm({ name: "", vendor_name: "", category: "", interval: "monatlich", vat_rate: "", is_35a_relevant: false, description: "" });
    setPresetDialogOpen(true);
  };

  const handleSavePreset = async () => {
    if (!presetForm.name.trim()) { toast.error("Name ist erforderlich"); return; }
    const payload = {
      name: presetForm.name,
      vendor_name: presetForm.vendor_name || null,
      category: presetForm.category || null,
      interval: presetForm.interval || "monatlich",
      vat_rate: presetForm.vat_rate ? parseFloat(presetForm.vat_rate) : null,
      is_35a_relevant: presetForm.is_35a_relevant,
      description: presetForm.description || null,
    };
    if (editingPresetId) {
      const { error } = await supabase.from("booking_template_presets").update(payload).eq("id", editingPresetId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Muster aktualisiert");
    } else {
      const maxSort = presets.length > 0 ? Math.max(...presets.map((p: any) => p.sort_order || 0)) : 0;
      const { error } = await supabase.from("booking_template_presets").insert({ ...payload, sort_order: maxSort + 1 } as any);
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Muster erstellt");
    }
    setPresetDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["booking-template-presets"] });
  };

  const handleDeletePreset = async (id: string) => {
    const { error } = await supabase.from("booking_template_presets").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    if (selectedPresetId === id) {
      setSelectedPresetId("");
    }
    toast.success("Muster gelöscht");
    queryClient.invalidateQueries({ queryKey: ["booking-template-presets"] });
  };

  const openCreate = () => {
    setEditingId(null);
    setSelectedPresetId("");
    setForm({ ...emptyForm, building_id: filterBuildingId });
    setIsDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      name: t.name || "",
      vendor_name: t.vendor_name || "",
      vendor_iban: t.vendor_iban || "",
      expected_amount: t.expected_amount?.toString() || "",
      amount_tolerance: t.amount_tolerance?.toString() || "",
      account_id: t.account_id || "",
      building_id: t.building_id || "",
      is_35a_relevant: t.is_35a_relevant || false,
      interval: t.interval || "monatlich",
      category: t.category || "",
      description: t.description || "",
      vat_rate: t.vat_rate?.toString() || "",
      valid_from: t.valid_from || "",
      valid_to: t.valid_to || "",
      linked_invoice_id: t.linked_invoice_id || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!form.building_id) {
      toast.error("Liegenschaft ist erforderlich");
      return;
    }

    const payload = {
      name: form.name.trim(),
      vendor_name: form.vendor_name || null,
      vendor_iban: form.vendor_iban || null,
      expected_amount: form.expected_amount ? parseFloat(form.expected_amount) : null,
      amount_tolerance: form.amount_tolerance ? parseFloat(form.amount_tolerance) : null,
      account_id: form.account_id || null,
      building_id: form.building_id || null,
      is_35a_relevant: form.is_35a_relevant,
      interval: form.interval,
      category: form.category || null,
      description: form.description || null,
      vat_rate: form.vat_rate ? parseFloat(form.vat_rate) : null,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      linked_invoice_id: form.linked_invoice_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from("booking_templates").update(payload).eq("id", editingId);
      if (error) { toast.error("Fehler beim Speichern"); return; }
      toast.success("Vorlage aktualisiert");
    } else {
      const { error } = await supabase.from("booking_templates").insert(payload);
      if (error) { toast.error("Fehler beim Erstellen"); return; }
      toast.success("Vorlage erstellt");
    }

    setIsDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["booking-templates"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("booking_templates").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Vorlage gelöscht");
    queryClient.invalidateQueries({ queryKey: ["booking-templates"] });
  };

  const formatCurrency = (val: number) =>
    `${Number(val).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Buchungsvorlagen</CardTitle>
            <Button onClick={openCreate} disabled={!filterBuildingId}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Vorlage
            </Button>
          </div>
          {!sharedBuildingId && (
            <div className="mt-3">
              <Select value={filterBuildingId} onValueChange={handleFilterBuildingChange}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Liegenschaft auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!filterBuildingId ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Bitte wählen Sie eine Liegenschaft aus</p>
              <p className="text-sm mt-1">Vorlagen werden pro Gebäude verwaltet</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Buchungsvorlagen für dieses Gebäude</p>
              <p className="text-sm mt-1">Vorlagen werden beim Kontoauszug-Import automatisch abgeglichen</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kreditor</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>MwSt</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {t.name}
                        {t.linked_invoice_id && (
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{t.vendor_name || "–"}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{t.vendor_iban || "–"}</TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {t.expected_amount != null ? (
                        <span>
                          {formatCurrency(t.expected_amount)}
                          {t.amount_tolerance != null && t.amount_tolerance > 0 && (
                            <span className="text-muted-foreground text-xs ml-1">±{formatCurrency(t.amount_tolerance)}</span>
                          )}
                        </span>
                      ) : "–"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.chart_of_accounts ? `${t.chart_of_accounts.account_number} ${t.chart_of_accounts.account_name}` : "–"}
                    </TableCell>
                    <TableCell className="text-sm">{t.vat_rate != null ? `${t.vat_rate}%` : "–"}</TableCell>
                    <TableCell className="text-sm capitalize">{t.interval || "–"}</TableCell>
                    <TableCell className="text-sm">
                      {t.valid_from || t.valid_to
                        ? `${t.valid_from ? new Date(t.valid_from).toLocaleDateString("de-DE") : "–"} – ${t.valid_to ? new Date(t.valid_to).toLocaleDateString("de-DE") : "offen"}`
                        : "–"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              {editingId ? "Vorlage bearbeiten" : "Neue Buchungsvorlage"}
            </DialogTitle>
            <DialogDescription>
              Vorlagen werden beim Kontoauszug-Import automatisch mit Transaktionen abgeglichen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* === Preset Selector (only for new templates) === */}
            {!editingId && presets.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Vorlage aus Muster erstellen</Label>
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={openPresetCreate}>
                    <Plus className="h-3 w-3" /> Neues Muster
                  </Button>
                </div>
                <Popover open={presetPickerOpen} onOpenChange={setPresetPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={presetPickerOpen} className="w-full justify-between font-normal">
                      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                        <span className={cn("truncate", !selectedPreset && "text-muted-foreground")}>
                          {selectedPreset ? selectedPreset.name : "Muster auswählen…"}
                        </span>
                        {selectedPreset?.category && (
                          <span className="truncate text-xs text-muted-foreground">
                            ({selectedPreset.category})
                          </span>
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                      {presets.map((p: any) => {
                        const isSelected = selectedPresetId === p.id;

                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "flex items-center gap-2 rounded-md border border-border/60 bg-background p-1",
                              isSelected && "border-primary/40 bg-muted/40"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => applyPreset(p.id)}
                              className="flex flex-1 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-muted/60"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                                {p.category && (
                                  <div className="truncate text-xs text-muted-foreground">{p.category}</div>
                                )}
                              </div>
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                            </button>

                            <div className="flex items-center gap-1 pr-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Muster bearbeiten"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openPresetEdit(p);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="Muster löschen"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();

                                  if (window.confirm(`Muster „${p.name}“ wirklich löschen?`)) {
                                    void handleDeletePreset(p.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <Separator />
              </div>
            )}

            {/* === Section 1: Grunddaten === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                Grunddaten
              </div>
              <div>
                <Label>Vorlagenname *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Abschlag Gaslieferant, Kontoführungsgebühr" />
              </div>
              <div>
                <Label>Liegenschaft *</Label>
                <Popover open={buildingOpen} onOpenChange={setBuildingOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={buildingOpen} className="w-full justify-between font-normal">
                      {form.building_id ? buildings.find(b => b.id === form.building_id)?.name || "Liegenschaft wählen" : "Liegenschaft wählen"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Liegenschaft suchen..." value={buildingSearch} onValueChange={setBuildingSearch} />
                      <CommandList>
                        <CommandEmpty>Keine Liegenschaft gefunden.</CommandEmpty>
                        <CommandGroup>
                          {buildings.map((b) => (
                            <CommandItem key={b.id} value={b.name} onSelect={() => { setForm({ ...form, building_id: b.id }); setBuildingOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", form.building_id === b.id ? "opacity-100" : "opacity-0")} />
                              {b.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Separator />

            {/* === Section 2: Kreditor === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Kreditor / Zahlungsempfänger
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} placeholder="z.B. Stadtwerke Pfronten" />
                </div>
                <div>
                  <Label>IBAN</Label>
                  <Input value={form.vendor_iban} onChange={(e) => setForm({ ...form, vendor_iban: e.target.value })} placeholder="DE89 3704 0044 ..." />
                </div>
              </div>
            </div>

            <Separator />

            {/* === Section 3: Betrag & Buchung === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Betrag & Buchung
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Erwarteter Betrag (€)</Label>
                  <Input type="number" step="0.01" value={form.expected_amount} onChange={(e) => setForm({ ...form, expected_amount: e.target.value })} placeholder="0,00" />
                </div>
                <div>
                  <Label>Toleranz ±€</Label>
                  <Input type="number" step="0.01" value={form.amount_tolerance} onChange={(e) => setForm({ ...form, amount_tolerance: e.target.value })} placeholder="z.B. 4,00" />
                </div>
              </div>
              {form.expected_amount && form.amount_tolerance && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Automatisches Matching bei Beträgen zwischen{" "}
                  <span className="font-medium text-foreground">{formatCurrency(parseFloat(form.expected_amount) - parseFloat(form.amount_tolerance))}</span>
                  {" "}und{" "}
                  <span className="font-medium text-foreground">{formatCurrency(parseFloat(form.expected_amount) + parseFloat(form.amount_tolerance))}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Buchungskonto</Label>
                  <Popover open={accountOpen} onOpenChange={setAccountOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={accountOpen} className="w-full justify-between font-normal">
                        {form.account_id
                          ? (() => { const a = accounts.find((a: any) => a.id === form.account_id); return a ? `${a.account_number} – ${a.account_name}` : "Konto wählen"; })()
                          : "Konto wählen"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Konto suchen..." value={accountSearch} onValueChange={setAccountSearch} />
                        <CommandList>
                          <CommandEmpty>Kein Konto gefunden.</CommandEmpty>
                          <CommandGroup>
                            {accounts.map((a: any) => (
                              <CommandItem key={a.id} value={`${a.account_number} ${a.account_name}`} onSelect={() => { setForm({ ...form, account_id: a.id }); setAccountOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", form.account_id === a.id ? "opacity-100" : "opacity-0")} />
                                {a.account_number} – {a.account_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>MwSt-Satz</Label>
                  <Select value={form.vat_rate} onValueChange={(v) => setForm({ ...form, vat_rate: v })}>
                    <SelectTrigger><SelectValue placeholder="MwSt wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="7">7%</SelectItem>
                      <SelectItem value="19">19%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_35a_relevant} onCheckedChange={(c) => setForm({ ...form, is_35a_relevant: c })} />
                <Label className="cursor-pointer">§35a relevant</Label>
              </div>
            </div>

            <Separator />

            {/* === Section 4: Zeitraum & Intervall === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Zeitraum & Intervall
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Intervall</Label>
                  <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monatlich">Monatlich</SelectItem>
                      <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                      <SelectItem value="halbjaehrlich">Halbjährlich</SelectItem>
                      <SelectItem value="jaehrlich">Jährlich</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gültig ab</Label>
                  <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
                </div>
              </div>
            </div>

            <Separator />

            {/* === Section 5: Verknüpfte Rechnung === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Verknüpfte Rechnung
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                z.B. Abschlagsbescheid des Gaslieferanten als Nachweis für die monatlichen Zahlungen
              </p>
              <Popover open={invoiceOpen} onOpenChange={setInvoiceOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={invoiceOpen} className="w-full justify-between font-normal">
                    {form.linked_invoice_id
                      ? (() => {
                          const inv = invoices.find((i: any) => i.id === form.linked_invoice_id);
                          return inv ? `${inv.invoice_number || "Ohne Nr."} – ${inv.vendor_name || ""}` : "Rechnung wählen";
                        })()
                      : "Keine Rechnung verknüpft"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechnung suchen..." value={invoiceSearch} onValueChange={setInvoiceSearch} />
                    <CommandList>
                      <CommandEmpty>Keine Rechnung gefunden.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__none__" onSelect={() => { setForm({ ...form, linked_invoice_id: "" }); setInvoiceOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", !form.linked_invoice_id ? "opacity-100" : "opacity-0")} />
                          <span className="text-muted-foreground">Keine Verknüpfung</span>
                        </CommandItem>
                        {invoices.map((inv: any) => (
                          <CommandItem
                            key={inv.id}
                            value={`${inv.invoice_number || ""} ${inv.vendor_name || ""}`}
                            onSelect={() => { setForm({ ...form, linked_invoice_id: inv.id }); setInvoiceOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.linked_invoice_id === inv.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span className="text-sm">{inv.invoice_number || "Ohne Nr."} – {inv.vendor_name || "Unbekannt"}</span>
                              <span className="text-xs text-muted-foreground">
                                {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("de-DE") : ""} 
                                {inv.gross_amount != null ? ` · ${formatCurrency(inv.gross_amount)}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>{editingId ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preset Management Dialog */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPresetId ? "Muster bearbeiten" : "Neues Muster"}</DialogTitle>
            <DialogDescription>
              Muster dienen als Vorlage beim Anlegen neuer Buchungsvorlagen. Sie füllen Felder automatisch vor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={presetForm.name} onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })} placeholder="z.B. Stromabschlag" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Standard-Kreditor</Label>
                <Input value={presetForm.vendor_name} onChange={(e) => setPresetForm({ ...presetForm, vendor_name: e.target.value })} placeholder="z.B. Gemeinde" />
              </div>
              <div>
                <Label>Kategorie</Label>
                <Input value={presetForm.category} onChange={(e) => setPresetForm({ ...presetForm, category: e.target.value })} placeholder="z.B. Betriebskosten" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Intervall</Label>
                <Select value={presetForm.interval} onValueChange={(v) => setPresetForm({ ...presetForm, interval: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monatlich">Monatlich</SelectItem>
                    <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                    <SelectItem value="halbjährlich">Halbjährlich</SelectItem>
                    <SelectItem value="jährlich">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>MwSt-Satz (%)</Label>
                <Select value={presetForm.vat_rate || "__none__"} onValueChange={(v) => setPresetForm({ ...presetForm, vat_rate: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine</SelectItem>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="7">7%</SelectItem>
                    <SelectItem value="19">19%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={presetForm.is_35a_relevant} onCheckedChange={(v) => setPresetForm({ ...presetForm, is_35a_relevant: v })} />
              <Label className="text-sm">§35a relevant</Label>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Input value={presetForm.description} onChange={(e) => setPresetForm({ ...presetForm, description: e.target.value })} placeholder="Kurzbeschreibung" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresetDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSavePreset}>{editingPresetId ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
