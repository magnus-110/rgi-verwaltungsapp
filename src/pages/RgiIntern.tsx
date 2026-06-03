import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { Briefcase, BarChart3, Clock, FileText, Users, FolderKanban, FileStack, Settings, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DashboardTab } from "@/components/rgi-intern/dashboard/DashboardTab";
import { ClientsTab } from "@/components/rgi-intern/clients/ClientsTab";
import { ProjectsTab } from "@/components/rgi-intern/projects/ProjectsTab";
import { TimeEntriesTab } from "@/components/rgi-intern/time/TimeEntriesTab";
import { InvoicesTab } from "@/components/rgi-intern/invoices/InvoicesTab";
import { TemplatesTab } from "@/components/rgi-intern/templates/TemplatesTab";
import { ItemPresetsTab } from "@/components/rgi-intern/item-presets/ItemPresetsTab";
import { CompanySettingsTab } from "@/components/rgi-intern/settings/CompanySettingsTab";

export default function RgiIntern() {
  const isAdmin = useIsRgiAdmin();
  const [tab, setTab] = useState("dashboard");

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-semibold mb-2">Kein Zugriff</h2>
          <p className="text-muted-foreground">Dieses Modul ist nur für Administrator:innen verfügbar.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Briefcase className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold">RGI Intern</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Zeiterfassung, Projekte und Rechnungsstellung</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="w-4 h-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5"><FolderKanban className="w-4 h-4" />Projekte</TabsTrigger>
          <TabsTrigger value="time" className="gap-1.5"><Clock className="w-4 h-4" />Stunden</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-4 h-4" />Rechnungen</TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5"><Users className="w-4 h-4" />Kunden</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><FileStack className="w-4 h-4" />Vorlagen</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-4 h-4" />Einstellungen</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="projects"><ProjectsTab /></TabsContent>
        <TabsContent value="time"><TimeEntriesTab /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="settings"><CompanySettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
