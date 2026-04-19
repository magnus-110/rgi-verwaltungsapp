import { useState } from "react";
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
import { Briefcase, Plus, Phone, Mail, Trash2, ExternalLink, Search, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";

const SERVICE_CATEGORIES = [
  { value: "handwerker", label: "Handwerker" },
  { value: "hausmeister", label: "Hausmeister" },
  { value: "versicherung", label: "Versicherung" },
  { value: "ablesefirma", label: "Ablesefirma" },
  { value: "schornsteinfeger", label: "Schornsteinfeger" },
  { value: "versorger", label: "Versorger" },
  { value: "reinigung", label: "Reinigung" },
  { value: "gaertner", label: "Gärtner" },
  { value: "sonstiges", label: "Sonstiges" },
];

const labelOf = (v?: string | null) =>
  SERVICE_CATEGORIES.find((c) => c.value === v)?.label ?? "Sonstiges";

interface Props {
  buildingId: string;
}

export function BuildingServiceProvidersTab({ buildingId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("alle");
  const [showAdd, setShowAdd] = useState(false);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["building-service-providers", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, service_category, notes, unit_number,
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
    filter === "alle" ? true : (p.service_category ?? "sonstiges") === filter
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
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Dienstleister hinzufügen
        </Button>
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
        {SERVICE_CATEGORIES.map((cat) => {
          const count = providers.filter((p) => (p.service_category ?? "sonstiges") === cat.value).length;
          if (count === 0) return null;
          return (
            <Badge
              key={cat.value}
              variant={filter === cat.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter(cat.value)}
            >
              {cat.label} ({count})
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
                          {labelOf(p.service_category)}
                        </Badge>
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
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
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
        existingContactIds={providers.map((p) => p.contact?.id).filter(Boolean)}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ["building-service-providers", buildingId] })}
      />
    </div>
  );
}

function AddProviderDialog({
  open, onOpenChange, buildingId, existingContactIds, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildingId: string;
  existingContactIds: string[];
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("handwerker");
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

  const filtered = contacts.filter((c) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      (c.company_name || "").toLowerCase().includes(term) ||
      (c.first_name || "").toLowerCase().includes(term) ||
      (c.last_name || "").toLowerCase().includes(term)
    );
  });

  const reset = () => {
    setSearch(""); setSelectedId(null); setCategory("handwerker"); setNotes("");
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: selectedId,
      building_id: buildingId,
      role_in_building: "dienstleister" as any,
      service_category: category,
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

  const getName = (c: any) =>
    c.company_name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";

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
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Kontakt auswählen</Label>
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
                {filtered.length === 0 ? (
                  <p className="p-3 text-xs text-center text-muted-foreground">
                    Keine Treffer
                  </p>
                ) : (
                  filtered.map((c) => {
                    const isAssigned = existingContactIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => !isAssigned && setSelectedId(c.id)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                          isAssigned
                            ? "opacity-50 cursor-not-allowed"
                            : selectedId === c.id
                              ? "bg-primary/10 cursor-pointer"
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
            <Button onClick={handleSave} disabled={!selectedId || saving}>
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
