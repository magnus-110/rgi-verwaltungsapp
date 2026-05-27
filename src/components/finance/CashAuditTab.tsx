import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ExternalLink, Copy, Trash2, CheckCircle2, Clock, FileEdit, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CreateAuditDialog } from "./CreateAuditDialog";
import { CashAuditWizard } from "./CashAuditWizard";
import { CashAuditAdminReview } from "./CashAuditAdminReview";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; icon: any; className: string }> = {
  draft: { label: "Entwurf", icon: FileEdit, className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Bearbeitung", icon: Clock, className: "bg-amber-100 text-amber-800" },
  completed: { label: "Abgeschlossen", icon: CheckCircle2, className: "bg-green-100 text-green-800" },
};

export function CashAuditTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editAuditId, setEditAuditId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ["cash-audits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_audits")
        .select(`
          *,
          buildings(name, address),
          billing_periods(fiscal_year),
          contacts!cash_audits_auditor_contact_id_fkey(
            company_name,
            contact_persons(first_name, last_name, is_primary)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/kassenpruefung/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link kopiert!");
  };

  const deleteAudit = async (id: string) => {
    if (!confirm("Kassenprüfung wirklich löschen?")) return;
    await supabase.from("cash_audits").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["cash-audits"] });
    toast.success("Gelöscht");
  };

  if (selectedAuditId) {
    const selected = audits.find((a: any) => a.id === selectedAuditId);
    // Admin sieht eigene Review-Ansicht für Prüfungen, an denen der Prüfer schon gearbeitet hat
    if (selected && selected.status !== "draft") {
      return (
        <CashAuditAdminReview
          auditId={selectedAuditId}
          onBack={() => setSelectedAuditId(null)}
        />
      );
    }
    return (
      <CashAuditWizard
        auditId={selectedAuditId}
        onBack={() => setSelectedAuditId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kassenprüfungen für Eigentümer erstellen und verwalten
        </p>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Neue Prüfung
        </Button>
      </div>

      {isLoading && <div className="py-8 text-center text-muted-foreground">Laden...</div>}

      {!isLoading && audits.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Noch keine Kassenprüfungen erstellt.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {audits.map((audit: any) => {
          const status = STATUS_MAP[audit.status] || STATUS_MAP.draft;
          const StatusIcon = status.icon;
          const contact = audit.contacts;
          const contactName = contact?.contact_persons?.filter((p: any) => p.is_primary)?.[0]
            ? `${contact.contact_persons.filter((p: any) => p.is_primary)[0].first_name} ${contact.contact_persons.filter((p: any) => p.is_primary)[0].last_name}`
            : contact?.company_name || "–";
          const auditorName = audit.auditor_name_override?.trim() || contactName;

          return (
            <Card key={audit.id} className="hover:bg-muted/30 transition-colors">
              <button
                onClick={() => setSelectedAuditId(audit.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{audit.buildings?.name || "–"}</span>
                      <Badge variant="outline">{audit.billing_periods?.fiscal_year || audit.fiscal_year}</Badge>
                      <Badge className={cn("gap-1 text-[10px]", status.className)}>
                        <StatusIcon className="h-3 w-3" /> {status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Prüfer: {auditorName} · Erstellt: {new Date(audit.created_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditAuditId(audit.id)} title="Bearbeiten">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(audit.access_token)} title="Link kopieren">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`/kassenpruefung/${audit.access_token}`, "_blank")} title="Öffnen">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteAudit(audit.id)} title="Löschen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>

      <CreateAuditDialog open={showCreate} onOpenChange={setShowCreate} />
      <CreateAuditDialog
        open={!!editAuditId}
        onOpenChange={(o) => { if (!o) setEditAuditId(null); }}
        auditId={editAuditId}
      />
    </div>
  );
}
