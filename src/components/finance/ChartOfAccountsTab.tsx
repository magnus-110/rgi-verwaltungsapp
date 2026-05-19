import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountSettingsPopover } from "./AccountSettingsPopover";
import { useBuildingShareTypes } from "@/hooks/useBuildingShareTypes";
import { getShareTypeLabel } from "@/lib/shareTypes";
import { AlertTriangle } from "lucide-react";

const SETTLEMENT_SECTIONS = [
  { value: "none", label: "– Keine –" },
  { value: "income", label: "Einnahmen" },
  { value: "operating_distributable", label: "Umlagefähige Ausgaben" },
  { value: "operating_non_distributable", label: "Nicht umlagefähige Ausgaben" },
  { value: "heating_prepayment", label: "Heizkosten-Vorauszahlung (Durchlauf)" },
  { value: "accrual", label: "Abgrenzungen" },
  { value: "reserve", label: "Rücklage (IHR)" },
  { value: "reserve_withdrawal", label: "RL-Entnahme" },
  { value: "bank", label: "Bankkonto" },
  { value: "opening", label: "Eröffnungsbuchung" },
];

const SETTLEMENT_35A_TYPES = [
  { value: "none", label: "– Keine –" },
  { value: "dienste", label: "Haushaltsnahe Dienstleistungen" },
  { value: "handwerker", label: "Handwerkerleistungen" },
];

