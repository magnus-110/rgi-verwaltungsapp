import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import { Briefcase, BarChart3, Clock, FileText, Users, FolderKanban, FileStack, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";

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

        <TabsContent value="dashboard"><PlaceholderTab title="Dashboard" hint="Umsatz-KPIs, offene Forderungen, abrechenbare Stunden — folgt in der nächsten Iteration." /></TabsContent>
        <TabsContent value="projects"><PlaceholderTab title="Projekte" hint="Projekte je Kunde und Sparte mit Default-Stundensatz." /></TabsContent>
        <TabsContent value="time"><PlaceholderTab title="Stundenerfassung" hint="Schnellerfassung mit Pflicht-Beschreibung, abrechenbar-Toggle, Stundensatz-Override." /></TabsContent>
        <TabsContent value="invoices"><PlaceholderTab title="Rechnungen" hint="Editor mit Positionen, USt-Auswahl, PDF-Render via CloudConvert." /></TabsContent>
        <TabsContent value="clients"><PlaceholderTab title="Kunden" hint="Aus Kontakt, Gebäude oder frei erstellbar. Adress-Snapshot." /></TabsContent>
        <TabsContent value="templates"><PlaceholderTab title="Word-Vorlagen" hint="Upload .docx → Platzhalter werden automatisch erkannt." /></TabsContent>
        <TabsContent value="settings"><PlaceholderTab title="Firmendaten" hint="Adresse, USt-IdNr., Bankverbindung, Nummernkreis-Muster, Mahngebühren." /></TabsContent>
      </Tabs>
    </div>
  );
}

function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="p-8 mt-4">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <p className="text-xs text-muted-foreground mt-4">
        Backend (DB, Storage, Edge Functions) ist eingerichtet. Diese Ansicht wird in der nächsten Iteration ausgebaut.
      </p>
    </Card>
  );
}
