import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Eye, Mail, MessageSquare, FileText, ArrowRight, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";

const STATUS_OPTIONS = ['neu','kontaktiert','besichtigung','angebot','abschluss','absage'] as const;
const STATUS_LABELS: Record<string, string> = {
  neu: 'Neu', kontaktiert: 'Kontaktiert', besichtigung: 'Besichtigung',
  angebot: 'Angebot', abschluss: 'Abschluss', absage: 'Absage',
};
const STATUS_COLORS: Record<string, string> = {
  neu: 'bg-blue-100 text-blue-800',
  kontaktiert: 'bg-purple-100 text-purple-800',
  besichtigung: 'bg-amber-100 text-amber-800',
  angebot: 'bg-orange-100 text-orange-800',
  abschluss: 'bg-green-100 text-green-800',
  absage: 'bg-red-100 text-red-800',
};

const EVENT_ICONS: Record<string, any> = {
  call: Phone, viewing: Eye, email: Mail, note: MessageSquare,
  offer: FileText, document_sent: FileText, status_change: ArrowRight,
};
const EVENT_LABELS: Record<string, string> = {
  call: 'Anruf', viewing: 'Besichtigung', email: 'Email', note: 'Notiz',
  offer: 'Angebot', document_sent: 'Dokument gesendet', status_change: 'Status geändert',
};

export const BrokerLeadsTab = ({ propertyId }: { propertyId: string }) => {
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const { data: leads = [] } = useQuery({
    queryKey: ['broker-leads', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('broker_leads' as any)
        .select('*').eq('property_id', propertyId).order('created_at', { ascending: false });
      return data || [];
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      <div className="space-y-2">
        <Button size="sm" className="w-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Interessent</Button>
        <div className="space-y-1">
          {leads.map((l: any) => (
            <button
              key={l.id}
              onClick={() => setSelectedLead(l.id)}
              className={cn(
                "w-full text-left p-2.5 rounded-md border transition-colors",
                selectedLead === l.id ? "bg-primary/10 border-primary/20" : "hover:bg-muted/50 border-transparent"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{l.external_name || 'Unbenannt'}</p>
                <Badge className={cn("text-[10px]", STATUS_COLORS[l.status])} variant="secondary">{STATUS_LABELS[l.status]}</Badge>
              </div>
              {l.external_email && <p className="text-xs text-muted-foreground truncate">{l.external_email}</p>}
            </button>
          ))}
          {leads.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Keine Interessenten</p>}
        </div>
      </div>

      <div>
        {selectedLead ? (
          <LeadDetail leadId={selectedLead} propertyId={propertyId} onDeleted={() => { setSelectedLead(null); qc.invalidateQueries({ queryKey: ['broker-leads', propertyId] }); }} />
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Wählen Sie einen Interessenten aus.</CardContent></Card>
        )}
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        propertyId={propertyId}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ['broker-leads', propertyId] });
          setSelectedLead(id);
        }}
      />
    </div>
  );
};

const CreateLeadDialog = ({ open, onOpenChange, propertyId, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; propertyId: string; onCreated: (id: string) => void;
}) => {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const qc = useQueryClient();

  const { data: contacts = [] } = useQuery({
    queryKey: ['broker-contacts-picker'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts')
        .select('id, short_name, company_name, first_name, last_name')
        .order('short_name', { nullsFirst: false });
      return (data || []).map((c: any) => ({
        id: c.id,
        label: c.short_name || c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '(ohne Namen)',
      }));
    },
  });

  const pickContact = async (id: string) => {
    setContactId(id);
    const picked = contacts.find((c: any) => c.id === id);
    if (picked?.label) setName(picked.label);
    const { data: persons } = await supabase.from('contact_persons').select('id').eq('contact_id', id).limit(1);
    const personIds: string[] = (persons || []).map((p: any) => p.id);
    if (personIds.length) {
      const [{ data: em }, { data: ph }] = await Promise.all([
        (supabase.from('contact_emails') as any).select('email').in('person_id', personIds).limit(1),
        (supabase.from('contact_phones') as any).select('phone_number').in('person_id', personIds).limit(1),
      ]);
      if (em?.[0]?.email) setEmail(em[0].email);
      if (ph?.[0]?.phone_number) setPhone(ph[0].phone_number);
    }
  };

  const submit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('broker_leads' as any).insert({
      property_id: propertyId,
      contact_id: contactId,
      external_name: name.trim() || null,
      external_email: email.trim() || null,
      external_phone: phone.trim() || null,
      created_by: user?.id,
    } as any).select('id').single();
    if (error) { toast.error(error.message); return; }
    setName(""); setEmail(""); setPhone(""); setContactId(null);
    onOpenChange(false);
    onCreated((data as any).id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Neuer Interessent</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Bestehender Kontakt</Label>
              <div className="flex gap-2">
                <ContactPicker
                  value={contactId}
                  options={contacts}
                  onChange={(id) => id ? pickContact(id) : setContactId(null)}
                  placeholder="Kontakt auswählen…"
                  noneLabel="— Neu / Ad-hoc —"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setContactDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />Neu
                </Button>
              </div>
            </div>
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><Label>Telefon</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={submit}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateContactDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onCreated={async () => {
          await qc.invalidateQueries({ queryKey: ['broker-contacts-picker'] });
          const { data } = await supabase.from('contacts')
            .select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (data?.id) await pickContact(data.id);
        }}
      />
    </>
  );
};

