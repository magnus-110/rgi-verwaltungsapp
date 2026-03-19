import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { BuildingList } from "@/components/buildings/BuildingList";
import { BuildingDashboard } from "@/components/buildings/BuildingDashboard";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Building2 } from "lucide-react";

export const Buildings = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(id || null);

  useEffect(() => {
    if (id) setSelectedBuildingId(id);
  }, [id]);

  const handleSelectBuilding = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    navigate(`/buildings/${buildingId}`, { replace: true });
  };

  const handleBack = () => {
    setSelectedBuildingId(null);
    navigate('/buildings', { replace: true });
  };

  // Mobile: show either list or dashboard
  if (isMobile) {
    if (selectedBuildingId) {
      return (
        <div className="h-[calc(100vh-4rem)]">
          <BuildingDashboard buildingId={selectedBuildingId} onBack={handleBack} />
        </div>
      );
    }
    return (
      <div className="h-[calc(100vh-4rem)]">
        <BuildingList selectedBuildingId={selectedBuildingId} onSelectBuilding={handleSelectBuilding} />
      </div>
    );
  }

  // Desktop: resizable split layout
  return (
    <div className="h-[calc(100vh-4rem)]">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
          <BuildingList selectedBuildingId={selectedBuildingId} onSelectBuilding={handleSelectBuilding} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75}>
          {selectedBuildingId ? (
            <BuildingDashboard buildingId={selectedBuildingId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="p-4 bg-muted rounded-2xl mb-4">
                <Building2 className="h-12 w-12" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Gebäude auswählen</h2>
              <p className="text-sm">Wählen Sie ein Gebäude aus der Liste, um Details anzuzeigen.</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
