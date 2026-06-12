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
  CheckCircle,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStammdatenName } from "@/hooks/useStammdatenName";
import { supabase } from "@/integrations/supabase/client";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  building_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  attachments: any;
  reported_by?: string;
  updated_at?: string;
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
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
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
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/tenant/reports")}
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

          {hasVisibleFiles && (
            <Button 
              variant="outline" 
              className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
              onClick={() => navigate("/tenant/files")}
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
          )}

          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/tenant/forum")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Schwarzes Brett</div>
                <div className="text-sm text-muted-foreground">Ankündigungen lesen</div>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full h-16 text-left justify-start border border-border/50 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
            onClick={() => navigate("/tenant/chatbot")}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Frage stellen</div>
                <div className="text-sm text-muted-foreground">RGI KI Assistentin</div>
              </div>
            </div>
          </Button>
        </div>

        {/* Contact */}
        <div className="mt-12 pt-8 border-t border-border">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-medium">Kontakt & Notfall</h3>
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 shrink-0" />
                  <a href="tel:+498363960656" className="hover:underline hover:text-foreground transition-colors">08363 960656</a>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0" />
                  <a href="mailto:info@rgi-immobilien.de" className="hover:underline hover:text-foreground transition-colors truncate">info@rgi-immobilien.de</a>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <a href="https://maps.app.goo.gl/nnWb3Dz5Rid1xzzv7" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-foreground transition-colors">Vilstalstr. 4, 87459 Pfronten</a>
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