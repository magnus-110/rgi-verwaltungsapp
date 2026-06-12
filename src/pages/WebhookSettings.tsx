import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { AlertCircle, CheckCircle, Send, Settings } from "lucide-react";

export const WebhookSettings = () => {
  const { profile } = useAuth();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testPayload, setTestPayload] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isBookingTesting, setIsBookingTesting] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<any>(null);
  const [lastBookingResult, setLastBookingResult] = useState<any>(null);

  useEffect(() => {
    // Set default test payload
    setTestPayload(JSON.stringify({
      event: "test",
      email: "test@beispiel.de",
      password: "123456",
      first_name: "Test",
      last_name: "Benutzer",
      phone: "+49 123 456789",
      management_mode: "weg",
      building_id: "test-building-id",
      created_at: new Date().toISOString()
    }, null, 2));
  }, []);

  // Redirect if not admin
  if (profile && profile.role !== 'admin') {
    return <div>Zugriff verweigert</div>;
  }

  const handleUpdateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl) {
      toast.error("Bitte geben Sie eine Webhook URL ein");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-webhook-url', {
        body: { webhookUrl }
      });

      if (error) throw error;

      toast.success("Webhook URL erfolgreich aktualisiert!");
      setWebhookUrl("");
    } catch (error: any) {
      console.error("Error updating webhook:", error);
      toast.error("Fehler beim Aktualisieren der Webhook URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!testPayload) {
      toast.error("Bitte geben Sie Test-Daten ein");
      return;
    }

    setIsTesting(true);
    try {
      const payload = JSON.parse(testPayload);
      
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: payload
      });

      if (error) throw error;

      setLastTestResult(data);
      
      if (data.success) {
        toast.success("Webhook-Test erfolgreich!");
      } else {
        toast.error(`Webhook-Test fehlgeschlagen: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Webhook test error:", error);
      setLastTestResult({ success: false, error: error.message });
      toast.error("Fehler beim Testen des Webhooks");
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestBookingWebhook = async () => {
    setIsBookingTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-booking-data', {
        body: { testMode: true }
      });

      if (error) throw error;

      setLastBookingResult(data);
      
      if (data.success) {
        toast.success(`Buchungs-Webhook erfolgreich: ${data.message}`);
      } else {
        toast.error(`Buchungs-Webhook fehlgeschlagen: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Booking webhook test error:", error);
      setLastBookingResult({ success: false, error: error.message });
      toast.error("Fehler beim Testen des Buchungs-Webhooks");
    } finally {
      setIsBookingTesting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="container max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Webhook Einstellungen</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Make.com Webhook URL
            </CardTitle>
            <CardDescription>
              Verwalten Sie die Webhook URL für Make.com Integrationen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateWebhook} className="space-y-4">
              <div>
                <Label htmlFor="webhook-url">Neue Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hook.eu2.make.com/..."
                  required
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Aktualisiere..." : "Webhook URL aktualisieren"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Webhook Testen
            </CardTitle>
            <CardDescription>
              Senden Sie Test-Daten an den konfigurierten Webhook
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="test-payload">Test Payload (JSON)</Label>
              <Textarea
                id="test-payload"
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            
            <Button onClick={handleTestWebhook} disabled={isTesting}>
              {isTesting ? "Teste..." : "Webhook testen"}
            </Button>

            {lastTestResult && (
              <Alert className={lastTestResult.success ? "border-green-200" : "border-red-200"}>
                <div className="flex items-start gap-2">
                  {lastTestResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={lastTestResult.success ? "default" : "destructive"}>
                        {lastTestResult.success ? "Erfolgreich" : "Fehlgeschlagen"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date().toLocaleString('de-DE')}
                      </span>
                    </div>
                    <AlertDescription>
                      {lastTestResult.success ? (
                        <>
                          <strong>Webhook erfolgreich gesendet!</strong>
                          {lastTestResult.response && (
                            <div className="mt-2">
                              <strong>Antwort:</strong>
                              <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                                {lastTestResult.response}
                              </pre>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <strong>Fehler:</strong> {lastTestResult.error}
                        </>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Buchungs-Webhook Testen
            </CardTitle>
            <CardDescription>
              Eine fiktive Test-Transaktion (Abschlag Gas) an Make.com senden — ohne DB-Änderung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTestBookingWebhook} disabled={isBookingTesting}>
              {isBookingTesting ? "Sende Test-Buchung..." : "Test-Buchung an Make.com senden"}
            </Button>

            {lastBookingResult && (
              <Alert className={lastBookingResult.success ? "border-green-200" : "border-red-200"}>
                <div className="flex items-start gap-2">
                  {lastBookingResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={lastBookingResult.success ? "default" : "destructive"}>
                        {lastBookingResult.success ? "Erfolgreich" : "Fehlgeschlagen"}
                      </Badge>
                    </div>
                    <AlertDescription>
                      {lastBookingResult.success ? (
                        <strong>{lastBookingResult.message || `${lastBookingResult.bookedCount} Transaktionen gebucht`}</strong>
                      ) : (
                        <><strong>Fehler:</strong> {lastBookingResult.error}</>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Events</CardTitle>
            <CardDescription>
              Diese Events werden automatisch an Make.com gesendet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-green-600 mb-2">user_created</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Wird gesendet wenn ein neuer Benutzer erstellt wird
                </p>
                <Badge variant="outline">Manuell + Bulk Upload</Badge>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-blue-600 mb-2">password_reset</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Wird gesendet wenn ein Passwort zurückgesetzt wird
                </p>
                <Badge variant="outline">Passwort vergessen</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};