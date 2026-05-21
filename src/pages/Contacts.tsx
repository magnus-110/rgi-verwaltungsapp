import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContactList } from "@/components/contacts/ContactList";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";

export interface Contact {
  id: string;
  short_name: string | null;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  notes: string | null;
  contact_type: string | null;
  is_service_provider_pool?: boolean | null;
  service_provider_categories?: string[] | null;
  trade_notes?: string | null;
  rating?: number | null;
  last_hired_at?: string | null;
  is_emergency_service?: boolean | null;
  address_lat?: number | null;
  address_lon?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ContactFilters {
  categories: string[];
  cities: string[];
  zipPrefix: string;
  emergencyOnly: boolean;
  poolOnly: boolean;
  sortByRating: boolean;
}

const PAGE_SIZE = 100;

const DEFAULT_FILTERS: ContactFilters = {
  categories: [],
  cities: [],
  zipPrefix: "",
  emergencyOnly: false,
  poolOnly: false,
  sortByRating: false,
};

export function Contacts() {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ContactFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Server-Side Pagination + Suche + Filter
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["contacts", search, page, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("contacts")
        .select(
          "id, short_name, salutation, first_name, last_name, company_name, address_street, address_zip, address_city, notes, contact_type, is_service_provider_pool, service_provider_categories, trade_notes, rating, last_hired_at, is_emergency_service, address_lat, address_lon, created_at, updated_at",
          { count: "exact" }
        );

      // Sortierung: Bewertung absteigend ODER Name aufsteigend
      if (filters.sortByRating) {
        q = q.order("rating", { ascending: false, nullsFirst: false })
             .order("last_name", { ascending: true, nullsFirst: false });
      } else {
        q = q.order("last_name", { ascending: true, nullsFirst: false });
      }
      q = q.range(from, to);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(
          `last_name.ilike.${term},first_name.ilike.${term},company_name.ilike.${term},short_name.ilike.${term},trade_notes.ilike.${term}`
        );
      }

      if (filters.categories.length > 0) {
        q = q.overlaps("service_provider_categories", filters.categories);
      }
      if (filters.cities.length > 0) {
        q = q.in("address_city", filters.cities);
      }
      if (filters.zipPrefix.trim()) {
        q = q.ilike("address_zip", `${filters.zipPrefix.trim()}%`);
      }
      if (filters.emergencyOnly) {
        q = q.eq("is_emergency_service", true);
      }
      if (filters.poolOnly) {
        q = q.eq("is_service_provider_pool", true);
      }

      const { data, error, count } = await q;
      if (error) {
        toast({ title: "Fehler", description: error.message, variant: "destructive" });
        throw error;
      }
      return { rows: (data || []) as Contact[], total: count ?? 0 };
    },
  });

  const contacts = data?.rows || [];
  const total = data?.total || 0;

  // Distinct Städte für Filter-UI (einmalig)
  const { data: cityOptions = [] } = useQuery({
    queryKey: ["contact-cities"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("address_city")
        .not("address_city", "is", null)
        .limit(2000);
      const set = new Set<string>();
      (data || []).forEach((r: any) => {
        const v = (r.address_city || "").trim();
        if (v) set.add(v);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
    },
  });

  // Selektierten Kontakt einzeln laden, falls nicht in der aktuellen Seite
  const { data: selectedFromUrl } = useQuery({
    queryKey: ["contact-by-id", selectedContactId],
    enabled: !!selectedContactId && !contacts.some((c) => c.id === selectedContactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id, short_name, salutation, first_name, last_name, company_name, address_street, address_zip, address_city, notes, contact_type, is_service_provider_pool, service_provider_categories, trade_notes, rating, last_hired_at, is_emergency_service, address_lat, address_lon, created_at, updated_at"
        )
        .eq("id", selectedContactId!)
        .maybeSingle();
      if (error) throw error;
      return data as Contact | null;
    },
  });

  // Seite zurücksetzen bei Suchänderung oder Filter-Änderung
  useEffect(() => {
    setPage(0);
  }, [search, filters]);

  // ?id= aus URL anwenden
  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    if (idFromUrl) setSelectedContactId(idFromUrl);
  }, [searchParams]);

  const handleSelect = (id: string | null) => {
    setSelectedContactId(id);
    if (id) setSearchParams({ id }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const handleDeleted = () => {
    handleSelect(null);
    refetch();
  };

  const selectedContact =
    contacts.find((c) => c.id === selectedContactId) || selectedFromUrl || null;

  if (isMobile) {
    if (selectedContactId && selectedContact) {
      return (
        <div className="h-full">
          <ContactDetail
            contact={selectedContact}
            onBack={() => handleSelect(null)}
            onUpdate={refetch}
            onDeleted={handleDeleted}
          />
        </div>
      );
    }
    return (
      <div className="h-full">
        <ContactList
          contacts={contacts}
          selectedId={selectedContactId}
          onSelect={handleSelect}
          onCreated={refetch}
          loading={isLoading}
          search={search}
          onSearchChange={setSearch}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)]">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <ContactList
            contacts={contacts}
            selectedId={selectedContactId}
            onSelect={handleSelect}
            onCreated={refetch}
            loading={isLoading}
            search={search}
            onSearchChange={setSearch}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          {selectedContact ? (
            <ContactDetail
              contact={selectedContact}
              onUpdate={refetch}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>Wählen Sie einen Kontakt aus der Liste</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
