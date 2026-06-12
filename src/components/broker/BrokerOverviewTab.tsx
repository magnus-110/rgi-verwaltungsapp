import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const FEATURE_OPTIONS = [
  "Balkon","Terrasse","Garten","Garage","Stellplatz","Aufzug","Keller","Einbauküche",
  "Barrierefrei","Klimaanlage","Möbliert","Haustier erlaubt","Glasfaser","Kamin"
];

export const BrokerOverviewTab = ({ property, onUpdated }: { property: any; onUpdated: () => void }) => {
  const [form, setForm] = useState<any>(property);
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState("");

  useEffect(() => { setForm(property); }, [property.id]);

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const num = (v: string) => v === "" ? null : Number(v);

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-min'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, display_name').order('display_name');
      return data || [];
    },
  });

  const { data: ownerEmails = [] } = useQuery({
    queryKey: ['owner-emails', form?.owner_contact_id],
    enabled: !!form?.owner_contact_id,
    queryFn: async () => {
      const { data: persons } = await supabase.from('contact_persons').select('id').eq('contact_id', form.owner_contact_id);
      if (!persons?.length) return [];
      const { data: emails } = await supabase.from('contact_emails').select('email').in('contact_person_id', persons.map((p: any) => p.id));
      return emails || [];
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        is_active: form.is_active,
        address: form.address || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        property_type: form.property_type || null,
        condition: form.condition || null,
        available_from: form.available_from || null,
        price_eur: form.price_eur,
        deposit_eur: form.deposit_eur,
        cold_rent_eur: form.cold_rent_eur,
        service_charge_eur: form.service_charge_eur,
        heating_cost_eur: form.heating_cost_eur,
        commission_buyer_pct: form.commission_buyer_pct,
        commission_seller_pct: form.commission_seller_pct,
        commission_tenant_pct: form.commission_tenant_pct,
        commission_note: form.commission_note || null,
        living_space_sqm: form.living_space_sqm,
        plot_size_sqm: form.plot_size_sqm,
        rooms: form.rooms,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        floor: form.floor,
        total_floors: form.total_floors,
        year_built: form.year_built,
        heating_type: form.heating_type || null,
        energy_class: form.energy_class || null,
        energy_value: form.energy_value,
        features: form.features || [],
        description: form.description || null,
        internal_notes: form.internal_notes || null,
        owner_contact_id: form.owner_contact_id || null,
      };
      const { error } = await supabase.from('broker_properties' as any).update(payload).eq('id', property.id);
      if (error) throw error;
      toast.success("Gespeichert");
      onUpdated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleFeature = (f: string) => {
    const cur: string[] = form.features || [];
    upd('features', cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f]);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex justify-end sticky top-0 z-10 bg-background/80 backdrop-blur py-2">
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />Speichern</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Eckdaten</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><Label>Titel</Label><Input value={form.title || ''} onChange={e => upd('title', e.target.value)} /></div>
          <div className="flex items-center gap-2"><Switch checked={!!form.is_active} onCheckedChange={v => upd('is_active', v)} /><Label>Aktiv</Label></div>
          <div><Label>Verfügbar ab</Label><Input type="date" value={form.available_from || ''} onChange={e => upd('available_from', e.target.value || null)} /></div>
          <div><Label>Adresse</Label><Input value={form.address || ''} onChange={e => upd('address', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>PLZ</Label><Input value={form.postal_code || ''} onChange={e => upd('postal_code', e.target.value)} /></div>
            <div><Label>Ort</Label><Input value={form.city || ''} onChange={e => upd('city', e.target.value)} /></div>
          </div>
          <div><Label>Objektart</Label>
            <Select value={form.property_type || ''} onValueChange={v => upd('property_type', v)}>
              <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
              <SelectContent>
                {['Wohnung','Haus','Doppelhaushälfte','Reihenhaus','Mehrfamilienhaus','Grundstück','Gewerbe','Sonstiges'].map(t =>
                  <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Zustand</Label>
            <Select value={form.condition || ''} onValueChange={v => upd('condition', v)}>
              <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
              <SelectContent>
                {['Neubau','Erstbezug','Sehr gut','Gepflegt','Renovierungsbedürftig','Sanierungsbedürftig'].map(t =>
                  <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Preis & Provision</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {property.listing_type === 'sale' ? (
            <div><Label>Kaufpreis (€)</Label><Input type="number" value={form.price_eur ?? ''} onChange={e => upd('price_eur', num(e.target.value))} /></div>
          ) : (
            <>
              <div><Label>Kaltmiete (€)</Label><Input type="number" value={form.cold_rent_eur ?? ''} onChange={e => upd('cold_rent_eur', num(e.target.value))} /></div>
              <div><Label>Nebenkosten (€)</Label><Input type="number" value={form.service_charge_eur ?? ''} onChange={e => upd('service_charge_eur', num(e.target.value))} /></div>
              <div><Label>Heizkosten (€)</Label><Input type="number" value={form.heating_cost_eur ?? ''} onChange={e => upd('heating_cost_eur', num(e.target.value))} /></div>
              <div><Label>Kaution (€)</Label><Input type="number" value={form.deposit_eur ?? ''} onChange={e => upd('deposit_eur', num(e.target.value))} /></div>
            </>
          )}
          {property.listing_type === 'sale' ? (
            <>
              <div><Label>Provision Käufer (%)</Label><Input type="number" step="0.01" value={form.commission_buyer_pct ?? ''} onChange={e => upd('commission_buyer_pct', num(e.target.value))} /></div>
              <div><Label>Provision Verkäufer (%)</Label><Input type="number" step="0.01" value={form.commission_seller_pct ?? ''} onChange={e => upd('commission_seller_pct', num(e.target.value))} /></div>
            </>
          ) : (
            <div><Label>Provision Mieter (%)</Label><Input type="number" step="0.01" value={form.commission_tenant_pct ?? ''} onChange={e => upd('commission_tenant_pct', num(e.target.value))} /></div>
          )}
          <div className="col-span-2 md:col-span-3"><Label>Provisionshinweis</Label><Input value={form.commission_note || ''} onChange={e => upd('commission_note', e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Eigentümer</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label>Kontakt</Label>
          <Select value={form.owner_contact_id || 'none'} onValueChange={v => upd('owner_contact_id', v === 'none' ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Keiner —</SelectItem>
              {contacts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {ownerEmails.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Emails: {ownerEmails.map((e: any) => e.email).join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Größen</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Wohnfläche (m²)</Label><Input type="number" step="0.01" value={form.living_space_sqm ?? ''} onChange={e => upd('living_space_sqm', num(e.target.value))} /></div>
          <div><Label>Grundstück (m²)</Label><Input type="number" step="0.01" value={form.plot_size_sqm ?? ''} onChange={e => upd('plot_size_sqm', num(e.target.value))} /></div>
          <div><Label>Zimmer</Label><Input type="number" step="0.5" value={form.rooms ?? ''} onChange={e => upd('rooms', num(e.target.value))} /></div>
          <div><Label>Schlafzimmer</Label><Input type="number" value={form.bedrooms ?? ''} onChange={e => upd('bedrooms', num(e.target.value))} /></div>
          <div><Label>Bäder</Label><Input type="number" value={form.bathrooms ?? ''} onChange={e => upd('bathrooms', num(e.target.value))} /></div>
          <div><Label>Etage</Label><Input type="number" value={form.floor ?? ''} onChange={e => upd('floor', num(e.target.value))} /></div>
          <div><Label>Gesamt-Etagen</Label><Input type="number" value={form.total_floors ?? ''} onChange={e => upd('total_floors', num(e.target.value))} /></div>
          <div><Label>Baujahr</Label><Input type="number" value={form.year_built ?? ''} onChange={e => upd('year_built', num(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ausstattung & Energie</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Heizungsart</Label><Input value={form.heating_type || ''} onChange={e => upd('heating_type', e.target.value)} /></div>
            <div><Label>Energieklasse</Label><Input value={form.energy_class || ''} onChange={e => upd('energy_class', e.target.value)} placeholder="z.B. B" /></div>
            <div><Label>Energiewert (kWh/m²a)</Label><Input type="number" step="0.01" value={form.energy_value ?? ''} onChange={e => upd('energy_value', num(e.target.value))} /></div>
          </div>
          <div>
            <Label className="mb-2 block">Ausstattung</Label>
            <div className="flex flex-wrap gap-1.5">
              {[...FEATURE_OPTIONS, ...((form.features as string[] || []).filter(f => !FEATURE_OPTIONS.includes(f)))].map(f => {
                const active = (form.features || []).includes(f);
                return (
                  <Badge
                    key={f}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleFeature(f)}
                  >
                    {f}
                  </Badge>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <Input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="Eigenes Merkmal…" className="h-8 text-sm" />
              <Button size="sm" variant="outline" onClick={() => { if (newFeature.trim()) { toggleFeature(newFeature.trim()); setNewFeature(""); } }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Beschreibung</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Öffentliche Beschreibung</Label><Textarea rows={4} value={form.description || ''} onChange={e => upd('description', e.target.value)} /></div>
          <div><Label>Interne Notizen</Label><Textarea rows={3} value={form.internal_notes || ''} onChange={e => upd('internal_notes', e.target.value)} /></div>
        </CardContent>
      </Card>
    </div>
  );
};
