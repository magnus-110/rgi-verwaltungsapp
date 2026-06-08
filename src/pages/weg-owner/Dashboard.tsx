import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, MessageSquare, MessageCircle, FileText, Users, Scale, Phone, Mail, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";
import { OwnerAnnualCycleWidget } from "@/components/dashboard/OwnerAnnualCycleWidget";
import { EmergencyContactsWidget } from "@/components/forum/EmergencyContactsWidget";
import { PROPERTY_MANAGER_FALLBACK } from "@/lib/emergencyContactInfo";

interface Building { id: string; name: string; address: string | null }

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [openReports, setOpenReports] = useState(0);
  const [openResolutions, setOpenResolutions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.user_id) return;
    const load = async () => {
      try {
        const { data: assignments } = await supabase
          .from("weg_owner_buildings")
          .select("building_id")
          .eq("user_id", profile.user_id);
        const bIds = (assignments || []).map((a: any) => a.building_id as string);

        let bs: Building[] = [];
        if (bIds.length) {
          const { data: bData } = await supabase
            .from("buildings")
            .select("id, name, address")
            .in("id", bIds);
          bs = (bData || []) as Building[];
        }
        setBuildings(bs);

        const { data: reports } = await supabase
          .from("weg_reports")
          .select("id", { count: "exact", head: false })
          .eq("reported_by", profile.user_id)
          .eq("status", "open");
        setOpenReports(reports?.length || 0);

        if (bIds.length) {
          const { data: res } = await supabase
            .from("etv_resolutions")
            .select("id")
            .in("building_id", bIds)
            .eq("is_actionable", true)
            .eq("published", true)
            .neq("actionable_status", "completed");
          setOpenResolutions(res?.length || 0);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.user_id]);

  const buildingIds = buildings.map((b) => b.id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Laden...</div>
      </div>
    );
  }

  const actions = [
    ...(hasVisibleFiles ? [{ icon: FileText, label: "Dokumente", path: "/weg-owner/files" }] : []),
    { icon: MessageCircle, label: "Chat", path: "/weg-owner/chatbot" },
    { icon: MessageSquare, label: "Schwarzes Brett", path: "/weg-owner/forum" },
    { icon: Users, label: "Versammlungen", path: "/weg-owner/meetings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div className="text-center space-y-2 pt-2">
          <h1 className="text-3xl md:text-4xl font-light text-foreground">
            Willkommen zurück, {profile?.first_name}
          </h1>
          {buildings.length > 0 && (
            <div className="text-base text-muted-foreground">
              {buildings.map((b) => b.name).join(", ")}
            </div>
          )}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/weg-owner/reports")}
            className="text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className={`h-5 w-5 ${openReports > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
              <span className={`text-3xl font-bold tabular-nums ${openReports > 0 ? "text-orange-600" : "text-foreground"}`}>{openReports}</span>
            </div>
            <div className="text-xs font-medium text-muted-foreground">Offene Meldungen</div>
          </button>
          <button
            onClick={() => navigate("/weg-owner/resolutions")}
            className="text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <Scale className={`h-5 w-5 ${openResolutions > 0 ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-3xl font-bold tabular-nums ${openResolutions > 0 ? "text-primary" : "text-foreground"}`}>{openResolutions}</span>
            </div>
            <div className="text-xs font-medium text-muted-foreground">Offene Beschlüsse</div>
          </button>
        </div>

        {/* Annual cycle */}
        {buildings.length > 0 && <OwnerAnnualCycleWidget buildings={buildings} />}

        {/* Quick actions */}
        <div className={`grid gap-3 ${actions.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {actions.map((a) => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <a.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[11px] font-medium text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Contact & emergency */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Kontakt & Notfall</h3>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{PROPERTY_MANAGER_FALLBACK.name}</div>
                  <div className="text-xs text-muted-foreground">Ihre Hausverwaltung</div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <a href={`tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <span className="tabular-nums">{PROPERTY_MANAGER_FALLBACK.phone}</span>
                </a>
                <a href={`mailto:${PROPERTY_MANAGER_FALLBACK.email}`} className="flex items-center gap-2 hover:text-primary transition-colors break-all">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <span>{PROPERTY_MANAGER_FALLBACK.email}</span>
                </a>
                <a href="https://maps.app.goo.gl/nnWb3Dz5Rid1xzzv7" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary transition-colors">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Vilstalstr. 4, 87459 Pfronten</span>
                </a>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-2">
                Tel. erreichbar: 10:00–15:00 Uhr · Termine nach Vereinbarung
              </p>
            </CardContent>
          </Card>

          {buildingIds.length > 0 && <EmergencyContactsWidget buildingIds={buildingIds} />}
        </div>
      </div>
    </div>
  );
};
