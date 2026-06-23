import React, { useState, useEffect, memo, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Search, User, Building2, Wrench, Upload, ChevronLeft, ChevronRight,
  SlidersHorizontal, X, Phone, Mail, MessageCircle, Star, Siren,
} from "lucide-react";
import { CreateContactDialog } from "./CreateContactDialog";
import { ImportContactsCsvDialog } from "./ImportContactsCsvDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  SERVICE_PROVIDER_CATEGORIES,
  SERVICE_PROVIDER_GROUPS,
  getCategoryLabel,
  type ServiceProviderGroup,
} from "@/lib/serviceProviderCategories";
import type { Contact, ContactFilters } from "@/pages/Contacts";
import { toTelHref } from "@/lib/phone";

const TYPE_CONFIG: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  person: { label: "Person", icon: User, variant: "secondary" },
  company: { label: "Firma", icon: Building2, variant: "default" },
  service_provider: { label: "Dienstleister", icon: Wrench, variant: "secondary" },
};

interface ContactListProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: () => void;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  filters: ContactFilters;
  onFiltersChange: (f: ContactFilters) => void;
  cityOptions: string[];
}

const getDisplayName = (c: Contact) => {
  if (c.company_name) return c.company_name;
  if (c.short_name) return c.short_name;
  return [c.last_name, c.first_name].filter(Boolean).join(", ") || "Unbenannt";
};

interface PrimaryComm {
  name?: string;
  phone?: string;
  email?: string;
}

