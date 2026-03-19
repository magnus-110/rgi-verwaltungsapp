import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ account_number: "", account_name: "", category: "", default_distribution_key: "mea", is_35a_relevant: false });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .is("building_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const categories = [...new Set(accounts.map(a => a.category))];

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").update({ account_name: editName }).eq("id", id);
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
    const { error } = await supabase.from("chart_of_accounts").insert({
      ...newAccount,
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
        <div className="space-y-2">
          {categories.map(cat => {
            const catAccounts = accounts.filter(a => a.category === cat);
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
                              <div className="flex items-center gap-1">
                                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" autoFocus
                                  onKeyDown={e => e.key === "Enter" && saveEdit(account.id)} />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(account.id)}>
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm">{account.account_name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getKeyLabel(account.default_distribution_key)}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {account.is_35a_relevant && <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">§35a</Badge>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(account.id, account.account_name)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {!account.is_system_account && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => deleteAccount(account.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
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
