import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Save, Loader2, FileText, Globe2 } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DocumentSourcesList } from "@/components/documents/DocumentSourcesList";
import { cn } from "@/lib/utils";

interface DocumentChatSettings {
  id?: string;
  system_prompt: string;
  web_system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

const DEFAULT_DOCUMENT_SYSTEM_PROMPT = `Du bist ein Dokumenten-Assistent für die Immobilienverwaltung.

STRENGE REGELN - UNBEDINGT BEFOLGEN:
1. Antworte AUSSCHLIESSLICH basierend auf den bereitgestellten Dokumenten
2. Verwende KEIN eigenes Wissen - nur die Dokumente zählen
3. Wenn die Information NICHT in den Dokumenten vorhanden ist, antworte:
   "Diese Information ist in den verfügbaren Dokumenten nicht enthalten. 
   Aktivieren Sie die Internet-Suche (🌐) für eine Recherche im Web."
4. Erfinde NIEMALS Informationen
5. Gib bei jeder Antwort die Quelle an (Dokumentname, Seite)
6. Antworte auf Deutsch
7. Sei präzise und zitiere relevante Passagen

Du hast KEINEN Zugang zum Internet. Deine EINZIGE Wissensquelle sind die Dokumente.`;

const DEFAULT_WEB_SYSTEM_PROMPT = `Du bist ein Recherche-Assistent für die Immobilienverwaltung.

DU HAST ZWEI WISSENSQUELLEN:
1. INTERNE DOKUMENTE: Dir werden relevante interne Dokumente bereitgestellt (siehe "KONTEXT AUS INTERNEN DOKUMENTEN")
2. INTERNET-RECHERCHE: Du kannst zusätzlich im Internet recherchieren

VORGEHENSWEISE:
1. Prüfe ZUERST, ob die Information in den internen Dokumenten vorhanden ist
2. Nutze die internen Dokumente als primäre und vertrauenswürdigste Quelle
3. Ergänze mit Internet-Recherche, wenn:
   - Die internen Dokumente keine Antwort liefern
   - Aktuelle Gesetzestexte oder Urteile benötigt werden
   - Der Nutzer explizit nach externen Informationen fragt

RICHTLINIEN:
- Kennzeichne klar, ob die Information aus internen Dokumenten oder dem Internet stammt
- Bei Informationen aus internen Dokumenten: Gib das Dokument und die Seite an
- Bei rechtlichen Fragen: Verweise auf offizielle Quellen (Gesetze, BGH-Urteile)
- Antworte auf Deutsch
- Weise bei rechtlichen Themen darauf hin, dass dies keine Rechtsberatung ist

Du kombinierst internes Wissen mit aktueller Internet-Recherche.`;

const AVAILABLE_MODELS = [
  { value: 'mistral-medium-3-5', label: 'Mistral Medium 3.5 (Empfohlen)' },
  { value: 'mistral-small-latest', label: 'Mistral Small (Schneller)' },
];

export function DocumentSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [promptMode, setPromptMode] = useState<'document' | 'web'>('document');
  const [settings, setSettings] = useState<DocumentChatSettings>({
    system_prompt: DEFAULT_DOCUMENT_SYSTEM_PROMPT,
    web_system_prompt: DEFAULT_WEB_SYSTEM_PROMPT,
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
          system_prompt: data.system_prompt || DEFAULT_DOCUMENT_SYSTEM_PROMPT,
          web_system_prompt: (data as any).web_system_prompt || DEFAULT_WEB_SYSTEM_PROMPT,
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
            web_system_prompt: settings.web_system_prompt,
            model: settings.model,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', settings.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_chat_settings')
          .insert({
            system_prompt: settings.system_prompt,
            web_system_prompt: settings.web_system_prompt,
            model: settings.model,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
          } as any);
        
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

  const currentPrompt = promptMode === 'document' ? settings.system_prompt : settings.web_system_prompt;
  const defaultPrompt = promptMode === 'document' ? DEFAULT_DOCUMENT_SYSTEM_PROMPT : DEFAULT_WEB_SYSTEM_PROMPT;

  const handlePromptChange = (value: string) => {
    if (promptMode === 'document') {
      setSettings(prev => ({ ...prev, system_prompt: value }));
    } else {
      setSettings(prev => ({ ...prev, web_system_prompt: value }));
    }
  };

  const handleResetPrompt = () => {
    if (promptMode === 'document') {
      setSettings(prev => ({ ...prev, system_prompt: DEFAULT_DOCUMENT_SYSTEM_PROMPT }));
    } else {
      setSettings(prev => ({ ...prev, web_system_prompt: DEFAULT_WEB_SYSTEM_PROMPT }));
    }
  };

  // Redirect employees to documents page
  if (profile?.role === 'employee') {
    return <Navigate to="/documents" replace />;
  }

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

      {/* System Prompts with Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>System-Prompt</CardTitle>
              <CardDescription>
                Definieren Sie die Persönlichkeit und das Verhalten des Assistenten
              </CardDescription>
            </div>
            {/* Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              <button
                onClick={() => setPromptMode('document')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  promptMode === 'document'
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="h-4 w-4" />
                Dokumente
              </button>
              <button
                onClick={() => setPromptMode('web')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  promptMode === 'web'
                    ? "bg-background shadow-sm text-orange-600"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Globe2 className="h-4 w-4" />
                Internet
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Description */}
          <div className={cn(
            "p-3 rounded-lg border text-sm",
            promptMode === 'document' 
              ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200"
              : "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-200"
          )}>
            {promptMode === 'document' ? (
              <p>
                <strong>Dokument-Modus:</strong> Dieser Prompt wird verwendet, wenn die Internet-Suche 
                <strong> deaktiviert</strong> ist. Der Assistent antwortet nur basierend auf den hochgeladenen Dokumenten.
              </p>
            ) : (
              <p>
                <strong>Internet-Modus:</strong> Dieser Prompt wird verwendet, wenn die Internet-Suche 
                <strong> aktiviert</strong> ist (🌐). Der Assistent kann im Internet recherchieren.
              </p>
            )}
          </div>

          <Textarea
            value={currentPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetPrompt}
          >
            Auf Standard zurücksetzen
          </Button>
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
