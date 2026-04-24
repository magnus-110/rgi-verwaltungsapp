import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Play, ChevronRight, ListChecks, X, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const contactName = (c: { short_name?: string | null; first_name?: string | null; last_name?: string | null; company_name?: string | null } | null | undefined): string => {
  if (!c) return "";
  return c.short_name || c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "";
};

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
}
interface TemplateStep {
  id: string;
  template_id: string;
  position: number;
  title: string;
  description: string | null;
  suggested_offset_days: number | null;
}
interface Instance {
  id: string;
  template_id: string | null;
  title: string;
  status: string;
  building_id: string | null;
  contact_id: string | null;
  started_at: string;
  completed_at: string | null;
  buildings?: { name: string } | null;
  contacts?: { short_name: string | null; first_name: string | null; last_name: string | null; company_name: string | null } | null;
  process_instance_steps?: { id: string; is_completed: boolean }[];
}
interface InstanceStep {
  id: string;
  instance_id: string;
  position: number;
  title: string;
  description: string | null;
  notes: string | null;
  is_completed: boolean;
  due_date: string | null;
}

export function Processes() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [tab, setTab] = useState("active");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Prozesse</h1>
        <p className="text-muted-foreground">Standardprozesse anlegen, starten und verfolgen</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Laufende Prozesse</TabsTrigger>
          <TabsTrigger value="completed">Abgeschlossen</TabsTrigger>
          {isAdmin && <TabsTrigger value="templates">Vorlagen</TabsTrigger>}
        </TabsList>

        <TabsContent value="active" className="mt-6">
          <InstancesList showCompleted={false} />
        </TabsContent>
        <TabsContent value="completed" className="mt-6">
          <InstancesList showCompleted={true} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="templates" className="mt-6">
            <TemplatesManager />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// =================== Templates ===================
