import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { FileText } from "lucide-react";

interface Paragraph35aSectionProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function Paragraph35aSection({ buildingId, periodId, fiscalYear }: Paragraph35aSectionProps) {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // §35a relevant accounts
  const { data: accounts35a = [] } = useQuery({
    queryKey: ["35a-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, default_distribution_key")
        .eq("is_35a_relevant", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Bookings for those accounts
  const { data: bookings35a = [] } = useQuery({
    queryKey: ["35a-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, is_35a_relevant")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("is_35a_relevant", true)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Owner assignments with shares
  const { data: owners = [] } = useQuery({
    queryKey: ["35a-owners", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, unit_number,
          contacts(first_name, last_name, company_name),
          contact_building_shares(share_type, share_value)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .eq("role_in_building", "eigentuemer");
      if (error) throw error;
      return data;
    },
  });

  // Calculate total §35a amount
  const total35a = bookings35a.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);

  // Get total MEA shares
  const totalMea = owners.reduce((s: number, o: any) => {
    const meaShare = o.contact_building_shares?.find((sh: any) => sh.share_type === "mea");
    return s + (meaShare?.share_value ?? 0);
  }, 0);

  // Calculate per owner
  const ownerRows = owners.map((o: any) => {
    const meaShare = o.contact_building_shares?.find((sh: any) => sh.share_type === "mea");
    const share = meaShare?.share_value ?? 0;
    const ratio = totalMea > 0 ? share / totalMea : 0;
    const amount = total35a * ratio;
    const name = o.contacts?.company_name || `${o.contacts?.last_name || ""}, ${o.contacts?.first_name || ""}`.trim();

    return {
      id: o.id,
      name,
      unit: o.unit_number || "–",
      mea: share,
      ratio,
      amount,
    };
  }).sort((a, b) => a.unit.localeCompare(b.unit));

  // Group bookings by account
  const accountSummary = accounts35a.map((acc: any) => {
    const accBookings = bookings35a.filter((b: any) => b.account_id === acc.id);
    const total = accBookings.reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);
    return { ...acc, total, count: accBookings.length };
  }).filter(a => a.total > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ausweisung haushaltsnaher Dienstleistungen und Handwerkerleistungen gem. §35a EStG für das Geschäftsjahr {fiscalYear}.
      </p>

      {/* Account summary */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> §35a-relevante Kosten nach Konto
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Konto</TableHead>
                <TableHead className="text-xs">Bezeichnung</TableHead>
                <TableHead className="text-xs text-center">Buchungen</TableHead>
                <TableHead className="text-xs text-right">Betrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountSummary.map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell className="text-xs font-mono">{acc.account_number}</TableCell>
                  <TableCell className="text-sm">{acc.account_name}</TableCell>
                  <TableCell className="text-center text-xs">{acc.count}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.total)}</TableCell>
                </TableRow>
              ))}
              {accountSummary.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                    Keine §35a-relevanten Buchungen gefunden.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-medium text-sm">Summe §35a</TableCell>
                <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(total35a)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Per owner distribution */}
      {total35a > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Verteilung auf Eigentümer (nach MEA)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Einheit</TableHead>
                  <TableHead className="text-xs">Eigentümer</TableHead>
                  <TableHead className="text-xs text-right">MEA</TableHead>
                  <TableHead className="text-xs text-right">Anteil</TableHead>
                  <TableHead className="text-xs text-right">§35a Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerRows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs font-mono">{row.unit}</TableCell>
                    <TableCell className="text-sm">{row.name}</TableCell>
                    <TableCell className="text-right text-xs">{row.mea.toFixed(4)}</TableCell>
                    <TableCell className="text-right text-xs">{(row.ratio * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-medium text-sm">Gesamt</TableCell>
                  <TableCell className="text-right font-mono font-medium text-sm">{formatCurrency(total35a)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
