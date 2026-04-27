import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const ConfirmEmailChange = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "confirming" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState<string>("");

  useEffect(() => {
    setStatus("confirming");
  }, []);

  useEffect(() => {
    const confirm = async () => {
      if (!token) {
        setError("Ungültiger Link.");
        setStatus("error");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("confirm-email-change", {
          body: { token },
        });
        if (error) {
          // Try to extract message from FunctionsHttpError
          const ctx = (error as any)?.context;
          const bodyText = ctx ? await ctx.text?.().catch(() => "") : "";
          let msg = error.message || "Bestätigung fehlgeschlagen.";
          try {
            const parsed = bodyText ? JSON.parse(bodyText) : null;
            if (parsed?.error) msg = parsed.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        setNewEmail((data as any)?.new_email ?? "");
        // Sign out any existing session — user must log in with new email
        await supabase.auth.signOut().catch(() => {});
        setStatus("success");
      } catch (e: any) {
        setError(e?.message ?? "Bestätigung fehlgeschlagen.");
        setStatus("error");
      }
    };
    if (status === "confirming") confirm();
  }, [status, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {status === "loading" || status === "confirming" ? (
          <>
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-semibold">E-Mail wird bestätigt …</h1>
            <p className="text-sm text-muted-foreground">Einen Moment bitte.</p>
          </>
        ) : status === "success" ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Login-E-Mail erfolgreich geändert</h1>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{newEmail}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Ab sofort melden Sie sich mit dieser E-Mail-Adresse an.
            </p>
            <Button onClick={() => navigate("/login")} className="w-full">
              Zur Anmeldung
            </Button>
          </>
        ) : (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Bestätigung fehlgeschlagen</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/login")} variant="outline">
              Zur Anmeldung
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};

export default ConfirmEmailChange;
