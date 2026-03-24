import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from "lucide-react";

const DISTRIBUTION_KEYS = [
  { value: "mea", label: "MEA" },
  { value: "personen", label: "Nach Personen" },
  { value: "einheiten", label: "Nach Einheiten" },
  { value: "verbrauch_wasser", label: "Verbrauch Wasser" },
  { value: "heizkostenverordnung", label: "Heizkostenverordnung" },
  { value: "direkt", label: "Direktzuordnung" },
  { value: "qm", label: "Nach Quadratmeter" },
];

interface Props {
  buildingId: string;
}

export function BuildingDistributionKeysTab({ buildingId }: Props) {
  const queryClient = useQueryClient();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newAccount, setNewAccount] = useState({ account_number: "", account_name: "", category: "", default_distribution_key: "mea", is_35a_relevant: false });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["building-account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("building_account_overrides").select("*").eq("building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  const overrideMap = new Map(overrides.map(o => [o.account_id, o]));
  
  // Collect custom distribution keys from overrides that aren't in DISTRIBUTION_KEYS
  const customDistKeys = [...new Set(
    overrides
      .map(o => o.distribution_key)
      .filter(k => k && !DISTRIBUTION_KEYS.some(dk => dk.value === k))
  )];
  const allDistKeys = [...DISTRIBUTION_KEYS, ...customDistKeys.map(k => ({ value: k, label: k }))];
  const categories = [...new Set(accounts.map(a => a.category))];
  const overrideCount = overrides.length;
  const buildingAccountCount = accounts.filter(a => (a as any).building_id === buildingId).length;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleOverride = async (accountId: string, key: string, defaultKey: string | null) => {
    if (key === (defaultKey || "")) {
      const existing = overrideMap.get(accountId);
      if (existing) {
        await supabase.from("building_account_overrides").delete().eq("id", existing.id);
      }
    } else {
      await supabase.from("building_account_overrides").upsert({
        building_id: buildingId,
        account_id: accountId,
        distribution_key: key,
      }, { onConflict: "building_id,account_id" });
    }
    toast.success("Verteilerschlüssel aktualisiert");
    queryClient.invalidateQueries({ queryKey: ["building-account-overrides", buildingId] });
  };

  const addBuildingAccount = async () => {
    if (!newAccount.account_number || !newAccount.account_name || !newAccount.category) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    const maxSort = Math.max(0, ...accounts.map(a => a.sort_order ?? 0));
    const { error } = await supabase.from("chart_of_accounts").insert({
      ...newAccount,
      building_id: buildingId,
      sort_order: maxSort + 1,
      is_system_account: false,
    });
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Liegenschaftskonto hinzugefügt");
    setIsAddOpen(false);
    setNewAccount({ account_number: "", account_name: "", category: "", default_distribution_key: "mea", is_35a_relevant: false });
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-building", buildingId] });
  };

  const deleteBuildingAccount = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Konto gelöscht");
    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts-building", buildingId] });
  };

  const [customKeyInput, setCustomKeyInput] = useState<string | null>(null);
  const [customKeyAccountId, setCustomKeyAccountId] = useState<string | null>(null);

  const getKeyLabel = (key: string | null) => allDistKeys.find(k => k.value === key)?.label || key || "–";

  if (isLoading) return <div className="text-muted-foreground text-sm">Laden...</div>;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Verteilerschlüssel</CardTitle>
            <div className="flex items-center gap-2">
              {overrideCount > 0 && (
                <Badge variant="secondary" className="text-xs">{overrideCount} angepasst</Badge>
              )}
              {buildingAccountCount > 0 && (
                <Badge className="text-xs bg-accent text-accent-foreground">{buildingAccountCount} eigene Konten</Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Individuelle Verteilerschlüssel und eigene Konten für diese Liegenschaft.
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Konto suchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-2">
            {categories.map(cat => {
              const catAccounts = accounts.filter(a => a.category === cat).filter(a => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return a.account_number.toLowerCase().includes(term) || a.account_name.toLowerCase().includes(term);
              });
              const collapsed = collapsedCategories.has(cat);
              if (catAccounts.length === 0) return null;
              const catOverrides = catAccounts.filter(a => overrideMap.has(a.id)).length;
              const catBuildingAccounts = catAccounts.filter(a => (a as any).building_id === buildingId).length;
              return (
                <div key={cat} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center gap-2 p-3 bg-muted/50 hover:bg-muted text-left font-medium text-sm"
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {cat}
                    {catOverrides > 0 && (
                      <Badge className="ml-2 text-xs bg-primary/10 text-primary hover:bg-primary/10">{catOverrides} angepasst</Badge>
                    )}
                    {catBuildingAccounts > 0 && (
                      <Badge className="ml-1 text-xs bg-accent text-accent-foreground">{catBuildingAccounts} eigene</Badge>
                    )}
                    <Badge variant="secondary" className="ml-auto text-xs">{catAccounts.length}</Badge>
                  </button>
                  {!collapsed && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Konto</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead className="w-[150px]">Standard</TableHead>
                          <TableHead className="w-[200px]">Aktuell</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catAccounts.map(account => {
                          const override = overrideMap.get(account.id);
                          const currentKey = override?.distribution_key || account.default_distribution_key;
                          const isOverridden = !!override;
                          const isBuildingAccount = (account as any).building_id === buildingId;
                          return (
                            <TableRow key={account.id} className={isBuildingAccount ? "bg-accent/10" : isOverridden ? "bg-primary/5" : ""}>
                              <TableCell className="font-mono text-xs">
                                {account.account_number}
                                {isBuildingAccount && (
                                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Eigenes</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{account.account_name}</TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{getKeyLabel(account.default_distribution_key)}</span>
                              </TableCell>
                              <TableCell>
                                {customKeyAccountId === account.id ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      autoFocus
                                      placeholder="Schlüssel eingeben"
                                      value={customKeyInput || ""}
                                      onChange={e => setCustomKeyInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter" && customKeyInput) {
                                          handleOverride(account.id, customKeyInput, account.default_distribution_key);
                                          setCustomKeyAccountId(null);
                                          setCustomKeyInput(null);
                                        }
                                      }}
                                      className="h-8 text-xs w-32"
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                                      if (customKeyInput) {
                                        handleOverride(account.id, customKeyInput, account.default_distribution_key);
                                      }
                                      setCustomKeyAccountId(null);
                                      setCustomKeyInput(null);
                                    }}>✓</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                                      setCustomKeyAccountId(null);
                                      setCustomKeyInput(null);
                                    }}>✕</Button>
                                  </div>
                                ) : (
                                <Select value={currentKey || ""} onValueChange={v => {
                                  if (v === "__add__") {
                                    setCustomKeyAccountId(account.id);
                                    setCustomKeyInput("");
                                  } else {
                                    handleOverride(account.id, v, account.default_distribution_key);
                                  }
                                }}>
                                  <SelectTrigger className={`h-8 text-xs ${isOverridden ? "border-primary" : ""}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allDistKeys.map(k => (
                                      <SelectItem key={k.value} value={k.value}>
                                        {k.label} {k.value === account.default_distribution_key ? "(Standard)" : ""}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__add__" className="text-primary font-medium">+ Hinzufügen</SelectItem>
                                  </SelectContent>
                                </Select>
                                )}
                              </TableCell>
                              <TableCell>
                                {isBuildingAccount && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteBuildingAccount(account.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liegenschaftskonto hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kontonummer *</Label>
                <Input value={newAccount.account_number} onChange={e => setNewAccount(p => ({ ...p, account_number: e.target.value }))} placeholder="z.B. H001" />
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
              <Input value={newAccount.account_name} onChange={e => setNewAccount(p => ({ ...p, account_name: e.target.value }))} placeholder="z.B. Hausgeld Eigentümer" />
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
            <Button onClick={addBuildingAccount}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
