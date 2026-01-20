import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Plus } from "lucide-react";

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

interface AgentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
  onSave: (agent: Partial<Agent>) => void;
}

const ICON_OPTIONS = [
  "FileText", "Users", "Calculator", "Receipt", "Wrench", "Shield",
  "Home", "ClipboardList", "PiggyBank", "Mail", "Scale", "Map", "Zap", "File"
];

const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", 
  "#ef4444", "#64748b", "#a855f7", "#22c55e", "#06b6d4",
  "#dc2626", "#0891b2", "#7c3aed", "#eab308", "#94a3b8"
];

export function AgentEditDialog({ open, onOpenChange, agent, onSave }: AgentEditDialogProps) {
  const isCreate = !agent?.id;
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    system_prompt: "",
    search_keywords: [] as string[],
    example_content: "",
    output_filename_pattern: "{category}_{building}",
    icon: "FileText",
    color: "#6366f1",
    is_active: true,
  });

  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    if (agent && agent.id) {
      setFormData({
        name: agent.name || "",
        description: agent.description || "",
        system_prompt: agent.system_prompt || "",
        search_keywords: agent.search_keywords || [],
        example_content: agent.example_content || "",
        output_filename_pattern: agent.output_filename_pattern || "{category}_{building}",
        icon: agent.icon || "FileText",
        color: agent.color || "#6366f1",
        is_active: agent.is_active ?? true,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        system_prompt: "Du bist ein Experte für die Erkennung von [KATEGORIE] in der Immobilienverwaltung. Suche nach: [BESCHREIBUNG WAS ERKANNT WERDEN SOLL].",
        search_keywords: [],
        example_content: "",
        output_filename_pattern: "{category}_{building}",
        icon: "FileText",
        color: "#6366f1",
        is_active: true,
      });
    }
  }, [agent]);

  const addKeyword = () => {
    if (newKeyword.trim() && !formData.search_keywords.includes(newKeyword.trim())) {
      setFormData(prev => ({
        ...prev,
        search_keywords: [...prev.search_keywords, newKeyword.trim()],
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      search_keywords: prev.search_keywords.filter(k => k !== keyword),
    }));
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    onSave(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "Neuen Agent erstellen" : "Agent bearbeiten"}
          </DialogTitle>
          <DialogDescription>
            Konfigurieren Sie den spezialisierten KI-Agenten für eine bestimmte Dokumentenkategorie.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="z.B. Wartungsverträge-Spezialist"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pattern">Dateiname-Pattern</Label>
                <Input
                  id="pattern"
                  value={formData.output_filename_pattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, output_filename_pattern: e.target.value }))}
                  placeholder="{category}_{building}_{year}"
                />
                <p className="text-xs text-muted-foreground">
                  Variablen: {"{category}"}, {"{building}"}, {"{year}"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Kurze Beschreibung der Funktion"
              />
            </div>

            {/* Icon and Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.slice(0, 8).map(icon => (
                    <Button
                      key={icon}
                      type="button"
                      variant={formData.icon === icon ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, icon }))}
                      className="w-10 h-10 p-0"
                    >
                      {icon.slice(0, 2)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Farbe</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.slice(0, 8).map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        formData.color === color ? "ring-2 ring-offset-2 ring-primary" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt">System Prompt *</Label>
              <Textarea
                id="prompt"
                value={formData.system_prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                placeholder="Beschreiben Sie die Expertise und Aufgabe des Agenten..."
                className="min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Dieser Prompt definiert, wonach der Agent suchen soll.
              </p>
            </div>

            {/* Keywords */}
            <div className="space-y-2">
              <Label>Suchbegriffe</Label>
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Neues Keyword..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                />
                <Button type="button" variant="outline" onClick={addKeyword}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.search_keywords.map(keyword => (
                  <Badge 
                    key={keyword} 
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Example Content */}
            <div className="space-y-2">
              <Label htmlFor="example">Beispielinhalt (optional)</Label>
              <Textarea
                id="example"
                value={formData.example_content}
                onChange={(e) => setFormData(prev => ({ ...prev, example_content: e.target.value }))}
                placeholder="Ein typisches Textbeispiel, das dieser Agent erkennen soll..."
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                Hilft dem Agenten, ähnliche Inhalte besser zu erkennen.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            {isCreate ? "Erstellen" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
