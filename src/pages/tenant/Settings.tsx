import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { User, Lock, Mail } from "lucide-react";


export const TenantSettings = () => {
  const { profile, updatePassword, fetchProfile } = useAuth();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
  const [profileForm, setProfileForm] = useState({
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
  });
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const updateProfile = async () => {
    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
        })
        .eq("user_id", profile?.user_id);

      if (error) throw error;

      await fetchProfile();
      toast({
        title: "Erfolg",
        description: "Profil wurde erfolgreich aktualisiert.",
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Fehler",
        description: "Profil konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Fehler",
        description: "Die neuen Passwörter stimmen nicht überein.",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: "Fehler",
        description: "Das neue Passwort muss mindestens 6 Zeichen lang sein.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await updatePassword(passwordForm.newPassword);
      
      if (error) throw error;

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("Error updating password:", error);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-lg text-muted-foreground">
          Verwalten Sie Ihre Profil- und Kontoeinstellungen
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profil
          </CardTitle>
          <CardDescription>
            Aktualisieren Sie Ihre persönlichen Informationen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">Vorname</Label>
              <Input
                id="firstName"
                value={profileForm.first_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, first_name: e.target.value }))}
                placeholder="Ihr Vorname"
              />
            </div>
            <div>
              <Label htmlFor="lastName">Nachname</Label>
              <Input
                id="lastName"
                value={profileForm.last_name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, last_name: e.target.value }))}
                placeholder="Ihr Nachname"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                value={profile?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Die E-Mail-Adresse kann nicht geändert werden.
            </p>
          </div>

          <Button 
            onClick={updateProfile} 
            disabled={isUpdatingProfile}
            className="w-full md:w-auto"
          >
            {isUpdatingProfile ? "Wird gespeichert..." : "Profil speichern"}
          </Button>
        </CardContent>
      </Card>

      {/* Password Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Passwort ändern
          </CardTitle>
          <CardDescription>
            Ändern Sie Ihr Passwort für erhöhte Sicherheit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <Input
              id="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
          
          <div>
            <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Passwort wiederholen"
            />
          </div>

          <Button 
            onClick={changePassword} 
            disabled={isUpdatingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
            className="w-full md:w-auto"
          >
            {isUpdatingPassword ? "Wird geändert..." : "Passwort ändern"}
          </Button>
        </CardContent>
      </Card>


      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Kontoinformationen</CardTitle>
          <CardDescription>
            Informationen über Ihr Konto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Rolle</Label>
              <p className="text-sm text-muted-foreground">Mieter</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Konto erstellt</Label>
              <p className="text-sm text-muted-foreground">
                Unbekannt
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};