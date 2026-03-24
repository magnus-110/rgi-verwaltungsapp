import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

const DISTRIBUTION_KEYS = [
  { value: "mea", label: "MEA" },
  { value: "personen", label: "Nach Personen" },
  { value: "einheiten", label: "Nach Einheiten" },
  { value: "verbrauch_wasser", label: "Verbrauch Wasser" },
  { value: "heizkostenverordnung", label: "Heizkostenverordnung" },
  { value: "direkt", label: "Direktzuordnung" },
  { value: "qm", label: "Nach Quadratmeter" },
];

export function DistributionKeysTab() {
  const queryClient = useQueryClient();
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["chart-of-accounts-dist", selectedBuilding],
    queryFn: async () => {
      let query = supabase.from("chart_of_accounts").select("*");
      if (selectedBuilding) {
        query = query.or(`building_id.is.null,building_id.eq.${selectedBuilding}`);
      } else {
        query = query.is("building_id", null);
      }
      const { data, error } = await query.order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["building-account-overrides", selectedBuilding],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const { data, error } = await supabase.from("building_account_overrides").select("*").eq("building_id", selectedBuilding);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuilding,
  });

  const overrideMap = new Map(overrides.map(o => [o.account_id, o]));
  const categories = [...new Set(accounts.map(a => a.category))];

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleOverride = async (accountId: string, key: string, defaultKey: string | null) => {
    if (key === (defaultKey || "")) {
      // Remove override if set back to default
      const existing = overrideMap.get(accountId);
      if (existing) {
        await supabase.from("building_account_overrides").delete().eq("id", existing.id);
      }
    } else {
      await supabase.from("building_account_overrides").upsert({
        building_id: selectedBuilding,
        account_id: accountId,
        distribution_key: key,
      }, { onConflict: "building_id,account_id" });
    }
    toast.success("Verteilerschlüssel aktualisiert");
    queryClient.invalidateQueries({ queryKey: ["building-account-overrides", selectedBuilding] });
  };

  const getKeyLabel = (key: string | null) => DISTRIBUTION_KEYS.find(k => k.value === key)?.label || key || "–";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Verteilerschlüssel pro Liegenschaft</CardTitle>
        <div className="mt-2">
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Liegenschaft auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {buildings.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.building_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedBuilding ? (
          <div className="text-muted-foreground text-sm text-center py-8">
            Bitte wählen Sie eine Liegenschaft aus, um die Verteilerschlüssel zu konfigurieren.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Konto suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-2">
            {categories.map(cat => {
              const catAccounts = accounts.filter(a => a.category === cat).filter(a => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return a.account_number.toLowerCase().includes(term) || a.account_name.toLowerCase().includes(term);
              });
              if (catAccounts.length === 0) return null;
              const collapsed = collapsedCategories.has(cat);
              const overrideCount = catAccounts.filter(a => overrideMap.has(a.id)).length;
              return (
                <div key={cat} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center gap-2 p-3 bg-muted/50 hover:bg-muted text-left font-medium text-sm"
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {cat}
                    {overrideCount > 0 && (
                      <Badge className="ml-2 text-xs bg-primary/10 text-primary hover:bg-primary/10">{overrideCount} angepasst</Badge>
                    )}
                  </button>
                  {!collapsed && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Konto-Nr.</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead className="w-[180px]">Standard</TableHead>
                          <TableHead className="w-[220px]">Aktueller Schlüssel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catAccounts.map(account => {
                          const override = overrideMap.get(account.id);
                          const currentKey = override?.distribution_key || account.default_distribution_key;
                          const isOverridden = !!override;
                          return (
                            <TableRow key={account.id} className={isOverridden ? "bg-primary/5" : ""}>
                              <TableCell className="font-mono text-xs">{account.account_number}</TableCell>
                              <TableCell className="text-sm">{account.account_name}</TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{getKeyLabel(account.default_distribution_key)}</span>
                              </TableCell>
                              <TableCell>
                                <Select value={currentKey || ""} onValueChange={v => handleOverride(account.id, v, account.default_distribution_key)}>
                                  <SelectTrigger className={`h-8 text-xs ${isOverridden ? "border-primary" : ""}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DISTRIBUTION_KEYS.map(k => (
                                      <SelectItem key={k.value} value={k.value}>
                                        {k.label} {k.value === account.default_distribution_key ? "(Standard)" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
