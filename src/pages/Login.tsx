import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage } from "@/lib/authErrorMessage";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { BackendStatusBanner } from "@/components/system/BackendStatusBanner";

export const Login = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeySupported =
    typeof window !== "undefined" && !!(window as any).PublicKeyCredential;
  const { signIn, user, profile } = useAuth();
  const { reportError } = useBackendHealth();

  // Passkey-Anmeldung wird ausschließlich durch Klick auf den Passkey-Button
  // ausgelöst – kein automatischer Conditional-UI-Prompt beim Seitenaufruf.


  // Redirect authenticated users
  if (user && profile) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(identifier, password);
      if (error) {
        // signIn zeigt bereits einen Toast; hier nur Health-Check auslösen
        reportError(error);
      }
    } catch (error) {
      reportError(error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const auth = supabase.auth as any;
    if (typeof auth.signInWithPasskey !== "function") {
      toast.error("Passkey-Anmeldung ist nicht verfügbar.");
      return;
    }
    setPasskeyLoading(true);
    try {
      const { error } = await auth.signInWithPasskey();
      if (error) {
        if (error.name === "NotAllowedError" || error.code === "user_cancelled") return;
        reportError(error);
        toast.error(getAuthErrorMessage(error));
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") return;
      reportError(e);
      toast.error(getAuthErrorMessage(e));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent form
    setResetLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: resetEmail }
      });

      if (error) {
        // Try to extract specific error message from the function response body
        let specificMessage: string | null = null;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) specificMessage = body.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            try {
              const parsed = JSON.parse(txt);
              if (parsed?.error) specificMessage = parsed.error;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }

        toast.error(specificMessage ?? 'Fehler beim Zurücksetzen des Passworts. Bitte versuchen Sie es später erneut.');
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Success case
      toast.success("Neues Passwort wurde generiert und per E-Mail versendet!");
      setResetDialogOpen(false);
      setResetEmail("");
    } catch (error: any) {
      
      toast.error('Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* RGI Logo */}
        <div className="text-center mb-8">
          <img 
            src="/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png" 
            alt="RGI Immobilien" 
            className="h-16 mx-auto mb-4"
          />
            <h1 className="text-2xl font-bold text-foreground">
              Verwaltungs-App
            </h1>
        </div>

        <Card className="border-border shadow-elegant">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Anmelden
            </CardTitle>
            <CardDescription className="text-center">
              Melden Sie sich mit Ihren Zugangsdaten an
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Benutzername oder E-Mail</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="z.B. max.mustermann"
                  required
                  className="focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="focus:ring-primary focus:border-primary pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Anmelden..." : "Anmelden"}
              </Button>

              {passkeySupported && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">oder</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                  >
                    <Fingerprint className="h-4 w-4 mr-2" />
                    {passkeyLoading ? "Anmelden…" : "Mit Passkey anmelden"}
                  </Button>
                </>
              )}

              
              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    type="button" 
                    variant="link" 
                    className="w-full text-sm text-muted-foreground"
                  >
                    Passwort vergessen?
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Passwort zurücksetzen</DialogTitle>
                    <DialogDescription>
                      Geben Sie Ihre E-Mail-Adresse ein, um ein neues Passwort zu erhalten.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div>
                      <Label htmlFor="reset-email">E-Mail-Adresse</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setResetDialogOpen(false)}
                        className="flex-1"
                      >
                        Abbrechen
                      </Button>
                      <Button type="submit" disabled={resetLoading} className="flex-1">
                        {resetLoading ? "Wird gesendet..." : "Neues Passwort anfordern"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </form>
          </CardContent>
        </Card>

        <p className="text-center mt-4 text-sm text-muted-foreground">
          Bei Log-in Problemen wenden Sie sich an Ihren Verwalter
        </p>
      </div>
    </div>
  );
};