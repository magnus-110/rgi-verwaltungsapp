import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, User, ChevronDown, ChevronUp, Phone, Mail, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AssignContactDialog } from "./AssignContactDialog";

interface ContactAssignment {
  id: string;
  contact_id: string;
  unit_number: string | null;
  floor_location: string | null;
  usage_type: string | null;
  role_in_building: string | null;
  notes: string | null;
  is_active: boolean;
  contact: {
    id: string;
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  };
  shares: { share_type: string; share_value: number }[];
  phones: { phone_number: string; label: string }[];
  emails: { email: string; label: string }[];
  costs: { cost_type: string; amount: number; interval: string }[];
}

const USAGE_LABELS: Record<string, string> = {
  selbstbewohnt: "Selbstbewohnt",
  zweitwohnsitz: "Zweitwohnsitz",
  vermietet: "Vermietet",
  fewo: "FeWo",
  leerstand: "Leerstand",
};

const ROLE_LABELS: Record<string, string> = {
  eigentuemer: "Eigentümer",
  mieter: "Mieter",
  verwalter: "Verwalter",
  beirat: "Beirat",
};

interface Props {
  buildingId: string;
}

export function BuildingContactsList({ buildingId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const { data: assignments = [], refetch } = useQuery({
    queryKey: ['building-contact-assignments', buildingId],
    queryFn: async () => {
      // Get assignments with contact info
      const { data: assignData, error } = await supabase
        .from("contact_building_assignments")
        .select("*, contact:contacts(id, salutation, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("created_at");
      
      if (error || !assignData) return [];

      // Get shares, phones, emails, costs for all assignments
      const assignmentIds = assignData.map(a => a.id);
      const contactIds = assignData.map(a => a.contact_id);

      const [sharesRes, phonesRes, emailsRes, costsRes] = await Promise.all([
        assignmentIds.length > 0 
          ? supabase.from("contact_building_shares").select("*").in("assignment_id", assignmentIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from("contact_phones").select("*").in("contact_id", contactIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from("contact_emails").select("*").in("contact_id", contactIds)
          : { data: [] },
        assignmentIds.length > 0
          ? supabase.from("contact_building_costs").select("*").in("assignment_id", assignmentIds)
          : { data: [] },
      ]);

      return assignData.map(a => ({
        ...a,
        shares: (sharesRes.data || []).filter((s: any) => s.assignment_id === a.id),
        phones: (phonesRes.data || []).filter((p: any) => p.contact_id === a.contact_id),
        emails: (emailsRes.data || []).filter((e: any) => e.contact_id === a.contact_id),
        costs: (costsRes.data || []).filter((c: any) => c.assignment_id === a.id),
      })) as ContactAssignment[];
    },
  });

  const getDisplayName = (a: ContactAssignment) => {
    const c = a.contact;
    if (c.company_name) return c.company_name;
    return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const getMea = (a: ContactAssignment) => {
    const mea = a.shares.find(s => s.share_type === 'mea');
    return mea ? mea.share_value : null;
  };

  const getHausgeld = (a: ContactAssignment) => {
    const hg = a.costs.find(c => c.cost_type.toLowerCase().includes('hausgeld'));
    return hg ? hg.amount : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Kontakte ({assignments.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
          <Plus className="h-3 w-3 mr-1" /> Kontakt zuordnen
        </Button>
      </div>

      {assignments.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Keine Kontakte zugeordnet</p>
      )}

      {assignments.map((a) => {
        const isExpanded = expanded === a.id;
        const mea = getMea(a);
        const hausgeld = getHausgeld(a);

        return (
          <Card key={a.id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Compact row - always visible */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : a.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{getDisplayName(a)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                    {a.unit_number && <Badge variant="secondary" className="text-xs">Einheit {a.unit_number}</Badge>}
                    {a.role_in_building && <Badge variant="outline" className="text-xs">{ROLE_LABELS[a.role_in_building] || a.role_in_building}</Badge>}
                    {mea !== null && <Badge variant="secondary" className="text-xs">MEA: {mea}</Badge>}
                    {hausgeld !== null && <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{hausgeld.toFixed(2)} €</Badge>}
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {a.floor_location && (
                      <div>
                        <span className="text-muted-foreground text-xs">Etage/Lage</span>
                        <p className="font-medium">{a.floor_location}</p>
                      </div>
                    )}
                    {a.usage_type && (
                      <div>
                        <span className="text-muted-foreground text-xs">Nutzung</span>
                        <p className="font-medium">{USAGE_LABELS[a.usage_type] || a.usage_type}</p>
                      </div>
                    )}
                  </div>

                  {/* Contact info */}
                  {(a.phones.length > 0 || a.emails.length > 0) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {a.phones.map((p, i) => (
                        <span key={i} className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" /> {p.phone_number}
                        </span>
                      ))}
                      {a.emails.map((e, i) => (
                        <span key={i} className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" /> {e.email}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* All shares */}
                  {a.shares.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Anteile</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {a.shares.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {s.share_type.toUpperCase()}: {s.share_value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Costs */}
                  {a.costs.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Kosten</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {a.costs.map((c, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {c.cost_type}: {c.amount.toFixed(2)} € / {c.interval}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {a.notes && (
                    <div>
                      <span className="text-xs text-muted-foreground">Notizen</span>
                      <p className="text-sm mt-0.5">{a.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <AssignContactDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        buildingId={buildingId}
        onAssigned={refetch}
        existingContactIds={assignments.map(a => a.contact_id)}
      />
    </div>
  );
}
