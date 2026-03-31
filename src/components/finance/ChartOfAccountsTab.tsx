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

const DISTRIBUTION_KEYS = [
  { value: "mea", label: "MEA" },
  { value: "personen", label: "Nach Personen" },
  { value: "einheiten", label: "Nach Einheiten" },
  { value: "verbrauch_wasser", label: "Verbrauch Wasser" },
  { value: "heizkostenverordnung", label: "Heizkostenverordnung" },
  { value: "direkt", label: "Direktzuordnung" },
  { value: "qm", label: "Nach Quadratmeter" },
];

const SETTLEMENT_SECTIONS = [
  { value: "none", label: "– Keine –" },
  { value: "income", label: "Einnahmen" },
  { value: "operating_distributable", label: "Umlagefähige Ausgaben" },
  { value: "operating_non_distributable", label: "Nicht umlagefähige Ausgaben" },
  { value: "accrual", label: "Abgrenzungen" },
  { value: "reserve", label: "Rücklage (IHR)" },
  { value: "reserve_withdrawal", label: "RL-Entnahme" },
  { value: "bank", label: "Bankkonto" },
];

const SETTLEMENT_35A_TYPES = [
  { value: "none", label: "– Keine –" },
  { value: "dienste", label: "Haushaltsnahe Dienstleistungen" },
  { value: "handwerker", label: "Handwerkerleistungen" },
];

