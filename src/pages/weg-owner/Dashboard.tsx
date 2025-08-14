import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Plus, 
  Bot, 
  Building2, 
  MessageSquare,
  Phone,
  Mail,
  Clock,
  AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      // Fetch reports
      const { data: reportsData, error: reportsError } = await supabase
        .from("weg_reports")
        .select("*")
        .eq("reported_by", profile?.user_id)
        .order("created_at", { ascending: false });

      if (reportsError) throw reportsError;
      setReports(reportsData || []);

      // Fetch building assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select("id, building_id, created_at")
        .eq("user_id", profile?.user_id);

      if (assignmentsError) throw assignmentsError;

      if (assignments && assignments.length > 0) {
        const buildingIds = assignments.map(a => a.building_id);
        const { data: buildingsData, error: buildingsError } = await supabase
          .from("buildings")
          .select("id, name, address, building_code")
          .in("id", buildingIds);

        if (buildingsError) throw buildingsError;
        
        const combinedData = assignments.map(assignment => {
          const building = buildingsData?.find(b => b.id === assignment.building_id);
          return {
            ...assignment,
            building
          };
        });
        
        setBuildings(combinedData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const inProgressReports = reports.filter(r => r.status === "in_progress").length;

  const currentDate = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Section */}
      <div className="bg-background border-b border-border pb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-foreground">
            Willkommen zurück!
          </h1>
          <div className="text-right text-sm text-muted-foreground">
            <div>Heute</div>
            <div className="font-medium">{currentDate}</div>
          </div>
        </div>
        
        {buildings.length > 0 && (
          <div className="text-muted-foreground">
            {buildings.map((building, index) => (
              <div key={building.id}>
                {building.building?.name}
                {index < buildings.length - 1 && ', '}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Offen Card */}
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-red-600 mb-1">Offen</div>
                <div className="text-3xl font-bold text-red-700">{openReports}</div>
                <div className="text-sm text-red-600">Warten auf Bearbeitung</div>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        {/* In Bearbeitung Card */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-600 mb-1">In Bearbeitung</div>
                <div className="text-3xl font-bold text-blue-700">{inProgressReports}</div>
                <div className="text-sm text-blue-600">Wird bearbeitet</div>
              </div>
              <AlertTriangle className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schnellaktionen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                <span className="text-primary text-sm">⚡</span>
              </div>
              Schnellaktionen
            </CardTitle>
            <div className="text-sm text-muted-foreground">Häufig benötigte Funktionen</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate("/weg-owner/reports/new")}
            >
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <div className="text-left">
                <div className="font-medium">Problem melden</div>
                <div className="text-xs text-muted-foreground">Technische oder organisatorische Probleme melden</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate("/weg-owner/chatbot")}
            >
              <Bot className="w-5 h-5 text-blue-500" />
              <div className="text-left">
                <div className="font-medium">Frage stellen</div>
                <div className="text-xs text-muted-foreground">Allgemeine Fragen über den Chatbot</div>
              </div>
            </Button>
          </CardContent>
        </Card>

        {/* Wichtige Hinweise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Wichtige Hinweise
            </CardTitle>
            <div className="text-sm text-muted-foreground">Neueste Ankündigungen und Diskussionen für Ihr Gebäude</div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Laden...</div>
            ) : buildings.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Noch keine Beiträge vorhanden</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate("/weg-owner/settings")}
                >
                  Alle Ankündigungen anzeigen
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {buildings.slice(0, 3).map((building) => (
                  <div key={building.id} className="border-b border-border pb-3 last:border-b-0">
                    <div className="font-medium text-sm mb-1">
                      {building.building?.name || 'Unbekanntes Gebäude'}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {building.building?.address || 'Keine Adresse'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Code: {building.building?.building_code || 'N/A'}
                    </div>
                  </div>
                ))}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate("/weg-owner/settings")}
                >
                  Alle Ankündigungen anzeigen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Kontakt & Service */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            Kontakt & Service
          </CardTitle>
          <div className="text-sm text-muted-foreground">Wichtige Kontaktdaten für Notfälle und Anfragen</div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bürozeiten */}
            <div>
              <h4 className="font-medium mb-3 text-sm">Bürozeiten</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Mo-Fr: 09:00 - 17:00 Uhr
                </div>
                <div className="text-xs">Termine nach Vereinbarung</div>
              </div>
            </div>

            {/* Kontakt */}
            <div>
              <h4 className="font-medium mb-3 text-sm">Kontakt</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>08362340656</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span>info@rgi-immobilien.de</span>
                </div>
              </div>
            </div>

            {/* Notfall */}
            <div>
              <h4 className="font-medium mb-3 text-sm">Notfall</h4>
              <div className="space-y-2">
                <Button 
                  size="sm" 
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                  onClick={() => navigate("/weg-owner/chatbot")}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Schreiben Sie in den Chat Notfall
                </Button>
                <div className="text-xs text-muted-foreground">
                  Wasserschäden, Heizungsausfall
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};