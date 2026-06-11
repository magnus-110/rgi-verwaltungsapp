import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: React.ReactNode;
}

/**
 * Blocks rendering of admin-area children until the current session
 * satisfies MFA (AAL2) for users with profiles.mfa_required = true.
 */
export const RequireMfa = ({ children }: Props) => {
  const { profile, user, loading } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "enroll" | "challenge">("checking");

  useEffect(() => {
    let cancelled = false;
    if (loading || !user) return;
    if (!profile?.mfa_required) {
      setState("ok");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
        if (error) {
          console.error("aal error", error);
          setState("ok"); // fail open to avoid lockout if API down
          return;
        }
        if (data?.currentLevel === "aal2") {
          setState("ok");
        } else if (data?.nextLevel === "aal2") {
          setState("challenge");
        } else {
          setState("enroll");
        }
      } catch (e) {
        console.error(e);
        setState("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.mfa_required, profile?.user_id, user?.id, loading]);

  if (loading || state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (state === "enroll") return <Navigate to="/mfa-enroll" replace />;
  if (state === "challenge") return <Navigate to="/mfa-challenge" replace />;
  return <>{children}</>;
};
