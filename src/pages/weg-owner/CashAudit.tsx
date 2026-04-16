import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CashAuditWizard } from "@/components/finance/CashAuditWizard";
import { Card, CardContent } from "@/components/ui/card";

export const WegOwnerCashAudit = () => {
  const { profile } = useAuth();

  const { data: audit, isLoading } = useQuery({
    queryKey: ["owner-cash-audit", profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      // Get contact IDs for this user
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile.user_id);
      if (!contacts || contacts.length === 0) return null;

      const contactIds = contacts.map((c) => c.id);
      const { data } = await supabase
        .from("cash_audits")
        .select("id, status")
        .in("auditor_contact_id", contactIds)
        .gt("visible_in_portal_until", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.user_id,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground py-12">
        Laden...
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aktuell keine Kassenprüfung für Sie freigeschaltet.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <CashAuditWizard auditId={audit.id} />
    </div>
  );
};
