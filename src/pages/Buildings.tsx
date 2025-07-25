import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Users, Plus, Edit, Eye } from "lucide-react";

const buildingsMockData = [
  {
    id: 1,
    name: "Wohnanlage Musterstraße",
    address: "Musterstraße 123, 12345 Berlin",
    type: "weg",
    units: 24,
    tenants: 48,
    status: "active",
    manager: "Hans Müller",
  },
  {
    id: 2,
    name: "Apartmenthaus Gartenweg",
    address: "Gartenweg 45, 12345 Berlin",
    type: "rent",
    units: 16,
    tenants: 23,
    status: "active",
    manager: "Maria Schmidt",
  },
  {
    id: 3,
    name: "Bürogebäude Parkstraße",
    address: "Parkstraße 67, 12345 Berlin",
    type: "weg",
    units: 8,
    tenants: 12,
    status: "maintenance",
    manager: "Klaus Weber",
  },
];

const getTypeBadge = (type: string) => {
  switch (type) {
    case "weg":
      return <Badge className="bg-blue-500 text-white">WEG</Badge>;
    case "rent":
      return <Badge className="bg-green-500 text-white">Miete</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return <Badge variant="default">Aktiv</Badge>;
    case "maintenance":
      return <Badge variant="secondary">Wartung</Badge>;
    case "inactive":
      return <Badge variant="destructive">Inaktiv</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const Buildings = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Gebäude</h2>
            <p className="text-muted-foreground">
              Übersicht aller verwalteten Gebäude und Immobilien
            </p>
          </div>
          <Button className="bg-gradient-primary hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Neues Gebäude
          </Button>
        </div>

        {/* Statistiken */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Gebäude</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">45</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">WEG-Gebäude</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">32</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Mietgebäude</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">13</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamteinheiten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">287</div>
            </CardContent>
          </Card>
        </div>

        {/* Gebäude-Liste */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {buildingsMockData.map((building) => (
            <Card key={building.id} className="hover:shadow-elegant transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center">
                      <Building2 className="mr-2 h-5 w-5 text-primary" />
                      {building.name}
                    </CardTitle>
                    <CardDescription className="flex items-center">
                      <MapPin className="mr-1 h-4 w-4" />
                      {building.address}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col space-y-1">
                    {getTypeBadge(building.type)}
                    {getStatusBadge(building.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{building.units}</div>
                    <p className="text-xs text-muted-foreground">Einheiten</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{building.tenants}</div>
                    <p className="text-xs text-muted-foreground">Bewohner</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium">Verwalter</p>
                  <p className="text-sm text-muted-foreground">{building.manager}</p>
                </div>

                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Eye className="mr-1 h-3 w-3" />
                    Details
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Edit className="mr-1 h-3 w-3" />
                    Bearbeiten
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};