const LeadDetail = ({ leadId, propertyId, onDeleted }: { leadId: string; propertyId: string; onDeleted: () => void }) => {
  const qc = useQueryClient();
  const [eventType, setEventType] = useState<string>('call');
  const [evtTitle, setEvtTitle] = useState(""); const [evtBody, setEvtBody] = useState("");

  const { data: lead } = useQuery({
    queryKey: ['broker-lead', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('broker_leads' as any).select('*').eq('id', leadId).single();
      return data as any;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ['broker-lead-events', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('broker_lead_events' as any)
        .select('*').eq('lead_id', leadId).order('occurred_at', { ascending: false });
      return data || [];
    },
  });

  const updateField = async (field: string, value: any) => {
    await supabase.from('broker_leads' as any).update({ [field]: value }).eq('id', leadId);
    qc.invalidateQueries({ queryKey: ['broker-lead', leadId] });
    qc.invalidateQueries({ queryKey: ['broker-leads', propertyId] });
    if (field === 'status') {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('broker_lead_events' as any).insert({
        lead_id: leadId, event_type: 'status_change',
        title: `Status: ${STATUS_LABELS[value]}`, created_by: user?.id,
      } as any);
      qc.invalidateQueries({ queryKey: ['broker-lead-events', leadId] });
    }
  };

  const addEvent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('broker_lead_events' as any).insert({
      lead_id: leadId, event_type: eventType,
      title: evtTitle.trim() || EVENT_LABELS[eventType],
      body: evtBody.trim() || null,
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    setEvtTitle(""); setEvtBody("");
    qc.invalidateQueries({ queryKey: ['broker-lead-events', leadId] });
  };

  const deleteLead = async () => {
    if (!confirm("Interessent wirklich löschen?")) return;
    await supabase.from('broker_leads' as any).delete().eq('id', leadId);
    onDeleted();
  };

  if (!lead) return null;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            {lead.external_name || 'Unbenannt'}
          </CardTitle>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={deleteLead}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><Label>Status</Label>
            <Select value={lead.status} onValueChange={v => updateField('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Bewertung (0–5)</Label>
            <Input type="number" min={0} max={5} value={lead.rating ?? ''} onChange={e => updateField('rating', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div><Label>Email</Label><Input value={lead.external_email || ''} onBlur={e => updateField('external_email', e.target.value || null)} onChange={e => updateField('external_email', e.target.value || null)} /></div>
          <div><Label>Telefon</Label><Input value={lead.external_phone || ''} onChange={e => updateField('external_phone', e.target.value || null)} /></div>
          <div className="col-span-2"><Label>Notizen</Label><Textarea rows={2} value={lead.notes || ''} onChange={e => updateField('notes', e.target.value || null)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Verlauf-Eintrag hinzufügen</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(EVENT_LABELS).filter(([k]) => k !== 'status_change' && k !== 'email').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Titel (optional)" value={evtTitle} onChange={e => setEvtTitle(e.target.value)} />
          </div>
          <Textarea rows={2} placeholder="Details…" value={evtBody} onChange={e => setEvtBody(e.target.value)} />
          <div className="flex justify-end"><Button size="sm" onClick={addEvent}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Verlauf</CardTitle></CardHeader>
        <CardContent>
          {events.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Noch keine Einträge</p>}
          <div className="space-y-3">
            {events.map((e: any) => {
              const Icon = EVENT_ICONS[e.event_type] || MessageSquare;
              return (
                <div key={e.id} className="flex gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-md h-fit"><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0 border-l-2 border-muted pl-3 pb-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{e.title || EVENT_LABELS[e.event_type]}</p>
                      <p className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(e.occurred_at).toLocaleString('de-DE')}</p>
                    </div>
                    {e.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-0.5">{e.body}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