function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("process_templates").select("*").order("name");
    if (error) toast.error(error.message);
    else setTemplates(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Vorlage wirklich löschen? Alle Schritte werden mitgelöscht.")) return;
    const { error } = await supabase.from("process_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Vorlage gelöscht"); load(); }
  };

  if (loading) return <div className="text-muted-foreground">Lädt…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Prozessvorlagen</h2>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Neue Vorlage</Button>
      </div>
      <div className="grid gap-3">
        {templates.map(t => (
          <Card key={t.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />{t.name}
                  {!t.is_active && <Badge variant="secondary">inaktiv</Badge>}
                </div>
                {t.category && <div className="text-xs text-muted-foreground">{t.category}</div>}
                {t.description && <div className="text-sm text-muted-foreground mt-1">{t.description}</div>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                  <Pencil className="h-4 w-4 mr-1" />Bearbeiten
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <div className="text-center text-muted-foreground py-12">Noch keine Vorlagen vorhanden.</div>
        )}
      </div>

      {(editing || creating) && (
        <TemplateEditor
          template={editing}
          onClose={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [category, setCategory] = useState(template?.category || "");
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(template?.id || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (templateId) {
      supabase.from("process_template_steps")
        .select("*").eq("template_id", templateId).order("position")
        .then(({ data }) => setSteps(data || []));
    }
  }, [templateId]);

  const handleSaveTemplate = async () => {
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    setSaving(true);
    if (templateId) {
      const { error } = await supabase.from("process_templates")
        .update({ name, description, category, is_active: isActive }).eq("id", templateId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("process_templates")
        .insert({ name, description, category, is_active: isActive }).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      setTemplateId(data.id);
    }
    toast.success("Gespeichert");
    setSaving(false);
  };

  const addStep = async () => {
    if (!templateId) { toast.error("Vorlage zuerst speichern"); return; }
    const position = steps.length;
    const { data, error } = await supabase.from("process_template_steps")
      .insert({ template_id: templateId, position, title: "Neuer Schritt" }).select().single();
    if (error) { toast.error(error.message); return; }
    setSteps([...steps, data]);
  };

  const updateStep = async (id: string, patch: Partial<TemplateStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...patch } : s));
    await supabase.from("process_template_steps").update(patch).eq("id", id);
  };

  const deleteStep = async (id: string) => {
    if (!confirm("Schritt löschen?")) return;
    const { error } = await supabase.from("process_template_steps").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSteps(steps.filter(s => s.id !== id));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <Input value={category} onChange={e => setCategory(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox checked={isActive} onCheckedChange={v => setIsActive(!!v)} id="active" />
              <label htmlFor="active" className="text-sm">Aktiv</label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Beschreibung</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <Button onClick={handleSaveTemplate} disabled={saving}>
            {templateId ? "Änderungen speichern" : "Vorlage anlegen"}
          </Button>

          {templateId && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Schritte ({steps.length})</h3>
                <Button size="sm" onClick={addStep}><Plus className="h-4 w-4 mr-1" />Schritt</Button>
              </div>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-2" />
                        <span className="text-sm font-mono text-muted-foreground mt-2">{i + 1}.</span>
                        <Input
                          value={s.title}
                          onChange={e => setSteps(steps.map(x => x.id === s.id ? { ...x, title: e.target.value } : x))}
                          onBlur={e => updateStep(s.id, { title: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Tage"
                          value={s.suggested_offset_days ?? ""}
                          onChange={e => setSteps(steps.map(x => x.id === s.id ? { ...x, suggested_offset_days: e.target.value ? parseInt(e.target.value) : null } : x))}
                          onBlur={e => updateStep(s.id, { suggested_offset_days: e.target.value ? parseInt(e.target.value) : null })}
                          className="w-20"
                        />
                        <Button variant="ghost" size="sm" onClick={() => deleteStep(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Beschreibung (optional)"
                        value={s.description || ""}
                        onChange={e => setSteps(steps.map(x => x.id === s.id ? { ...x, description: e.target.value } : x))}
                        onBlur={e => updateStep(s.id, { description: e.target.value })}
                        className="text-sm min-h-[60px]"
                      />
                    </CardContent>
                  </Card>
                ))}
                {steps.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Schritte.</div>}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Instances ===================
function InstancesList({ showCompleted }: { showCompleted: boolean }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [openInstance, setOpenInstance] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("process_instances")
      .select("*, buildings(name), contacts(short_name,first_name,last_name,company_name), process_instance_steps(id,is_completed)")
      .in("status", showCompleted ? ["completed", "cancelled"] : ["in_progress", "on_hold"])
      .order("started_at", { ascending: false });
    if (error) toast.error(error.message);
    else setInstances((data as any) || []);
    setLoading(false);
  }, [showCompleted]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-muted-foreground">Lädt…</div>;

  return (
    <div className="space-y-4">
      {!showCompleted && (
        <div className="flex justify-end">
          <Button onClick={() => setStarting(true)}><Play className="h-4 w-4 mr-2" />Prozess starten</Button>
        </div>
      )}
      <div className="grid gap-3">
        {instances.map(inst => {
          const total = inst.process_instance_steps?.length || 0;
          const done = inst.process_instance_steps?.filter(s => s.is_completed).length || 0;
          return (
            <Card key={inst.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenInstance(inst.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{inst.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {inst.buildings?.name && <>🏢 {inst.buildings.name} · </>}
                    {contactName(inst.contacts) && <>👤 {contactName(inst.contacts)} · </>}
                    Gestartet {format(new Date(inst.started_at), "dd.MM.yyyy", { locale: de })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={inst.status === "completed" ? "default" : "secondary"}>
                    {done}/{total}
                  </Badge>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {instances.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            {showCompleted ? "Keine abgeschlossenen Prozesse." : "Keine laufenden Prozesse. Starten Sie einen neuen!"}
          </div>
        )}
      </div>

      {starting && <StartProcessDialog onClose={() => { setStarting(false); load(); }} />}
      {openInstance && <InstanceDetail id={openInstance} onClose={() => { setOpenInstance(null); load(); }} />}
    </div>
  );
}

function StartProcessDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [buildingId, setBuildingId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("process_templates").select("*").eq("is_active", true).order("name")
      .then(({ data }) => setTemplates(data || []));
    supabase.from("buildings").select("id,name").order("name")
      .then(({ data }) => setBuildings(data || []));
    supabase.from("contacts").select("id,name").order("name")
      .then(({ data }) => setContacts((data as any) || []));
  }, []);

  useEffect(() => {
    const tpl = templates.find(t => t.id === templateId);
    if (tpl && !title) setTitle(tpl.name);
  }, [templateId, templates, title]);

  const handleStart = async () => {
    if (!templateId) { toast.error("Vorlage wählen"); return; }
    if (!title.trim()) { toast.error("Titel erforderlich"); return; }
    setSaving(true);

    const { data: tplSteps } = await supabase
      .from("process_template_steps")
      .select("*").eq("template_id", templateId).order("position");

    const { data: instance, error: instErr } = await supabase
      .from("process_instances")
      .insert({
        template_id: templateId,
        title,
        building_id: buildingId || null,
        contact_id: contactId || null,
        owner_user_id: user?.id,
        created_by: user?.id!,
      })
      .select().single();

    if (instErr) { toast.error(instErr.message); setSaving(false); return; }

    if (tplSteps && tplSteps.length > 0) {
      const startDate = new Date();
      const stepsToInsert = tplSteps.map(s => ({
        instance_id: instance.id,
        template_step_id: s.id,
        position: s.position,
        title: s.title,
        description: s.description,
        due_date: s.suggested_offset_days != null
          ? new Date(startDate.getTime() + s.suggested_offset_days * 86400000).toISOString().split("T")[0]
          : null,
      }));
      await supabase.from("process_instance_steps").insert(stepsToInsert);
    }

    toast.success("Prozess gestartet");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prozess starten</DialogTitle>
          <DialogDescription>Wähle eine Vorlage und ordne Gebäude/Kontakt zu (optional).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Vorlage</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Vorlage wählen" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Titel</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Gebäude (optional)</label>
            <Select value={buildingId || "__none__"} onValueChange={v => setBuildingId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Kein Gebäude" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Kein Gebäude —</SelectItem>
                {buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Kontakt (optional)</label>
            <Select value={contactId || "__none__"} onValueChange={v => setContactId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Kein Kontakt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Kein Kontakt —</SelectItem>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleStart} disabled={saving}>Starten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstanceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [instance, setInstance] = useState<Instance | null>(null);
  const [steps, setSteps] = useState<InstanceStep[]>([]);

  const load = useCallback(async () => {
    const { data: inst } = await supabase
      .from("process_instances")
      .select("*, buildings(name), contacts(name)")
      .eq("id", id).single();
    setInstance(inst as any);
    const { data: stepsData } = await supabase
      .from("process_instance_steps")
      .select("*").eq("instance_id", id).order("position");
    setSteps(stepsData || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleStep = async (step: InstanceStep) => {
    const newCompleted = !step.is_completed;
    setSteps(steps.map(s => s.id === step.id ? { ...s, is_completed: newCompleted } : s));
    await supabase.from("process_instance_steps").update({
      is_completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
      completed_by: newCompleted ? user?.id : null,
    }).eq("id", step.id);
  };

  const updateNotes = async (id: string, notes: string) => {
    await supabase.from("process_instance_steps").update({ notes }).eq("id", id);
  };

  const handleComplete = async () => {
    await supabase.from("process_instances").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", id);
    toast.success("Prozess abgeschlossen");
    onClose();
  };

  const handleReopen = async () => {
    await supabase.from("process_instances").update({
      status: "in_progress", completed_at: null,
    }).eq("id", id);
    toast.success("Prozess wieder geöffnet");
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm("Prozess wirklich löschen?")) return;
    const { error } = await supabase.from("process_instances").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Gelöscht");
    onClose();
  };

  if (!instance) return null;
  const done = steps.filter(s => s.is_completed).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{instance.title}</DialogTitle>
          <DialogDescription>
            {instance.buildings?.name && <>🏢 {instance.buildings.name} · </>}
            {instance.contacts?.name && <>👤 {instance.contacts.name} · </>}
            {done}/{steps.length} erledigt
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {steps.map((s, i) => (
            <Card key={s.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={s.is_completed}
                    onCheckedChange={() => toggleStep(s)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className={`font-medium ${s.is_completed ? "line-through text-muted-foreground" : ""}`}>
                      {i + 1}. {s.title}
                    </div>
                    {s.description && <div className="text-sm text-muted-foreground">{s.description}</div>}
                    {s.due_date && (
                      <div className="text-xs text-muted-foreground">
                        Fällig: {format(new Date(s.due_date), "dd.MM.yyyy", { locale: de })}
                      </div>
                    )}
                    <Textarea
                      placeholder="Notiz hinzufügen…"
                      defaultValue={s.notes || ""}
                      onBlur={e => updateNotes(s.id, e.target.value)}
                      className="text-sm min-h-[50px] mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {instance.status === "in_progress" ? (
            <Button onClick={handleComplete}>Prozess abschließen</Button>
          ) : (
            <Button variant="outline" onClick={handleReopen}>Wieder öffnen</Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />Löschen
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
