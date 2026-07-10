import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, ClipboardPaste } from "lucide-react";

export const MfaEnroll = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Clean up any existing unverified factors
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const existingTotp = factors?.totp?.find((f) => f.status === "verified");
        if (existingTotp) {
          // Already enrolled → go to challenge instead
          navigate("/mfa-challenge", { replace: true });
          return;
        }
        // Remove stale unverified factors
        const unverified = factors?.all?.filter((f) => f.status !== "verified") ?? [];
        for (const f of unverified) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }

        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
        if (cancelled) return;
        if (error) throw error;
        setFactorId(data.id);
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (e: any) {
        toast.error(e?.message ?? "Enrollment fehlgeschlagen");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const digits = (text.match(/\d/g) || []).join("").slice(0, 6);
      if (digits.length !== 6) {
        toast.error("Kein 6-stelliger Code in der Zwischenablage gefunden");
        return;
      }
      setCode(digits);
    } catch {
      toast.error("Zugriff auf die Zwischenablage nicht möglich");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;
      toast.success("Zwei-Faktor-Authentifizierung eingerichtet");
      navigate("/", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Code ungültig");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Zwei-Faktor einrichten</CardTitle>
          <CardDescription>
            Scannen Sie den QR-Code mit Ihrer Authenticator-App (z.B. Google Authenticator, Authy, 1Password) und geben Sie anschließend den 6-stelligen Code ein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initializing ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {qr && (
                <div className="flex justify-center">
                  <div
                    className="bg-white p-2 rounded-md border"
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                </div>
              )}
              {secret && (
                <div className="text-center text-xs text-muted-foreground break-all">
                  <span className="font-medium">Manueller Code:</span> {secret}
                </div>
              )}
              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="code">6-stelliger Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      required
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      title="Code aus Zwischenablage einfügen"
                      onClick={handlePasteFromClipboard}
                    >
                      <ClipboardPaste className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                  {loading ? "Wird geprüft..." : "Bestätigen & aktivieren"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>
                  Abbrechen & abmelden
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MfaEnroll;
