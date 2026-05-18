import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookingInstructionsSection } from "@/components/buildings/BookingInstructionsSection";
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
import { ChevronDown, ChevronRight, Plus, Search, Trash2, Pencil, Check, X } from "lucide-react";
import { AccountSettingsPopover } from "./AccountSettingsPopover";
import { useBuildingShareTypes } from "@/hooks/useBuildingShareTypes";
import { getShareTypeLabel } from "@/lib/shareTypes";

const SETTLEMENT_SECTIONS = [
  { value: "none", label: "– Keine –" },
  { value: "income", label: "Einnahmen" },
  { value: "operating_distributable", label: "Umlagefähige Ausgaben" },
  { value: "operating_non_distributable", label: "Nicht umlagefähig" },
  { value: "heating_prepayment", label: "Heizkosten-Vorauszahlung (Durchlauf)" },
  { value: "accrual", label: "Abgrenzungen" },
  { value: "reserve", label: "Rücklage (IHR)" },
  { value: "reserve_withdrawal", label: "RL-Entnahme" },
  { value: "bank", label: "Bankkonto" },
  { value: "opening", label: "Eröffnungsbuchung" },
];

const SETTLEMENT_35A_TYPES = [
  { value: "none", label: "– Keine –" },
  { value: "dienste", label: "Dienstleistungen" },
  { value: "handwerker", label: "Handwerker" },
];

interface Props {
  buildingId: string;
}

