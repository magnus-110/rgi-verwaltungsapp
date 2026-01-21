import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Star, Copy } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  is_active: boolean;
  icon: string;
  color: string;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  agent_ids: string[];
  is_template: boolean;
  is_default: boolean;
  management_mode: string;
}

interface PresetManagementProps {
  agents: Agent[];
}

export function PresetManagement({ agents }: PresetManagementProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_presets")
        .select("*")
        .order("name");

      if (error) throw error;
      setPresets(data || []);
    } catch (error) {
      console.error("Error loading presets:", error);
    } finally {
      setLoading(false);
    }
  };

  const deletePreset = async (preset: Preset) => {
    if (!isAdmin) return;
    if (preset.is_template) {
      toast({
        title: "Nicht erlaubt",
        description: "System-Presets können nicht gelöscht werden.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Preset "${preset.name}" wirklich löschen?`)) return;

    try {
      const { error } = await supabase
        .from("agent_presets")
        .delete()
        .eq("id", preset.id);

      if (error) throw error;
      setPresets(prev => prev.filter(p => p.id !== preset.id));
      toast({ title: "Preset gelöscht" });
    } catch (error) {
      console.error("Error deleting preset:", error);
      toast({
        title: "Fehler",
        description: "Preset konnte nicht gelöscht werden",
        variant: "destructive",
      });
    }
  };

  const setAsDefault = async (preset: Preset) => {
    if (!isAdmin) return;

    try {
      // First, unset all defaults for this management mode
      await supabase
        .from("agent_presets")
        .update({ is_default: false })
        .eq("management_mode", preset.management_mode as "weg" | "rent");

      // Then set this one as default
      const { error } = await supabase
        .from("agent_presets")
        .update({ is_default: true })
        .eq("id", preset.id);

      if (error) throw error;

      setPresets(prev => prev.map(p => ({
        ...p,
        is_default: p.id === preset.id && p.management_mode === preset.management_mode
      })));

      toast({
        title: "Standard gesetzt",
        description: `"${preset.name}" ist jetzt der Standard für ${preset.management_mode === 'weg' ? 'WEG' : 'Miete'}.`,
      });
    } catch (error) {
      console.error("Error setting default:", error);
    }
  };

  const duplicatePreset = async (preset: Preset) => {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from("agent_presets")
        .insert([{
          name: `${preset.name} (Kopie)`,
          description: preset.description,
          agent_ids: preset.agent_ids,
          is_template: false,
          is_default: false,
          management_mode: preset.management_mode as "weg" | "rent",
        }])
        .select()
        .single();

      if (error) throw error;
      setPresets(prev => [...prev, data]);
      toast({ title: "Preset dupliziert" });
    } catch (error) {
      console.error("Error duplicating preset:", error);
    }
  };

  const getAgentNamesForPreset = (preset: Preset) => {
    return agents
      .filter(a => preset.agent_ids.includes(a.id))
      .map(a => a.name);
  };

  if (loading) {
    return <div className="text-muted-foreground">Lade Presets...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Agent-Presets</h3>
          <p className="text-sm text-muted-foreground">
            Vordefinierte Kombinationen von Agenten für verschiedene Anwendungsfälle
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setIsCreateMode(true); setEditingPreset({} as Preset); }}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Preset
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {presets.map(preset => (
          <Card key={preset.id} className={preset.is_default ? "border-primary" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{preset.name}</CardTitle>
                    {preset.is_default && (
                      <Badge variant="default" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Standard
                      </Badge>
                    )}
                    {preset.is_template && (
                      <Badge variant="secondary" className="text-xs">System</Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {preset.description || `${preset.agent_ids.length} Agenten`}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {preset.management_mode === 'weg' ? 'WEG' : 'Miete'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 mb-4">
                {getAgentNamesForPreset(preset).slice(0, 5).map(name => (
                  <Badge key={name} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
                {preset.agent_ids.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{preset.agent_ids.length - 5} weitere
                  </Badge>
                )}
              </div>

              {isAdmin && (
                <div className="flex gap-2">
                  {!preset.is_default && (
                    <Button variant="outline" size="sm" onClick={() => setAsDefault(preset)}>
                      <Star className="h-3 w-3 mr-1" />
                      Standard
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => duplicatePreset(preset)}>
                    <Copy className="h-3 w-3 mr-1" />
                    Kopieren
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { setEditingPreset(preset); setIsCreateMode(false); }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Bearbeiten
                  </Button>
                  {!preset.is_template && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => deletePreset(preset)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <PresetEditDialog
        open={!!editingPreset}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPreset(null);
            setIsCreateMode(false);
          }
        }}
        preset={isCreateMode ? null : editingPreset}
        agents={agents}
        onSave={async (data) => {
          try {
            const insertData = {
              name: data.name!,
              description: data.description,
              agent_ids: data.agent_ids,
              management_mode: data.management_mode as "weg" | "rent",
              is_template: false,
              is_default: false,
            };
            
            if (isCreateMode) {
              const { data: newPreset, error } = await supabase
                .from("agent_presets")
                .insert([insertData])
                .select()
                .single();
              if (error) throw error;
              setPresets(prev => [...prev, newPreset]);
              toast({ title: "Preset erstellt" });
            } else if (editingPreset) {
              const updateData = {
                name: data.name,
                description: data.description,
                agent_ids: data.agent_ids,
                management_mode: data.management_mode as "weg" | "rent",
              };
              const { error } = await supabase
                .from("agent_presets")
                .update(updateData)
                .eq("id", editingPreset.id);
              if (error) throw error;
              setPresets(prev => prev.map(p => p.id === editingPreset.id ? { ...p, ...updateData } : p));
              toast({ title: "Preset aktualisiert" });
            }
          } catch (error) {
            console.error("Error saving preset:", error);
            toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
          }
          setEditingPreset(null);
          setIsCreateMode(false);
        }}
      />
    </div>
  );
}

// Preset Edit Dialog Component
function PresetEditDialog({ 
  open, 
  onOpenChange, 
  preset, 
  agents, 
  onSave 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  preset: Preset | null; 
  agents: Agent[];
  onSave: (data: Partial<Preset>) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    agent_ids: [] as string[],
    management_mode: "weg",
  });

  useEffect(() => {
    if (preset?.id) {
      setFormData({
        name: preset.name || "",
        description: preset.description || "",
        agent_ids: preset.agent_ids || [],
        management_mode: preset.management_mode || "weg",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        agent_ids: [],
        management_mode: "weg",
      });
    }
  }, [preset]);

  const toggleAgent = (agentId: string) => {
    setFormData(prev => ({
      ...prev,
      agent_ids: prev.agent_ids.includes(agentId)
        ? prev.agent_ids.filter(id => id !== agentId)
        : [...prev.agent_ids, agentId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{preset?.id ? "Preset bearbeiten" : "Neues Preset"}</DialogTitle>
          <DialogDescription>
            Wählen Sie die Agenten aus, die in diesem Preset enthalten sein sollen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="z.B. WEG-Stammakte Komplett"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-desc">Beschreibung</Label>
            <Input
              id="preset-desc"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Kurze Beschreibung..."
            />
          </div>

          <div className="space-y-2">
            <Label>Agenten auswählen ({formData.agent_ids.length} ausgewählt)</Label>
            <ScrollArea className="h-[200px] border rounded-md p-3">
              <div className="space-y-2">
                {agents.map(agent => (
                  <div 
                    key={agent.id} 
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <Checkbox
                      checked={formData.agent_ids.includes(agent.id)}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <div 
                      className="w-6 h-6 rounded flex items-center justify-center text-xs"
                      style={{ backgroundColor: agent.color + "20", color: agent.color }}
                    >
                      {agent.name.slice(0, 2)}
                    </div>
                    <span className="text-sm">{agent.name}</span>
                    {!agent.is_active && (
                      <Badge variant="secondary" className="text-xs ml-auto">Inaktiv</Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave(formData)} disabled={!formData.name.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
