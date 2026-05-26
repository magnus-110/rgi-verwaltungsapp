import { useQuery } from "@tanstack/react-query";
import { Key, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export const OutstandingKeysWidget = () => {
  const navigate = useNavigate();
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["outstanding-key-loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("key_loans")
        .select("id, building_id, borrower_name, issued_at, due_at, tag_id, key_tags(tag_number), buildings(name)")
        .is("returned_at", null)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <span className="flex items-center">
            <Key className="mr-2 h-5 w-5 text-primary" />
            Verliehene Schlüssel
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {loans.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : loans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aktuell sind keine Schlüssel verliehen.</p>
        ) : (
          loans.slice(0, 8).map((loan: any) => {
            const overdue = loan.due_at && new Date(loan.due_at) < new Date();
            return (
              <button
                key={loan.id}
                onClick={() => navigate(`/buildings/${loan.building_id}?tab=keys`)}
                className="w-full text-left rounded-md border border-border p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {loan.key_tags?.tag_number || "—"} · {loan.borrower_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {loan.buildings?.name}
                      {loan.due_at && (
                        <> · fällig {format(new Date(loan.due_at), "dd.MM.yyyy", { locale: de })}</>
                      )}
                    </div>
                  </div>
                  {overdue && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      überfällig
                    </Badge>
                  )}
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
