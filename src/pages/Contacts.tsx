import React, { useState, useEffect } from "react";
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
  created_at: string;
  updated_at: string;
}

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("last_name", { ascending: true });

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleDeleted = () => {
    setSelectedContactId(null);
    fetchContacts();
  };

  const selectedContact = contacts.find((c) => c.id === selectedContactId) || null;

  if (isMobile) {
    if (selectedContactId && selectedContact) {
      return (
        <div className="h-full">
          <ContactDetail
            contact={selectedContact}
            onBack={() => setSelectedContactId(null)}
            onUpdate={fetchContacts}
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
          onSelect={setSelectedContactId}
          onCreated={fetchContacts}
          loading={loading}
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
            onSelect={setSelectedContactId}
            onCreated={fetchContacts}
            loading={loading}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          {selectedContact ? (
            <ContactDetail
              contact={selectedContact}
              onUpdate={fetchContacts}
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
