import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Field = { label: string; key: string; required?: boolean; placeholder?: string };

interface Props<T extends { id: string; name: string }> {
  value: string | undefined;
  onChange: (id: string) => void;
  options: T[];
  table: "key_storage_locations" | "key_types" | "key_subject_types" | "key_manufacturers";
  label: string;
  placeholder?: string;
  renderOption?: (o: T) => React.ReactNode;
  extraFields?: Field[];
  queryKey: any[];
}

export function DropdownWithAdd<T extends { id: string; name: string }>({
  value, onChange, options, table, label, placeholder, renderOption, extraFields = [], queryKey,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ name: "" });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Name fehlt"); return; }
    setSaving(true);
    const { data, error } = await supabase.from(table as any).insert(form as any).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey });
    onChange((data as any).id);
    setOpen(false);
    setForm({ name: "" });
  };

  return (
    <>
      <Select value={value} onValueChange={(v) => v === "__add__" ? setOpen(true) : onChange(v)}>
        <SelectTrigger><SelectValue placeholder={placeholder ?? `${label} wählen`} /></SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>
              {renderOption ? renderOption(o) : o.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="__add__"><span className="flex items-center gap-1 text-primary"><Plus className="h-3 w-3" /> Neu hinzufügen</span></SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{label} hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {extraFields.map(f => (
              <div key={f.key}>
                <Label>{f.label}{f.required && " *"}</Label>
                <Input
                  value={form[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
