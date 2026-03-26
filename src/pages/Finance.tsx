import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { BankStatementsTab } from "@/components/finance/BankStatementsTab";
import { BookingTemplatesTab } from "@/components/finance/BookingTemplatesTab";
import { BookingsTab } from "@/components/finance/BookingsTab";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Calculator, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Finance = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finanzen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Rechnungen, Vorlagen, Kontoauszüge und Buchungen verwalten
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
          onClick={() => navigate('/finanzen/abrechnung')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calculator className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Jahresabrechnung</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Gesamtabrechnung und Einzelabrechnungen erstellen</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
          onClick={() => navigate('/finanzen/wirtschaftsplan')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Wirtschaftsplan</h3>
              <p className="text-xs text-muted-foreground mt-0.5">KI-gestützten Wirtschaftsplan für das Folgejahr erstellen</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
          <TabsTrigger value="templates">Vorlagen</TabsTrigger>
          <TabsTrigger value="statements">Kontoauszüge</TabsTrigger>
          <TabsTrigger value="bookings">Buchungen</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="templates">
          <BookingTemplatesTab />
        </TabsContent>
        <TabsContent value="statements">
          <BankStatementsTab />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
