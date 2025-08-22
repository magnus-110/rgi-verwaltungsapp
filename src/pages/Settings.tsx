
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";

export const Settings = () => {
  const { profile, fetchProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
        })
        .eq("user_id", profile.user_id);

      if (error) throw error;

      toast.success("Profil erfolgreich aktualisiert");
      await fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Fehler beim Aktualisieren des Profils");
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre persönlichen Einstellungen
          </p>
        </div>

        <div className="grid gap-6">
          {/* Persönliche Informationen */}
          <Card>
            <CardHeader>
              <CardTitle>Persönliche Informationen</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">Vorname</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ihr Vorname"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Nachname</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Ihr Nachname"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    value={profile.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Die E-Mail-Adresse kann nicht geändert werden
                  </p>
                </div>
                <div>
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ihre Telefonnummer"
                  />
                </div>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Speichern..." : "Änderungen speichern"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Benachrichtigungen */}
          {profile.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle>Benachrichtigungen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <PushNotificationToggle />
                  <p className="text-xs text-muted-foreground mt-2">
                    Erhalten Sie Push-Benachrichtigungen für neue Meldungen in Ihren verwalteten Gebäuden
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Passwort ändern */}
          <Card>
            <CardHeader>
              <CardTitle>Passwort</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => window.location.href = '/change-password'}>
                Passwort ändern
              </Button>
            </CardContent>
          </Card>

          {/* Rolle und Berechtigungen */}
          <Card>
            <CardHeader>
              <CardTitle>Konto-Informationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Rolle</Label>
                <div className="flex items-center mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {profile.role === 'admin' && 'Administrator'}
                    {profile.role === 'tenant' && 'Mieter'}
                    {profile.role === 'weg_owner' && 'WEG-Eigentümer'}
                  </span>
                </div>
              </div>
              
              {profile.building_id && (
                <div>
                  <Label>Zugewiesenes Gebäude</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    ID: {profile.building_id}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