export function BuildingDistributionKeysTab({ buildingId }: Props) {
  const queryClient = useQueryClient();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newAccount, setNewAccount] = useState({
    account_number: "", account_name: "", category: "", default_distribution_key: "mea",
    is_35a_relevant: false, is_billing_relevant: true, is_heating_relevant: false,
    carry_forward_balance: false, is_wirtschaftsplan_relevant: true,
    is_distributable: true, settlement_section: "operating_distributable" as string | null,
    settlement_35a_type: null as string | null, default_vat_rate: 19,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: buildingData } = useQuery({
    queryKey: ["building-booking-instructions", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("booking_instructions")
        .eq("id", buildingId)
        .single();
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

  // Verteilerschlüssel-Optionen aus tatsächlich am Gebäude gepflegten Anteilen
  // (Standard + Custom, exakt wie im Personen-Tab).
  const { options: shareTypeOptions } = useBuildingShareTypes(buildingId);
  // Override-Keys, die bereits in irgendeinem Konto-Override genutzt werden,
  // aber noch nicht in den Anteilen gepflegt sind, zusätzlich aufnehmen,
  // damit bestehende Overrides sichtbar bleiben.
  const overrideExtras = [...new Set(
    overrides
      .map(o => o.distribution_key)
      .filter((k): k is string => !!k && !shareTypeOptions.some(o => o.value === k))
  )];
  const allDistKeys = [
    ...shareTypeOptions,
    ...overrideExtras.map(k => ({ value: k, label: `${getShareTypeLabel(k)} (nicht im Gebäude gepflegt)` })),
  ];
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

  const invalidateAllCoa = () => {
    queryClient.invalidateQueries({ predicate: (q) => {
      const k = q.queryKey[0];
      return typeof k === "string" && (k.startsWith("chart-of-accounts") || k.startsWith("coa-"));
    }});
  };

  const updateAccountField = async (accountId: string, field: string, value: any) => {
    const { error } = await supabase.from("chart_of_accounts").update({ [field]: value } as any).eq("id", accountId);
    if (error) { toast.error("Fehler: " + error.message); return; }
    invalidateAllCoa();
  };

  const addBuildingAccount = async () => {
    if (!newAccount.account_number || !newAccount.account_name || !newAccount.category) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
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
      sort_order: 0,
      is_system_account: false,
    } as any);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Liegenschaftskonto hinzugefügt");
    setIsAddOpen(false);
    setNewAccount({
      account_number: "", account_name: "", category: "", default_distribution_key: "mea",
      is_35a_relevant: false, is_billing_relevant: true, is_heating_relevant: false,
      carry_forward_balance: false, is_wirtschaftsplan_relevant: true,
      is_distributable: true, settlement_section: "operating_distributable",
      settlement_35a_type: null, default_vat_rate: 19,
    });
    invalidateAllCoa();
  };

  const deleteBuildingAccount = async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Konto gelöscht");
    invalidateAllCoa();
  };

  const [customKeyInput, setCustomKeyInput] = useState<string | null>(null);
  const [customKeyAccountId, setCustomKeyAccountId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  const startEditName = (account: any) => {
    setEditingNameId(account.id);
    setEditingNameValue(account.account_name);
  };
  const saveEditName = async (id: string) => {
    if (!editingNameValue.trim()) { toast.error("Bezeichnung darf nicht leer sein"); return; }
    const { error } = await supabase.from("chart_of_accounts").update({ account_name: editingNameValue.trim() } as any).eq("id", id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Bezeichnung aktualisiert");
    setEditingNameId(null);
    invalidateAllCoa();
  };

  const getKeyLabel = (key: string | null) => allDistKeys.find(k => k.value === key)?.label || key || "–";

  if (isLoading) return <div className="text-muted-foreground text-sm">Laden...</div>;

  return (
    <div className="space-y-6">
      <BookingInstructionsSection buildingId={buildingId} initialValue={(buildingData as any)?.booking_instructions} />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Kontenrahmen</CardTitle>
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
            Kontenrahmen mit Verteilerschlüssel. Klicke auf ⋯ für alle Einstellungen (Flags, MwSt, §35a).
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Konto</TableHead>
                            <TableHead>Bezeichnung</TableHead>
                            <TableHead className="w-[150px]">Standard</TableHead>
                            <TableHead className="w-[180px]">Aktuell</TableHead>
                            <TableHead className="w-[70px] text-center">MwSt</TableHead>
                            <TableHead className="w-[60px]"></TableHead>
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
                                <TableCell className="text-sm">
                                  {editingNameId === account.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        autoFocus
                                        value={editingNameValue}
                                        onChange={e => setEditingNameValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter") saveEditName(account.id);
                                          if (e.key === "Escape") setEditingNameId(null);
                                        }}
                                        className="h-7 text-sm"
                                      />
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEditName(account.id)}>
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingNameId(null)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startEditName(account)}
                                      className="group inline-flex items-center gap-1.5 text-left hover:text-primary"
                                      title="Bezeichnung bearbeiten"
                                    >
                                      <span>{account.account_name}</span>
                                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                                    </button>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground">{getKeyLabel(account.default_distribution_key)}</span>
                                </TableCell>
                                <TableCell>
                                  {customKeyAccountId === account.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        autoFocus placeholder="Schlüssel eingeben"
                                        value={customKeyInput || ""}
                                        onChange={e => setCustomKeyInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter" && customKeyInput) {
                                            handleOverride(account.id, customKeyInput, account.default_distribution_key);
                                            setCustomKeyAccountId(null);
                                            setCustomKeyInput(null);
                                          }
                                        }}
                                        className="h-8 text-xs w-28"
                                      />
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                                        if (customKeyInput) handleOverride(account.id, customKeyInput, account.default_distribution_key);
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
                                <TableCell className="text-center">
                                  <span className="text-xs text-muted-foreground">{(account as any).default_vat_rate ?? 19} %</span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <AccountSettingsPopover
                                      account={account as any}
                                      onUpdate={(field, value) => updateAccountField(account.id, field, value)}
                                    />
                                    {isBuildingAccount && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => deleteBuildingAccount(account.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Account Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
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
                <Label className="text-xs">VR</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={newAccount.is_billing_relevant} onCheckedChange={c => setNewAccount(p => ({ ...p, is_billing_relevant: !!c }))} />
                <Label className="text-xs">Abr.</Label>
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
            <Button onClick={addBuildingAccount}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
