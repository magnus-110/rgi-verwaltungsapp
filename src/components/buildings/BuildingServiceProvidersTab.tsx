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
import { Briefcase, Plus, Phone, Mail, Trash2, ExternalLink, Settings2, Link2, Bell, BellRing, ShieldAlert, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KontaktAuswahl } from "@/components/contacts/KontaktAuswahl";
import { Switch } from "@/components/ui/switch";
import { toTelHref, phoneWithNote } from "@/lib/phone";

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
  const [editId, setEditId] = useState<string | null>(null);

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
            contact_phones(phone_number, label, note),
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
                          <a href={toTelHref(primaryPhone.phone_number) || undefined} className="flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" /> {phoneWithNote(primaryPhone.phone_number, primaryPhone.note)}
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
                        className="h-7 w-7"
                        title="Bearbeiten"
                        onClick={() => setEditId(p.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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

      <FreitextDienstleister buildingId={buildingId} categories={categories} />

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

      <EditProviderDialog
        assignment={providers.find((p) => p.id === editId) || null}
        categories={categories}
        onClose={() => setEditId(null)}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSelectedId(null);
    setCategory(categories[0]?.name || ""); setNotes("");
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

  const schonZugeordnet =
    !!selectedId && !!category && existingAssignments.some((a) => a.contactId === selectedId && a.category === category);

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
              <Label className="text-xs">Kontakt aus Adressen</Label>
              <KontaktAuswahl
                className="mt-1"
                value={selectedId}
                onChange={(id) => setSelectedId(id)}
                placeholder="Firma oder Name suchen …"
                neuTitel="Neuer Dienstleister"
                neuVorbelegung={{ contactType: "company", isServiceProvider: true }}
              />
              {schonZugeordnet && (
                <p className="mt-1 text-xs text-destructive">Dieser Kontakt ist hier schon als „{category}“ eingetragen.</p>
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
            <Button onClick={handleSave} disabled={!selectedId || !category || saving || schonZugeordnet}>
              {saving ? "Speichern..." : "Zuordnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function EditProviderDialog({
  assignment, categories, onClose, onSaved,
}: {
  assignment: any | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const open = !!assignment;
  const assignmentId = assignment?.id;

  useEffect(() => {
    if (assignment) {
      setCategory(assignment.service_category || "Sonstiges");
      setNotes(assignment.notes || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const handleSave = async () => {
    if (!assignment) return;
    setSaving(true);
    const { error } = await supabase
      .from("contact_building_assignments")
      .update({
        service_category: category || "Sonstiges",
        notes: notes.trim() || null,
      })
      .eq("id", assignment.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dienstleister aktualisiert" });
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
            <Pencil className="h-4 w-4" />
            Dienstleister bearbeiten
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{contactName}</span>
          </div>

          <div>
            <Label className="text-xs">Gewerk / Kategorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
                {category && !categories.some((c) => c.name === category) && (
                  <SelectItem value={category}>{category}</SelectItem>
                )}
              </SelectContent>
            </Select>
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
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !category}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dienstleister, die nur als Text am Gebäude stehen (building_service_providers, z. B. aus dem Eigentümer-Fragebogen).
 * Verknüpfen mit einem Kontakt aus „Adressen“: setzt contact_id und trägt den Kontakt als Dienstleister am Gebäude ein.
 * Der Text bleibt erhalten.
 */
function FreitextDienstleister({ buildingId, categories }: { buildingId: string; categories: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: zeilen = [] } = useQuery({
    queryKey: ["building-service-providers-freitext", buildingId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("building_service_providers")
        .select("id, name, category, phone, email, notes, source, contact_id")
        .eq("building_id", buildingId)
        .is("contact_id", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as {
        id: string; name: string; category: string | null; phone: string | null; email: string | null;
        notes: string | null; source: string | null; contact_id: string | null;
      }[];
    },
  });

  if (!zeilen.length) return null;

  const verknuepfen = async (z: (typeof zeilen)[number], contactId: string | null) => {
    if (!contactId) return;
    const kat =
      categories.find((c) => c.name.toLowerCase() === (z.category ?? "").toLowerCase())?.name || z.category || "Sonstiges";
    const { error } = await (supabase as any).from("building_service_providers").update({ contact_id: contactId }).eq("id", z.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    const { data: schon } = await supabase
      .from("contact_building_assignments")
      .select("id")
      .eq("building_id", buildingId)
      .eq("contact_id", contactId)
      .eq("role_in_building", "dienstleister" as any)
      .eq("service_category", kat)
      .limit(1);
    if (!schon?.length) {
      const { error: e2 } = await supabase.from("contact_building_assignments").insert({
        contact_id: contactId,
        building_id: buildingId,
        role_in_building: "dienstleister" as any,
        service_category: kat,
        notes: z.notes || null,
      });
      if (e2) {
        toast({ title: "Fehler", description: e2.message, variant: "destructive" });
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["building-service-providers-freitext", buildingId] });
    queryClient.invalidateQueries({ queryKey: ["building-service-providers", buildingId] });
    toast({ title: "Mit Kontakt verknüpft", description: `„${z.name}“ ist jetzt als ${kat} eingetragen.` });
  };

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Nur als Text erfasst
          </p>
          <p className="text-xs text-muted-foreground">
            Diese Angaben stammen z. B. aus dem Eigentümer-Fragebogen. Bitte mit einem Kontakt aus „Adressen“ verknüpfen.
          </p>
        </div>
        {zeilen.map((z) => (
          <div key={z.id} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2 sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm">{z.name}</span>
                {z.category && <Badge variant="secondary" className="text-[10px]">{z.category}</Badge>}
              </div>
              {(z.phone || z.email || z.notes) && (
                <p className="truncate text-xs text-muted-foreground">{[z.phone, z.email, z.notes].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <KontaktAuswahl
              value={null}
              freitext={z.name}
              onChange={(id) => verknuepfen(z, id)}
              placeholder="Kontakt wählen …"
              neuTitel="Neuer Dienstleister"
              neuVorbelegung={{
                contactType: "company",
                isServiceProvider: true,
                phone: z.phone,
                email: z.email,
                notes: z.notes,
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
