import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Pencil, Trash2, LayoutTemplate, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TemplateForm {
  name: string;
  vendor_name: string;
  vendor_iban: string;
  expected_amount: string;
  account_id: string;
  building_id: string;
  is_35a_relevant: boolean;
  interval: string;
  category: string;
  description: string;
}

const emptyForm: TemplateForm = {
  name: "",
  vendor_name: "",
  vendor_iban: "",
  expected_amount: "",
  account_id: "",
  building_id: "",
  is_35a_relevant: false,
  interval: "monatlich",
  category: "",
  description: "",
};

export function BookingTemplatesTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [accountOpen, setAccountOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["booking-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_templates")
        .select("*, buildings(name), chart_of_accounts(account_number, account_name)")
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

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      name: t.name || "",
      vendor_name: t.vendor_name || "",
      vendor_iban: t.vendor_iban || "",
      expected_amount: t.expected_amount?.toString() || "",
      account_id: t.account_id || "",
      building_id: t.building_id || "",
      is_35a_relevant: t.is_35a_relevant || false,
      interval: t.interval || "monatlich",
      category: t.category || "",
      description: t.description || "",
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
      account_id: form.account_id || null,
      building_id: form.building_id || null,
      is_35a_relevant: form.is_35a_relevant,
      interval: form.interval,
      category: form.category || null,
      description: form.description || null,
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Buchungsvorlagen</CardTitle>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Vorlage
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Buchungsvorlagen angelegt</p>
              <p className="text-sm mt-1">Vorlagen werden beim Kontoauszug-Import automatisch abgeglichen</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Liegenschaft</TableHead>
                  <TableHead>Kreditor</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm">{t.buildings?.name || "–"}</TableCell>
                    <TableCell className="text-sm">{t.vendor_name || "–"}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{t.vendor_iban || "–"}</TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {t.expected_amount ? `${Number(t.expected_amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.chart_of_accounts ? `${t.chart_of_accounts.account_number} ${t.chart_of_accounts.account_name}` : "–"}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{t.interval || "–"}</TableCell>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Vorlage bearbeiten" : "Neue Buchungsvorlage"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Hausgeld Eingang" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kreditor/Name</Label>
                <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
              </div>
              <div>
                <Label>IBAN</Label>
                <Input value={form.vendor_iban} onChange={(e) => setForm({ ...form, vendor_iban: e.target.value })} placeholder="DE..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Erwarteter Betrag</Label>
                <Input type="number" step="0.01" value={form.expected_amount} onChange={(e) => setForm({ ...form, expected_amount: e.target.value })} />
              </div>
              <div>
                <Label>Intervall</Label>
                <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monatlich">Monatlich</SelectItem>
                    <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                    <SelectItem value="jaehrlich">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                    <CommandInput placeholder="Konto suchen (Nr. oder Name)..." value={accountSearch} onValueChange={setAccountSearch} />
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
            <div className="flex items-center gap-2">
              <Switch checked={form.is_35a_relevant} onCheckedChange={(c) => setForm({ ...form, is_35a_relevant: c })} />
              <Label>§35a relevant</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>{editingId ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
