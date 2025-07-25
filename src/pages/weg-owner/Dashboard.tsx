import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, MessageSquare, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();

  const stats = [
    { title: "Meine Meldungen", value: "3", icon: AlertCircle, color: "text-yellow-600" },
    { title: "Offene Tickets", value: "1", icon: MessageSquare, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => navigate("/weg-owner/reports/new")} className="gap-2">
          <Plus className="w-4 h-4" />
          Neue Meldung
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Schnellzugriff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3"
              onClick={() => navigate("/weg-owner/reports/new")}
            >
              <Plus className="w-4 h-4" />
              Neue Meldung erstellen
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3"
              onClick={() => navigate("/weg-owner/chatbot")}
            >
              <Bot className="w-4 h-4" />
              KI-Assistent starten
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Letzte Aktivitäten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Meldung #123 wurde bearbeitet</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Neue Antwort auf Meldung #122</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Meldung #121 wurde erstellt</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hinweise für WEG-Eigentümer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              • Für spezifische Gebäudeinformationen nutzen Sie den KI-Chatbot mit Ihrer Gebäude-ID
            </p>
            <p>
              • Meldungen werden direkt an die Verwaltung weitergeleitet
            </p>
            <p>
              • Bei dringenden Angelegenheiten kontaktieren Sie die Hausverwaltung direkt
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};