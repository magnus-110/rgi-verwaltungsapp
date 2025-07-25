import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle, Plus } from "lucide-react";

const reportsMockData = [
  {
    id: 1,
    title: "Heizungsausfall Gebäude A",
    description: "Kompletter Heizungsausfall in der Wohnanlage Musterstraße 123",
    status: "open",
    priority: "high",
    building: "Musterstraße 123",
    reporter: "Hans Müller",
    created: "2024-01-24 09:15",
  },
  {
    id: 2,
    title: "Wasserschaden im Keller",
    description: "Wasserrohrbruch im Kellergeschoss, Notfallreparatur erforderlich",
    status: "in_progress",
    priority: "critical",
    building: "Gartenweg 45",
    reporter: "Maria Schmidt",
    created: "2024-01-23 16:45",
  },
  {
    id: 3,
    title: "Aufzug Wartung überfällig",
    description: "Regelmäßige Wartung des Aufzugs ist überfällig",
    status: "resolved",
    priority: "medium",
    building: "Parkstraße 67",
    reporter: "System",
    created: "2024-01-22 10:30",
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "open":
      return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Offen</Badge>;
    case "in_progress":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />In Bearbeitung</Badge>;
    case "resolved":
      return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Erledigt</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "critical":
      return <Badge className="bg-red-500 text-white">Kritisch</Badge>;
    case "high":
      return <Badge className="bg-orange-500 text-white">Hoch</Badge>;
    case "medium":
      return <Badge className="bg-yellow-500 text-black">Mittel</Badge>;
    case "low":
      return <Badge className="bg-green-500 text-white">Niedrig</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export const Reports = () => {
  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Meldungen</h2>
            <p className="text-muted-foreground">
              Verwalten Sie alle eingegangenen Meldungen
            </p>
          </div>
          <Button className="bg-gradient-primary hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Neue Meldung
          </Button>
        </div>

        {/* Statistiken */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">23</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">8</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In Bearbeitung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">7</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Erledigt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">8</div>
            </CardContent>
          </Card>
        </div>

        {/* Meldungen Liste */}
        <div className="space-y-4">
          {reportsMockData.map((report) => (
            <Card key={report.id} className="hover:shadow-elegant transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{report.title}</CardTitle>
                    <CardDescription>{report.description}</CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    {getStatusBadge(report.status)}
                    {getPriorityBadge(report.priority)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium">Gebäude</p>
                    <p className="text-sm text-muted-foreground">{report.building}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Gemeldet von</p>
                    <p className="text-sm text-muted-foreground">{report.reporter}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Erstellt</p>
                    <p className="text-sm text-muted-foreground">{report.created}</p>
                  </div>
                </div>
                <div className="flex space-x-2 mt-4">
                  <Button variant="outline" size="sm">Details</Button>
                  <Button variant="outline" size="sm">Bearbeiten</Button>
                  {report.status === "open" && (
                    <Button size="sm" className="bg-gradient-primary hover:opacity-90">
                      Bearbeitung starten
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
    </div>
  );
};