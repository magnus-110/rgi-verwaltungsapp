import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, MessageSquare, Bot, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchReports();
    }
  }, [profile]);

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("weg_reports")
        .select("*")
        .eq("reported_by", profile?.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const totalReports = reports.length;

  const stats = [
    { title: "Meine Meldungen", value: totalReports.toString(), icon: AlertCircle, color: "text-yellow-600" },
    { title: "Offene Tickets", value: openReports.toString(), icon: MessageSquare, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            Willkommen, {profile?.first_name || 'WEG-Eigentümer'}!
          </h1>
          <Button onClick={() => navigate("/weg-owner/reports/new")} className="gap-2">
            <Plus className="w-4 h-4" />
            Neue Meldung
          </Button>
        </div>
        <p className="text-lg text-muted-foreground">
          Hier finden Sie eine Übersicht über Ihre Meldungen und Aktivitäten.
        </p>
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
            <CardTitle>Letzte Meldungen</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">Laden...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                Noch keine Meldungen erstellt.
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {reports.slice(0, 3).map((report) => (
                  <div key={report.id} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      report.status === 'open' ? 'bg-red-500' :
                      report.status === 'in_progress' ? 'bg-yellow-500' : 'bg-green-500'
                    }`}></div>
                    <span>{report.title}</span>
                    <span className="text-muted-foreground text-xs ml-auto">
                      {new Date(report.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                ))}
              </div>
            )}
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