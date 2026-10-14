import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Info, Save, Loader2, Flame, MapPin, StickyNote, Plus, X, Landmark, CalendarRange, User as UserIcon, Mail, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GebaeudeNotizen } from "@/components/notizbuch/GebaeudeNotizen";

function RentOwnerBlock({ buildingId }: { buildingId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: owners = [] } = useQuery({
    queryKey: ["rent-building-owner", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select("id, unit_number, contact:contacts(id, salutation, first_name, last_name, company_name)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "eigentuemer");
      return (data || []) as any[];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-picker-rent-owner"],
    enabled: pickerOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, salutation, first_name, last_name, company_name")
        .order("last_name", { ascending: true })
        .limit(500);
      return (data || []) as any[];
    },
  });

  const ownerContactIds = new Set(owners.map((o: any) => o.contact?.id).filter(Boolean));
  const filtered = contacts
    .filter((c: any) => !ownerContactIds.has(c.id))
    .filter((c: any) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const name = `${c.company_name || ""} ${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      return name.includes(s);
    })
    .slice(0, 50);

  const refresh = () => qc.invalidateQueries({ queryKey: ["rent-building-owner", buildingId] });

  const addOwner = async (contactId: string) => {
    setSavingId(contactId);
    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: contactId,
      building_id: buildingId,
      role_in_building: "eigentuemer" as any,
      billing_mode: "own_billing" as any,
      parent_assignment_id: null,
    } as any);
    setSavingId(null);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setPickerOpen(false);
    setSearch("");
    refresh();
    toast({ title: "Eigentümer hinzugefügt" });
  };

  const removeOwner = async (assignmentId: string) => {
    if (!confirm("Eigentümer entfernen?")) return;
    const { error } = await supabase
      .from("contact_building_assignments")
      .delete()
      .eq("id", assignmentId);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  };

  return (
    <div className="border-t pt-3 space-y-1">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs flex items-center gap-1.5">
          <UserIcon className="h-3 w-3" /> Eigentümer{owners.length > 0 && ` (${owners.length})`}
        </Label>
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setPickerOpen((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Hinzufügen
        </Button>
      </div>

      {owners.length === 0 && !pickerOpen && (
        <p className="text-xs text-muted-foreground italic">Kein Eigentümer hinterlegt.</p>
      )}

      {owners.map((o: any) => {
        const c = o.contact || {};
        const name = c.company_name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
        return (
          <div key={o.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
            <span className="text-sm">{name}</span>
            <div className="flex items-center gap-2">
              {o.unit_number && <span className="text-[11px] text-muted-foreground">EH {o.unit_number}</span>}
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeOwner(o.id)} title="Entfernen">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}

      {pickerOpen && (
        <div className="mt-2 p-2 rounded-md border bg-muted/30 space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kontakt suchen…"
            className="h-8 text-sm"
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 px-1">Keine passenden Kontakte.</p>
            ) : (
              filtered.map((c: any) => {
                const name = c.company_name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addOwner(c.id)}
                    disabled={savingId === c.id}
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent disabled:opacity-50"
                  >
                    {name}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setPickerOpen(false); setSearch(""); }}>
              Schließen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  buildingId: string;
  managementMode?: 'weg' | 'rent';
}

export const BuildingGeneralInfoCard = ({ buildingId, managementMode = 'weg' }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ---- Stammfelder (ETV-Ort, Heizung) ----
  const { data: building } = useQuery({
    queryKey: ["building-general-info", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("etv_default_location, heating_type, creditor_id, fiscal_year_start_month, fiscal_year_start_day")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data as {
        etv_default_location: string | null;
        heating_type: string | null;
        creditor_id: string | null;
        fiscal_year_start_month: number;
        fiscal_year_start_day: number;
      };
    },
  });

  const [etv, setEtv] = useState("");
  const [heating, setHeating] = useState("");
  const [fyMonth, setFyMonth] = useState<number>(1);
  const [fyDay, setFyDay] = useState<number>(1);
  const [savingMain, setSavingMain] = useState(false);

  useEffect(() => {
    if (building) {
      setEtv(building.etv_default_location || "");
      setHeating(building.heating_type || "");
      setFyMonth(building.fiscal_year_start_month ?? 1);
      setFyDay(building.fiscal_year_start_day ?? 1);
    }
  }, [building]);

  const isMainDirty =
    (building?.etv_default_location || "") !== etv ||
    (building?.heating_type || "") !== heating ||
    (building?.fiscal_year_start_month ?? 1) !== fyMonth ||
    (building?.fiscal_year_start_day ?? 1) !== fyDay;

  const handleSaveMain = async () => {
    setSavingMain(true);
    const { error } = await supabase
      .from("buildings")
      .update({
        etv_default_location: etv || null,
        heating_type: heating || null,
        fiscal_year_start_month: fyMonth,
        fiscal_year_start_day: fyDay,
      })
      .eq("id", buildingId);
    setSavingMain(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    qc.invalidateQueries({ queryKey: ["building-general-info", buildingId] });
    qc.invalidateQueries({ queryKey: ["building-detail", buildingId] });
    qc.invalidateQueries({ queryKey: ["building-fy-cfg", buildingId] });
    qc.invalidateQueries({ queryKey: ["annual-cycle-timeline", buildingId] });
    qc.invalidateQueries({ queryKey: ["annual-cycle", buildingId] });
  };

  return (
    <Card>
      <CardHeader className="p-3 md:p-4 pb-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          Allgemeine Infos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1 space-y-4">
        {/* ETV-Ort (nur WEG) + Heizung */}
        <div className={managementMode === 'rent' ? "" : "grid md:grid-cols-2 gap-3"}>
          {managementMode !== 'rent' && (
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> ETV-Ort (Standard)
              </Label>
              <Input
                value={etv}
                onChange={(e) => setEtv(e.target.value)}
                placeholder="z. B. Hotel Krone, Musterstraße 1"
                className="h-9 text-sm"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <Flame className="h-3 w-3" /> Heizungsart
            </Label>
            <Input
              value={heating}
              onChange={(e) => setHeating(e.target.value)}
              placeholder="z. B. Gas, Fernwärme"
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Eigentümer (nur Mietverwaltung) */}
        {managementMode === 'rent' && <RentOwnerBlock buildingId={buildingId} />}

        {/* Wirtschaftsjahr-Beginn */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3" /> Wirtschaftsjahr-Beginn
          </Label>
          <div className="flex items-center gap-2">
            <Select value={String(fyDay)} onValueChange={(v) => setFyDay(Number(v))}>
              <SelectTrigger className="h-9 w-[90px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>{d}.</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(fyMonth)} onValueChange={(v) => setFyMonth(Number(v))}>
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Januar","Februar","März","April","Mai","Juni",
                  "Juli","August","September","Oktober","November","Dezember",
                ].map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Wird überall für Jahreszyklus und Wirtschaftsjahr-Auswahl dieser Liegenschaft verwendet.
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSaveMain} disabled={!isMainDirty || savingMain} className="gap-1.5">
            {savingMain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </Button>
        </div>


        {/* Gläubiger-ID */}
        <div className="border-t pt-3">
          <Label className="text-xs flex items-center gap-1.5 mb-1">
            <Landmark className="h-3 w-3" /> Gläubiger-ID (SEPA)
          </Label>
          {building?.creditor_id ? (
            <p className="text-sm font-mono">{building.creditor_id}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Noch nicht hinterlegt — über „Bearbeiten" eintragen.
            </p>
          )}
        </div>

        {/* Notizen — kommen jetzt aus dem Notizbuch */}
        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <StickyNote className="h-3 w-3" /> Notizen
          </Label>
          <GebaeudeNotizen buildingId={buildingId} kompakt />
        </div>
      </CardContent>
    </Card>
  );
};