export function ChartOfAccountsTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDistKey, setEditDistKey] = useState("");
  const [edit35a, setEdit35a] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("global");
  const [searchTerm, setSearchTerm] = useState("");
  const [newAccount, setNewAccount] = useState({
    account_number: "", account_name: "", category: "", default_distribution_key: "mea",
    is_35a_relevant: false, is_billing_relevant: false, is_heating_relevant: false,
    carry_forward_balance: false, is_wirtschaftsplan_relevant: false,
    is_distributable: false, settlement_section: null as string | null,
    settlement_35a_type: null as string | null,
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
        query = query.eq("building_id", selectedBuilding);
      } else {
        query = query.is("building_id", null);
      }
      const { data, error } = await query.order("sort_order", { ascending: true });
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

  const [editBillingRelevant, setEditBillingRelevant] = useState(false);
  const [editHeatingRelevant, setEditHeatingRelevant] = useState(false);
  const [editCarryForward, setEditCarryForward] = useState(false);
  const [editWpRelevant, setEditWpRelevant] = useState(false);
  const [editDistributable, setEditDistributable] = useState(false);
  const [editSettlementSection, setEditSettlementSection] = useState<string>("none");
  const [editSettlement35aType, setEditSettlement35aType] = useState<string>("none");

  const startEdit = (account: any) => {
    setEditingId(account.id);
    setEditName(account.account_name);
    setEditDistKey(account.default_distribution_key || "mea");
    setEdit35a(account.is_35a_relevant || false);
    setEditBillingRelevant(account.is_billing_relevant || false);
    setEditHeatingRelevant(account.is_heating_relevant || false);
    setEditCarryForward(account.carry_forward_balance || false);
    setEditWpRelevant(account.is_wirtschaftsplan_relevant || false);
    setEditDistributable(account.is_distributable || false);
    setEditSettlementSection(account.settlement_section || "none");
    setEditSettlement35aType(account.settlement_35a_type || "none");
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").update({
      account_name: editName,
      default_distribution_key: editDistKey,
      is_35a_relevant: edit35a,
      is_billing_relevant: editBillingRelevant,
      is_heating_relevant: editHeatingRelevant,
      carry_forward_balance: editCarryForward,
      is_wirtschaftsplan_relevant: editWpRelevant,
      is_distributable: editDistributable,
      settlement_section: editSettlementSection === "none" ? null : editSettlementSection,
      settlement_35a_type: editSettlement35aType === "none" ? null : editSettlement35aType,
    }).eq("id", id);
    if (error) { toast.error("Fehler beim Speichern"); return; }
    toast.success("Konto aktualisiert");
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
  };

  const deleteAccount = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Konto gelöscht");
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
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
      building_id: buildingId,
      sort_order: maxSort + 1,
      is_system_account: false,
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Konto hinzugefügt");
    setIsAddOpen(false);
    setNewAccount({
      account_number: "", account_name: "", category: "", default_distribution_key: "mea",
      is_35a_relevant: false, is_billing_relevant: false, is_heating_relevant: false,
      carry_forward_balance: false, is_wirtschaftsplan_relevant: false,
      is_distributable: false, settlement_section: null, settlement_35a_type: null,
    });
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
  };

  const getKeyLabel = (key: string | null) => DISTRIBUTION_KEYS.find(k => k.value === key)?.label || key || "–";
  const getSectionLabel = (section: string | null) => SETTLEMENT_SECTIONS.find(s => s.value === section)?.label || "–";
  const get35aTypeLabel = (type: string | null) => SETTLEMENT_35A_TYPES.find(t => t.value === type)?.label || "–";

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
                          <TableHead className="w-[160px]">Abr.-Sektion</TableHead>
                          <TableHead className="w-[50px] text-center" title="Verteilungsrelevant">VR</TableHead>
                          <TableHead className="w-[50px] text-center" title="§35a Typ">§35a</TableHead>
                          <TableHead className="w-[50px] text-center" title="Abrechnungsrelevant">Abr.</TableHead>
                          <TableHead className="w-[40px] text-center" title="Heizkosten-relevant">HK</TableHead>
                          <TableHead className="w-[40px] text-center" title="Saldovortrag">SV</TableHead>
                          <TableHead className="w-[40px] text-center" title="Wirtschaftsplan-relevant">WP</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
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
                                    {DISTRIBUTION_KEYS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="outline" className="text-xs">{getKeyLabel(account.default_distribution_key)}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === account.id ? (
                                <Select value={editSettlementSection} onValueChange={setEditSettlementSection}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SETTLEMENT_SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                account.settlement_section && (
                                  <Badge variant="outline" className="text-xs">{getSectionLabel(account.settlement_section)}</Badge>
                                )
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Checkbox checked={editDistributable} onCheckedChange={c => setEditDistributable(!!c)} />
                              ) : (
                                account.is_distributable && <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">VR</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Select value={editSettlement35aType} onValueChange={setEditSettlement35aType}>
                                  <SelectTrigger className="h-7 text-xs w-20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SETTLEMENT_35A_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                account.settlement_35a_type && (
                                  <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">
                                    {account.settlement_35a_type === "dienste" ? "DL" : "HW"}
                                  </Badge>
                                )
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Checkbox checked={editBillingRelevant} onCheckedChange={c => setEditBillingRelevant(!!c)} />
                              ) : (
                                account.is_billing_relevant && <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">Abr.</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Checkbox checked={editHeatingRelevant} onCheckedChange={c => setEditHeatingRelevant(!!c)} />
                              ) : (
                                account.is_heating_relevant && <Badge className="text-xs bg-orange-100 text-orange-800 hover:bg-orange-100">HK</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Checkbox checked={editCarryForward} onCheckedChange={c => setEditCarryForward(!!c)} />
                              ) : (
                                account.carry_forward_balance && <Badge className="text-xs bg-purple-100 text-purple-800 hover:bg-purple-100">SV</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {editingId === account.id ? (
                                <Checkbox checked={editWpRelevant} onCheckedChange={c => setEditWpRelevant(!!c)} />
                              ) : (
                                account.is_wirtschaftsplan_relevant && <Badge className="text-xs bg-teal-100 text-teal-800 hover:bg-teal-100">WP</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === account.id ? (
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(account.id)}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(account)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  {!account.is_system_account && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => deleteAccount(account.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
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
                    {DISTRIBUTION_KEYS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Abrechnungssektion</Label>
                <Select value={newAccount.settlement_section || "none"} onValueChange={v => setNewAccount(p => ({ ...p, settlement_section: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_SECTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>§35a Typ</Label>
                <Select value={newAccount.settlement_35a_type || "none"} onValueChange={v => setNewAccount(p => ({ ...p, settlement_35a_type: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETTLEMENT_35A_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-3 pb-2">
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={newAccount.is_distributable} onCheckedChange={c => setNewAccount(p => ({ ...p, is_distributable: !!c }))} />
                  <Label className="text-xs">Verteilungsrel.</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={newAccount.is_billing_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_billing_relevant: !!c }))} />
                  <Label className="text-xs">Abrechnung</Label>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_35a_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_35a_relevant: !!c }))} />
                <Label>§35a</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_heating_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_heating_relevant: !!c }))} />
                <Label>HK-relevant</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.carry_forward_balance} onCheckedChange={c => setNewAccount(p => ({ ...p, carry_forward_balance: !!c }))} />
                <Label>Saldovortrag</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_wirtschaftsplan_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_wirtschaftsplan_relevant: !!c }))} />
                <Label>WP-relevant</Label>
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
