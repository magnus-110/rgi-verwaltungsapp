import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartOfAccountsTab } from "@/components/finance/ChartOfAccountsTab";
import { DistributionKeysTab } from "@/components/finance/DistributionKeysTab";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { BookingsTab } from "@/components/finance/BookingsTab";

export const Finance = () => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finanzen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kontenrahmen, Rechnungen und Buchungen verwalten
        </p>
      </div>

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="accounts">Kontenrahmen</TabsTrigger>
          <TabsTrigger value="distribution">Verteilerschlüssel</TabsTrigger>
          <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
          <TabsTrigger value="bookings">Buchungen</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <ChartOfAccountsTab />
        </TabsContent>
        <TabsContent value="distribution">
          <DistributionKeysTab />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
