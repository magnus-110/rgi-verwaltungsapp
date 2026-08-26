import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, FileText, Download, CalendarClock, ArrowRight, FileBadge } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useOffers, useDeleteOffer, useConvertOfferToContract, offerSignedUrl,
  OFFER_STATUS_LABEL, type Offer, type OfferStatus,
} from "@/hooks/useOffers";
import { OfferWizard } from "./OfferWizard";
import { formatDate, formatEur } from "@/types/rgiContracts";

const STATUS_VARIANT: Record<OfferStatus, "default" | "secondary" | "outline" | "destructive"> = {
  inquiry: "outline",
  drafted: "secondary",
  sent: "default",
  won: "default",
  lost: "destructive",
  withdrawn: "outline",
};

export function OffersTab() {
  const { data: offers, isLoading } = useOffers();
  const del = useDeleteOffer();
  const convert = useConvertOfferToContract();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Offer | null>(null);
  const [convertFor, setConvertFor] = useState<Offer | null>(null);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [targetBuilding, setTargetBuilding] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OfferStatus>("all");

  const rows = useMemo(() => {
    return (offers ?? []).filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        o.prospect_name.toLowerCase().includes(q) ||
        (o.object_city ?? "").toLowerCase().includes(q) ||
        (o.object_address ?? "").toLowerCase().includes(q)
      );
    });
  }, [offers, search, statusFilter]);

  const stats = useMemo(() => {
    const open = (offers ?? []).filter((o) => ["inquiry", "drafted", "sent"].includes(o.status));
    const openValue = open.reduce((s, o) => s + (Number(o.monthly_net) || 0) * 12, 0);
    const won = (offers ?? []).filter((o) => o.status === "won").length;
    const lost = (offers ?? []).filter((o) => o.status === "lost").length;
    const today = new Date().toISOString().slice(0, 10);
    const due = open.filter((o) => o.follow_up_on && o.follow_up_on <= today).length;
    return { openCount: open.length, openValue, won, lost, due };
  }, [offers]);

  const openNew = () => { setEditing(null); setWizardOpen(true); };
  const openEdit = (o: Offer) => { setEditing(o); setWizardOpen(true); };

  const startConvert = async (o: Offer) => {
    setConvertFor(o);
    setTargetBuilding("");
    const { data } = await (supabase as any)
      .from("buildings")
      .select("id, name, building_code, management_mode")
      .order("name");
    setBuildings(data ?? []);
  };

  const openFile = async (path: string) => {
    try {
      window.open(await offerSignedUrl(path), "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Anfrage suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Stände</SelectItem>
            {(Object.keys(OFFER_STATUS_LABEL) as OfferStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{OFFER_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" />Neue Anfrage</Button>
      </div>

      {(offers ?? []).length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Offene Anfragen" value={String(stats.openCount)} />
          <Kpi label="Mögliches Honorar / Jahr" value={formatEur(stats.openValue)} accent />
          <Kpi label="Nachfassen fällig" value={String(stats.due)} warn={stats.due > 0} />
          <Kpi label="Gewonnen / verloren" value={`${stats.won} / ${stats.lost}`} />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground mb-4">
            {(offers ?? []).length === 0
              ? "Noch keine Anfrage erfasst. Sobald eine WEG anfragt, legst du sie hier an und erzeugst den Vertragsentwurf mit einem Klick."
              : "Keine Anfrage passt zum Filter."}
          </p>
          {(offers ?? []).length === 0 && (
            <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" />Erste Anfrage anlegen</Button>
          )}
        </Card>
      ) : (
        <Card className="divide-y">
          {rows.map((o) => {
            const today = new Date().toISOString().slice(0, 10);
            const followDue = o.follow_up_on && o.follow_up_on <= today && ["inquiry", "drafted", "sent"].includes(o.status);
            return (
              <div key={o.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{o.prospect_name}</span>
                    <Badge variant={STATUS_VARIANT[o.status]}>{OFFER_STATUS_LABEL[o.status]}</Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {o.management_mode === "weg" ? "WEG" : "Miete"}
                    </Badge>
                    {followDue && (
                      <Badge variant="destructive" className="gap-1 text-[11px] font-normal">
                        <CalendarClock className="w-3 h-3" />nachfassen
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[o.object_address, o.object_city].filter(Boolean).join(", ") || "keine Anschrift"}
                    {o.units_apartment ? ` · ${o.units_apartment} Wohnungen` : ""}
                    {o.desired_start ? ` · ab ${formatDate(o.desired_start)}` : ""}
                    {o.lost_reason ? ` · verloren: ${o.lost_reason}` : ""}
                  </div>
                </div>

                <div className="text-right tabular-nums">
                  <div className="font-medium">{formatEur(Number(o.monthly_net) || 0)}</div>
                  <div className="text-xs text-muted-foreground">im Monat</div>
                </div>

                <div className="flex items-center gap-1">
                  {o.docx_storage_path && (
                    <Button variant="ghost" size="sm" title="Word öffnen" onClick={() => openFile(o.docx_storage_path!)}>
                      <FileText className="w-4 h-4" />
                    </Button>
                  )}
                  {o.pdf_storage_path && (
                    <Button variant="ghost" size="sm" title="PDF öffnen" onClick={() => openFile(o.pdf_storage_path!)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  {(o.summary_pdf_storage_path || o.summary_docx_storage_path) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Übersichtsblatt öffnen"
                      onClick={() => openFile((o.summary_pdf_storage_path || o.summary_docx_storage_path)!)}
                    >
                      <FileBadge className="w-4 h-4" />
                    </Button>
                  )}
                  {o.status !== "won" && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => startConvert(o)}>
                      Vertrag anlegen<ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(o)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <OfferWizard open={wizardOpen} onOpenChange={setWizardOpen} offer={editing} />

      {/* Zuschlag: Angebot in einen Vertrag überführen */}
      <AlertDialog open={!!convertFor} onOpenChange={(v) => !v && setConvertFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag aus dem Angebot anlegen</AlertDialogTitle>
            <AlertDialogDescription>
              Honorar, Einheiten und alle Zusatzleistungen werden übernommen. Wähle das Objekt,
              zu dem der Vertrag gehört — es muss unter Gebäude schon angelegt sein.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Select value={targetBuilding} onValueChange={setTargetBuilding}>
              <SelectTrigger><SelectValue placeholder="Objekt wählen…" /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.building_code ? ` · ${b.building_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={!targetBuilding}
              onClick={() => {
                if (convertFor && targetBuilding) {
                  convert.mutate({ offer: convertFor, buildingId: targetBuilding });
                }
                setConvertFor(null);
              }}
            >
              Vertrag anlegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Angebot löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{confirmDelete?.prospect_name}“ wird mit allen Positionen entfernt. Bereits erzeugte
              Dateien bleiben im Speicher liegen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDelete) del.mutate(confirmDelete.id); setConfirmDelete(null); }}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <Card className={`p-4 ${warn ? "border-destructive/40" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${accent ? "text-primary" : warn ? "text-destructive" : ""}`}>
        {value}
      </div>
    </Card>
  );
}
