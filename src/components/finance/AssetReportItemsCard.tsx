import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface Props {
  buildingId: string;
  fiscalYear: number;
}

interface AssetItem {
  id: string;
  label: string;
  amount: number;
  notes: string | null;
}

export function AssetReportItemsCard({ buildingId, fiscalYear }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ label: string; amount: string; notes: string }>({
    label: "",
    amount: "",
    notes: "",
  });
  const [edits, setEdits] = useState<Record<string, { label: string; amount: string; notes: string }>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["asset-report-items", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_report_items" as any)
        .select("id, label, amount, notes")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data as any) as AssetItem[];
    },
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const parseAmount = (s: string) => Number(String(s).replace(",", ".")) || 0;

  const refetch = () => qc.invalidateQueries({ queryKey: ["asset-report-items", buildingId, fiscalYear] });

  const addItem = async () => {
    if (!draft.label.trim()) {
      toast.error("Bezeichnung erforderlich");
      return;
    }
    const { error } = await supabase.from("asset_report_items" as any).insert({
      building_id: buildingId,
      fiscal_year: fiscalYear,
      label: draft.label.trim(),
      amount: parseAmount(draft.amount),
      notes: draft.notes.trim() || null,
    });
    if (error) {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
      return;
    }
    setDraft({ label: "", amount: "", notes: "" });
    toast.success("Vermögenswert hinzugefügt");
    refetch();
  };

  const saveEdit = async (id: string) => {
    const e = edits[id];
    if (!e) return;
    const { error } = await supabase
      .from("asset_report_items" as any)
      .update({
        label: e.label.trim(),
        amount: parseAmount(e.amount),
        notes: e.notes.trim() || null,
      })
      .eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
      return;
    }
    setEdits((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    toast.success("Aktualisiert");
    refetch();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Diesen Vermögenswert löschen?")) return;
    const { error } = await supabase.from("asset_report_items" as any).delete().eq("id", id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Gelöscht");
    refetch();
  };

  const total = items.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Weitere Vermögenswerte</CardTitle>
        <p className="text-xs text-muted-foreground">
          Manuell erfasste Posten (z. B. Rasentraktor, Werkzeuge, sonstiges Inventar).
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">Keine weiteren Vermögenswerte erfasst.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const e = edits[item.id];
              const isEditing = !!e;
              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center text-sm">
                  <Input
                    className="col-span-5 h-8"
                    value={isEditing ? e.label : item.label}
                    onChange={(ev) =>
                      setEdits((p) => ({
                        ...p,
                        [item.id]: {
                          label: ev.target.value,
                          amount: e?.amount ?? String(item.amount).replace(".", ","),
                          notes: e?.notes ?? (item.notes || ""),
                        },
                      }))
                    }
                  />
                  <Input
                    className="col-span-3 h-8 text-right font-mono"
                    value={isEditing ? e.amount : String(item.amount).replace(".", ",")}
                    onChange={(ev) =>
                      setEdits((p) => ({
                        ...p,
                        [item.id]: {
                          label: e?.label ?? item.label,
                          amount: ev.target.value,
                          notes: e?.notes ?? (item.notes || ""),
                        },
                      }))
                    }
                  />
                  <Input
                    className="col-span-2 h-8"
                    placeholder="Notiz"
                    value={isEditing ? e.notes : item.notes || ""}
                    onChange={(ev) =>
                      setEdits((p) => ({
                        ...p,
                        [item.id]: {
                          label: e?.label ?? item.label,
                          amount: e?.amount ?? String(item.amount).replace(".", ","),
                          notes: ev.target.value,
                        },
                      }))
                    }
                  />
                  <div className="col-span-2 flex justify-end gap-1">
                    {isEditing && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(item.id)}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between border-t pt-2 font-medium text-sm">
              <span>Summe</span>
              <span className="font-mono">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t">
          <Input
            className="col-span-5 h-8"
            placeholder="Bezeichnung (z. B. Rasentraktor)"
            value={draft.label}
            onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
          />
          <Input
            className="col-span-3 h-8 text-right font-mono"
            placeholder="0,00"
            value={draft.amount}
            onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))}
          />
          <Input
            className="col-span-2 h-8"
            placeholder="Notiz"
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
          />
          <Button size="sm" className="col-span-2 h-8" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
