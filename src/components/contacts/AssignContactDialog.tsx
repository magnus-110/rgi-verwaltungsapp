import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, User, Plus } from "lucide-react";
import { CreateContactDialog } from "./CreateContactDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  onAssigned: () => void;
  existingContactIds: string[];
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  salutation: string | null;
}

export function AssignContactDialog({ open, onOpenChange, buildingId, onAssigned, existingContactIds }: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadContacts();
  }, [open]);

  const loadContacts = async () => {
    const { data } = await supabase.from("contacts").select("id, first_name, last_name, company_name, salutation").order("last_name");
    setContacts(data || []);
  };

  const available = contacts.filter(c => !existingContactIds.includes(c.id));
  const filtered = available.filter(c => {
    const term = search.toLowerCase();
    return (c.first_name || "").toLowerCase().includes(term) ||
      (c.last_name || "").toLowerCase().includes(term) ||
      (c.company_name || "").toLowerCase().includes(term);
  });

  const getName = (c: ContactOption) => {
    if (c.company_name) return c.company_name;
    return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: selectedId,
      building_id: buildingId,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kontakt zugeordnet" });
      setSelectedId(null);
      setSearch("");
      onOpenChange(false);
      onAssigned();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kontakt zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Kontakt suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {search ? "Keine Ergebnisse" : "Alle Kontakte bereits zugeordnet"}
                </div>
              ) : (
                filtered.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedId === c.id ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">{getName(c)}</span>
                  </div>
                ))
              )}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> Neuen Kontakt erstellen
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleAssign} disabled={!selectedId || saving}>
              {saving ? "..." : "Zuordnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateContactDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => { loadContacts(); setShowCreate(false); }}
      />
    </>
  );
}
