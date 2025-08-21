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
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
}

interface ForumPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export const TenantDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
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
        .from("miete_reports")
        .select("*")
        .eq("reported_by", profile?.user_id)
        .order("created_at", { ascending: false });

      if (reportsError) throw reportsError;
      setReports(reportsData || []);

      // Fetch forum posts
      const { data: forumData, error: forumError } = await supabase
        .from("forum_posts")
        .select("id, title, content, created_at")
        .eq("management_mode", "rent")
        .order("created_at", { ascending: false })
        .limit(5);

      if (forumError) throw forumError;
      setForumPosts(forumData || []);

      // Fetch tenant info
      await fetchTenantInfo();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantInfo = async () => {
    try {
      const profileWithBuilding = profile as any;
      
      if (profileWithBuilding?.building_id) {
        const { data: buildingData, error: buildingError } = await supabase
          .from("buildings")
          .select("id, name, address")
          .eq("id", profileWithBuilding.building_id)
          .maybeSingle();

        if (!buildingError && buildingData) {
          setTenantInfo({ buildings: buildingData });
          return;
        }
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("*, buildings(id, name, address)")
        .eq("user_id", profile?.user_id)
        .maybeSingle();

      if (!tenantError && tenantData) {
        setTenantInfo(tenantData);
      } else {
        setTenantInfo(null);
      }
    } catch (error) {
      console.error("Error fetching tenant info:", error);
      setTenantInfo(null);
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const resolvedReports = reports.filter(r => r.status === "resolved").length;

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
        
        {tenantInfo && (
          <div className="text-muted-foreground">
            {tenantInfo.buildings ? 
              `${tenantInfo.buildings.name} • ${tenantInfo.buildings.address}` : 
              'Gebäude wird geladen...'}
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

        {/* Erledigt Card */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-green-600 mb-1">Erledigt</div>
                <div className="text-3xl font-bold text-green-700">{resolvedReports}</div>
                <div className="text-sm text-green-600">Abgeschlossen</div>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
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
              onClick={() => navigate("/tenant/reports/new")}
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
              onClick={() => navigate("/tenant/chatbot")}
            >
              <Bot className="w-5 h-5 text-blue-500" />
              <div className="text-left">
                <div className="font-medium">Frage stellen</div>
                <div className="text-xs text-muted-foreground">Allgemeine Fragen über den Chatbot</div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 h-12"
              onClick={() => navigate("/tenant/forum")}
            >
              <MessageSquare className="w-5 h-5 text-green-500" />
              <div className="text-left">
                <div className="font-medium">Schwarzes Brett besuchen</div>
                <div className="text-xs text-muted-foreground">Diskussionen und Ankündigungen lesen</div>
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
            ) : forumPosts.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Noch keine Beiträge vorhanden</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate("/tenant/forum")}
                >
                  Alle Ankündigungen anzeigen
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {forumPosts.slice(0, 3).map((post) => (
                  <div key={post.id} className="border-b border-border pb-3 last:border-b-0">
                    <div className="font-medium text-sm mb-1">
                      {post.title}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {post.content}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                ))}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate("/tenant/forum")}
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
                  onClick={() => navigate("/tenant/chatbot")}
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