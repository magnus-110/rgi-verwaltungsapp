import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

interface Loan {
  id: string;
  borrower_name: string | null;
  borrower_email: string | null;
  due_at: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  buildingId: string;
  tagNumber?: string;
}

export const EditKeyLoanDialog = ({ open, onClose, loan, buildingId, tagNumber }: Props) => {
  const qc = useQueryClient();
  const [name, setName] = useState(loan.borrower_name ?? "");
  const [email, setEmail] = useState(loan.borrower_email ?? "");
  const [openReturn, setOpenReturn] = useState(!loan.due_at);
  const [dueDate, setDueDate] = useState(
    loan.due_at ? format(new Date(loan.due_at), "yyyy-MM-dd") : format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState(loan.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(loan.borrower_name ?? "");
      setEmail(loan.borrower_email ?? "");
      setOpenReturn(!loan.due_at);
      setDueDate(loan.due_at ? format(new Date(loan.due_at), "yyyy-MM-dd") : format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"));
      setNotes(loan.notes ?? "");
    }
  }, [open, loan]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name angeben");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("key_loans")
      .update({
        borrower_name: name.trim(),
        borrower_email: email.trim() || null,
        due_at: openReturn ? null : new Date(dueDate + "T23:59:59").toISOString(),
        notes: notes.trim() || null,
      })
      .eq("id", loan.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["key-loans-active", buildingId] });
    qc.invalidateQueries({ queryKey: ["key-tags", buildingId] });
    qc.invalidateQueries({ queryKey: ["key-events", buildingId] });
    qc.invalidateQueries({ queryKey: ["outstanding-key-loans"] });
    toast.success("Leihe aktualisiert");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[95vw]">
        <DialogHeader>
          <DialogTitle>
            Leihe bearbeiten{tagNumber && <> · <span className="font-mono">{tagNumber}</span></>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <div className="min-w-0">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="min-w-0">
              <Label>E-Mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Rückgabe bis {openReturn ? "" : "*"}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={openReturn} />
            <label className="flex items-center gap-2 text-sm mt-2">
              <Checkbox checked={openReturn} onCheckedChange={(v) => setOpenReturn(!!v)} />
              Offene Rückgabe (kein festes Datum)
            </label>
          </div>
          <div>
            <Label>Notiz</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
