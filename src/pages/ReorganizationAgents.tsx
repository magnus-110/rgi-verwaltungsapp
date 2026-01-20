import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Settings, 
  FileText, 
  Users, 
  Calculator, 
  Receipt, 
  Wrench, 
  Shield,
  Home,
  ClipboardList,
  PiggyBank,
  Mail,
  Scale,
  Map,
  Zap,
  File,
  GripVertical,
  Pencil,
  Trash2,
  Copy,
  RotateCcw
} from "lucide-react";
import { AgentEditDialog } from "@/components/reorganization/AgentEditDialog";
import { PresetManagement } from "@/components/reorganization/PresetManagement";

// Icon mapping
const iconMap: Record<string, any> = {
  FileText, Users, Calculator, Receipt, Wrench, Shield, Home,
  ClipboardList, PiggyBank, Mail, Scale, Map, Zap, File
};

interface Agent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  search_keywords: string[];
  example_content: string | null;
  output_filename_pattern: string;
  is_active: boolean;
  sort_order: number;
  icon: string;
  color: string;
}

export function ReorganizationAgents() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [activeTab, setActiveTab] = useState("agents");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reorganization_agents")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error("Error loading agents:", error);
      toast({
        title: "Fehler",
        description: "Agenten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAgent = async (agent: Agent) => {
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from("reorganization_agents")
        .update({ is_active: !agent.is_active })
        .eq("id", agent.id);

      if (error) throw error;

      setAgents(prev => 
        prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a)
      );

      toast({
        title: agent.is_active ? "Agent deaktiviert" : "Agent aktiviert",
        description: `"${agent.name}" wurde ${agent.is_active ? "deaktiviert" : "aktiviert"}.`,
      });
    } catch (error) {
      console.error("Error toggling agent:", error);
      toast({
        title: "Fehler",
        description: "Status konnte nicht geändert werden",
        variant: "destructive",
      });
    }
  };

  const deleteAgent = async (agent: Agent) => {
    if (!isAdmin) return;
    if (!confirm(`Agent "${agent.name}" wirklich löschen?`)) return;

    try {
      const { error } = await supabase
        .from("reorganization_agents")
        .delete()
        .eq("id", agent.id);

      if (error) throw error;

      setAgents(prev => prev.filter(a => a.id !== agent.id));
      toast({
        title: "Agent gelöscht",
        description: `"${agent.name}" wurde entfernt.`,
      });
    } catch (error) {
      console.error("Error deleting agent:", error);
      toast({
        title: "Fehler",
        description: "Agent konnte nicht gelöscht werden",
        variant: "destructive",
      });
    }
  };

  const duplicateAgent = async (agent: Agent) => {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from("reorganization_agents")
        .insert({
          name: `${agent.name} (Kopie)`,
          description: agent.description,
          system_prompt: agent.system_prompt,
          search_keywords: agent.search_keywords,
          example_content: agent.example_content,
          output_filename_pattern: agent.output_filename_pattern,
          is_active: false,
          sort_order: agents.length,
          icon: agent.icon,
          color: agent.color,
        })
        .select()
        .single();

      if (error) throw error;

      setAgents(prev => [...prev, data]);
      toast({
        title: "Agent dupliziert",
        description: `Kopie von "${agent.name}" erstellt.`,
      });
    } catch (error) {
      console.error("Error duplicating agent:", error);
      toast({
        title: "Fehler",
        description: "Agent konnte nicht dupliziert werden",
        variant: "destructive",
      });
    }
  };

  const handleSaveAgent = async (agentData: Partial<Agent>) => {
    try {
      if (isCreateMode) {
        const { data, error } = await supabase
          .from("reorganization_agents")
          .insert([{
            name: agentData.name!,
            system_prompt: agentData.system_prompt!,
            description: agentData.description,
            search_keywords: agentData.search_keywords,
            example_content: agentData.example_content,
            output_filename_pattern: agentData.output_filename_pattern,
            icon: agentData.icon,
            color: agentData.color,
            is_active: agentData.is_active,
            sort_order: agents.length,
          }])
          .select()
          .single();

        if (error) throw error;
        setAgents(prev => [...prev, data]);
        toast({ title: "Agent erstellt", description: `"${agentData.name}" wurde hinzugefügt.` });
      } else if (editingAgent) {
        const { error } = await supabase
          .from("reorganization_agents")
          .update(agentData)
          .eq("id", editingAgent.id);

        if (error) throw error;
        setAgents(prev => prev.map(a => a.id === editingAgent.id ? { ...a, ...agentData } : a));
        toast({ title: "Agent aktualisiert", description: `"${agentData.name}" wurde gespeichert.` });
      }
    } catch (error) {
      console.error("Error saving agent:", error);
      toast({
        title: "Fehler",
        description: "Agent konnte nicht gespeichert werden",
        variant: "destructive",
      });
    }

    setEditingAgent(null);
    setIsCreateMode(false);
  };

  const resetToDefaults = async () => {
    if (!isAdmin) return;
    if (!confirm("Alle Agenten auf Standardwerte zurücksetzen? Eigene Anpassungen gehen verloren!")) return;

    toast({
      title: "Wird zurückgesetzt...",
      description: "Dies kann einen Moment dauern.",
    });

    // This would require a migration or edge function to reset
    // For now, just reload
    await loadAgents();
  };

  const getIconComponent = (iconName: string) => {
    const IconComponent = iconMap[iconName] || FileText;
    return IconComponent;
  };

  const activeCount = agents.filter(a => a.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Lade Agenten...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reorganisations-Agenten</h1>
          <p className="text-muted-foreground">
            Konfigurieren Sie spezialisierte KI-Agenten zur automatischen PDF-Kategorisierung
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-8 px-3">
            {activeCount} von {agents.length} aktiv
          </Badge>
          {isAdmin && (
            <Button onClick={() => { setIsCreateMode(true); setEditingAgent({} as Agent); }}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Agent
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="agents">Agenten ({agents.length})</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Spezialisierte Agenten</CardTitle>
                  <CardDescription>
                    Jeder Agent ist auf eine bestimmte Dokumentenkategorie trainiert
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={resetToDefaults}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Zurücksetzen
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {agents.map((agent) => {
                    const IconComponent = getIconComponent(agent.icon);
                    return (
                      <div
                        key={agent.id}
                        className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                          agent.is_active 
                            ? "bg-card border-border" 
                            : "bg-muted/30 border-muted opacity-60"
                        }`}
                      >
                        <div className="cursor-move text-muted-foreground hover:text-foreground">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: agent.color + "20", color: agent.color }}
                        >
                          <IconComponent className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{agent.name}</span>
                            {!agent.is_active && (
                              <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {agent.description || agent.search_keywords.slice(0, 3).join(", ")}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="hidden md:flex">
                            {agent.search_keywords.length} Keywords
                          </Badge>
                          
                          {isAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => duplicateAgent(agent)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setEditingAgent(agent); setIsCreateMode(false); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteAgent(agent)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={agent.is_active}
                                onCheckedChange={() => toggleAgent(agent)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presets" className="mt-4">
          <PresetManagement agents={agents} />
        </TabsContent>
      </Tabs>

      <AgentEditDialog
        open={!!editingAgent}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAgent(null);
            setIsCreateMode(false);
          }
        }}
        agent={isCreateMode ? null : editingAgent}
        onSave={handleSaveAgent}
      />
    </div>
  );
}
