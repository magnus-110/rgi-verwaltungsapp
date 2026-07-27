import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export const ChangePassword = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const { user, profile, updatePassword } = useAuth();
  const location = useLocation();
  
  const isAdminRoute = location.pathname.startsWith('/admin/');
  const isWegOwnerRoute = location.pathname.startsWith('/weg-owner/');
  const isTenantRoute = location.pathname.startsWith('/tenant/');

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // For forced password change, only redirect if not on a role-specific route
  if (
    profile &&
    !profile.force_password_change &&
    !profile.must_change_password &&
    !isAdminRoute &&
    !isWegOwnerRoute &&
    !isTenantRoute
  ) {
    return <Navigate to="/" replace />;
  }

  const isForcedChange = !!(profile?.force_password_change || profile?.must_change_password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwörter stimmen nicht überein",
        description: "Bitte stellen Sie sicher, dass beide Passwörter identisch sind.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Passwort zu kurz",
        description: "Das Passwort muss mindestens 6 Zeichen lang sein.",
        variant: "destructive",
      });
      return;
    }

    if (!isForcedChange && !currentPassword) {
      toast({
        title: "Aktuelles Passwort erforderlich",
        description: "Bitte geben Sie Ihr aktuelles Passwort ein.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (!isForcedChange && !mfaRequired) {
      const email = profile?.email || user?.email;
      if (!email) {
        setLoading(false);
        toast({ title: "Fehler", description: "E-Mail nicht verfügbar.", variant: "destructive" });
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        setLoading(false);
        toast({
          title: "Aktuelles Passwort ist falsch",
          description: "Bitte überprüfen Sie Ihr aktuelles Passwort und versuchen Sie es erneut.",
          variant: "destructive",
        });
        return;
      }

      // Check whether AAL2 (MFA) is required for updateUser
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel !== "aal2" && aal?.nextLevel === "aal2") {
          const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
          if (factorsError) throw factorsError;
          const totp = factors?.totp?.find((f) => f.status === "verified") ?? factors?.totp?.[0];
          if (!totp) {
            setLoading(false);
            toast({
              title: "MFA erforderlich",
              description: "Kein verifizierter Authenticator gefunden. Bitte melden Sie sich neu an und schließen Sie die MFA-Prüfung ab.",
              variant: "destructive",
            });
            return;
          }
          setMfaFactorId(totp.id);
          setMfaRequired(true);
          setLoading(false);
          toast({
            title: "Bestätigungscode erforderlich",
            description: "Bitte geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.",
          });
          return;
        }
      } catch (e: any) {
        setLoading(false);
        toast({ title: "MFA-Prüfung fehlgeschlagen", description: e?.message ?? "Unbekannter Fehler", variant: "destructive" });
        return;
      }
    }

    if (mfaRequired) {
      if (!mfaFactorId) {
        setLoading(false);
        toast({ title: "Fehler", description: "MFA-Faktor nicht gefunden.", variant: "destructive" });
        return;
      }
      if (!/^\d{6}$/.test(mfaCode.trim())) {
        setLoading(false);
        toast({ title: "Code ungültig", description: "Bitte 6-stelligen Code eingeben.", variant: "destructive" });
        return;
      }
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (chalErr || !challenge) {
        setLoading(false);
        toast({ title: "MFA-Challenge fehlgeschlagen", description: chalErr?.message ?? "Unbekannter Fehler", variant: "destructive" });
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyErr) {
        setLoading(false);
        toast({ title: "Code ungültig", description: "Der eingegebene Code ist falsch oder abgelaufen.", variant: "destructive" });
        return;
      }
    }

    const { error } = await updatePassword(newPassword);
    setLoading(false);

    if (!error) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMfaCode("");
      setMfaRequired(false);
      setMfaFactorId(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png" 
            alt="RGI Immobilien" 
            className="h-16 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-foreground">
            Passwort ändern
          </h1>
        </div>

        <Card className="border-border shadow-elegant">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Neues Passwort festlegen
            </CardTitle>
            <CardDescription className="text-center">
              {profile?.force_password_change 
                ? "Sie müssen Ihr Passwort bei der ersten Anmeldung ändern"
                : "Geben Sie ein neues Passwort ein"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isForcedChange && (
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="focus:ring-primary focus:border-primary pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Neues Passwort</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="focus:ring-primary focus:border-primary pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="focus:ring-primary focus:border-primary pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground"
                disabled={loading}
              >
                {loading ? "Passwort wird geändert..." : "Passwort ändern"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};