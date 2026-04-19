import React, { useState, useEffect, memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, Building2, Wrench, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { CreateContactDialog } from "./CreateContactDialog";
import { ImportContactsCsvDialog } from "./ImportContactsCsvDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Contact } from "@/pages/Contacts";

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
  // Server-Side Pagination + Suche
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}

const getDisplayName = (c: Contact) => {
  if (c.company_name) return c.company_name;
  if (c.short_name) return c.short_name;
  return [c.last_name, c.first_name].filter(Boolean).join(", ") || "Unbenannt";
};

const ContactRow = memo(function ContactRow({
  contact,
  selected,
  onSelect,
  primaryName,
}: {
  contact: Contact;
  selected: boolean;
  onSelect: (id: string) => void;
  primaryName?: string;
}) {
  const typeConfig = TYPE_CONFIG[contact.contact_type || "person"];
  return (
    <div
      onClick={() => onSelect(contact.id)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border transition-colors ${
        selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted"
      }`}
    >
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        {typeConfig ? <typeConfig.icon className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{getDisplayName(contact)}</p>
          {typeConfig && contact.contact_type && contact.contact_type !== "person" && (
            <Badge variant={typeConfig.variant} className="text-[9px] px-1 py-0 shrink-0">
              {typeConfig.label}
            </Badge>
          )}
        </div>
        {primaryName && (contact.contact_type === "company" || contact.contact_type === "service_provider") && (
          <p className="text-xs text-muted-foreground truncate">{primaryName}</p>
        )}
        {contact.short_name && contact.company_name && (
          <p className="text-xs text-muted-foreground truncate">{contact.short_name}</p>
        )}
      </div>
    </div>
  );
});

export function ContactList({
  contacts,
  selectedId,
  onSelect,
  onCreated,
  loading,
  search,
  onSearchChange,
  page,
  pageSize,
  total,
  onPageChange,
}: ContactListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [primaryPersons, setPrimaryPersons] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState(search);

  // Debounce Server-Side-Search
  useEffect(() => {
    const t = setTimeout(() => onSearchChange(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput, onSearchChange]);

  // Lade Primary Persons NUR für die sichtbaren Kontakte
  useEffect(() => {
    if (contacts.length === 0) {
      setPrimaryPersons({});
      return;
    }
    const ids = contacts.map((c) => c.id);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("contact_persons")
        .select("contact_id, first_name, last_name")
        .in("contact_id", ids)
        .eq("is_primary", true);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((p: any) => {
        map[p.contact_id] = [p.first_name, p.last_name].filter(Boolean).join(" ");
      });
      setPrimaryPersons(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min(total, (page + 1) * pageSize);

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <VirtualContactRows
        contacts={contacts}
        selectedId={selectedId}
        onSelect={onSelect}
        loading={loading}
        search={search}
        primaryPersons={primaryPersons}
      />


      {total > pageSize && (
        <div className="border-t border-border p-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{showingFrom}–{showingTo} von {total}</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={page + 1 >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateContactDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={onCreated}
      />
      <ImportContactsCsvDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={onCreated}
      />
    </div>
  );
}
