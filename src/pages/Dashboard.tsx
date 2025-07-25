import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, MessageSquare, Building2, Users, Bot, TrendingUp } from "lucide-react";

const DashboardWidget = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string; 
  description: string; 
  icon: any; 
  trend?: string;
}) => (
  <Card className="hover:shadow-elegant transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-primary">{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {trend && (
        <div className="flex items-center pt-1">
          <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
          <span className="text-xs text-green-500">{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Überblick über Ihre Verwaltungsaktivitäten
          </p>
        </div>

        {/* Statistik Widgets */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DashboardWidget
            title="Offene Tickets"
            value="23"
            description="3 kritisch, 12 hoch, 8 normal"
            icon={AlertCircle}
            trend="+2 seit gestern"
          />
          <DashboardWidget
            title="Neue Meldungen"
            value="8"
            description="Heute eingegangen"
            icon={MessageSquare}
            trend="+12% zur Vorwoche"
          />
          <DashboardWidget
            title="Verwaltete Gebäude"
            value="45"
            description="32 WEG, 13 Mietgebäude"
            icon={Building2}
          />
          <DashboardWidget
            title="Aktive Nutzer"
            value="156"
            description="89 WEG-Eigentümer, 67 Mieter"
            icon={Users}
            trend="+5 neue diese Woche"
          />
        </div>

        {/* Hauptbereiche */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Aktuelle Meldungen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5" />
                Aktuelle Meldungen
              </CardTitle>
              <CardDescription>
                Die neuesten eingegangenen Meldungen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-medium">Heizungsausfall Gebäude A</h4>
                <p className="text-sm text-muted-foreground">Eingegangen heute, 09:15</p>
              </div>
              <div className="border-l-4 border-yellow-500 pl-4">
                <h4 className="font-medium">Wasserschaden Keller</h4>
                <p className="text-sm text-muted-foreground">Eingegangen gestern, 16:45</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-medium">Aufzug Wartung erforderlich</h4>
                <p className="text-sm text-muted-foreground">Eingegangen vor 2 Tagen</p>
              </div>
            </CardContent>
          </Card>

          {/* Forum Aktivitäten */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Forum Aktivitäten
              </CardTitle>
              <CardDescription>
                Neueste Diskussionen und Beiträge
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">Hausverwaltung Neuerungen 2024</h4>
                <p className="text-sm text-muted-foreground">15 Antworten • Letzter Beitrag vor 2 Stunden</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Energiekosten-Abrechnung</h4>
                <p className="text-sm text-muted-foreground">8 Antworten • Letzter Beitrag vor 5 Stunden</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Gemeinschaftsraum Buchung</h4>
                <p className="text-sm text-muted-foreground">3 Antworten • Letzter Beitrag gestern</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chatbot Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bot className="mr-2 h-5 w-5" />
              Chatbot Status
            </CardTitle>
            <CardDescription>
              Aktueller Status und Nutzungsstatistiken des AI-Assistenten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">Online</div>
                <p className="text-sm text-muted-foreground">System Status</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">247</div>
                <p className="text-sm text-muted-foreground">Anfragen heute</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">94%</div>
                <p className="text-sm text-muted-foreground">Erfolgsrate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};