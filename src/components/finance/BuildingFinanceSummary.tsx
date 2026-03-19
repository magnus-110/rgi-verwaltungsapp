import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, BookOpen, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  buildingId: string;
  buildingName: string;
}

export function BuildingFinanceSummary({ buildingId, buildingName }: Props) {
  const navigate = useNavigate();

  const { data: invoiceCounts } = useQuery({
    queryKey: ["building-invoice-counts", buildingId],
    queryFn: async () => {
      const [open, paid, booked] = await Promise.all([
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("building_id", buildingId).eq("status", "open"),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("building_id", buildingId).eq("status", "paid"),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("building_id", buildingId).eq("status", "booked"),
      ]);
      return { open: open.count || 0, paid: paid.count || 0, booked: booked.count || 0 };
    },
  });

  const { data: bookingStats } = useQuery({
    queryKey: ["building-booking-stats", buildingId],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data, error } = await supabase.from("bookings")
        .select("amount, status")
        .eq("building_id", buildingId)
        .eq("fiscal_year", year);
      if (error) return { total: 0, pending: 0 };
      const total = data.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const pending = data.filter(b => b.status === "pending").length;
      return { total, pending };
    },
  });

  const formatCurrency = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{invoiceCounts?.open || 0}</p>
            <p className="text-xs text-muted-foreground">Offene Rechnungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{invoiceCounts?.paid || 0}</p>
            <p className="text-xs text-muted-foreground">Bezahlte Rechnungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(bookingStats?.total || 0)}</p>
            <p className="text-xs text-muted-foreground">Buchungen {new Date().getFullYear()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{bookingStats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Unbestätigte Buchungen</p>
          </CardContent>
        </Card>
      </div>
      <Button variant="outline" onClick={() => navigate("/finanzen")} className="w-full">
        <ArrowRight className="h-4 w-4 mr-2" /> Zur Finanzübersicht
      </Button>
    </div>
  );
}
