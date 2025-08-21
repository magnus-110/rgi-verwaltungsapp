import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Bot, Settings, Plus, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface KnowledgeItem {
  title: string;
  content: string;
}

export const ChatbotSettings = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState({
    model: "gpt-4o-mini",
    temperature: [0.7],
    max_tokens: [500],
    system_prompt: "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung.",
    knowledge_items: [] as KnowledgeItem[]
  });
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<KnowledgeItem>({ title: "", content: "" });

  useEffect(() => {
    fetchChatbotSettings();
  }, []);

  const fetchChatbotSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("chatbot_settings")
        .select("*")
        .eq("management_mode", "weg")
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        let knowledgeItems = [];
        if (data.knowledge_items && Array.isArray(data.knowledge_items)) {
          knowledgeItems = data.knowledge_items;
        } else if (data.knowledge_base) {
          // Fallback: migrate old knowledge_base to new format
          knowledgeItems = [{ title: "Allgemein", content: data.knowledge_base }];
        }

        setSettings({
          model: data.model || "gpt-4o-mini",
          temperature: [data.temperature || 0.7],
          max_tokens: [data.max_tokens || 500],
          system_prompt: data.system_prompt || "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung.",
          knowledge_items: knowledgeItems
        });
      }
    } catch (error) {
      console.error("Error fetching chatbot settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Zugriff verweigert</h1>
          <p className="text-muted-foreground">Nur Administratoren können Chatbot-Einstellungen verwalten.</p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      const settingsData = {
        model: settings.model,
        temperature: settings.temperature[0],
        max_tokens: settings.max_tokens[0],
        system_prompt: settings.system_prompt,
        knowledge_items: settings.knowledge_items as any,
        knowledge_base: settings.knowledge_items.map(item => `${item.title}: ${item.content}`).join('\n\n')
      };

      // Save identical settings for both management modes
      const { error } = await supabase
        .from("chatbot_settings")
        .upsert([
          { ...settingsData, management_mode: "weg" as const },
          { ...settingsData, management_mode: "rent" as const }
        ], {
          onConflict: "management_mode"
        });

      if (error) throw error;

      toast({
        title: "Einstellungen gespeichert",
        description: "Die Chatbot-Einstellungen wurden für beide Verwaltungsmodi aktualisiert.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern der Einstellungen ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleAddItem = () => {
    if (newItem.title.trim() && newItem.content.trim()) {
      setSettings({
        ...settings,
        knowledge_items: [...settings.knowledge_items, { ...newItem }]
      });
      setNewItem({ title: "", content: "" });
    }
  };

  const handleEditItem = (index: number, item: KnowledgeItem) => {
    const newItems = [...settings.knowledge_items];
    newItems[index] = item;
    setSettings({ ...settings, knowledge_items: newItems });
    setEditingItem(null);
  };

  const handleDeleteItem = (index: number) => {
    const newItems = settings.knowledge_items.filter((_, i) => i !== index);
    setSettings({ ...settings, knowledge_items: newItems });
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="w-8 h-8" />
        <h1 className="text-3xl font-bold">Chatbot-Einstellungen</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              KI-Konfiguration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="model">KI-Modell</Label>
              <Select value={settings.model} onValueChange={(value) => setSettings({ ...settings, model: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Empfohlen)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} className="w-full">
              Einstellungen speichern
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Prompt & Wissensbasis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="system-prompt">System Prompt</Label>
              <Textarea
                id="system-prompt"
                value={settings.system_prompt}
                onChange={(e) => setSettings({ ...settings, system_prompt: e.target.value })}
                placeholder="Definieren Sie hier das Verhalten des Chatbots..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Beschreibt die Rolle und das Verhalten des Chatbots.
              </p>
            </div>

            <div>
              <Label>Wissensbasis-Themen</Label>
              <div className="space-y-3">
                {settings.knowledge_items.map((item, index) => (
                  <Card key={index} className="p-3">
                    {editingItem === index ? (
                      <div className="space-y-2">
                        <Input
                          value={item.title}
                          onChange={(e) => handleEditItem(index, { ...item, title: e.target.value })}
                          placeholder="Thema-Titel"
                        />
                        <Textarea
                          value={item.content}
                          onChange={(e) => handleEditItem(index, { ...item, content: e.target.value })}
                          placeholder="Inhalt..."
                          rows={4}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setEditingItem(null)}>
                            Speichern
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium cursor-pointer flex items-center gap-2" onClick={() => toggleExpanded(index)}>
                            {item.title}
                            {expandedItems.has(index) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </h4>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditingItem(index)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(index)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        {expandedItems.has(index) && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            {item.content}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
                
                <Card className="p-3 border-dashed">
                  <div className="space-y-2">
                    <Input
                      value={newItem.title}
                      onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                      placeholder="Neues Thema..."
                    />
                    <Textarea
                      value={newItem.content}
                      onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
                      placeholder="Inhalt..."
                      rows={3}
                    />
                    <Button size="sm" onClick={handleAddItem} className="flex items-center gap-2">
                      <Plus className="w-3 h-3" />
                      Thema hinzufügen
                    </Button>
                  </div>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Organisieren Sie Ihr Wissen in thematische Bereiche. Klicken Sie auf einen Titel, um den Inhalt zu sehen.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Erweiterte Einstellungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Temperatur: {settings.temperature[0]}</Label>
              <Slider
                value={settings.temperature}
                onValueChange={(value) => setSettings({ ...settings, temperature: value })}
                max={1}
                min={0}
                step={0.1}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Steuert die Kreativität der Antworten (0 = fokussiert, 1 = kreativ)
              </p>
            </div>

            <div>
              <Label>Max. Tokens: {settings.max_tokens[0]}</Label>
              <Slider
                value={settings.max_tokens}
                onValueChange={(value) => setSettings({ ...settings, max_tokens: value })}
                max={2000}
                min={100}
                step={50}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Begrenzt die Länge der Antworten
              </p>
            </div>
          </CardContent>
        </Card>
      </div>


      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Bot className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 mb-1">Wichtige Hinweise</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• Einstellungen gelten für alle Nutzer (Mieter und WEG-Eigentümer)</li>
                <li>• Änderungen werden sofort aktiv</li>
                <li>• Höhere Temperatur = kreativere, aber möglicherweise ungenauere Antworten</li>
                <li>• Organisieren Sie Ihr Wissen thematisch für bessere Chatbot-Antworten</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};