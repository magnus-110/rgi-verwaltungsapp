import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CashAuditWizard } from "@/components/finance/CashAuditWizard";

export const CashAuditProxy = () => {
  const { token } = useParams<{ token: string }>();

  const { data: audit, isLoading, error } = useQuery({
    queryKey: ["cash-audit-proxy", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc("get_audit_by_token", { p_token: token });
      if (error) throw error;
      return data as any;
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Kassenprüfung wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!audit || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Link ungültig</h1>
          <p className="text-muted-foreground">
            Dieser Kassenprüfungs-Link ist ungültig oder abgelaufen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border shadow-sm">
        <div className="flex items-center justify-between h-14 px-4">
          <img
            src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png"
            alt="RGI Immobilien Logo"
            className="h-10 w-auto object-contain"
          />
          <span className="text-sm text-muted-foreground">Digitale Kassenprüfung</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 md:p-6">
        <CashAuditWizard
          auditId={audit.id}
          tokenMode
          token={token}
        />
      </main>
    </div>
  );
};
