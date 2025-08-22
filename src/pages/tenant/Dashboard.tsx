import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Plus, 
  MessageCircle, 
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
          
          {tenantInfo && (
            <p className="text-lg text-muted-foreground">
              {tenantInfo.buildings ? 
                `${tenantInfo.buildings.name}` : 
                'Ihr Dashboard'}
            </p>
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
            className="w-full h-16 text-left justify-start border-0 bg-white shadow-sm hover:shadow-md transition-all duration-200"
            onClick={() => navigate("/tenant/reports")}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="font-medium">Problem melden</div>
                <div className="text-sm text-muted-foreground">Meldung erstellen oder verwalten</div>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border-0 bg-white shadow-sm hover:shadow-md transition-all duration-200"
            onClick={() => navigate("/tenant/forum")}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="font-medium">Schwarzes Brett</div>
                <div className="text-sm text-muted-foreground">Ankündigungen lesen</div>
              </div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border-0 bg-white shadow-sm hover:shadow-md transition-all duration-200"
            onClick={() => navigate("/tenant/chatbot")}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium">Frage stellen</div>
                <div className="text-sm text-muted-foreground">RGI KI Assistent</div>
              </div>
            </div>
          </Button>
        </div>

        {/* Contact */}
        <div className="mt-12 pt-8 border-t border-border">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-medium">Kontakt & Notfall</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>08363 960656</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>info@rgi-immobilien.de</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <div>Mo-Fr: 09:00 - 17:00 Uhr</div>
                <div>Termine nach Vereinbarung</div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};