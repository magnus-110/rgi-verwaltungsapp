import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, User, ChevronDown, ChevronUp, Phone, Mail, MapPin, Trash2, Copy, CreditCard, BookOpen, X, Pencil, Check, CornerDownRight } from "lucide-react";
import { UNIT_KIND_LABELS, UNIT_KIND_ICONS, UNIT_KIND_OPTIONS, BILLING_MODE_LABELS, isApartment, type UnitKind } from "@/lib/secondaryUnits";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AssignContactDialog } from "./AssignContactDialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast as sonnerToast } from "sonner";

function BankSepaInlineEditor({ bankId, sepaRef, sepaDate, onSaved }: { bankId: string; sepaRef: string | null; sepaDate: string | null; onSaved: () => void }) {
  const [refVal, setRefVal] = useState(sepaRef || "");
  const [dateVal, setDateVal] = useState<string | null>(sepaDate);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRefVal(sepaRef || ""); setDateVal(sepaDate); }, [sepaRef, sepaDate, bankId]);

  const save = async (patch: { sepa_mandate_ref?: string | null; sepa_mandate_date?: string | null }) => {
    setSaving(true);
    const { error } = await supabase.from("contact_bank_accounts").update(patch).eq("id", bankId);
    setSaving(false);
    if (error) { sonnerToast.error("Fehler: " + error.message); return; }
    sonnerToast.success("SEPA-Mandat gespeichert");
    onSaved();
  };

  return (
    <div className="border-t pt-2 mt-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!dateVal}
            disabled={saving}
            onCheckedChange={(checked) => {
              const d = checked ? new Date().toISOString().slice(0, 10) : null;
              setDateVal(d);
              save({ sepa_mandate_date: d });
            }}
          />
          <span className="text-xs flex items-center gap-1">
            {dateVal && <CheckCircle2 className="h-3 w-3 text-green-600" />}
            SEPA-Mandat erteilt
          </span>
        </div>
        {dateVal && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {new Date(dateVal).toLocaleDateString("de-DE")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateVal ? new Date(dateVal) : undefined}
                onSelect={(d) => {
                  const iso = d ? d.toISOString().slice(0, 10) : null;
                  setDateVal(iso);
                  save({ sepa_mandate_date: iso });
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">SEPA-Mandatsreferenz</Label>
        <Input
          className="h-7 text-xs font-mono"
          value={refVal}
          onChange={(e) => setRefVal(e.target.value)}
          onBlur={() => { if ((refVal || null) !== (sepaRef || null)) save({ sepa_mandate_ref: refVal.trim() || null }); }}
          placeholder="z. B. RGI-SEPA-000123"
          disabled={saving}
        />
      </div>
      {dateVal && (
        <p className="text-[10px] text-muted-foreground">
          erteilt am <span className="font-medium text-foreground">{new Date(dateVal).toLocaleDateString("de-DE")}</span>
        </p>
      )}
    </div>
  );
}

/** Input that buffers locally and only calls onSave on blur */
function BufferedInput({ value: externalValue, onSave, className, ...props }: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'onBlur' | 'value'> & { value: string; onSave: (val: string) => void }) {
  const [local, setLocal] = useState(externalValue);
  const savedRef = useRef(externalValue);
  useEffect(() => { if (externalValue !== savedRef.current) { setLocal(externalValue); savedRef.current = externalValue; } }, [externalValue]);
  return (
    <Input
      {...props}
      className={className}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== savedRef.current) { savedRef.current = local; onSave(local); } }}
    />
  );
}

/** Numeric input that buffers locally and saves on blur */
function BufferedNumberInput({ value: externalValue, onSave, className, ...props }: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'onBlur' | 'value'> & { value: number; onSave: (val: number) => void }) {
  const [local, setLocal] = useState(externalValue === 0 ? "" : String(externalValue));
  const savedRef = useRef(externalValue);
  const localRef = useRef(local);
  const onSaveRef = useRef(onSave);
  useEffect(() => { localRef.current = local; }, [local]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { if (externalValue !== savedRef.current) { setLocal(externalValue === 0 ? "" : String(externalValue)); savedRef.current = externalValue; } }, [externalValue]);
  const flush = () => {
    const num = localRef.current === "" ? 0 : parseFloat(localRef.current.replace(",", "."));
    const val = isNaN(num) ? 0 : num;
    if (val !== savedRef.current) { savedRef.current = val; onSaveRef.current(val); }
  };
  // Flush pending edits on unmount (e.g. when switching tabs while typing)
  useEffect(() => () => { flush(); }, []);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      className={className}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={flush}
    />
  );
}

/** Textarea that buffers locally and saves on blur */
function BufferedTextarea({ value: externalValue, onSave, className, ...props }: Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'onBlur' | 'value'> & { value: string; onSave: (val: string) => void }) {
  const [local, setLocal] = useState(externalValue);
  const savedRef = useRef(externalValue);
  const localRef = useRef(local);
  const onSaveRef = useRef(onSave);
  useEffect(() => { localRef.current = local; }, [local]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { if (externalValue !== savedRef.current) { setLocal(externalValue); savedRef.current = externalValue; } }, [externalValue]);
  const flush = () => { if (localRef.current !== savedRef.current) { savedRef.current = localRef.current; onSaveRef.current(localRef.current); } };
  useEffect(() => () => { flush(); }, []);
  return (
    <Textarea
      {...props}
      className={className}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={flush}
    />
  );
}

