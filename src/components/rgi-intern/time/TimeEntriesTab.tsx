import { useMemo, useState } from "react";
import { useRgiTimeEntries, useRgiProjects, useRgiClients, useDeleteRgiTimeEntry, type RgiTimeEntry } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeEntryDialog } from "./TimeEntryDialog";
import { CreateInvoiceFromTimeDialog } from "../invoices/CreateInvoiceFromTimeDialog";

function fmtMin(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function TimeEntriesTab() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const { data: entries, isLoading } = useRgiTimeEntries({
    projectId: projectFilter === "all" ? undefined : projectFilter,
    onlyOpen,
  });
  const { data: projects } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const del = useDeleteRgiTimeEntry();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RgiTimeEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceDialog, setInvoiceDialog] = useState(false);

  const projectMap = useMemo(() => new Map(projects?.map((p) => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients?.map((c) => [c.id, c])), [clients]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectedEntries = (entries ?? []).filter((e) => selected.has(e.id));

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Projekte</SelectItem>
            {projects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyOpen} onCheckedChange={(v) => setOnlyOpen(!!v)} /> nur offen / abrechenbar
        </label>
        <div className="flex-1" />
        {selected.size > 0 && (
          <Button variant="default" onClick={() => setInvoiceDialog(true)} className="gap-1.5">
            <FileText className="w-4 h-4" />Rechnung aus {selected.size} Einträgen
          </Button>
        )}
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" />Stunden erfassen</Button>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="divide-y">
          {(entries ?? []).length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Keine Einträge.</div>}
          {entries?.map((e) => {
            const p = projectMap.get(e.project_id);
            const c = p ? clientMap.get(p.client_id) : null;
            const billed = !!e.invoice_item_id;
            return (
              <div key={e.id} className="p-3 flex items-center gap-3">
                <Checkbox
                  checked={selected.has(e.id)}
                  disabled={billed || !e.billable}
                  onCheckedChange={() => toggle(e.id)}
                />
                <div className="text-sm font-mono w-20 shrink-0">{e.date}</div>
                <div className="text-sm font-mono w-20 shrink-0">{fmtMin(e.minutes)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{e.description}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p?.name ?? "—"} {c && `· ${c.name}`}
                    {e.hourly_rate != null && ` · ${e.hourly_rate} €/h`}
                  </div>
                </div>
                {!e.billable && <Badge variant="secondary">nicht abrechenbar</Badge>}
                {billed && <Badge variant="default">abgerechnet</Badge>}
                <Button variant="ghost" size="sm" disabled={billed} onClick={() => { setEditing(e); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" disabled={billed} onClick={() => { if (confirm("Eintrag löschen?")) del.mutate(e.id); }}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      <TimeEntryDialog open={open} onOpenChange={setOpen} entry={editing} projects={projects ?? []} />
      <CreateInvoiceFromTimeDialog
        open={invoiceDialog}
        onOpenChange={(v) => { setInvoiceDialog(v); if (!v) setSelected(new Set()); }}
        entries={selectedEntries}
        projects={projects ?? []}
        clients={clients ?? []}
      />
    </div>
  );
}
