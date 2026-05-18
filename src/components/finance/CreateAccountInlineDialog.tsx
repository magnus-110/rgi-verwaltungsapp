import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useBuildingShareTypes } from "@/hooks/useBuildingShareTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string | null;
  onCreated: (accountId: string) => void;
}

export function CreateAccountInlineDialog({ open, onOpenChange, buildingId, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_number: "",
    account_name: "",
    category: "1. Umlagefähige Betriebskosten",
    scope: "building" as "building" | "global",
    default_vat_rate: "19",
    is_billing_relevant: true,
    is_distributable: false,
    is_heating_relevant: false,
    is_wirtschaftsplan_relevant: false,
    is_35a_relevant: false,
    settlement_35a_type: "",
    default_distribution_key: "",
    carry_forward_balance: false,
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  useEffect(() => {
    if (open) {
      setForm({
        account_number: "", account_name: "", category: "1. Umlagefähige Betriebskosten",
        scope: buildingId ? "building" : "global",
        default_vat_rate: "19", is_billing_relevant: true, is_distributable: false,
        is_heating_relevant: false, is_wirtschaftsplan_relevant: false, is_35a_relevant: false,
        settlement_35a_type: "", default_distribution_key: "", carry_forward_balance: false,
      });
    }
  }, [open, buildingId]);

  const handleSave = async () => {
    if (!form.account_number || !form.account_name) {
      toast.error("Kontonummer und -name sind Pflichtfelder");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("chart_of_accounts").insert({
        account_number: form.account_number,
        account_name: form.account_name,
        category: form.category,
        building_id: form.scope === "building" ? buildingId : null,
        default_vat_rate: parseFloat(form.default_vat_rate) || 0,
        is_billing_relevant: form.is_billing_relevant,
        is_distributable: form.is_distributable,
        is_heating_relevant: form.is_heating_relevant,
        is_wirtschaftsplan_relevant: form.is_wirtschaftsplan_relevant,
        is_35a_relevant: form.is_35a_relevant,
        settlement_35a_type: form.settlement_35a_type || null,
        default_distribution_key: form.default_distribution_key || null,
        carry_forward_balance: form.carry_forward_balance,
      }).select("id").single();
      if (error) throw error;
      toast.success("Konto erstellt ✓");
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === "string" && k.startsWith("chart-of-accounts");
      }});
      onCreated(data.id);
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Neues Konto anlegen</h3>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Geltungsbereich</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={form.scope === "building" ? "default" : "outline"}
                disabled={!buildingId}
                className="flex-1 h-8 text-xs" onClick={() => update("scope", "building")}>
                Nur diese Liegenschaft
              </Button>
              <Button type="button" size="sm" variant={form.scope === "global" ? "default" : "outline"}
                className="flex-1 h-8 text-xs" onClick={() => update("scope", "global")}>
                Alle Liegenschaften
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kontonummer</label>
              <Input className="h-9 text-sm font-mono" value={form.account_number}
                onChange={e => update("account_number", e.target.value)} placeholder="z.B. 4100" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kontoname</label>
              <Input className="h-9 text-sm" value={form.account_name}
                onChange={e => update("account_name", e.target.value)} placeholder="z.B. Reparaturen" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategorie</label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1. Umlagefähige Betriebskosten">1. Umlagefähige Betriebskosten</SelectItem>
                  <SelectItem value="2. Heizung & Warme BK">2. Heizung & Warme BK</SelectItem>
                  <SelectItem value="3. Verwaltung & Instandhaltung">3. Verwaltung & Instandhaltung</SelectItem>
                  <SelectItem value="4. WEG-Systemkonten & Rücklagen">4. WEG-Systemkonten & Rücklagen</SelectItem>
                  <SelectItem value="5. Eröffnungen & Abgrenzung">5. Eröffnungen & Abgrenzung</SelectItem>
                  <SelectItem value="0. Personenkonten">0. Personenkonten</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">MwSt-Satz (%)</label>
              <Select value={form.default_vat_rate} onValueChange={v => update("default_vat_rate", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="7">7%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Verteilerschlüssel</label>
            <Select value={form.default_distribution_key} onValueChange={v => update("default_distribution_key", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {(form.scope === "building" ? shareTypeOptions : globalShareTypeOptions).map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_billing_relevant} onCheckedChange={v => update("is_billing_relevant", !!v)} />
              Abrechnungsrelevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_distributable} onCheckedChange={v => update("is_distributable", !!v)} />
              Umlagefähig
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_wirtschaftsplan_relevant} onCheckedChange={v => update("is_wirtschaftsplan_relevant", !!v)} />
              Wirtschaftsplan-relevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_heating_relevant} onCheckedChange={v => update("is_heating_relevant", !!v)} />
              Heizungsrelevant
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.carry_forward_balance} onCheckedChange={v => update("carry_forward_balance", !!v)} />
              Saldovortrag
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={form.is_35a_relevant} onCheckedChange={v => update("is_35a_relevant", !!v)} />
              §35a-relevant
            </label>
          </div>

          {form.is_35a_relevant && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">§35a Typ</label>
              <Select value={form.settlement_35a_type} onValueChange={v => update("settlement_35a_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Typ wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="haushaltsnahe_dienstleistung">Haushaltsnahe Dienstleistung</SelectItem>
                  <SelectItem value="handwerkerleistung">Handwerkerleistung</SelectItem>
                  <SelectItem value="geringfuegige_beschaeftigung">Geringfügige Beschäftigung</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.account_number || !form.account_name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Konto erstellen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
