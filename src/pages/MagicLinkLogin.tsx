import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Consumes a one-time magic link from the welcome letter QR code.
 * Calls consume-magic-link edge function -> sets session -> redirects.
 */
export const MagicLinkLogin = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const consume = async () => {
      if (!token) {
        setError("Ungültiger Link");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke(
          "consume-magic-link",
          { body: { token } }
        );
        if (error) throw error;
        const session = (data as any)?.session;
        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("Keine Sitzung erhalten.");
        }
        const { error: setErr } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (setErr) throw setErr;
        navigate("/change-password", { replace: true });
      } catch (e: any) {
        setError(e?.message ?? "Link konnte nicht verwendet werden.");
      }
    };
    consume();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {error ? (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Link abgelaufen oder ungültig</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/login")}>Zur Anmeldung</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-semibold">Anmeldung läuft …</h1>
            <p className="text-sm text-muted-foreground">
              Sie werden gleich weitergeleitet.
            </p>
          </>
        )}
      </Card>
    </div>
  );
};
