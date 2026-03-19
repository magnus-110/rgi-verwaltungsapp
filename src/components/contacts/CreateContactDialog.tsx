import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SALUTATIONS = [
  "Herr", "Frau", "Eheleute", "Firma", "Familie",
  "Herr Dr.", "Frau Dr.", "Herr Prof.", "Frau Prof.",
  "Herr Prof. Dr.", "Frau Prof. Dr.", "Herr/Frau"
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateContactDialog({ open, onOpenChange, onCreated }: Props) {
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [shortName, setShortName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!lastName && !companyName) {
      toast({ title: "Fehler", description: "Name oder Firma ist erforderlich", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("contacts").insert({
      salutation: salutation || null,
      first_name: firstName || null,
      last_name: lastName || null,
      company_name: companyName || null,
      short_name: shortName || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kontakt erstellt" });
      setSalutation(""); setFirstName(""); setLastName(""); setCompanyName(""); setShortName("");
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Kontakt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Kurzname</Label>
            <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="z.B. Müller, Max" />
          </div>
          <div>
            <Label>Anrede</Label>
            <Select value={salutation} onValueChange={setSalutation}>
              <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
              <SelectContent>
                {SALUTATIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vorname</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Nachname</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Firma</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Speichern..." : "Erstellen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