const USAGE_TYPES = [
  { value: "selbstbewohnt", label: "Selbstbewohnt" },
  { value: "zweitwohnsitz", label: "Zweitwohnsitz" },
  { value: "vermietet", label: "Vermietet" },
  { value: "fewo", label: "Ferienwohnung" },
  { value: "leerstand", label: "Leerstand" },
];

const SHARE_TYPES = [
  { value: "mea", label: "MEA" },
  { value: "Whg.-MEA", label: "Whg.-MEA" },
  { value: "Gar.-MEA", label: "Gar.-MEA" },
  { value: "Sonder-MEA", label: "Sonder-MEA" },
  { value: "einheit", label: "Einheit" },
  { value: "qm", label: "Quadratmeter" },
  { value: "personen", label: "Personen" },
  { value: "garagen", label: "Garagen" },
  { value: "stellplaetze", label: "Stellplätze" },
  { value: "wasser", label: "Wasser" },
  { value: "warmwasser", label: "Warmwasser" },
  { value: "heizkosten", label: "Heizkosten" },
];

const COST_TYPES = ["Hausgeld", "Rücklage", "Sonderumlage", "Heizkosten", "Nebenkosten", "Miete", "Stellplatz", "Garage"];
const INTERVALS = [
  { value: "monatlich", label: "Monatlich" },
  { value: "quartal", label: "Quartalsweise" },
  { value: "jaehrlich", label: "Jährlich" },
  { value: "einmalig", label: "Einmalig" },
];

interface ContactAssignment {
  id: string;
  contact_id: string;
  unit_number: string | null;
  floor_location: string | null;
  usage_type: string | null;
  usage_since: string | null;
  role_in_building: string | null;
  bank_account_id: string | null;
  notes: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  contact: {
    id: string;
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    address_street: string | null;
    address_zip: string | null;
    address_city: string | null;
  };
  shares: { id: string; share_type: string; share_value: number }[];
  phones: { id: string; phone_number: string; label: string; contact_id: string }[];
  emails: { id: string; email: string; label: string; contact_id: string }[];
  costs: { id: string; cost_type: string; amount: number; reserve_share_monthly: number | null; interval: string; valid_from: string | null; valid_to: string | null }[];
  bankAccounts: { id: string; iban: string | null; bic: string | null; bank_name: string | null; account_holder: string | null; sepa_mandate_ref: string | null; sepa_mandate_date: string | null }[];
  persons: { id: string; salutation: string | null; first_name: string | null; last_name: string | null; is_primary: boolean | null }[];
}

interface Props {
  buildingId: string;
  managementMode?: string;
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-xs text-muted-foreground">{label}: </span>
        <span className="text-sm font-mono select-all">{value}</span>
      </div>
      <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={handleCopy}>
        {copied ? <span className="text-xs text-primary">✓</span> : <Copy className="h-3 w-3 text-muted-foreground" />}
      </Button>
    </div>
  );
}

