import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Plus, 
  MessageCircle, 
  Building2, 
  Phone,
  Mail,
  Clock,
  AlertCircle,
  MessageSquare,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground animate-fade-in">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Welcome Section */}
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl font-light text-foreground">
            Willkommen zurück, {profile?.first_name}
          </h1>
          
          {buildings.length > 0 && (
            <div className="text-lg text-muted-foreground space-y-1">
              {buildings.map((building, index) => (
                <p key={building.id}>
                  {building.building?.name || 'Unbekanntes Gebäude'}
                  {index < buildings.length - 1 && buildings.length > 1 ? ', ' : ''}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        {openReports > 0 && (
          <Card className="border-0 shadow-sm bg-red-50 border-red-100">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <div className="text-2xl font-semibold text-red-700 mb-1">{openReports}</div>
              <div className="text-red-600">offene Meldungen</div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/weg-owner/reports")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <AlertTriangle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Problem melden</div>
                <div className="text-sm text-muted-foreground">Meldung erstellen oder verwalten</div>
              </div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/weg-owner/forum")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Schwarzes Brett</div>
                <div className="text-sm text-muted-foreground">Nachrichten und Ankündigungen</div>
              </div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/weg-owner/files")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Meine Dokumente</div>
                <div className="text-sm text-muted-foreground">Dokumente einsehen</div>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/weg-owner/chatbot")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Frage stellen</div>
                <div className="text-sm text-muted-foreground">RGI KI Assistent</div>
              </div>
            </div>
          </Button>
        </div>

        {/* Buildings */}
        {buildings.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-center">Ihre Gebäude</h3>
            <div className="space-y-3">
              {buildings.map((building) => (
                <Card key={building.id} className="border-0 shadow-sm bg-white">
                  <CardContent className="p-4">
                    <div className="text-sm font-medium">
                      {building.building?.name || 'Unbekanntes Gebäude'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {building.building?.address || 'Keine Adresse'}
                    </div>
                    {building.building?.building_code && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Code: {building.building.building_code}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="mt-12 pt-8 border-t border-border">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-medium">Kontakt & Notfall</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-center gap-2">
                  <Phone className="w-4 h-4" />
                   <a href="tel:+498363960656" className="hover:underline hover:text-foreground transition-colors">08363 960656</a>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" />
                   <a href="mailto:info@rgi-immobilien.de" className="hover:underline hover:text-foreground transition-colors">info@rgi-immobilien.de</a>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <div>Tel. erreichbar: 10:00-15:00 Uhr</div>
                <div>Termine nach Vereinbarung</div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};