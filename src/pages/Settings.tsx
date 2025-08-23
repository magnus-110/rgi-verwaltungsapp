
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";

export const Settings = () => {
  const { profile, fetchProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState((profile as any)?.phone || "");
  const [isLoading, setIsLoading] = useState(false);
  
  // Admin creation states
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminFirstName, setNewAdminFirstName] = useState("");
  const [newAdminLastName, setNewAdminLastName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

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

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword || !newAdminFirstName || !newAdminLastName) {
      toast.error("Bitte füllen Sie alle Felder aus");
      return;
    }

    setIsCreatingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newAdminEmail,
          password: newAdminPassword,
          role: 'admin',
          first_name: newAdminFirstName,
          last_name: newAdminLastName
        }
      });

      if (error) throw error;

      toast.success("Admin erfolgreich erstellt");
      setNewAdminEmail("");
      setNewAdminFirstName("");
      setNewAdminLastName("");
      setNewAdminPassword("");
    } catch (error) {
      console.error("Error creating admin:", error);
      toast.error("Fehler beim Erstellen des Admins");
    } finally {
      setIsCreatingAdmin(false);
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

          {/* Admin Management - nur für Admins */}
          {profile.role === 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Administrator verwalten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateAdmin} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="newAdminFirstName">Vorname</Label>
                      <Input
                        id="newAdminFirstName"
                        value={newAdminFirstName}
                        onChange={(e) => setNewAdminFirstName(e.target.value)}
                        placeholder="Vorname des neuen Admins"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newAdminLastName">Nachname</Label>
                      <Input
                        id="newAdminLastName"
                        value={newAdminLastName}
                        onChange={(e) => setNewAdminLastName(e.target.value)}
                        placeholder="Nachname des neuen Admins"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="newAdminEmail">E-Mail</Label>
                    <Input
                      id="newAdminEmail"
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="E-Mail des neuen Admins"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newAdminPassword">Temporäres Passwort</Label>
                    <Input
                      id="newAdminPassword"
                      type="password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Temporäres Passwort"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Der neue Admin sollte das Passwort nach der ersten Anmeldung ändern
                    </p>
                  </div>
                  <Button type="submit" disabled={isCreatingAdmin}>
                    {isCreatingAdmin ? "Erstellen..." : "Admin erstellen"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
