import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts").select("*").order("sort_order");
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
  const categories = [...new Set(accounts.map(a => a.category))];
  const overrideCount = overrides.length;

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

  const getKeyLabel = (key: string | null) => DISTRIBUTION_KEYS.find(k => k.value === key)?.label || key || "–";

  if (isLoading) return <div className="text-muted-foreground text-sm">Laden...</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Verteilerschlüssel</CardTitle>
          {overrideCount > 0 && (
            <Badge variant="secondary" className="text-xs">{overrideCount} angepasst</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Individuelle Verteilerschlüssel für diese Liegenschaft. Nicht geänderte Konten verwenden den Standard.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {categories.map(cat => {
            const catAccounts = accounts.filter(a => a.category === cat);
            const collapsed = collapsedCategories.has(cat);
            const catOverrides = catAccounts.filter(a => overrideMap.has(a.id)).length;
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
      </CardContent>
    </Card>
  );
}
