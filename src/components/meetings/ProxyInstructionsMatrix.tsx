import { useMemo, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileSignature, Check, X, Minus, RotateCcw } from "lucide-react";

type Vote = "yes" | "no" | "abstain";

interface AgendaItemLite {
  id: string;
  sort_order: number;
  title: string;
  requires_resolution: boolean;
  status: string | null;
}

interface AttendeeLite {
  id: string;
  assignment_id: string;
  attendance_type: string | null;
  proxy_type: string | null;
  proxy_external_name?: string | null;
  pre_vote_instructions: Record<string, Vote> | null;
  contact_building_assignments?: {
    unit_number?: string | null;
    contacts?: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null;
  } | null;
}

interface Props {
  meetingId: string;
  agendaItems: AgendaItemLite[];
  attendees: AttendeeLite[];
  trigger?: React.ReactNode;
}

const getContactName = (c: AttendeeLite["contact_building_assignments"] extends infer T ? any : any) => {
  if (!c) return "Unbekannt";
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
};

export const ProxyInstructionsMatrix = ({ meetingId, agendaItems, attendees, trigger }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Only proxy-attendees (paper or app) are relevant for pre-instructions
  const proxyAttendees = useMemo(
    () => attendees.filter((a) => a.attendance_type === "proxy"),
    [attendees]
  );

  const votableTops = useMemo(
    () =>
      agendaItems
        .filter((t) => t.requires_resolution !== false)
        .filter((t) => t.status !== "voted"),
    [agendaItems]
  );

  // Local draft state mirrors DB so toggling feels instant
  const [draft, setDraft] = useState<Record<string, Record<string, Vote | null>>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, Record<string, Vote | null>> = {};
    proxyAttendees.forEach((a) => {
      initial[a.assignment_id] = { ...(a.pre_vote_instructions || {}) };
    });
    setDraft(initial);
  }, [open, proxyAttendees]);

  const saveMutation = useMutation({
    mutationFn: async ({ assignmentId, instructions }: { assignmentId: string; instructions: Record<string, Vote | null> }) => {
      // Filter nulls so we store only set values
      const clean: Record<string, Vote> = {};
      Object.entries(instructions).forEach(([k, v]) => {
        if (v === "yes" || v === "no" || v === "abstain") clean[k] = v;
      });
      const att = proxyAttendees.find((a) => a.assignment_id === assignmentId);
      if (!att) throw new Error("Anwesender nicht gefunden");
      const { error } = await supabase
        .from("etv_attendees")
        .update({ pre_vote_instructions: clean as any })
        .eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-attendees-live", meetingId] });
    },
    onError: (e: any) => {
      toast({ title: "Speichern fehlgeschlagen", description: e.message, variant: "destructive" });
    },
  });

  const setCell = (assignmentId: string, topId: string, vote: Vote | null) => {
    setDraft((prev) => {
      const next = { ...prev, [assignmentId]: { ...(prev[assignmentId] || {}), [topId]: vote } };
      // Persist this row
      saveMutation.mutate({ assignmentId, instructions: next[assignmentId] });
      return next;
    });
  };

  const setRowAll = (assignmentId: string, vote: Vote | null) => {
    const next: Record<string, Vote | null> = {};
    votableTops.forEach((t) => (next[t.id] = vote));
    setDraft((prev) => ({ ...prev, [assignmentId]: next }));
    saveMutation.mutate({ assignmentId, instructions: next });
  };

  const cellBtn = (
    active: boolean,
    color: "green" | "red" | "gray",
    onClick: () => void,
    icon: React.ReactNode,
  ) => {
    const base = "h-7 w-7 p-0 rounded-md border transition-colors flex items-center justify-center";
    const palette =
      color === "green"
        ? active
          ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
          : "bg-background text-green-600 border-border hover:bg-green-50 dark:hover:bg-green-950/30"
        : color === "red"
        ? active
          ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
          : "bg-background text-red-600 border-border hover:bg-red-50 dark:hover:bg-red-950/30"
        : active
        ? "bg-muted-foreground text-background border-muted-foreground"
        : "bg-background text-muted-foreground border-border hover:bg-muted";
    return (
      <button type="button" onClick={onClick} className={`${base} ${palette}`}>
        {icon}
      </button>
    );
  };

  const defaultTrigger = (
    <Button size="sm" variant="outline" className="gap-1.5">
      <FileSignature className="h-3.5 w-3.5" /> Papier-Vollmachten vorbereiten
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger || defaultTrigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[95vw] sm:w-[1100px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Weisungs-Matrix für Vollmachten
          </SheetTitle>
          <SheetDescription>
            Trage hier die schriftlich erhaltenen Weisungen aus Papier-Vollmachten ein. Beim Start der Abstimmung
            werden die Stimmen automatisch übernommen — du kannst sie später noch ändern.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {proxyAttendees.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Keine Vollmachten erfasst. Trage zuerst Vollmachten in der Anwesenheitsliste ein.
            </div>
          ) : votableTops.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Keine abstimmbaren TOPs vorhanden.
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 font-semibold sticky left-0 bg-muted/40 z-10 min-w-[200px]">
                        Eigentümer
                      </th>
                      {votableTops.map((t, idx) => (
                        <th key={t.id} className="p-2 font-semibold text-center min-w-[120px] border-l border-border">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <div className="text-[11px] text-muted-foreground">TOP {idx + 1}</div>
                                <div className="text-xs truncate max-w-[110px]" title={t.title}>{t.title}</div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[280px]">
                              <p className="font-medium">TOP {idx + 1}: {t.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                      <th className="p-2 font-semibold text-center min-w-[150px] border-l border-border">
                        Schnellauswahl
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {proxyAttendees.map((a) => {
                      const cba = a.contact_building_assignments;
                      const contact = cba?.contacts;
                      const row = draft[a.assignment_id] || {};
                      const proxyLabel = a.proxy_type === "manager"
                        ? "v.d. Verwaltung"
                        : a.proxy_type === "external"
                        ? `v.d. ${a.proxy_external_name || "Ext."}`
                        : a.proxy_type === "owner"
                        ? "v.d. Eigentümer"
                        : "Vollmacht";
                      return (
                        <tr key={a.id} className="border-t hover:bg-muted/20">
                          <td className="p-2 sticky left-0 bg-background z-10 border-r">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                {cba?.unit_number && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">E{cba.unit_number}</Badge>
                                )}
                                <span className="text-sm font-medium truncate">{getContactName(contact)}</span>
                              </div>
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[9px] w-fit px-1 py-0">
                                {proxyLabel}
                              </Badge>
                            </div>
                          </td>
                          {votableTops.map((t) => {
                            const v = row[t.id] || null;
                            return (
                              <td key={t.id} className="p-2 border-l border-border">
                                <div className="flex items-center justify-center gap-1">
                                  {cellBtn(v === "yes", "green",
                                    () => setCell(a.assignment_id, t.id, v === "yes" ? null : "yes"),
                                    <Check className="h-3.5 w-3.5" />)}
                                  {cellBtn(v === "no", "red",
                                    () => setCell(a.assignment_id, t.id, v === "no" ? null : "no"),
                                    <X className="h-3.5 w-3.5" />)}
                                  {cellBtn(v === "abstain", "gray",
                                    () => setCell(a.assignment_id, t.id, v === "abstain" ? null : "abstain"),
                                    <Minus className="h-3.5 w-3.5" />)}
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-2 border-l border-border">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600"
                                onClick={() => setRowAll(a.assignment_id, "yes")}>Alle Ja</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600"
                                onClick={() => setRowAll(a.assignment_id, "no")}>Alle Nein</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => setRowAll(a.assignment_id, null)}
                                title="Alle zurücksetzen">
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Ja</span>
                <span className="flex items-center gap-1"><X className="h-3 w-3 text-red-600" /> Nein</span>
                <span className="flex items-center gap-1"><Minus className="h-3 w-3" /> Enthaltung</span>
                <span className="ml-auto">Änderungen werden automatisch gespeichert.</span>
              </div>
            </TooltipProvider>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
