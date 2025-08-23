import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Key, TestTube, Settings } from "lucide-react";

export const NewPushNotificationSetup = () => {
  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<any>(null);

  const generateNewKeys = async () => {
    setLoading(true);
    try {
      console.log('Generating new VAPID keys...');
      
      const { data, error } = await supabase.functions.invoke('generate-vapid-keys');
      
      if (error) {
        console.error('Key generation error:', error);
        toast.error('Fehler beim Generieren der Schlüssel');
        return;
      }

      console.log('Keys generated:', data);
      setKeys(data.keys);
      toast.success('Neue VAPID-Schlüssel generiert');
      
    } catch (error) {
      console.error('Key generation failed:', error);
      toast.error('Schlüssel-Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const testNewSystem = async () => {
    setLoading(true);
    try {
      console.log('Testing new push system...');
      
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          reportId: 'test-new-system',
          buildingId: 'test-building',
          buildingName: 'Test-Gebäude',
          reportTitle: 'Neues System Test',
          reportType: 'weg'
        }
      });

      if (error) {
        console.error('Test error:', error);
        toast.error('System-Test fehlgeschlagen');
        return;
      }

      console.log('Test result:', data);
      toast.success('Neues System funktioniert!');
      
    } catch (error) {
      console.error('System test failed:', error);
      toast.error('System-Test fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Push-Benachrichtigungen Neu-Setup
          </CardTitle>
          <CardDescription>
            Komplett neues, vereinfachtes Push-Notification-System
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          <div className="space-y-2">
            <h4 className="font-medium">Schritt 1: Neue VAPID-Schlüssel generieren</h4>
            <Button 
              onClick={generateNewKeys}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Key className="h-4 w-4" />
              {loading ? 'Generiere...' : 'VAPID-Schlüssel generieren'}
            </Button>
          </div>

          {keys && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h5 className="font-medium">Generierte Schlüssel:</h5>
              <div className="space-y-1 text-sm">
                <p><strong>Public Key:</strong></p>
                <code className="block bg-background p-2 rounded text-xs break-all">
                  {keys.publicKey}
                </code>
                <p><strong>Private Key:</strong></p>
                <code className="block bg-background p-2 rounded text-xs break-all">
                  {keys.privateKey}
                </code>
              </div>
              <p className="text-sm text-muted-foreground">
                Diese Schlüssel müssen in den Supabase Edge Function Secrets gespeichert werden:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• VAPID_PUBLIC_KEY = [Public Key oben]</li>
                <li>• VAPID_PRIVATE_KEY = [Private Key oben]</li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium">Schritt 2: System testen</h4>
            <Button 
              onClick={testNewSystem}
              disabled={loading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <TestTube className="h-4 w-4" />
              {loading ? 'Teste...' : 'Neues System testen'}
            </Button>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h5 className="font-medium text-blue-900">Warum ein neues System?</h5>
            <ul className="text-sm text-blue-800 mt-2 space-y-1">
              <li>• Das alte System hatte Import-Probleme mit Web-Push-Libraries</li>
              <li>• VAPID-Key Mismatches zwischen Frontend und Backend</li>
              <li>• Komplexe CORS-Konfiguration</li>
              <li>• Dieses neue System ist einfacher und zuverlässiger</li>
            </ul>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};