const ContactRow = memo(function ContactRow({
  contact,
  selected,
  onSelect,
  comm,
}: {
  contact: Contact;
  selected: boolean;
  onSelect: (id: string) => void;
  comm?: PrimaryComm;
}) {
  const typeConfig = TYPE_CONFIG[contact.contact_type || "person"];
  const cats = (contact.service_provider_categories ?? []).slice(0, 3);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const telHref = toTelHref(comm?.phone);
  const mailHref = comm?.email ? `mailto:${comm.email}` : null;
  const waHref = comm?.phone
    ? `https://wa.me/${comm.phone.replace(/[^\d+]/g, "").replace(/^\+/, "")}`
    : null;

  return (
    <div
      onClick={() => onSelect(contact.id)}
      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-border transition-colors ${
        selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted"
      }`}
    >
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        {typeConfig ? <typeConfig.icon className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium truncate">{getDisplayName(contact)}</p>
          {typeConfig && contact.contact_type && contact.contact_type !== "person" && (
            <Badge variant={typeConfig.variant} className="text-[9px] px-1 py-0 shrink-0">
              {typeConfig.label}
            </Badge>
          )}
          {contact.is_emergency_service && (
            <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0 gap-0.5">
              <Siren className="h-2.5 w-2.5" /> Notdienst
            </Badge>
          )}
          {contact.rating ? (
            <span className="flex items-center text-[10px] text-amber-600 dark:text-amber-400 gap-0.5">
              <Star className="h-3 w-3 fill-current" />{contact.rating}
            </span>
          ) : null}
        </div>

        {comm?.name && (contact.contact_type === "company" || contact.contact_type === "service_provider") && (
          <p className="text-xs text-muted-foreground truncate">{comm.name}</p>
        )}

      </div>
    </div>
  );
});

function VirtualContactRows({
  contacts, selectedId, onSelect, loading, search, comms,
}: {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  search: string;
  comms: Record<string, PrimaryComm>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 10,
  });

  if (loading) {
    return <div className="flex-1 p-4 text-center text-muted-foreground text-sm">Laden...</div>;
  }
  if (contacts.length === 0) {
    return (
      <div className="flex-1 p-4 text-center text-muted-foreground text-sm">
        {search ? "Keine Ergebnisse" : "Keine Kontakte mit diesen Filtern"}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const c = contacts[vi.index];
          return (
            <div
              key={c.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <ContactRow
                contact={c}
                selected={selectedId === c.id}
                onSelect={onSelect}
                comm={comms[c.id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPopover({
  filters, onChange, cityOptions,
}: {
  filters: ContactFilters;
  onChange: (f: ContactFilters) => void;
  cityOptions: string[];
}) {
  const [catSearch, setCatSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const grouped = useMemo(() => {
    const term = catSearch.trim().toLowerCase();
    const out: Record<ServiceProviderGroup, typeof SERVICE_PROVIDER_CATEGORIES> = {} as any;
    SERVICE_PROVIDER_CATEGORIES.forEach((c) => {
      if (term && !c.label.toLowerCase().includes(term)) return;
      (out[c.group] ||= []).push(c);
    });
    return out;
  }, [catSearch]);

  const filteredCities = useMemo(() => {
    const term = citySearch.trim().toLowerCase();
    return term ? cityOptions.filter((c) => c.toLowerCase().includes(term)) : cityOptions;
  }, [citySearch, cityOptions]);

  const toggleCat = (id: string) => {
    const next = filters.categories.includes(id)
      ? filters.categories.filter((c) => c !== id)
      : [...filters.categories, id];
    onChange({ ...filters, categories: next });
  };
  const toggleCity = (city: string) => {
    const next = filters.cities.includes(city)
      ? filters.cities.filter((c) => c !== city)
      : [...filters.cities, city];
    onChange({ ...filters, cities: next });
  };

  return (
    <PopoverContent className="w-[360px] p-0" align="end">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Filter</h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onChange({
                categories: [], cities: [], zipPrefix: "",
                emergencyOnly: false, poolOnly: false, sortByRating: false,
              })
            }
          >
            Zurücksetzen
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[440px]">
        <div className="p-3 space-y-4">
          {/* Gewerke */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Gewerke</Label>
            <Input
              placeholder="Gewerk suchen…"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="space-y-2">
              {(Object.keys(SERVICE_PROVIDER_GROUPS) as ServiceProviderGroup[]).map((g) => {
                const items = grouped[g];
                if (!items || items.length === 0) return null;
                return (
                  <div key={g}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      {SERVICE_PROVIDER_GROUPS[g]}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {items.map((c) => {
                        const on = filters.categories.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCat(c.id)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                              on
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Orte */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Ort</Label>
            <Input
              placeholder="Ort suchen…"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredCities.length === 0 && (
                <p className="text-xs text-muted-foreground">Keine Treffer</p>
              )}
              {filteredCities.map((city) => {
                const on = filters.cities.includes(city);
                return (
                  <label
                    key={city}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted px-1 py-0.5 rounded"
                  >
                    <Checkbox checked={on} onCheckedChange={() => toggleCity(city)} />
                    <span className="text-xs">{city}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* PLZ */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">PLZ-Bereich</Label>
            <Input
              placeholder="z. B. 87 für 87xxx"
              value={filters.zipPrefix}
              onChange={(e) => onChange({ ...filters, zipPrefix: e.target.value })}
              className="h-8 text-xs"
              inputMode="numeric"
            />
          </div>

          <Separator />

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="f-emergency" className="text-xs cursor-pointer flex items-center gap-2">
                <Siren className="h-3.5 w-3.5 text-destructive" /> Nur Notdienst / 24h
              </Label>
              <Switch
                id="f-emergency"
                checked={filters.emergencyOnly}
                onCheckedChange={(v) => onChange({ ...filters, emergencyOnly: !!v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="f-pool" className="text-xs cursor-pointer flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-primary" /> Nur Dienstleister-Pool
              </Label>
              <Switch
                id="f-pool"
                checked={filters.poolOnly}
                onCheckedChange={(v) => onChange({ ...filters, poolOnly: !!v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="f-rating" className="text-xs cursor-pointer flex items-center gap-2">
                <Star className="h-3.5 w-3.5 text-amber-500" /> Beste Bewertung zuerst
              </Label>
              <Switch
                id="f-rating"
                checked={filters.sortByRating}
                onCheckedChange={(v) => onChange({ ...filters, sortByRating: !!v })}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </PopoverContent>
  );
}

export function ContactList({
  contacts, selectedId, onSelect, onCreated, loading,
  search, onSearchChange, page, pageSize, total, onPageChange,
  filters, onFiltersChange, cityOptions,
}: ContactListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [comms, setComms] = useState<Record<string, PrimaryComm>>({});
  const [searchInput, setSearchInput] = useState(search);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => onSearchChange(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput, onSearchChange]);

  // Lade Primary-Person + Telefon + E-Mail für die sichtbaren Kontakte
  useEffect(() => {
    if (contacts.length === 0) {
      setComms({});
      return;
    }
    const ids = contacts.map((c) => c.id);
    let cancelled = false;
    (async () => {
      const [personsRes, phonesRes, emailsRes] = await Promise.all([
        supabase
          .from("contact_persons")
          .select("id, contact_id, first_name, last_name, phone, email, is_primary")
          .in("contact_id", ids),
        supabase
          .from("contact_phones")
          .select("contact_id, person_id, phone_number")
          .in("contact_id", ids),
        supabase
          .from("contact_emails")
          .select("contact_id, person_id, email, is_primary")
          .in("contact_id", ids),
      ]);
      if (cancelled) return;

      const map: Record<string, PrimaryComm> = {};
      const personById = new Map<string, any>();
      (personsRes.data || []).forEach((p: any) => personById.set(p.id, p));

      (personsRes.data || []).forEach((p: any) => {
        if (!p.is_primary) return;
        const cur = map[p.contact_id] || {};
        cur.name = [p.first_name, p.last_name].filter(Boolean).join(" ") || cur.name;
        if (!cur.phone && p.phone) cur.phone = p.phone;
        if (!cur.email && p.email) cur.email = p.email;
        map[p.contact_id] = cur;
      });
      (phonesRes.data || []).forEach((ph: any) => {
        const cur = map[ph.contact_id] || {};
        if (!cur.phone && ph.phone_number) {
          // Bevorzuge Telefone der Primary-Person
          const person = ph.person_id ? personById.get(ph.person_id) : null;
          if (!person || person.is_primary || !cur.phone) cur.phone = ph.phone_number;
        }
        map[ph.contact_id] = cur;
      });
      (emailsRes.data || []).forEach((em: any) => {
        const cur = map[em.contact_id] || {};
        if ((!cur.email || em.is_primary) && em.email) cur.email = em.email;
        map[em.contact_id] = cur;
      });

      setComms(map);
    })();
    return () => { cancelled = true; };
  }, [contacts]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min(total, (page + 1) * pageSize);

  const activeFilterCount =
    filters.categories.length + filters.cities.length +
    (filters.zipPrefix.trim() ? 1 : 0) +
    (filters.emergencyOnly ? 1 : 0) +
    (filters.poolOnly ? 1 : 0) +
    (filters.sortByRating ? 1 : 0);

  const removeCategory = (id: string) =>
    onFiltersChange({ ...filters, categories: filters.categories.filter((c) => c !== id) });
  const removeCity = (city: string) =>
    onFiltersChange({ ...filters, cities: filters.cities.filter((c) => c !== city) });

  return (
    <div className="h-full flex flex-col border-r border-border bg-background">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Adressen</h2>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" onClick={() => setShowImport(true)} title="CSV importieren">
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen (Name, Firma, Notizen)…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative" title="Filter">
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <FilterPopover filters={filters} onChange={onFiltersChange} cityOptions={cityOptions} />
          </Popover>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1">
            {filters.categories.map((id) => (
              <Badge key={`c-${id}`} variant="secondary" className="text-[10px] gap-1">
                {getCategoryLabel(id)}
                <button onClick={() => removeCategory(id)}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {filters.cities.map((city) => (
              <Badge key={`o-${city}`} variant="secondary" className="text-[10px] gap-1">
                {city}
                <button onClick={() => removeCity(city)}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {filters.zipPrefix.trim() && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                PLZ {filters.zipPrefix.trim()}*
                <button onClick={() => onFiltersChange({ ...filters, zipPrefix: "" })}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {filters.emergencyOnly && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                Notdienst
                <button onClick={() => onFiltersChange({ ...filters, emergencyOnly: false })}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {filters.poolOnly && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                Pool
                <button onClick={() => onFiltersChange({ ...filters, poolOnly: false })}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {filters.sortByRating && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                ★ sortiert
                <button onClick={() => onFiltersChange({ ...filters, sortByRating: false })}><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </div>

      <VirtualContactRows
        contacts={contacts}
        selectedId={selectedId}
        onSelect={onSelect}
        loading={loading}
        search={search}
        comms={comms}
      />

      {total > pageSize && (
        <div className="border-t border-border p-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{showingFrom}–{showingTo} von {total}</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              disabled={page === 0} onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1">{page + 1} / {totalPages}</span>
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateContactDialog open={showCreate} onOpenChange={setShowCreate} onCreated={onCreated} />
      <ImportContactsCsvDialog open={showImport} onOpenChange={setShowImport} onImported={onCreated} />
    </div>
  );
}