export function BuildingContactsList({ buildingId, managementMode = 'weg' }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [mieterFilter, setMieterFilter] = useState<'current' | 'all'>('current');

  const [deleteTarget, setDeleteTarget] = useState<ContactAssignment | null>(null);
  // For inline editing/adding custom types - { id: record id, field: 'share_type'|'cost_type', value: string, mode: 'add'|'edit' }
  const [editingType, setEditingType] = useState<{ id: string; field: string; value: string; mode: 'add' | 'edit'; oldValue?: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const isTenantActive = (a: ContactAssignment) => {
    if (a.valid_to && a.valid_to < todayIso) return false;
    return true;
  };

  // Load custom cost types and share types from DB
  const { data: customCostTypes = [] } = useQuery({
    queryKey: ['custom-cost-types'],
    queryFn: async () => {
      const { data } = await supabase.from("contact_building_costs").select("cost_type");
      if (!data) return [];
      const unique = [...new Set(data.map(d => d.cost_type))];
      return unique.filter(t => !COST_TYPES.includes(t) && t && t !== "__add__");
    },
  });

  const { data: customShareTypes = [] } = useQuery({
    queryKey: ['custom-share-types', buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("building_share_types")
        .select("value")
        .eq("building_id", buildingId);
      if (!data) return [];
      const unique = [...new Set(data.map((d: any) => d.value as string))];
      return unique.filter(t => !SHARE_TYPES.some(s => s.value === t) && t && t !== String("__add__"));
    },
  });

  const allCostTypes = [...COST_TYPES, ...customCostTypes];
  const allShareTypes = [...SHARE_TYPES, ...customShareTypes.map(t => ({ value: t, label: t }))];

  const { data: assignments = [], refetch } = useQuery({
    queryKey: ['building-contact-assignments', buildingId, managementMode],
    queryFn: async () => {
      const roleFilter: ("eigentuemer" | "beirat" | "mieter")[] = managementMode === 'rent' ? ["mieter"] : ["eigentuemer", "beirat"];
      const { data: assignData, error } = await supabase
        .from("contact_building_assignments")
        .select("*, contact:contacts(id, salutation, first_name, last_name, company_name, address_street, address_zip, address_city)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", roleFilter)
        .order("unit_number", { ascending: true, nullsFirst: false });
      
      if (error || !assignData) return [];

      const assignmentIds = assignData.map(a => a.id);
      const contactIds = assignData.map(a => a.contact_id);

      const [sharesRes, phonesRes, emailsRes, costsRes, bankRes, personsRes] = await Promise.all([
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
        contactIds.length > 0
          ? supabase.from("contact_bank_accounts").select("*").in("contact_id", contactIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from("contact_persons").select("id, contact_id, salutation, first_name, last_name, is_primary").in("contact_id", contactIds)
          : { data: [] },
      ]);

      

      const sortByCreated = (a: any, b: any) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      };

      return assignData.map(a => ({
        ...a,
        shares: (sharesRes.data || [])
          .filter((s: any) => s.assignment_id === a.id)
          .sort(sortByCreated),
        phones: (phonesRes.data || []).filter((p: any) => p.contact_id === a.contact_id),
        emails: (emailsRes.data || []).filter((e: any) => e.contact_id === a.contact_id),
        costs: (costsRes.data || [])
          .filter((c: any) => c.assignment_id === a.id)
          .sort(sortByCreated),
        bankAccounts: (bankRes.data || []).filter((b: any) => b.contact_id === a.contact_id),
        persons: ((personsRes as any).data || [])
          .filter((p: any) => p.contact_id === a.contact_id)
          .sort((x: any, y: any) => Number(!!y.is_primary) - Number(!!x.is_primary)),
      })) as unknown as ContactAssignment[];
    },
  });

  const getDisplayName = (a: ContactAssignment) => {
    const c = a.contact;
    if (c.company_name) return c.company_name;

    // Wenn mehrere Personen am Kontakt hängen (z. B. Eheleute), alle sinnvoll kombinieren.
    const persons = (a.persons || []).filter(p => p.first_name || p.last_name);
    if (persons.length > 1) {
      // Gruppiere nach Nachname für kompakte Darstellung: "Anna und Peter Müller" / "Müller, Anna und Schmidt, Peter"
      const byLastName = new Map<string, string[]>();
      const order: string[] = [];
      for (const p of persons) {
        const ln = (p.last_name || "").trim();
        const fn = (p.first_name || "").trim();
        if (!byLastName.has(ln)) { byLastName.set(ln, []); order.push(ln); }
        if (fn) byLastName.get(ln)!.push(fn);
      }
      const groups = order.map(ln => {
        const fns = byLastName.get(ln) || [];
        if (fns.length === 0) return ln;
        const fnPart = fns.length === 1 ? fns[0] : `${fns.slice(0, -1).join(", ")} und ${fns[fns.length - 1]}`;
        return ln ? `${fnPart} ${ln}` : fnPart;
      });
      return groups.join(" / ");
    }

    if (persons.length === 1) {
      const p = persons[0];
      return [p.salutation, p.first_name, p.last_name].filter(Boolean).join(" ");
    }

    return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const getMea = (a: ContactAssignment) => {
    const mea = a.shares.find(s => s.share_type === 'mea');
    return mea ? mea.share_value : null;
  };

  const getHausgeld = (a: ContactAssignment) => {
    const hgList = a.costs.filter(c => c.cost_type.toLowerCase().includes('hausgeld'));
    if (hgList.length === 0) return null;
    // Neuestes nach valid_from zuerst (null = älter)
    const latest = [...hgList].sort((x, y) => {
      const xd = x.valid_from ? new Date(x.valid_from).getTime() : 0;
      const yd = y.valid_from ? new Date(y.valid_from).getTime() : 0;
      return yd - xd;
    })[0];
    return latest.amount;
  };

  const isBeirat = (a: ContactAssignment) => a.role_in_building === 'beirat';
  const isCashAuditor = (a: ContactAssignment) => (a as any).is_cash_auditor === true;

  const updateAssignment = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_assignments").update({ [field]: value || null } as any).eq("id", id);
    refetch();
  };

  const toggleBeirat = async (a: ContactAssignment) => {
    const newRole = a.role_in_building === 'beirat' ? 'eigentuemer' : 'beirat';
    await supabase.from("contact_building_assignments").update({ role_in_building: newRole }).eq("id", a.id);
    refetch();
  };

  const toggleCashAuditor = async (a: ContactAssignment) => {
    await supabase
      .from("contact_building_assignments")
      .update({ is_cash_auditor: !isCashAuditor(a) } as any)
      .eq("id", a.id);
    refetch();
  };

  const removeAssignment = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.functions.invoke("remove-contact-from-building", {
      body: { assignment_id: deleteTarget.id },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Fehler",
        description: error?.message || (data as any)?.error || "Unbekannter Fehler",
        variant: "destructive",
      });
    } else {
      const accountDeleted = (data as any)?.account_deleted;
      toast({
        title: "Zuordnung entfernt",
        description: accountDeleted
          ? "Account wurde komplett gelöscht (keine weiteren Gebäude)."
          : "Person hat weiterhin Zugriff auf andere Gebäude.",
      });
      setDeleteTarget(null);
      setExpanded(null);
      refetch();
    }
  };

  // Shares
  // WICHTIG: Vor dem Insert blurren wir das aktive Eingabefeld und geben pending
  // onBlur-Saves Zeit, ihre DB-Updates abzusetzen — sonst überschreibt ein zu
  // früher Refetch die gerade getippte Zahl mit dem alten Wert (Race Condition).
  const flushPendingEdits = async () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === "function") el.blur();
    // Zwei Mikrotask-Ticks: einmal damit onBlur-Handler synchron feuert,
    // einmal damit die darin angestoßenen Promises beginnen.
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => setTimeout(r, 50));
  };

  const addShare = async (assignmentId: string) => {
    await flushPendingEdits();
    await supabase.from("contact_building_shares").insert({ assignment_id: assignmentId, share_type: "mea", share_value: 0 });
    await refetch();
  };
  const updateShare = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_shares").update({ [field]: value } as any).eq("id", id);
    await refetch();
    if (field === "share_type") queryClient.invalidateQueries({ queryKey: ["custom-share-types", buildingId] });
  };
  const deleteShare = async (id: string) => {
    await supabase.from("contact_building_shares").delete().eq("id", id);
    await refetch();
  };

  const saveEditingType = async () => {
    if (!editingType || !editingType.value.trim()) {
      setEditingType(null);
      return;
    }
    const val = editingType.value.trim();
    if (editingType.field === "share_type") {
      if (editingType.mode === "edit" && editingType.oldValue) {
        // Rename: catalog + alle Shares dieses Gebäudes
        await supabase
          .from("building_share_types")
          .update({ value: val, label: val } as any)
          .eq("building_id", buildingId)
          .eq("value", editingType.oldValue);
        const { data: asgs } = await supabase
          .from("contact_building_assignments")
          .select("id")
          .eq("building_id", buildingId);
        const ids = (asgs || []).map((a: any) => a.id);
        if (ids.length > 0) {
          await supabase
            .from("contact_building_shares")
            .update({ share_type: val } as any)
            .in("assignment_id", ids)
            .eq("share_type", editingType.oldValue as any);
        }
      } else {
        // Neu anlegen: in Katalog + in den aktuellen Share-Datensatz schreiben
        await supabase
          .from("building_share_types")
          .upsert({ building_id: buildingId, value: val, label: val } as any, { onConflict: "building_id,value" } as any);
        await supabase.from("contact_building_shares").update({ share_type: val } as any).eq("id", editingType.id);
      }
      queryClient.invalidateQueries({ queryKey: ["custom-share-types", buildingId] });
      queryClient.invalidateQueries({ queryKey: ["building-share-types", buildingId] });
    } else {
      if (editingType.mode === "edit" && editingType.oldValue) {
        await supabase.from("contact_building_costs").update({ cost_type: val }).eq("cost_type", editingType.oldValue);
      } else {
        await supabase.from("contact_building_costs").update({ cost_type: val }).eq("id", editingType.id);
      }
      queryClient.invalidateQueries({ queryKey: ["custom-cost-types"] });
    }
    setEditingType(null);
    refetch();
  };

  const deleteCustomType = async (field: string, typeValue: string) => {
    if (field === "share_type") {
      const { data: asgs } = await supabase
        .from("contact_building_assignments")
        .select("id")
        .eq("building_id", buildingId);
      const ids = (asgs || []).map((a: any) => a.id);
      if (ids.length > 0) {
        await supabase
          .from("contact_building_shares")
          .update({ share_type: "mea" } as any)
          .in("assignment_id", ids)
          .eq("share_type", typeValue as any);
      }
      await supabase
        .from("building_share_types")
        .delete()
        .eq("building_id", buildingId)
        .eq("value", typeValue);
      queryClient.invalidateQueries({ queryKey: ["custom-share-types", buildingId] });
      queryClient.invalidateQueries({ queryKey: ["building-share-types", buildingId] });
    } else {
      await supabase.from("contact_building_costs").update({ cost_type: "Hausgeld" }).eq("cost_type", typeValue);
      queryClient.invalidateQueries({ queryKey: ["custom-cost-types"] });
    }
    toast({ title: `„${typeValue}" entfernt` });
    refetch();
  };


  const ensureAccountAndTemplate = async (assignmentId: string, costType: string, amount: number, validFrom: string | null, validTo: string | null) => {
    if (amount <= 0) {
      toast({ title: "Hinweis", description: "Bitte zuerst einen Betrag eingeben.", variant: "destructive" });
      return;
    }
    
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    const unitNumber = assignment.unit_number || "0000";
    const floorLocation = assignment.floor_location || "";
    const lastName = assignment.contact.last_name || "Unbenannt";
    const contactName = [assignment.contact.first_name, assignment.contact.last_name].filter(Boolean).join(" ") || "Unbenannt";
    
    const defaultBank = assignment.bankAccounts?.find((b: any) => b.is_default) || assignment.bankAccounts?.[0];
    const vendorIban = defaultBank?.iban || null;
    const vendorName = contactName;

    // Format date compact MM/YY for template name
    const fmtDate = (d: string | null) => {
      if (!d) return null;
      const dt = new Date(d);
      return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(-2)}`;
    };

    try {
      // 1. Find or create account (reuse by account_number — no duplicates)
      const { data: existingAccount, error: findError } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("building_id", buildingId)
        .eq("account_number", unitNumber)
        .maybeSingle();

      if (findError) {
        toast({ title: "Fehler", description: `Kontosuche fehlgeschlagen: ${findError.message}`, variant: "destructive" });
        return;
      }

      let accountId = existingAccount?.id;
      if (!accountId) {
        const numericSort = parseInt(unitNumber.replace(/\D/g, ''), 10) || 0;
        const { data: newAccount, error: insertError } = await supabase
          .from("chart_of_accounts")
          .insert({
            account_number: unitNumber,
            account_name: `${costType === "Hausgeld" ? "HG" : costType} ${lastName}`,
            building_id: buildingId,
            category: "0. Personenkonten",
            sort_order: numericSort,
            default_vat_rate: 0,
          })
          .select("id")
          .single();
        if (insertError) {
          toast({ title: "Fehler beim Konto erstellen", description: insertError.message, variant: "destructive" });
          return;
        }
        accountId = newAccount?.id;
      }

      if (!accountId) {
        toast({ title: "Fehler", description: "Konto konnte nicht erstellt werden.", variant: "destructive" });
        return;
      }

      // 2. Find existing templates for same cost type + unit
      const { data: existingTemplates } = await supabase
        .from("booking_templates")
        .select("id, valid_from, valid_to")
        .eq("building_id", buildingId)
        .ilike("name", `%${costType}%${unitNumber}%`);

      // Check for overlapping timeframe
      const hasOverlap = (existingTemplates || []).find(t => {
        const tFrom = t.valid_from || null;
        const tTo = t.valid_to || null;
        // If both have no dates, they overlap
        if (!tFrom && !tTo && !validFrom && !validTo) return true;
        // Open-ended ranges: treat null as infinity
        const aStart = validFrom || "0000-01-01";
        const aEnd = validTo || "9999-12-31";
        const bStart = tFrom || "0000-01-01";
        const bEnd = tTo || "9999-12-31";
        return aStart <= bEnd && bStart <= aEnd;
      });

      // Build template name — append date range if dates are set
      const baseName = `${costType} ${unitNumber} ${floorLocation}`.trim();
      const dateSuffix = (validFrom || validTo)
        ? ` (${fmtDate(validFrom) || "…"}–${fmtDate(validTo) || "…"})`
        : "";
      const templateName = baseName + dateSuffix;

      if (hasOverlap) {
        // Update existing overlapping template
        const { error: updateErr } = await supabase.from("booking_templates").update({ 
          expected_amount: amount,
          vendor_name: vendorName,
          vendor_iban: vendorIban,
          vat_rate: 0,
          account_id: accountId,
          valid_from: validFrom,
          valid_to: validTo,
        }).eq("id", hasOverlap.id);
        if (updateErr) {
          toast({ title: "Fehler beim Vorlage aktualisieren", description: updateErr.message, variant: "destructive" });
          return;
        }
      } else {
        // Create new template (different timeframe)
        const { error: insertErr } = await supabase.from("booking_templates").insert({
          name: templateName,
          building_id: buildingId,
          expected_amount: amount,
          interval: "monatlich",
          account_id: accountId,
          vendor_name: vendorName,
          vendor_iban: vendorIban,
          vat_rate: 0,
          valid_from: validFrom,
          valid_to: validTo,
        });
        if (insertErr) {
          toast({ title: "Fehler beim Vorlage erstellen", description: insertErr.message, variant: "destructive" });
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["booking-templates"] });

      toast({ title: "Konto & Vorlage erstellt", description: `${costType}-Konto und Buchungsvorlage wurden angelegt/aktualisiert.` });
    } catch (err: any) {
      toast({ title: "Unerwarteter Fehler", description: err?.message || "Bitte erneut versuchen.", variant: "destructive" });
    }
  };

  // Costs
  // Rent-Modus: schließt ältere Kosten desselben Typs automatisch ab,
  // sobald ein neues "gültig ab" gesetzt wird.
  const closePreviousCostsForType = async (
    assignmentId: string,
    costType: string,
    newValidFrom: string,
    currentCostId: string,
  ) => {
    const newDate = new Date(newValidFrom);
    if (isNaN(newDate.getTime())) return;
    const cutoff = new Date(newDate.getTime() - 86400_000).toISOString().slice(0, 10);
    const { data: others } = await supabase
      .from("contact_building_costs")
      .select("id, valid_from, valid_to")
      .eq("assignment_id", assignmentId)
      .eq("cost_type", costType)
      .neq("id", currentCostId);
    for (const o of (others || [])) {
      const of = o.valid_from || null;
      const ot = o.valid_to || null;
      if (of && of >= newValidFrom) continue; // jünger / gleich -> nicht anfassen
      if (ot && ot < newValidFrom) continue; // schon abgeschlossen vorher
      await supabase.from("contact_building_costs").update({ valid_to: cutoff }).eq("id", o.id);
    }
  };

  const addCost = async (assignmentId: string) => {
    await flushPendingEdits();
    const payload: any = { assignment_id: assignmentId, cost_type: "Miete", amount: 0, interval: "monatlich" };
    if (managementMode === 'rent') payload.valid_from = todayIso;
    const { data: inserted } = await supabase.from("contact_building_costs").insert(payload).select("id").single();
    if (managementMode === 'rent' && inserted?.id) {
      await closePreviousCostsForType(assignmentId, "Miete", todayIso, inserted.id);
    }
    await refetch();
  };
  const updateCost = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_costs").update({ [field]: value } as any).eq("id", id);
    if (managementMode === 'rent' && (field === 'valid_from' || field === 'cost_type') && value) {
      const { data: row } = await supabase
        .from("contact_building_costs")
        .select("assignment_id, cost_type, valid_from")
        .eq("id", id)
        .maybeSingle();
      if (row?.valid_from) {
        await closePreviousCostsForType(row.assignment_id, row.cost_type, row.valid_from, id);
      }
    }
    await refetch();
    if (field === "cost_type") queryClient.invalidateQueries({ queryKey: ["custom-cost-types"] });
  };
  const deleteCost = async (id: string) => {
    await supabase.from("contact_building_costs").delete().eq("id", id);
    await refetch();
  };

  // Phones
  const addPhone = async (contactId: string) => {
    await supabase.from("contact_phones").insert({ contact_id: contactId, phone_number: "", label: "Mobil" });
    refetch();
  };
  const updatePhone = async (id: string, field: string, value: string) => {
    await supabase.from("contact_phones").update({ [field]: value } as any).eq("id", id);
    refetch();
  };
  const deletePhone = async (id: string) => {
    await supabase.from("contact_phones").delete().eq("id", id);
    refetch();
  };

  // Emails
  const addEmail = async (contactId: string) => {
    await supabase.from("contact_emails").insert({ contact_id: contactId, email: "", label: "Privat" });
    refetch();
  };
  const updateEmail = async (id: string, field: string, value: string) => {
    await supabase.from("contact_emails").update({ [field]: value } as any).eq("id", id);
    refetch();
  };
  const deleteEmail = async (id: string) => {
    await supabase.from("contact_emails").delete().eq("id", id);
    refetch();
  };

  const roleLabel = managementMode === 'weg' ? 'Eigentümer' : 'Mieter';

  // Mieter-Filter: nur aktuelle (default) vs. alle
  const visibleAssignments = managementMode === 'rent' && mieterFilter === 'current'
    ? assignments.filter(isTenantActive)
    : assignments;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">
          Kontakte ({visibleAssignments.length}{managementMode === 'rent' && mieterFilter === 'current' && assignments.length !== visibleAssignments.length ? ` von ${assignments.length}` : ''})
        </h3>
        <div className="flex items-center gap-2">
          {managementMode === 'rent' && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setMieterFilter('current')}
                className={cn("px-2.5 h-7 text-xs", mieterFilter === 'current' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
              >
                Nur aktuelle
              </button>
              <button
                type="button"
                onClick={() => setMieterFilter('all')}
                className={cn("px-2.5 h-7 text-xs border-l", mieterFilter === 'all' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
              >
                Alle
              </button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
            <Plus className="h-3 w-3 mr-1" /> Kontakt zuordnen
          </Button>
        </div>
      </div>

      {visibleAssignments.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Keine Kontakte zugeordnet</p>
      )}

      {(() => {
        // Hauptwohnungen + Sub-Units gruppieren (Sub-Units bekommen Einrückung)
        const mains = visibleAssignments.filter((a) => isApartment((a as any).unit_kind));
        const subsAll = visibleAssignments.filter((a) => !isApartment((a as any).unit_kind));
        const subsByParent = new Map<string, ContactAssignment[]>();
        const looseSubs: ContactAssignment[] = [];
        for (const s of subsAll) {
          const pid = (s as any).parent_assignment_id as string | null;
          if (pid && mains.some((m) => m.id === pid)) {
            const arr = subsByParent.get(pid) || [];
            arr.push(s);
            subsByParent.set(pid, arr);
          } else {
            looseSubs.push(s);
          }
        }
        const flat: { a: ContactAssignment; isSub: boolean }[] = [];
        mains.forEach((m) => {
          flat.push({ a: m, isSub: false });
          (subsByParent.get(m.id) || []).forEach((s) => flat.push({ a: s, isSub: true }));
        });
        looseSubs.forEach((s) => flat.push({ a: s, isSub: false }));

        return flat.map(({ a, isSub }) => {
        const isExpanded = expanded === a.id;
        const hausgeld = getHausgeld(a);
        const kind = ((a as any).unit_kind || "apartment") as UnitKind;
        const billingMode = ((a as any).billing_mode || "own_billing") as "own_billing" | "distribution_only";
        const kindLabel = UNIT_KIND_LABELS[kind] || "Einheit";
        const kindIcon = UNIT_KIND_ICONS[kind] ?? "";

        return (
          <Card key={a.id} className={`overflow-hidden ${isSub ? "ml-6 border-l-2 border-l-primary/30" : ""}`}>
            <CardContent className="p-0">
              {/* Compact row */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : a.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {isSub ? <CornerDownRight className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {!isApartment(kind) && <span aria-hidden>{kindIcon}</span>}
                      {getDisplayName(a)}
                    </p>
                    {(a.unit_number || a.floor_location || !isApartment(kind)) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[!isApartment(kind) ? kindLabel : null, a.unit_number, a.floor_location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                    {managementMode === 'weg' && isBeirat(a) && <Badge variant="secondary" className="text-xs">Beirat</Badge>}
                    {managementMode === 'weg' && isCashAuditor(a) && <Badge variant="secondary" className="text-xs">Kassenprüfung</Badge>}
                    {hausgeld !== null && <Badge variant="outline" className="text-xs">{hausgeld.toFixed(2)} €</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Zuordnung bearbeiten"
                    onClick={(e) => { e.stopPropagation(); setEditAssignmentId(a.id); setShowAssign(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-border">
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList variant="underline" className="w-full h-8 mb-3">
                      <TabsTrigger variant="underline" value="overview" className="text-xs h-7 flex-1">Übersicht</TabsTrigger>
                      <TabsTrigger variant="underline" value="shares" className="text-xs h-7 flex-1">Anteile</TabsTrigger>
                      <TabsTrigger variant="underline" value="costs" className="text-xs h-7 flex-1">Kosten</TabsTrigger>
                      <TabsTrigger variant="underline" value="bank" className="text-xs h-7 flex-1">Bank</TabsTrigger>
                    </TabsList>

                    {/* Tab: Übersicht */}
                    <TabsContent value="overview" className="space-y-4 mt-0">
                      {/* Telefon */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</p>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addPhone(a.contact_id)}>
                            <Plus className="h-3 w-3 mr-1" /> Telefon
                          </Button>
                        </div>
                        {a.phones.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Telefonnummer</p>}
                        {a.phones.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <BufferedInput
                              value={p.phone_number}
                              onSave={(val) => updatePhone(p.id, "phone_number", val)}
                              placeholder="Nummer"
                              className="h-7 text-sm flex-1"
                            />
                            <Select value={p.label || "Mobil"} onValueChange={(v) => updatePhone(p.id, "label", v)}>
                              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Mobil">Mobil</SelectItem>
                                <SelectItem value="Privat">Privat</SelectItem>
                                <SelectItem value="Geschäftlich">Geschäftl.</SelectItem>
                                <SelectItem value="Festnetz">Festnetz</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deletePhone(p.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* E-Mail */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">E-Mail</p>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addEmail(a.contact_id)}>
                            <Plus className="h-3 w-3 mr-1" /> E-Mail
                          </Button>
                        </div>
                        {a.emails.length === 0 && <p className="text-xs text-muted-foreground italic">Keine E-Mail-Adresse</p>}
                        {a.emails.map((e) => (
                          <div key={e.id} className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <BufferedInput
                              value={e.email}
                              onSave={(val) => updateEmail(e.id, "email", val)}
                              placeholder="E-Mail"
                              className="h-7 text-sm flex-1"
                            />
                            <Select value={e.label || "Privat"} onValueChange={(v) => updateEmail(e.id, "label", v)}>
                              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Privat">Privat</SelectItem>
                                <SelectItem value="Geschäftlich">Geschäftl.</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteEmail(e.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Adresse (read-only) */}
                      {(a.contact.address_street || a.contact.address_zip || a.contact.address_city) && (
                        <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresse</p>
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span>
                              {[a.contact.address_street, [a.contact.address_zip, a.contact.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Adresse wird über die Kontaktseite verwaltet</p>
                        </div>
                      )}

                      {/* Assignment fields */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Einheitsdaten</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <Label className="text-xs">Einheit Nr.</Label>
                            <BufferedInput
                              value={a.unit_number || ""}
                              onSave={(val) => updateAssignment(a.id, "unit_number", val)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Etage / Lage</Label>
                            <BufferedInput
                              value={a.floor_location || ""}
                              onSave={(val) => updateAssignment(a.id, "floor_location", val)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Nutzungsart</Label>
                            <Select value={a.usage_type || ""} onValueChange={(v) => updateAssignment(a.id, "usage_type", v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen" /></SelectTrigger>
                              <SelectContent>
                                {USAGE_TYPES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Nutzung seit</Label>
                            <Input
                              type="date"
                              value={a.usage_since || ""}
                              onChange={(e) => updateAssignment(a.id, "usage_since", e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>

                        {managementMode === 'weg' && (
                          <div className="flex items-center gap-2 pt-1">
                            <Checkbox
                              id={`beirat-${a.id}`}
                              checked={isBeirat(a)}
                              onCheckedChange={() => toggleBeirat(a)}
                            />
                            <Label htmlFor={`beirat-${a.id}`} className="text-sm cursor-pointer">Mitglied des Verwaltungsbeirats</Label>
                          </div>
                        )}

                        {managementMode === 'weg' && (
                          <div className="flex items-center gap-2 pt-1">
                            <Checkbox
                              id={`cash-auditor-${a.id}`}
                              checked={isCashAuditor(a)}
                              onCheckedChange={() => toggleCashAuditor(a)}
                            />
                            <Label htmlFor={`cash-auditor-${a.id}`} className="text-sm cursor-pointer">Kassenprüfer/in</Label>
                          </div>
                        )}
                      </div>

                      {/* Notizen */}
                      <div>
                        <Label className="text-xs">Notizen</Label>
                        <BufferedTextarea
                          value={a.notes || ""}
                          onSave={(val) => updateAssignment(a.id, "notes", val)}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    </TabsContent>

                    {/* Tab: Anteile */}
                    <TabsContent value="shares" className="mt-0">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anteile / Verteilerschlüssel</Label>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addShare(a.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Anteil
                        </Button>
                      </div>
                      {a.shares.length === 0 && <p className="text-xs text-muted-foreground">Keine Anteile definiert</p>}
                      {a.shares.map(s => (
                        <div key={s.id} className="flex items-center gap-2 mt-2">
                          {editingType?.id === s.id && editingType.field === "share_type" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                placeholder="Kategorie eingeben"
                                value={editingType.value}
                                onChange={(e) => setEditingType({ ...editingType, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") saveEditingType(); if (e.key === "Escape") setEditingType(null); }}
                                className="w-36 h-8 text-sm"
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditingType}>
                                <Check className="h-3 w-3 text-primary" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingType(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Select value={s.share_type} onValueChange={(v) => {
                                if (v === "__add__") {
                                  setEditingType({ id: s.id, field: "share_type", value: "", mode: "add" });
                                } else {
                                  updateShare(s.id, "share_type", v);
                                }
                              }}>
                                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {SHARE_TYPES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
                                  {customShareTypes.length > 0 && (
                                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Eigene</div>
                                  )}
                                  {customShareTypes.map(ct => (
                                    <div key={ct} className="flex items-center justify-between px-2 py-1 hover:bg-accent rounded-sm group">
                                      <SelectItem value={ct} className="flex-1 p-0">{ct}</SelectItem>
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 ml-1">
                                        <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); setEditingType({ id: s.id, field: "share_type", value: ct, mode: "edit", oldValue: ct }); }}>
                                          <Pencil className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                        <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCustomType("share_type", ct); }}>
                                          <X className="h-3 w-3 text-destructive" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <SelectItem value="__add__" className="text-primary font-medium">+ Hinzufügen</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <BufferedNumberInput
                            value={s.share_value}
                            onSave={(val) => updateShare(s.id, "share_value", val)}
                            placeholder="0"
                            className="w-28 h-8 text-sm"
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteShare(s.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </TabsContent>

                    {/* Tab: Kosten */}
                    <TabsContent value="costs" className="mt-0">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kosten</Label>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addCost(a.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Kosten
                        </Button>
                      </div>
                      {a.costs.length === 0 && <p className="text-xs text-muted-foreground">Keine Kosten definiert</p>}
                      {[...a.costs].sort((x, y) => {
                        // Hausgeld immer zuerst, dann nach valid_from absteigend (neuestes oben)
                        const xHg = x.cost_type.toLowerCase().includes("hausgeld") ? 1 : 0;
                        const yHg = y.cost_type.toLowerCase().includes("hausgeld") ? 1 : 0;
                        if (xHg !== yHg) return yHg - xHg;
                        const xd = x.valid_from ? new Date(x.valid_from).getTime() : 0;
                        const yd = y.valid_from ? new Date(y.valid_from).getTime() : 0;
                        return yd - xd;
                      }).map(c => (
                        <div key={c.id} className="flex items-center gap-2 mt-2">
                          {editingType?.id === c.id && editingType.field === "cost_type" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                placeholder="Kategorie eingeben"
                                value={editingType.value}
                                onChange={(e) => setEditingType({ ...editingType, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") saveEditingType(); if (e.key === "Escape") setEditingType(null); }}
                                className="w-32 h-8 text-sm"
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditingType}>
                                <Check className="h-3 w-3 text-primary" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingType(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Select value={c.cost_type} onValueChange={(v) => {
                                if (v === "__add__") {
                                  setEditingType({ id: c.id, field: "cost_type", value: "", mode: "add" });
                                } else {
                                  updateCost(c.id, "cost_type", v);
                                }
                              }}>
                                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {COST_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                                  {customCostTypes.length > 0 && (
                                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Eigene</div>
                                  )}
                                  {customCostTypes.map(ct => (
                                    <div key={ct} className="flex items-center justify-between px-2 py-1 hover:bg-accent rounded-sm group">
                                      <SelectItem value={ct} className="flex-1 p-0">{ct}</SelectItem>
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 ml-1">
                                        <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); setEditingType({ id: c.id, field: "cost_type", value: ct, mode: "edit", oldValue: ct }); }}>
                                          <Pencil className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                        <button type="button" className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCustomType("cost_type", ct); }}>
                                          <X className="h-3 w-3 text-destructive" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <SelectItem value="__add__" className="text-primary font-medium">+ Hinzufügen</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <BufferedNumberInput
                            value={c.amount}
                            onSave={(val) => updateCost(c.id, "amount", val)}
                            placeholder="0,00"
                            className="w-24 h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">€</span>
                          <Select value={c.interval} onValueChange={(v) => updateCost(c.id, "interval", v)}>
                            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {INTERVALS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            value={c.valid_from || ""}
                            onChange={(e) => updateCost(c.id, "valid_from", e.target.value || null)}
                            className="w-[130px] h-8 text-xs"
                            title="Gültig ab"
                            placeholder="ab"
                          />
                          <Input
                            type="date"
                            value={c.valid_to || ""}
                            onChange={(e) => updateCost(c.id, "valid_to", e.target.value || null)}
                            className="w-[130px] h-8 text-xs"
                            title="Gültig bis"
                            placeholder="bis"
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => ensureAccountAndTemplate(a.id, c.cost_type, c.amount, c.valid_from, c.valid_to)}
                                >
                                  <BookOpen className="h-3.5 w-3.5 text-orange-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Konto + Vorlage anlegen</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteCost(c.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </TabsContent>

                    {/* Tab: Bank */}
                    <TabsContent value="bank" className="mt-0">
                      {a.bankAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Keine Bankverbindung hinterlegt. Bitte im Kontakt-Manager pflegen.</p>
                      ) : (
                        <div className="space-y-3">
                          {a.bankAccounts.map((bank, i) => (
                            <div key={bank.id || i} className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                              {bank.account_holder && <CopyableField label="Kontoinhaber" value={bank.account_holder} />}
                              {bank.iban && <CopyableField label="IBAN" value={bank.iban} />}
                              {bank.bic && <CopyableField label="BIC" value={bank.bic} />}
                              {bank.bank_name && <CopyableField label="Bank" value={bank.bank_name} />}
                              <BankSepaInlineEditor
                                bankId={bank.id}
                                sepaRef={bank.sepa_mandate_ref}
                                sepaDate={bank.sepa_mandate_date}
                                onSaved={() => queryClient.invalidateQueries({ queryKey: ['building-contact-assignments', buildingId, managementMode] })}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        );
        });
      })()}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zuordnung entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${getDisplayName(deleteTarget)} wird von diesem Gebäude entfernt. Der Kontakt selbst bleibt erhalten.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={removeAssignment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignContactDialog
        open={showAssign}
        onOpenChange={(o) => { setShowAssign(o); if (!o) setEditAssignmentId(null); }}
        buildingId={buildingId}
        onAssigned={() => { refetch(); setEditAssignmentId(null); }}
        existingContactIds={assignments.map(a => a.contact_id)}
        managementMode={managementMode as "weg" | "rent"}
        editAssignmentId={editAssignmentId}
      />
    </div>
  );
}
