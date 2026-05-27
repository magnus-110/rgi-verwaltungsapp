import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Phone, Mail, Trash2, ExternalLink, Search, Building2, Settings2, Bell, BellRing, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";
import { Switch } from "@/components/ui/switch";

interface Props {
  buildingId: string;
}

export function BuildingServiceProvidersTab({ buildingId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("alle");
  const [showAdd, setShowAdd] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [emergencyEditId, setEmergencyEditId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["service-provider-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_provider_categories")
        .select("id, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["building-service-providers", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, service_category, notes, unit_number,
          is_emergency_contact, emergency_note, emergency_sort_order,
          contact:contacts(
            id, company_name, first_name, last_name, salutation, contact_type,
            address_street, address_zip, address_city,
            contact_phones(phone_number, label),
            contact_emails(email, label, is_primary)
          )
        `)
        .eq("building_id", buildingId)
        .eq("role_in_building", "dienstleister" as any)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filtered = providers.filter((p) =>
    filter === "alle" ? true : (p.service_category ?? "Sonstiges") === filter
  );

  const removeProvider = async (id: string) => {
    const { error } = await supabase
      .from("contact_building_assignments")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["building-service-providers", buildingId] });
    toast({ title: "Dienstleister entfernt" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Dienstleister</h2>
          <Badge variant="secondary" className="text-xs">{providers.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowManageCats(true)} title="Kategorien verwalten">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Dienstleister hinzufügen
          </Button>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <Badge
          variant={filter === "alle" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilter("alle")}
        >
          Alle ({providers.length})
        </Badge>
        {categories.map((cat) => {
          const count = providers.filter((p) => (p.service_category ?? "Sonstiges") === cat.name).length;
          if (count === 0) return null;
          return (
            <Badge
              key={cat.id}
              variant={filter === cat.name ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter(cat.name)}
            >
              {cat.name} ({count})
            </Badge>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {providers.length === 0
                ? "Noch keine Dienstleister zugeordnet"
                : "Keine Einträge in dieser Kategorie"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((p) => {
            const c = p.contact;
            if (!c) return null;
            const name = c.company_name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
            const primaryEmail = (c.contact_emails || []).find((e: any) => e.is_primary) || (c.contact_emails || [])[0];
            const primaryPhone = (c.contact_phones || [])[0];
            return (
              <Card key={p.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{name}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {p.service_category || "Sonstiges"}
                        </Badge>
                        {p.is_emergency_contact && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-foreground/30">
                            <ShieldAlert className="h-3 w-3" /> Notfallkontakt
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        {primaryPhone && (
                          <a href={`tel:${primaryPhone.phone_number}`} className="flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" /> {primaryPhone.phone_number}
                          </a>
                        )}
                        {primaryEmail && (
                          <a href={`mailto:${primaryEmail.email}`} className="flex items-center gap-1 hover:text-foreground">
                            <Mail className="h-3 w-3" /> {primaryEmail.email}
                          </a>
                        )}
                      </div>
                      {p.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">„{p.notes}"</p>}
                      {p.is_emergency_contact && p.emergency_note && (
                        <p className="text-xs text-orange-700 mt-1.5">🔔 {p.emergency_note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-7 w-7 ${p.is_emergency_contact ? "text-orange-600 hover:text-orange-700" : ""}`}
                        title="Notfallkontakt-Einstellungen"
                        onClick={() => setEmergencyEditId(p.id)}
                      >
                        {p.is_emergency_contact ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Zum Kontakt"
                        onClick={() => navigate(`/contacts?id=${c.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Entfernen"
                        onClick={() => removeProvider(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddProviderDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        buildingId={buildingId}
        categories={categories}
        existingAssignments={providers
          .map((p) => ({ contactId: p.contact?.id as string | undefined, category: (p.service_category ?? "Sonstiges") as string }))
          .filter((a) => !!a.contactId) as { contactId: string; category: string }[]}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ["building-service-providers", buildingId] })}
      />

      <ManageCategoriesDialog
        open={showManageCats}
        onOpenChange={setShowManageCats}
        categories={categories}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["service-provider-categories"] })}
      />

      <EmergencyEditDialog
        assignment={providers.find((p) => p.id === emergencyEditId) || null}
        onClose={() => setEmergencyEditId(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["building-service-providers", buildingId] })}
      />
    </div>
  );
}

function AddProviderDialog({
  open, onOpenChange, buildingId, categories, existingAssignments, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId: string;
  categories: { id: string; name: string }[];
  existingAssignments: { contactId: string; category: string }[];
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: contacts = [], refetch } = useQuery({
    queryKey: ["contacts-service-providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, company_name, first_name, last_name, salutation, contact_type, address_city")
        .order("company_name", { nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const filteredContacts = contacts.filter((c) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      (c.company_name || "").toLowerCase().includes(term) ||
      (c.first_name || "").toLowerCase().includes(term) ||
      (c.last_name || "").toLowerCase().includes(term)
    );
  });

  const reset = () => {
    setSearch(""); setSelectedId(null); setShowList(true);
    setCategory(categories[0]?.name || ""); setNotes("");
  };

  const getName = (c: any) =>
    c.company_name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";

  const selectContact = (id: string) => {
    setSelectedId(id);
    setShowList(false); // close list after selection
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: selectedId,
      building_id: buildingId,
      role_in_building: "dienstleister" as any,
      service_category: category || "Sonstiges",
      notes: notes || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dienstleister zugeordnet" });
    reset();
    onOpenChange(false);
    onAdded();
  };

  const selectedContact = contacts.find((c) => c.id === selectedId);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dienstleister zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Gewerk / Kategorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Kontakt</Label>
              {selectedContact && !showList ? (
                <div className="flex items-center justify-between gap-2 mt-1 p-2 border rounded-md bg-muted/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{getName(selectedContact)}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowList(true)}>
                    Ändern
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Firma oder Name suchen..."
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <div className="mt-2 max-h-56 overflow-y-auto border rounded-md">
                    {filteredContacts.length === 0 ? (
                      <p className="p-3 text-xs text-center text-muted-foreground">Keine Treffer</p>
                    ) : (
                      filteredContacts.map((c) => {
                        const isAssigned = existingContactIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => !isAssigned && selectContact(c.id)}
                            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                              isAssigned
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-muted cursor-pointer"
                            }`}
                          >
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 truncate">{getName(c)}</span>
                            {c.address_city && (
                              <span className="text-xs text-muted-foreground">{c.address_city}</span>
                            )}
                            {isAssigned && <Badge variant="secondary" className="text-[10px]">Zugeordnet</Badge>}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setShowCreate(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Neuen Dienstleister anlegen
                  </Button>
                </>
              )}
            </div>

            <div>
              <Label className="text-xs">Notiz (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. Vertragsnummer, Zuständigkeitsbereich..."
                className="text-sm min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={!selectedId || !category || saving}>
              {saving ? "Speichern..." : "Zuordnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateContactDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => { refetch(); }}
      />
    </>
  );
}

function ManageCategoriesDialog({
  open, onOpenChange, categories, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: { id: string; name: string; sort_order?: number }[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const addCategory = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const maxSort = Math.max(0, ...categories.map((c) => c.sort_order ?? 0));
    const { error } = await supabase
      .from("service_provider_categories")
      .insert({ name, sort_order: maxSort + 10 });
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setNewName("");
    onChanged();
    toast({ title: "Kategorie hinzugefügt" });
  };

  const removeCategory = async (id: string) => {
    const { error } = await supabase.from("service_provider_categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dienstleister-Kategorien verwalten</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Diese Kategorien stehen bei allen Gebäuden zur Auswahl.
          </p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="z.B. Heizung/Sanitär"
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
            />
            <Button size="sm" onClick={addCategory} disabled={!newName.trim() || saving}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{c.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removeCategory(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmergencyEditDialog({
  assignment, onClose, onSaved,
}: {
  assignment: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState("");
  const [sortOrder, setSortOrder] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const open = !!assignment;
  const assignmentId = assignment?.id;

  useEffect(() => {
    if (assignment) {
      setEnabled(!!assignment.is_emergency_contact);
      setNote(assignment.emergency_note || "");
      setSortOrder(
        assignment.emergency_sort_order !== null && assignment.emergency_sort_order !== undefined
          ? String(assignment.emergency_sort_order)
          : ""
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const handleSave = async () => {
    if (!assignment) return;
    setSaving(true);
    const { error } = await supabase
      .from("contact_building_assignments")
      .update({
        is_emergency_contact: enabled,
        emergency_note: note.trim() || null,
        emergency_sort_order: sortOrder ? parseInt(sortOrder, 10) : null,
      })
      .eq("id", assignment.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notfall-Einstellungen gespeichert" });
    onSaved();
    onClose();
  };

  const contactName =
    assignment?.contact?.company_name ||
    [assignment?.contact?.first_name, assignment?.contact?.last_name].filter(Boolean).join(" ") ||
    "Dienstleister";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-orange-600" />
            Notfallkontakt-Einstellungen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{contactName}</span>
            {assignment?.service_category && <> · {assignment.service_category}</>}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5 pr-3">
              <Label className="text-sm">Als Notfallkontakt anzeigen</Label>
              <p className="text-xs text-muted-foreground">
                Wird Bewohnern oben am Schwarzen Brett angezeigt.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div>
            <Label className="text-xs">Hinweis für Bewohner (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. 24/7 erreichbar, nur Werktags 7–17 Uhr..."
              className="text-sm min-h-[60px]"
              disabled={!enabled}
            />
          </div>

          <div>
            <Label className="text-xs">Reihenfolge (optional)</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="z. B. 10 (kleinere Zahl = weiter oben)"
              className="h-9 text-sm"
              disabled={!enabled}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
