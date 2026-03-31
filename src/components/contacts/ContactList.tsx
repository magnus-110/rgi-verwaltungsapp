import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, Building2, Users, Wrench, Upload } from "lucide-react";
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
}

export function ContactList({ contacts, selectedId, onSelect, onCreated, loading }: ContactListProps) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [primaryPersons, setPrimaryPersons] = useState<Record<string, string>>({});

  // Load primary person names for all contacts
  useEffect(() => {
    const loadPrimaryPersons = async () => {
      const { data } = await supabase
        .from("contact_persons")
        .select("contact_id, first_name, last_name")
        .eq("is_primary", true);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => {
          map[p.contact_id] = [p.first_name, p.last_name].filter(Boolean).join(" ");
        });
        setPrimaryPersons(map);
      }
    };
    loadPrimaryPersons();
  }, [contacts]);

  const filtered = contacts.filter((c) => {
    const term = search.toLowerCase();
    return (
      (c.first_name || "").toLowerCase().includes(term) ||
      (c.last_name || "").toLowerCase().includes(term) ||
      (c.company_name || "").toLowerCase().includes(term) ||
      (c.short_name || "").toLowerCase().includes(term) ||
      (primaryPersons[c.id] || "").toLowerCase().includes(term)
    );
  });

  const getDisplayName = (c: Contact) => {
    if (c.company_name) return c.company_name;
    if (c.short_name) return c.short_name;
    return [c.last_name, c.first_name].filter(Boolean).join(", ") || "Unbenannt";
  };

  return (
    <div className="h-full flex flex-col border-r border-border bg-background">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Adressen</h2>
          <Button size="icon" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {search ? "Keine Ergebnisse" : "Noch keine Kontakte"}
          </div>
        ) : (
          filtered.map((c) => {
            const typeConfig = TYPE_CONFIG[c.contact_type || "person"];
            const primaryName = primaryPersons[c.id];
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border transition-colors ${
                  selectedId === c.id
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-muted"
                }`}
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {typeConfig ? <typeConfig.icon className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{getDisplayName(c)}</p>
                    {typeConfig && c.contact_type && c.contact_type !== "person" && (
                      <Badge variant={typeConfig.variant} className="text-[9px] px-1 py-0 shrink-0">
                        {typeConfig.label}
                      </Badge>
                    )}
                  </div>
                  {primaryName && (c.contact_type === "company" || c.contact_type === "service_provider") && (
                    <p className="text-xs text-muted-foreground truncate">{primaryName}</p>
                  )}
                  {c.short_name && c.company_name && (
                    <p className="text-xs text-muted-foreground truncate">{c.short_name}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <CreateContactDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={onCreated}
      />
    </div>
  );
}
