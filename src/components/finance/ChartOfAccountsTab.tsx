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
  const [newAccount, setNewAccount] = useState({ account_number: "", account_name: "", category: "", default_distribution_key: "mea", is_35a_relevant: false });

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

  const startEdit = (account: any) => {
    setEditingId(account.id);
    setEditName(account.account_name);
    setEditDistKey(account.default_distribution_key || "mea");
    setEdit35a(account.is_35a_relevant || false);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").update({
      account_name: editName,
      default_distribution_key: editDistKey,
      is_35a_relevant: edit35a,
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
      ...newAccount,
      building_id: buildingId,
      sort_order: maxSort + 1,
      is_system_account: false,
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Konto hinzugefügt");
    setIsAddOpen(false);
    setNewAccount({ account_number: "", account_name: "", category: "", default_distribution_key: "mea", is_35a_relevant: false });
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
  };

  const getKeyLabel = (key: string | null) => DISTRIBUTION_KEYS.find(k => k.value === key)?.label || key || "–";

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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Konto-Nr.</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead className="w-[180px]">Verteilerschlüssel</TableHead>
                        <TableHead className="w-[80px] text-center">§35a</TableHead>
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
                          <TableCell className="text-center">
                            {editingId === account.id ? (
                              <Checkbox checked={edit35a} onCheckedChange={c => setEdit35a(!!c)} />
                            ) : (
                              account.is_35a_relevant && <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">§35a</Badge>
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
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
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
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={newAccount.is_35a_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_35a_relevant: !!c }))} />
                  <Label>§35a relevant</Label>
                </div>
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
