import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Shield, Landmark, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

interface Props {
  buildingId: string;
}

interface Deposit {
  id: string;
  assignment_id: string;
  deposit_type: string;
  amount: number;
  bank_name: string | null;
  iban: string | null;
  guarantor: string | null;
  guarantee_number: string | null;
  guarantee_expiry: string | null;
  received_on: string | null;
  released_on: string | null;
  notes: string | null;
}

interface AssignmentRow {
  id: string;
  unit_number: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
  deposits: Deposit[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

const contactName = (c: AssignmentRow["contact"]) => {
  if (!c) return "—";
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
};

export function BuildingDepositsTab({ buildingId }: Props) {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["building-deposits", buildingId],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data: assigns } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, contact:contacts(id, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "mieter")
        .order("unit_number", { ascending: true, nullsFirst: false });

      const list = (assigns || []) as any[];
      if (list.length === 0) return [];

      const { data: deps } = await (supabase as any)
        .from("tenant_deposits")
        .select("*")
        .in("assignment_id", list.map((a) => a.id));

      const byAssign = new Map<string, Deposit[]>();
      (deps || []).forEach((d: Deposit) => {
        const arr = byAssign.get(d.assignment_id) || [];
        arr.push(d);
        byAssign.set(d.assignment_id, arr);
      });

      return list.map((a) => ({
        id: a.id,
        unit_number: a.unit_number,
        contact: a.contact,
        deposits: byAssign.get(a.id) || [],
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["building-deposits", buildingId] });

  const addDeposit = async (assignmentId: string) => {
    const { error } = await (supabase as any).from("tenant_deposits").insert({
      assignment_id: assignmentId,
      deposit_type: "konto",
      amount: 0,
    });
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    refresh();
  };

  const updateDeposit = async (id: string, patch: Partial<Deposit>) => {
    const { error } = await (supabase as any).from("tenant_deposits").update(patch).eq("id", id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    refresh();
  };

  const deleteDeposit = async (id: string) => {
    if (!confirm("Kaution wirklich löschen?")) return;
    await (supabase as any).from("tenant_deposits").delete().eq("id", id);
    refresh();
  };

  const totalAll = rows.reduce(
    (sum, r) => sum + r.deposits.reduce((s, d) => s + Number(d.amount || 0), 0),
    0
  );
  const totalReceived = rows.reduce(
    (sum, r) =>
      sum + r.deposits.filter((d) => d.received_on).reduce((s, d) => s + Number(d.amount || 0), 0),
    0
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-4">
      {/* Summen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard icon={Wallet} label="Mieter gesamt" value={`${rows.length}`} />
        <SummaryCard icon={Shield} label="Kaution Soll" value={fmt(totalAll)} />
        <SummaryCard icon={Landmark} label="Kaution erhalten" value={fmt(totalReceived)} />
      </div>

      {rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Keine Mieter in diesem Gebäude.
          </CardContent>
        </Card>
      )}

      {rows.map((r) => {
        const sum = r.deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
        return (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{contactName(r.contact)}</CardTitle>
                  {r.unit_number && <Badge variant="outline">EH {r.unit_number}</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{fmt(sum)}</span>
                  <Button size="sm" variant="outline" onClick={() => addDeposit(r.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Kaution
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {r.deposits.length === 0 ? (
                <p className="text-xs text-muted-foreground">Keine Kaution hinterlegt</p>
              ) : (
                <div className="space-y-3">
                  {r.deposits.map((d) => (
                    <DepositEditor
                      key={d.id}
                      deposit={d}
                      onUpdate={(p) => updateDeposit(d.id, p)}
                      onDelete={() => deleteDeposit(d.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DepositEditor({
  deposit,
  onUpdate,
  onDelete,
}: {
  deposit: Deposit;
  onUpdate: (patch: Partial<Deposit>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(deposit);
  const set = (patch: Partial<Deposit>) => setLocal({ ...local, ...patch });
  const save = (patch: Partial<Deposit>) => onUpdate(patch);

  const isKonto = local.deposit_type === "konto";

  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={local.deposit_type}
          onValueChange={(v) => {
            set({ deposit_type: v });
            save({ deposit_type: v });
          }}
        >
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="konto">Konto</SelectItem>
            <SelectItem value="buergschaft">Bürgschaft</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">Betrag</Label>
          <Input
            type="number"
            step="0.01"
            value={local.amount ?? 0}
            onChange={(e) => set({ amount: Number(e.target.value) })}
            onBlur={() => save({ amount: Number(local.amount) })}
            className="w-32 h-9 text-sm"
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-8 w-8 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isKonto ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Field label="Bank">
            <Input
              value={local.bank_name || ""}
              onChange={(e) => set({ bank_name: e.target.value })}
              onBlur={() => save({ bank_name: local.bank_name })}
              className="h-9 text-sm"
            />
          </Field>
          <Field label="IBAN">
            <Input
              value={local.iban || ""}
              onChange={(e) => set({ iban: e.target.value })}
              onBlur={() => save({ iban: local.iban })}
              className="h-9 text-sm"
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Field label="Bürge">
            <Input
              value={local.guarantor || ""}
              onChange={(e) => set({ guarantor: e.target.value })}
              onBlur={() => save({ guarantor: local.guarantor })}
              className="h-9 text-sm"
            />
          </Field>
          <Field label="Bürgschafts-Nr.">
            <Input
              value={local.guarantee_number || ""}
              onChange={(e) => set({ guarantee_number: e.target.value })}
              onBlur={() => save({ guarantee_number: local.guarantee_number })}
              className="h-9 text-sm"
            />
          </Field>
          <Field label="Gültig bis">
            <Input
              type="date"
              value={local.guarantee_expiry || ""}
              onChange={(e) => set({ guarantee_expiry: e.target.value })}
              onBlur={() => save({ guarantee_expiry: local.guarantee_expiry || null })}
              className="h-9 text-sm"
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Field label="Erhalten am">
          <Input
            type="date"
            value={local.received_on || ""}
            onChange={(e) => set({ received_on: e.target.value })}
            onBlur={() => save({ received_on: local.received_on || null })}
            className="h-9 text-sm"
          />
        </Field>
        <Field label="Freigegeben am">
          <Input
            type="date"
            value={local.released_on || ""}
            onChange={(e) => set({ released_on: e.target.value })}
            onBlur={() => save({ released_on: local.released_on || null })}
            className="h-9 text-sm"
          />
        </Field>
      </div>

      <Field label="Notizen">
        <Input
          value={local.notes || ""}
          onChange={(e) => set({ notes: e.target.value })}
          onBlur={() => save({ notes: local.notes })}
          className="h-9 text-sm"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
