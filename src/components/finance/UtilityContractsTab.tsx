import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Flame, Zap, Droplets, Thermometer, Pencil, Trash2 } from "lucide-react";

const UTILITY_TYPES = [
  { value: "gas", label: "Gas", icon: Flame, color: "text-orange-500" },
  { value: "strom", label: "Strom", icon: Zap, color: "text-yellow-500" },
  { value: "wasser", label: "Wasser", icon: Droplets, color: "text-blue-500" },
  { value: "fernwaerme", label: "Fernwärme", icon: Thermometer, color: "text-red-500" },
];

interface Props {
  buildingId: string;
}

export function UtilityContractsTab({ buildingId }: Props) {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor_name: "",
    vendor_iban: "",
    utility_type: "gas" as string,
    contract_number: "",
    meter_number: "",
    installment_amount: "",
    installment_interval: "monatlich",
    notes: "",
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["utility-contracts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("utility_contracts")
        .select("*, prepay_account:prepayment_account_id(account_number, account_name), expense_account:expense_account_id(account_number, account_name)")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-for-contracts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  const [prepaymentAccountId, setPrepaymentAccountId] = useState<string>("");
  const [expenseAccountId, setExpenseAccountId] = useState<string>("");

  const resetForm = () => {
    setForm({ vendor_name: "", vendor_iban: "", utility_type: "gas", contract_number: "", meter_number: "", installment_amount: "", installment_interval: "monatlich", notes: "" });
    setPrepaymentAccountId("");
    setExpenseAccountId("");
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.vendor_name) { toast.error("Lieferant erforderlich"); return; }

    const payload: any = {
      building_id: buildingId,
      vendor_name: form.vendor_name,
      vendor_iban: form.vendor_iban || null,
      utility_type: form.utility_type,
      contract_number: form.contract_number || null,
      meter_number: form.meter_number || null,
      installment_amount: form.installment_amount ? parseFloat(form.installment_amount) : null,
      installment_interval: form.installment_interval,
      prepayment_account_id: prepaymentAccountId || null,
      expense_account_id: expenseAccountId || null,
      notes: form.notes || null,
    };

    if (editingId) {
      const { error } = await supabase.from("utility_contracts").update(payload).eq("id", editingId);
      if (error) { toast.error("Fehler: " + error.message); return; }
      toast.success("Vertrag aktualisiert");
    } else {
      const { error } = await supabase.from("utility_contracts").insert(payload);
      if (error) { toast.error("Fehler: " + error.message); return; }
      toast.success("Vertrag angelegt");
    }

    setIsAddOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["utility-contracts", buildingId] });
  };

  const handleEdit = (contract: any) => {
    setForm({
      vendor_name: contract.vendor_name || "",
      vendor_iban: contract.vendor_iban || "",
      utility_type: contract.utility_type || "gas",
      contract_number: contract.contract_number || "",
      meter_number: contract.meter_number || "",
      installment_amount: contract.installment_amount?.toString() || "",
      installment_interval: contract.installment_interval || "monatlich",
      notes: contract.notes || "",
    });
    setPrepaymentAccountId(contract.prepayment_account_id || "");
    setExpenseAccountId(contract.expense_account_id || "");
    setEditingId(contract.id);
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("utility_contracts").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Vertrag gelöscht");
    queryClient.invalidateQueries({ queryKey: ["utility-contracts", buildingId] });
  };

  const getUtilityInfo = (type: string) => UTILITY_TYPES.find(u => u.value === type) || UTILITY_TYPES[0];

  if (isLoading) return <div className="text-muted-foreground text-sm">Laden...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Versorgungsverträge</h3>
          <p className="text-xs text-muted-foreground">Gas, Strom, Wasser & Fernwärme — Abschlagspläne und Jahresabrechnungen</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Vertrag hinzufügen
        </Button>
      </div>

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p className="text-sm">Noch keine Versorgungsverträge angelegt.</p>
            <p className="text-xs mt-1">Verträge werden auch automatisch aus erkannten Abschlagsrechnungen erstellt.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead>
                <TableHead>Lieferant</TableHead>
                <TableHead>Vertragsnr.</TableHead>
                <TableHead>Zähler</TableHead>
                <TableHead className="text-right">Abschlag</TableHead>
                <TableHead>Intervall</TableHead>
                <TableHead>Vorauszahlungskonto</TableHead>
                <TableHead>Aufwandskonto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract: any) => {
                const info = getUtilityInfo(contract.utility_type);
                const Icon = info.icon;
                return (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${info.color}`} />
                        <span className="text-sm">{info.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{contract.vendor_name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{contract.contract_number || "–"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{contract.meter_number || "–"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {contract.installment_amount ? `${Number(contract.installment_amount).toFixed(2)} €` : "–"}
                    </TableCell>
                    <TableCell className="text-xs">{contract.installment_interval || "–"}</TableCell>
                    <TableCell className="text-xs">
                      {contract.prepay_account ? `${contract.prepay_account.account_number} ${contract.prepay_account.account_name}` : "–"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {contract.expense_account ? `${contract.expense_account.account_number} ${contract.expense_account.account_name}` : "–"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={contract.status === "active" ? "default" : "secondary"} className="text-xs">
                        {contract.status === "active" ? "Aktiv" : "Geschlossen"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(contract)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(contract.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={(o) => { if (!o) { resetForm(); } setIsAddOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Vertrag bearbeiten" : "Neuer Versorgungsvertrag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Versorgungsart *</Label>
                <Select value={form.utility_type} onValueChange={v => setForm(p => ({ ...p, utility_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UTILITY_TYPES.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lieferant *</Label>
                <Input value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="z.B. Stadtwerke" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IBAN</Label>
                <Input value={form.vendor_iban} onChange={e => setForm(p => ({ ...p, vendor_iban: e.target.value }))} placeholder="DE..." />
              </div>
              <div>
                <Label>Vertragsnummer</Label>
                <Input value={form.contract_number} onChange={e => setForm(p => ({ ...p, contract_number: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Abschlagsbetrag (€)</Label>
                <Input type="number" step="0.01" value={form.installment_amount} onChange={e => setForm(p => ({ ...p, installment_amount: e.target.value }))} />
              </div>
              <div>
                <Label>Intervall</Label>
                <Select value={form.installment_interval} onValueChange={v => setForm(p => ({ ...p, installment_interval: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monatlich">Monatlich</SelectItem>
                    <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                    <SelectItem value="jaehrlich">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zählernummer</Label>
                <Input value={form.meter_number} onChange={e => setForm(p => ({ ...p, meter_number: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vorauszahlungskonto</Label>
                <Select value={prepaymentAccountId} onValueChange={setPrepaymentAccountId}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Konto wählen..." /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">{a.account_number} {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aufwandskonto</Label>
                <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Konto wählen..." /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">{a.account_number} {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optionale Hinweise..." className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setIsAddOpen(false); }}>Abbrechen</Button>
            <Button onClick={handleSave}>{editingId ? "Speichern" : "Anlegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
