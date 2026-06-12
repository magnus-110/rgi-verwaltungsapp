import { useState, useEffect } from "react";
import { Search, Home, Plus, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  listingType: 'rent' | 'sale';
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Row {
  id: string;
  title: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  is_active: boolean;
}

export const BrokerPropertyList = ({ listingType, selectedId, onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ['broker-properties', listingType, showInactive],
    queryFn: async () => {
      let q = supabase.from('broker_properties' as any)
        .select('id, title, address, postal_code, city, is_active')
        .eq('listing_type', listingType)
        .order('created_at', { ascending: false });
      if (!showInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const filtered = items.filter(i =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
    (i.address || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col border-r border-border bg-card">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">
            {listingType === 'rent' ? 'Vermietung' : 'Verkauf'}
          </h2>
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setCreateOpen(true)} title="Neues Objekt">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="pl-7 h-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor="show-inactive" className="text-muted-foreground cursor-pointer">
            Inaktive anzeigen
          </Label>
          <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            Keine Objekte
          </div>
        )}
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              "w-full text-left p-3 rounded-lg transition-colors",
              selectedId === p.id
                ? "bg-primary/10 border border-primary/20"
                : "hover:bg-muted/50 border border-transparent"
            )}
          >
            <div className="flex items-start gap-2">
              <div className={cn(
                "p-1.5 rounded-md flex-shrink-0",
                selectedId === p.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <Home className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn("text-sm font-medium truncate", selectedId === p.id && "text-primary")}>
                    {p.title}
                  </p>
                  {!p.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      inaktiv
                    </span>
                  )}
                </div>
                {(p.address || p.postal_code || p.city) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <BrokerPropertyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        listingType={listingType}
        mode="create"
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ['broker-properties'] });
          if (id) onSelect(id);
        }}
      />

    </div>
  );
};

export const BrokerPropertyFormDialog = ({ open, onOpenChange, listingType, mode, initial, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  listingType: 'rent' | 'sale';
  mode: 'create' | 'edit';
  initial?: Partial<Row>;
  onSaved: (id?: string) => void;
}) => {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setAddress(initial?.address || "");
      setPostalCode(initial?.postal_code || "");
      setCity(initial?.city || "");
    }
  }, [open, initial?.id]);

  const submit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      if (mode === 'create') {
        const { data: { user } } = await supabase.auth.getUser();
        const defaults = listingType === 'sale'
          ? { commission_buyer_pct: 3, commission_seller_pct: 3, commission_note: 'Standard: 3 % netto Käufer + 3 % netto Verkäufer' }
          : {};
        const { data, error } = await supabase.from('broker_properties' as any).insert({
          title: title.trim(),
          address: address.trim() || null,
          postal_code: postalCode.trim() || null,
          city: city.trim() || null,
          listing_type: listingType,
          created_by: user?.id,
          ...defaults,
        } as any).select('id').single();
        if (error) throw error;
        await supabase.rpc('ensure_broker_categories' as any, { p_property_id: (data as any).id });
        toast.success("Objekt angelegt");
        onOpenChange(false);
        onSaved((data as any).id);
      } else if (initial?.id) {
        const { error } = await supabase.from('broker_properties' as any).update({
          title: title.trim(),
          address: address.trim() || null,
          postal_code: postalCode.trim() || null,
          city: city.trim() || null,
        }).eq('id', initial.id);
        if (error) throw error;
        toast.success("Gespeichert");
        onOpenChange(false);
        onSaved(initial.id);
      }
    } catch (e: any) {
      toast.error(e.message || "Fehler");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? `Neues ${listingType === 'rent' ? 'Vermietungs-' : 'Verkaufs-'}Objekt`
              : 'Objekt bearbeiten'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. 3-Zi-Wohnung Marktstraße 12" />
          </div>
          <div>
            <Label>Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Straße & Hausnummer" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>PLZ</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Ort</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={loading || !title.trim()}>
            {mode === 'create' ? 'Anlegen' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
