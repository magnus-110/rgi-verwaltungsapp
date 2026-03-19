import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, User, Plus, ChevronRight, ChevronLeft } from "lucide-react";
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
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
}

const ROLES = [
  { value: "eigentuemer", label: "Eigentümer" },
  { value: "mieter", label: "Mieter" },
  { value: "verwalter", label: "Verwalter" },
  { value: "beirat", label: "Beirat" },
];

export function AssignContactDialog({ open, onOpenChange, buildingId, onAssigned, existingContactIds }: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"select" | "details">("select");
  const { toast } = useToast();

  // Assignment details
  const [role, setRole] = useState("eigentuemer");
  const [unitNumber, setUnitNumber] = useState("");
  const [floorLocation, setFloorLocation] = useState("");
  const [addressMode, setAddressMode] = useState<"existing" | "new">("existing");
  const [newStreet, setNewStreet] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newCity, setNewCity] = useState("");

  useEffect(() => {
    if (open) {
      loadContacts();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setStep("select");
    setSelectedId(null);
    setSearch("");
    setRole("eigentuemer");
    setUnitNumber("");
    setFloorLocation("");
    setAddressMode("existing");
    setNewStreet("");
    setNewZip("");
    setNewCity("");
  };

  const loadContacts = async () => {
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, company_name, salutation, address_street, address_zip, address_city")
      .order("last_name");
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

  const getAddress = (c: ContactOption) => {
    const parts = [c.address_street, [c.address_zip, c.address_city].filter(Boolean).join(" ")].filter(Boolean);
    return parts.join(", ");
  };

  const selectedContact = contacts.find(c => c.id === selectedId);

  const handleAssign = async () => {
    if (!selectedId) return;
    setSaving(true);

    // If new address, update contact first
    if (addressMode === "new" && (newStreet || newZip || newCity)) {
      await supabase.from("contacts").update({
        address_street: newStreet || null,
        address_zip: newZip || null,
        address_city: newCity || null,
      }).eq("id", selectedId);
    }

    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: selectedId,
      building_id: buildingId,
      role_in_building: role || null,
      unit_number: unitNumber || null,
      floor_location: floorLocation || null,
    });

    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kontakt zugeordnet" });
      onOpenChange(false);
      onAssigned();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "select" ? "Kontakt zuordnen" : "Zuordnungsdetails"}
            </DialogTitle>
          </DialogHeader>

          {step === "select" && (
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
                      <div className="min-w-0">
                        <span className="text-sm block">{getName(c)}</span>
                        {getAddress(c) && (
                          <span className="text-xs text-muted-foreground block truncate">{getAddress(c)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCreate(true)}>
                <Plus className="h-3 w-3 mr-1" /> Neuen Kontakt erstellen
              </Button>
            </div>
          )}

          {step === "details" && selectedContact && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
                <p className="font-medium">{getName(selectedContact)}</p>
                {getAddress(selectedContact) && (
                  <p className="text-xs text-muted-foreground">{getAddress(selectedContact)}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Rolle</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Einheit Nr.</Label>
                  <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="h-8 text-sm" placeholder="z.B. 3" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Etage / Lage</Label>
                <Input value={floorLocation} onChange={(e) => setFloorLocation(e.target.value)} className="h-8 text-sm" placeholder="z.B. 2. OG links" />
              </div>

              {/* Address option */}
              <div className="border-t border-border pt-3">
                <Label className="text-xs font-semibold mb-2 block">Adresse</Label>
                <RadioGroup value={addressMode} onValueChange={(v) => setAddressMode(v as "existing" | "new")} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="existing" id="addr-existing" className="mt-0.5" />
                    <div>
                      <Label htmlFor="addr-existing" className="text-sm cursor-pointer">Bestehende Adresse übernehmen</Label>
                      {getAddress(selectedContact) ? (
                        <p className="text-xs text-muted-foreground">{getAddress(selectedContact)}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Keine Adresse hinterlegt</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="new" id="addr-new" className="mt-0.5" />
                    <Label htmlFor="addr-new" className="text-sm cursor-pointer">Neue Adresse eingeben</Label>
                  </div>
                </RadioGroup>

                {addressMode === "new" && (
                  <div className="mt-3 space-y-2 pl-6">
                    <Input value={newStreet} onChange={(e) => setNewStreet(e.target.value)} placeholder="Straße + Hausnr." className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <Input value={newZip} onChange={(e) => setNewZip(e.target.value)} placeholder="PLZ" className="h-8 text-sm w-24" />
                      <Input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Ort" className="h-8 text-sm flex-1" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {step === "select" && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                <Button onClick={() => setStep("details")} disabled={!selectedId}>
                  Weiter <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
            {step === "details" && (
              <>
                <Button variant="outline" onClick={() => setStep("select")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
                </Button>
                <Button onClick={handleAssign} disabled={saving}>
                  {saving ? "..." : "Zuordnen"}
                </Button>
              </>
            )}
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
