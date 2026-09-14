import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Users, RefreshCw, AlertTriangle, Merge, Split } from "lucide-react";
import { applyHeadGrouping, resetHeadGrouping, getHeadWeight, formatHeads } from "@/lib/etvHeadcount";

interface VotingHeadsPanelProps {
  meetingId: string;
  buildingId: string;
}

interface HeadAttendee {
  id: string;
  assignment_id: string;
  head_weight: number | null;
  contact_building_assignments: {
    unit_number: string | null;
    contacts: { id: string; first_name: string | null; last_name: string | null; company_name: string | null };
  };
}

const contactName = (c: any) =>
  c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unbenannt";

export const VotingHeadsPanel = ({ meetingId, buildingId }: VotingHeadsPanelProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: attendees = [], isLoading } = useQuery({
    queryKey: ["etv-heads", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select(`
          id, assignment_id, head_weight,
          contact_building_assignments!inner(
            unit_number,
            contacts!inner(id, first_name, last_name, company_name)
          )
        `)
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return (data || []) as unknown as HeadAttendee[];
    },
  });

  const { data: owners = [] } = useQuery({
    queryKey: ["building-owners", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, role_in_building, contacts!inner(id, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("role_in_building", "eigentuemer")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildingId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["etv-heads", meetingId] });
    queryClient.invalidateQueries({ queryKey: ["etv-attendees", meetingId] });
    queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
  };

  const initMutation = useMutation({
    mutationFn: async () => {
      const existing = attendees.map((a) => a.assignment_id);
      const rows = owners
        .filter((o: any) => !existing.includes(o.id))
        .map((o: any) => ({ meeting_id: meetingId, assignment_id: o.id, attendance_type: "absent" }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("etv_attendees").insert(rows);
      if (error) throw error;
      // Neue Teilnehmer direkt nach § 25 Abs. 2 WEG zu Köpfen zusammenfassen
      await applyHeadGrouping(meetingId);
      return rows.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast({ title: "Eigentümer geladen", description: `${count} Einheiten übernommen.` });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const setWeightMutation = useMutation({
    mutationFn: async ({ id, weight }: { id: string; weight: number }) => {
      const { error } = await (supabase.from("etv_attendees") as any)
        .update({ head_weight: weight })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const groupMutation = useMutation({
    mutationFn: async () => applyHeadGrouping(meetingId),
    onSuccess: (changed) => {
      invalidate();
      toast({
        title: "Nach Eigentümern zusammengefasst",
        description: changed === 0 ? "Es war nichts anzupassen." : `${changed} Einheiten angepasst.`,
      });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const splitMutation = useMutation({
    mutationFn: async () => resetHeadGrouping(meetingId),
    onSuccess: (changed) => {
      invalidate();
      toast({
        title: "Jede Einheit zählt als eigener Kopf",
        description: changed === 0 ? "Es war nichts anzupassen." : `${changed} Einheiten angepasst.`,
      });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  // Nach Eigentümer gruppieren
  const groups = new Map<string, { contact: any; rows: HeadAttendee[] }>();
  for (const a of attendees) {
    const contact = a.contact_building_assignments?.contacts;
    const key = contact?.id || a.assignment_id;
    const entry = groups.get(key) || { contact, rows: [] };
    entry.rows.push(a);
    groups.set(key, entry);
  }
  const groupList = Array.from(groups.values())
    .map((g) => ({
      ...g,
      rows: [...g.rows].sort((x, y) =>
        (x.contact_building_assignments?.unit_number || "").localeCompare(
          y.contact_building_assignments?.unit_number || "",
          "de",
          { numeric: true }
        )
      ),
    }))
    .sort((a, b) => contactName(a.contact).localeCompare(contactName(b.contact), "de"));

  const totalUnits = attendees.length;
  const totalHeads = attendees.reduce((s, a) => s + getHeadWeight(a), 0);
  const multiUnitOwners = groupList.filter((g) => g.rows.length > 1);
  const notGrouped = multiUnitOwners.filter((g) => g.rows.reduce((s, r) => s + getHeadWeight(r), 0) > 1);

  if (isLoading) return <p className="text-sm text-muted-foreground">Wird geladen…</p>;

  if (totalUnits === 0) {
    return (
      <div className="py-6 text-center space-y-3">
        <Users className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Noch keine Teilnehmerliste vorhanden.
        </p>
        {owners.length > 0 && (
          <Button size="sm" onClick={() => initMutation.mutate()} disabled={initMutation.isPending} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${initMutation.isPending ? "animate-spin" : ""}`} />
            Eigentümer laden
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            {formatHeads(totalHeads)} Köpfe aus {totalUnits} Einheiten
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Nach § 25 Abs. 2 WEG hat jeder Eigentümer eine Stimme, auch bei mehreren Einheiten.
            Abweichende Regelungen der Teilungserklärung hier händisch einstellen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            onClick={() => groupMutation.mutate()}
            disabled={groupMutation.isPending}
          >
            <Merge className="h-3.5 w-3.5" /> Nach Eigentümer zusammenfassen
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            onClick={() => splitMutation.mutate()}
            disabled={splitMutation.isPending}
          >
            <Split className="h-3.5 w-3.5" /> Jede Einheit ein Kopf
          </Button>
        </div>
      </div>

      {notGrouped.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
          <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
            <span>
              {notGrouped.length === 1 ? "Ein Eigentümer besitzt" : `${notGrouped.length} Eigentümer besitzen`} mehrere
              Einheiten und {notGrouped.length === 1 ? "zählt" : "zählen"} derzeit mit mehreren Köpfen:{" "}
              {notGrouped.map((g) => contactName(g.contact)).join(", ")}.
            </span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        {groupList.map((group) => {
          const heads = group.rows.reduce((s, r) => s + getHeadWeight(r), 0);
          return (
            <div key={group.contact?.id || group.rows[0].id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">{contactName(group.contact)}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {group.rows.length} {group.rows.length === 1 ? "Einheit" : "Einheiten"}
                  </Badge>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      heads === 1
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {formatHeads(heads)} {heads === 1 ? "Kopf" : "Köpfe"}
                  </Badge>
                </div>
              </div>

              {group.rows.length > 1 && (
                <div className="space-y-1">
                  {group.rows.map((row) => {
                    const own = getHeadWeight(row) > 0;
                    return (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-muted/30"
                      >
                        <span className="text-xs">
                          Einheit {row.contact_building_assignments?.unit_number || "—"}
                          {!own && <span className="text-muted-foreground"> · mit zusammengefasst</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">eigener Kopf</span>
                          <Switch
                            checked={own}
                            disabled={setWeightMutation.isPending}
                            onCheckedChange={(checked) =>
                              setWeightMutation.mutate({ id: row.id, weight: checked ? 1 : 0 })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
