import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, MailX, Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Selection ist assignment-basiert (pro Zuordnung Gebäude↔Kontakt↔Einheit),
 * NICHT contact-basiert. Damit lassen sich Eigentümer, die mehrfach im
 * Gebäude vorkommen (mehrere Einheiten/Rollen), einzeln abwählen.
 *
 * contact_ids wird zusätzlich abgeleitet (für Placeholder-Stats), damit
 * Bestands-Code (z. B. usePlaceholderStats) unverändert weiterläuft.
 *
 * Sentinel "__none__" in assignment_ids bedeutet: Empfängerliste leer.
 */
export type RecipientFilterValue = {
  roles: string[];
  contact_ids: string[];      // abgeleitet aus assignment_ids
  assignment_ids: string[];   // primäre Auswahl
  require_email: boolean;
};

interface Props {
  buildingId: string;
  requireEmail: boolean;
  value: RecipientFilterValue;
  onChange: (v: RecipientFilterValue) => void;
  /** Roles to hide entirely (e.g. ["dienstleister"] for Rundmails) */
  excludeRoles?: string[];
}

type AssignmentRow = {
  id: string;
  contact_id: string;
  unit_number: string | null;
  role_in_building: string | null;
  contacts: {
    id: string;
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
};

const NONE = "__none__";

export const RecipientPicker = ({ buildingId, requireEmail, value, onChange, excludeRoles }: Props) => {
  const [search, setSearch] = useState("");

  const { data: allAssignments = [], isLoading } = useQuery({
    queryKey: ["comm-recipient-source", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("id, contact_id, unit_number, role_in_building, contacts(id, salutation, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .or("is_active.is.null,is_active.eq.true");
      if (error) throw error;
      return (data || []) as unknown as AssignmentRow[];
    },
  });

  const assignments = useMemo(() => {
    if (!excludeRoles || excludeRoles.length === 0) return allAssignments;
    const ex = new Set(excludeRoles.map((r) => r.toLowerCase()));
    return allAssignments.filter((a) => !a.role_in_building || !ex.has(a.role_in_building.toLowerCase()));
  }, [allAssignments, excludeRoles]);

  const contactIds = useMemo(() => Array.from(new Set(assignments.map((a) => a.contact_id))), [assignments]);
  const { data: emailMap = new Map<string, boolean>() } = useQuery({
    queryKey: ["comm-recipient-emails", buildingId, contactIds.join(",")],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data: ce } = await supabase.from("contact_emails").select("contact_id").in("contact_id", contactIds);
      const { data: cp } = await supabase.from("contact_persons").select("contact_id, email").in("contact_id", contactIds);
      const map = new Map<string, boolean>();
      (ce || []).forEach((r: any) => map.set(r.contact_id, true));
      (cp || []).forEach((r: any) => { if (r.email) map.set(r.contact_id, true); });
      return map;
    },
  });

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => { if (a.role_in_building) set.add(a.role_in_building); });
    return Array.from(set).sort();
  }, [assignments]);

  const filtered = useMemo(() => {
    let rows = assignments;
    if (value.roles.length > 0) rows = rows.filter((a) => a.role_in_building && value.roles.includes(a.role_in_building));
    if (requireEmail) rows = rows.filter((a) => emailMap.get(a.contact_id));
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter((a) => {
        const c = a.contacts;
        if (!c) return false;
        const name = `${c.first_name || ""} ${c.last_name || ""} ${c.company_name || ""}`.toLowerCase();
        return name.includes(s) || (a.unit_number || "").toLowerCase().includes(s);
      });
    }
    return rows;
  }, [assignments, value.roles, requireEmail, emailMap, search]);

  // Explizit ausgewählt? (assignment_ids enthält reale Werte, nicht nur NONE)
  const explicitIds = (value.assignment_ids || []).filter((x) => x !== NONE);
  const isNone = (value.assignment_ids || []).includes(NONE);
  const useExplicit = explicitIds.length > 0;

  const effectiveSelectedIds = isNone
    ? new Set<string>()
    : useExplicit
      ? new Set(explicitIds)
      : new Set(filtered.map((a) => a.id));

  const emit = (assignmentIds: string[]) => {
    // Ableiten: welche contact_ids gehören dazu?
    const sel = new Set(assignmentIds);
    const cIds = Array.from(
      new Set(
        assignments
          .filter((a) => sel.has(a.id))
          .map((a) => a.contact_id),
      ),
    );
    onChange({
      ...value,
      assignment_ids: assignmentIds,
      contact_ids: cIds,
    });
  };

  const toggleAssignment = (assignmentId: string) => {
    // Wenn vorher implizit "alle", expandiere zuerst auf konkrete Liste
    const current = useExplicit
      ? new Set(explicitIds)
      : isNone
        ? new Set<string>()
        : new Set(filtered.map((a) => a.id));
    if (current.has(assignmentId)) current.delete(assignmentId);
    else current.add(assignmentId);
    emit(Array.from(current));
  };

  const selectAll = () => onChange({ ...value, assignment_ids: [], contact_ids: [] });
  const selectNone = () => onChange({ ...value, assignment_ids: [NONE], contact_ids: [] });

  const totalSelected = filtered.filter((a) => effectiveSelectedIds.has(a.id)).length;

  useEffect(() => {
    onChange({ ...value, require_email: requireEmail });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireEmail]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="multiple"
          value={value.roles}
          onValueChange={(roles) => onChange({ ...value, roles, assignment_ids: [], contact_ids: [] })}
          className="flex-wrap"
        >
          {availableRoles.map((r) => (
            <ToggleGroupItem key={r} value={r} className="capitalize">{r}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Name oder Einheit suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          {isLoading ? "Lade..." : `${totalSelected} von ${filtered.length} ausgewählt`}
          {requireEmail && <Badge variant="outline" className="ml-1">nur mit E-Mail</Badge>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">Alle</button>
          <button type="button" onClick={selectNone} className="text-xs text-primary hover:underline">Keine</button>
        </div>
      </div>

      <Card className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="p-2 space-y-1">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">Keine Empfänger gefunden.</p>
            )}
            {filtered.map((a) => {
              const c = a.contacts;
              const name = c?.company_name || `${c?.first_name || ""} ${c?.last_name || ""}`.trim() || "(ohne Name)";
              const checked = effectiveSelectedIds.has(a.id);
              const hasEmail = emailMap.get(a.contact_id);
              return (
                <label key={a.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => toggleAssignment(a.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{name}</div>
                    <div className="text-xs text-muted-foreground flex gap-2">
                      {a.role_in_building && <span className="capitalize">{a.role_in_building}</span>}
                      {a.unit_number && <span>· Einheit {a.unit_number}</span>}
                    </div>
                  </div>
                  {hasEmail ? (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <MailX className="h-3.5 w-3.5 text-destructive/60" />
                  )}
                </label>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};