export function ChartOfAccountsTab() {
  const queryClient = useQueryClient();
  const invalidateAllCoa = () => {
    queryClient.invalidateQueries({ predicate: (q) => {
      const k = q.queryKey[0];
      return typeof k === "string" && (
        k.startsWith("chart-of-accounts") ||
        k.startsWith("coa-") ||
        k.startsWith("settlement-accounts") ||
        k.startsWith("settlement-bookings") ||
        k === "building-share-types"
      );
    }});
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDistKey, setEditDistKey] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("global");
  const [searchTerm, setSearchTerm] = useState("");
  const [newAccount, setNewAccount] = useState({
    account_number: "", account_name: "", category: "", default_distribution_key: "mea",
    is_35a_relevant: false, is_billing_relevant: false, is_heating_relevant: false,
    carry_forward_balance: false, is_wirtschaftsplan_relevant: false,
    is_distributable: false, settlement_section: null as string | null,
    settlement_35a_type: null as string | null, default_vat_rate: 19,
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance-coa"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", selectedBuilding],
    queryFn: async () => {
      let query = supabase.from("chart_of_accounts").select("*");
      if (selectedBuilding && selectedBuilding !== "global") {
        // Im Liegenschafts-View beide Quellen zeigen: globale Standardkonten
        // PLUS gebäudespezifische Konten (z. B. zusätzliche Rücklagen-"Töpfe" 1811–1814).
        query = query.or(`building_id.is.null,building_id.eq.${selectedBuilding}`);
      } else {
        query = query.is("building_id", null);
      }
      const { data, error } = await query.order("account_number", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filteredAccounts = accounts.filter(a => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return a.account_number.toLowerCase().includes(term) || a.account_name.toLowerCase().includes(term);
  });

  const categories = [...new Set(filteredAccounts.map(a => a.category))];

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const startEdit = (account: any) => {
    setEditingId(account.id);
    setEditName(account.account_name);
    setEditDistKey(account.default_distribution_key || "mea");
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").update({
      account_name: editName,
      default_distribution_key: editDistKey,
    }).eq("id", id);
    if (error) { toast.error("Fehler beim Speichern"); return; }
    toast.success("Konto aktualisiert");
    setEditingId(null);
    invalidateAllCoa();
  };

  const updateAccountField = async (id: string, field: string, value: any) => {
    const { error } = await supabase.from("chart_of_accounts").update({ [field]: value } as any).eq("id", id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    invalidateAllCoa();
  };

  const deleteAccount = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Konto gelöscht");
    invalidateAllCoa();
  };

  const addAccount = async () => {
    if (!newAccount.account_number || !newAccount.account_name || !newAccount.category) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const maxSort = Math.max(0, ...accounts.map(a => a.sort_order ?? 0));
    const buildingId = selectedBuilding && selectedBuilding !== "global" ? selectedBuilding : null;
    const { error } = await supabase.from("chart_of_accounts").insert({
      account_number: newAccount.account_number,
      account_name: newAccount.account_name,
      category: newAccount.category,
      default_distribution_key: newAccount.default_distribution_key,
      is_35a_relevant: newAccount.is_35a_relevant,
      is_billing_relevant: newAccount.is_billing_relevant,
      is_heating_relevant: newAccount.is_heating_relevant,
      carry_forward_balance: newAccount.carry_forward_balance,
      is_wirtschaftsplan_relevant: newAccount.is_wirtschaftsplan_relevant,
      is_distributable: newAccount.is_distributable,
      settlement_section: newAccount.settlement_section,
      settlement_35a_type: newAccount.settlement_35a_type,
      default_vat_rate: newAccount.default_vat_rate,
      building_id: buildingId,
      sort_order: maxSort + 1,
      is_system_account: false,
    } as any);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Konto hinzugefügt");
    setIsAddOpen(false);
    setNewAccount({
      account_number: "", account_name: "", category: "", default_distribution_key: "mea",
      is_35a_relevant: false, is_billing_relevant: false, is_heating_relevant: false,
      carry_forward_balance: false, is_wirtschaftsplan_relevant: false,
      is_distributable: false, settlement_section: null, settlement_35a_type: null, default_vat_rate: 19,
    });
    invalidateAllCoa();
  };

  // Verteilerschlüssel-Liste = exakt die Anteile, die im jeweiligen Gebäude
  // tatsächlich gepflegt sind. Für den globalen Tab nur Standard-Schlüssel.
  const buildingForShareTypes = selectedBuilding && selectedBuilding !== "global"
    ? selectedBuilding
    : undefined;
  const { options: shareTypeOptionsBase } = useBuildingShareTypes(buildingForShareTypes);
  // Beim Inline-Edit den aktuell gespeicherten Wert als Stale-Option ergänzen,
  // damit er sichtbar bleibt, falls er nicht mehr im Gebäude gepflegt ist.
  const { options: editShareTypeOptions } = useBuildingShareTypes(buildingForShareTypes, editDistKey);
  const allDistKeys = shareTypeOptionsBase;

  const getKeyLabel = (key: string | null) => getShareTypeLabel(key);

  if (isLoading) return <div className="text-muted-foreground p-4">Laden...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Kontenrahmen ({accounts.length} Konten)</CardTitle>
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Alle (global)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Alle (global)</SelectItem>
              {buildings.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.building_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Konto suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="space-y-2">
          {categories.map(cat => {
            const catAccounts = filteredAccounts.filter(a => a.category === cat);
            const collapsed = collapsedCategories.has(cat);
            return (
              <div key={cat} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center gap-2 p-3 bg-muted/50 hover:bg-muted text-left font-medium text-sm"
                >
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {cat}
                  <Badge variant="secondary" className="ml-auto text-xs">{catAccounts.length}</Badge>
                </button>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Konto-Nr.</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead className="w-[160px]">Verteilerschlüssel</TableHead>
                          <TableHead className="w-[70px] text-center">MwSt</TableHead>
                          <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catAccounts.map(account => (
                          <TableRow key={account.id}>
                            <TableCell className="font-mono text-xs">{account.account_number}</TableCell>
                            <TableCell>
                              {editingId === account.id ? (
                                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" autoFocus
                                  onKeyDown={e => e.key === "Enter" && saveEdit(account.id)} />
                              ) : (
                                <span className="text-sm">{account.account_name}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === account.id ? (
                                <Select value={editDistKey} onValueChange={setEditDistKey}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {editShareTypeOptions.map(k => (
                                      <SelectItem key={k.value} value={k.value}>
                                        {k.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-xs">{getKeyLabel(account.default_distribution_key)}</Badge>
                                  {(account as any).is_billing_relevant && !(account as any).settlement_section && (
                                    <span title="Konto ist als abrechnungsrelevant markiert, aber ohne Abrechnungssektion – wird in der Abrechnung nicht angezeigt.">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-xs text-muted-foreground">{(account as any).default_vat_rate ?? 19} %</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {editingId === account.id ? (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(account.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(account)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <AccountSettingsPopover
                                      account={account as any}
                                      onUpdate={(field, value) => updateAccountField(account.id, field, value)}
                                    />
                                    {!account.is_system_account && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => deleteAccount(account.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Neues Konto hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kontonummer *</Label>
                <Input value={newAccount.account_number} onChange={e => setNewAccount(p => ({ ...p, account_number: e.target.value }))} placeholder="z.B. 2000" />
              </div>
              <div>
                <Label>Kategorie *</Label>
                <Select value={newAccount.category} onValueChange={v => setNewAccount(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Bezeichnung *</Label>
              <Input value={newAccount.account_name} onChange={e => setNewAccount(p => ({ ...p, account_name: e.target.value }))} placeholder="Kontobezeichnung" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Standard-Verteilerschlüssel</Label>
                <Select value={newAccount.default_distribution_key} onValueChange={v => setNewAccount(p => ({ ...p, default_distribution_key: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allDistKeys.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Standard-MwSt</Label>
                <Select value={String(newAccount.default_vat_rate)} onValueChange={v => setNewAccount(p => ({ ...p, default_vat_rate: parseFloat(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 %</SelectItem>
                    <SelectItem value="7">7 %</SelectItem>
                    <SelectItem value="19">19 %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Abrechnungssektion</Label>
                <Select value={newAccount.settlement_section || "none"} onValueChange={v => setNewAccount(p => ({ ...p, settlement_section: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>§35a Typ</Label>
                <Select value={newAccount.settlement_35a_type || "none"} onValueChange={v => setNewAccount(p => ({ ...p, settlement_35a_type: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_35A_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_distributable} onCheckedChange={c => setNewAccount(p => ({ ...p, is_distributable: !!c }))} />
                <Label className="text-xs">Verteilungsrel.</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_billing_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_billing_relevant: !!c }))} />
                <Label className="text-xs">Abrechnung</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_35a_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_35a_relevant: !!c }))} />
                <Label className="text-xs">§35a</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_heating_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_heating_relevant: !!c }))} />
                <Label className="text-xs">HK</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.carry_forward_balance} onCheckedChange={c => setNewAccount(p => ({ ...p, carry_forward_balance: !!c }))} />
                <Label className="text-xs">Saldovortrag</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_wirtschaftsplan_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_wirtschaftsplan_relevant: !!c }))} />
                <Label className="text-xs">WP</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Abbrechen</Button>
            <Button onClick={addAccount}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
