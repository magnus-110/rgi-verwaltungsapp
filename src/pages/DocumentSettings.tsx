import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DocumentSourcesList } from "@/components/documents/DocumentSourcesList";

interface DocumentChatSettings {
  id?: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

const DEFAULT_SYSTEM_PROMPT = `Du bist ein hilfreicher Assistent für die Immobilienverwaltung. Du beantwortest Fragen basierend auf den bereitgestellten Dokumenten.

WICHTIGE REGELN:
1. Antworte NUR basierend auf den bereitgestellten Dokumenten
2. Wenn die Information nicht in den Dokumenten vorhanden ist, sage das klar
3. Gib immer die Quelle an (Dokument, Seite, Abschnitt)
4. Beziehe dich auf vorherige Fragen in der Konversation wenn relevant
5. Antworte auf Deutsch
6. Sei präzise und hilfreich`;

const AVAILABLE_MODELS = [
  { value: 'mistral-large-latest', label: 'Mistral Large (Empfohlen)' },
  { value: 'mistral-medium-latest', label: 'Mistral Medium' },
  { value: 'mistral-small-latest', label: 'Mistral Small (Schneller)' },
];

export function DocumentSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<DocumentChatSettings>({
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    model: 'mistral-large-latest',
    temperature: 0.3,
    max_tokens: 2000,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('document_chat_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setSettings({
          id: data.id,
          system_prompt: data.system_prompt || DEFAULT_SYSTEM_PROMPT,
          model: data.model || 'mistral-large-latest',
          temperature: data.temperature ?? 0.3,
          max_tokens: data.max_tokens ?? 2000,
        });
      }
    } catch (error) {
      console.log('No existing settings, using defaults');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (settings.id) {
        const { error } = await supabase
          .from('document_chat_settings')
          .update({
            system_prompt: settings.system_prompt,
            model: settings.model,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_chat_settings')
          .insert({
            system_prompt: settings.system_prompt,
            model: settings.model,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
          });
        
        if (error) throw error;
      }

      toast({
        title: "Einstellungen gespeichert",
        description: "Die Dokumenten-Chat Einstellungen wurden erfolgreich aktualisiert.",
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Fehler",
        description: "Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/documents')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Dokumenten-Chat Einstellungen</h1>
          <p className="text-muted-foreground">Konfigurieren Sie den KI-Assistenten für die Dokumentensuche</p>
        </div>
      </div>

      {/* Model Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Modell-Einstellungen</CardTitle>
          <CardDescription>Wählen Sie das KI-Modell und passen Sie die Parameter an</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Modell</Label>
            <Select
              value={settings.model}
              onValueChange={(value) => setSettings(prev => ({ ...prev, model: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map(model => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mistral Large liefert die besten Ergebnisse, Mistral Small ist schneller und günstiger.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Temperatur</Label>
              <span className="text-sm text-muted-foreground">{settings.temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.temperature]}
              onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Niedrige Werte (0.1-0.3) = präzise und konsistent. Hohe Werte (0.7-1.0) = kreativer und variierter.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max. Tokens</Label>
            <Input
              type="number"
              value={settings.max_tokens}
              onChange={(e) => setSettings(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 2000 }))}
              min={500}
              max={4000}
            />
            <p className="text-xs text-muted-foreground">
              Maximale Länge der Antwort. 1000 Tokens ≈ 750 Wörter.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>System-Prompt</CardTitle>
          <CardDescription>
            Definieren Sie die Persönlichkeit und das Verhalten des Assistenten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={settings.system_prompt}
            onChange={(e) => setSettings(prev => ({ ...prev, system_prompt: e.target.value }))}
            rows={12}
            className="font-mono text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettings(prev => ({ ...prev, system_prompt: DEFAULT_SYSTEM_PROMPT }))}
          >
            Auf Standard zurücksetzen
          </Button>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Hinweis zur Web-Suche</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Die Mistral AI API unterstützt derzeit keine Web-Suche. Der Assistent kann nur auf 
            die hochgeladenen Dokumente zugreifen. Für Web-Suche-Funktionalität müsste eine 
            zusätzliche Such-API (z.B. Perplexity, Tavily oder Brave Search) integriert werden.
          </p>
        </CardContent>
      </Card>

      {/* Knowledge Sources */}
      <DocumentSourcesList />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </div>
  );
}

export default DocumentSettings;
