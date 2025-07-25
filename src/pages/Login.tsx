import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, user, profile } = useAuth();

  // Redirect authenticated users
  if (user) {
    if (profile?.force_password_change) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    await signIn(email, password);
    setLoading(false);
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
            RGI Verwaltungs-App
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
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre.email@beispiel.de"
                  required
                  className="focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="focus:ring-primary focus:border-primary"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground"
                disabled={loading}
              >
                {loading ? "Anmelden..." : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center mt-4 text-sm text-muted-foreground">
          Bei Problemen wenden Sie sich an Ihren Administrator
        </p>
      </div>
    </div>
  );
};