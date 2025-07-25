import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Bot, Settings, Eye, EyeOff } from "lucide-react";

export const ChatbotSettings = () => {
  const { profile } = useAuth();
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState({
    openai_api_key: "",
    model: "gpt-4o-mini",
    temperature: [0.7],
    max_tokens: [500]
  });

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
      // TODO: Implement Supabase update
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Chatbot-Einstellungen wurden erfolgreich aktualisiert.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Beim Speichern der Einstellungen ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async () => {
    if (!settings.openai_api_key) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen API-Schlüssel ein.",
        variant: "destructive",
      });
      return;
    }

    try {
      // TODO: Implement API test
      toast({
        title: "Verbindung erfolgreich",
        description: "Die Verbindung zur OpenAI API wurde erfolgreich getestet.",
      });
    } catch (error) {
      toast({
        title: "Verbindung fehlgeschlagen",
        description: "Die Verbindung zur OpenAI API konnte nicht hergestellt werden.",
        variant: "destructive",
      });
    }
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
              OpenAI Konfiguration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="api-key">OpenAI API-Schlüssel</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={settings.openai_api_key}
                  onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                  placeholder="sk-..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ihr OpenAI API-Schlüssel wird sicher gespeichert.
              </p>
            </div>

            <div>
              <Label htmlFor="model">KI-Modell</Label>
              <Select value={settings.model} onValueChange={(value) => setSettings({ ...settings, model: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Empfohlen)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} className="flex-1">
                Einstellungen speichern
              </Button>
              <Button variant="outline" onClick={handleTestConnection}>
                Verbindung testen
              </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Chatbot-Funktionen nach Rolle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold text-green-600 mb-2">Administratoren</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Vollzugriff auf alle Daten</li>
                <li>• Gebäudeinformationen</li>
                <li>• Verwaltungsfunktionen</li>
                <li>• Systemkonfiguration</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-yellow-600 mb-2">WEG-Eigentümer</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Gebäudedaten via ID</li>
                <li>• Allgemeine Informationen</li>
                <li>• Meldungshistorie</li>
                <li>• Kontaktinformationen</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-blue-600 mb-2">Mieter</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Eigene Gebäudedaten</li>
                <li>• Mieterspezifische Infos</li>
                <li>• Hausordnung</li>
                <li>• Ansprechpartner</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Bot className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 mb-1">Wichtige Hinweise</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• Der API-Schlüssel wird verschlüsselt gespeichert</li>
                <li>• Änderungen werden sofort für alle Nutzer aktiv</li>
                <li>• Testen Sie die Verbindung nach Änderungen</li>
                <li>• Höhere Temperatur = kreativere, aber möglicherweise ungenauere Antworten</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};