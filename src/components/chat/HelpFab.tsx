import { useState, useEffect } from "react";
import { HelpCircle, X, Home, MessageCircle, Phone, Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
}

interface HelpFabProps {
  userType: "tenant" | "weg_owner";
  selectedBuildingId?: string;
  onBuildingChange?: (buildingId: string) => void;
  userName?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export const HelpFab = ({ userType, selectedBuildingId, onBuildingChange, userName, isOpen = false, setIsOpen }: HelpFabProps) => {
  const { profile } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);

  useEffect(() => {
    if (userType === "weg_owner" && profile?.user_id && isOpen) {
      fetchWegOwnerBuildings();
    }
  }, [userType, profile?.user_id, isOpen]);

  const fetchWegOwnerBuildings = async () => {
    try {
      // First get building assignments for WEG owner
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select("building_id")
        .eq("user_id", profile?.user_id);

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) {
        setBuildings([]);
        return;
      }

      const buildingIds = assignments.map(a => a.building_id);

      // Then get building details
      const { data: buildingsData, error: buildingsError } = await supabase
        .from("buildings")
        .select("id, name, address, building_code")
        .in("id", buildingIds);

      if (buildingsError) throw buildingsError;

      setBuildings(buildingsData || []);
    } catch (error) {
      console.error("Error fetching WEG owner buildings:", error);
      setBuildings([]);
    }
  };

  const tips = [
    {
      icon: <MessageCircle className="w-4 h-4" />,
      title: "Allgemeines",
      description: "Stellen Sie allgemeine Fragen rund um unsere Immobilienverwaltung – auch bei Problemen oder wenn Sie sonst niemanden erreichen."
    },
    {
      icon: <FileText className="w-4 h-4" />,
      title: "Verträge",
      description: "Erhalten Sie Auskünfte zu allgemeinen Vertragsinhalten."
    },
    {
      icon: <Home className="w-4 h-4" />,
      title: "Datenschutz",
      description: "Formulieren Sie Ihre Anfragen ohne vertrauliche Angaben."
    }
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => setIsOpen && setIsOpen(false)}
      />
      
      {/* Help Panel */}
      <Card className="relative w-80 max-h-[80vh] overflow-y-auto shadow-xl border-border/50 animate-in slide-in-from-bottom-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src="/lovable-uploads/b9771424-b209-4762-aff0-6832ee6c96c7.png" 
                alt="RGI Haus"
                className="w-6 h-6"
              />
              <CardTitle className="text-lg">
                Hilfe & Tipps
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen && setIsOpen(false)}
              className="w-8 h-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          {userName && (
            <p className="text-sm text-muted-foreground">
              Hallo {userName}! Hier finden Sie nützliche Tipps.
            </p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Tips */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Tipps für Sie</h4>
            {tips.map((tip, index) => (
              <div 
                key={index}
                className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-primary/10 flex items-center justify-center text-primary">
                  {tip.icon}
                </div>
                <div className="space-y-1">
                  <h5 className="text-sm font-medium text-foreground">
                    {tip.title}
                  </h5>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tip.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Contact Info */}
          <div className="p-3 rounded-lg bg-gradient-primary/5 border border-primary/20">
            <h5 className="text-sm font-medium text-primary mb-2">
              RGI Immobilien Verwaltung
            </h5>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>📞 Tel: 08363 960656</p>
              <p>✉️ E-Mail: info@rgi-immobilien.de</p>
              <p>🕒 Mo-Fr: 8:00-17:00 Uhr</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};