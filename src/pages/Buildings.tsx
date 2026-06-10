import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { BuildingList } from "@/components/buildings/BuildingList";
import { BuildingDashboard } from "@/components/buildings/BuildingDashboard";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Building2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Buildings = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(id || null);
  const [listCollapsed, setListCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("buildings.listCollapsed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (id) setSelectedBuildingId(id);
  }, [id]);

  useEffect(() => {
    try { localStorage.setItem("buildings.listCollapsed", listCollapsed ? "1" : "0"); } catch {}
  }, [listCollapsed]);

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

  // Desktop: collapsed list → narrow strip with expand button
  if (listCollapsed) {
    return (
      <div className="h-[calc(100vh-8rem)] flex">
        <div className="w-12 border-r border-border bg-card flex flex-col items-center py-3 gap-2 shrink-0">
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9"
            onClick={() => setListCollapsed(false)}
            title="Gebäudeliste ausklappen"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
        </div>
        <div className="flex-1 min-w-0 overflow-auto">
          {selectedBuildingId ? (
            <BuildingDashboard buildingId={selectedBuildingId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="p-4 bg-muted rounded-2xl mb-4">
                <Building2 className="h-12 w-12" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Gebäude auswählen</h2>
              <p className="text-sm">Klappen Sie die Liste links aus, um ein Gebäude zu wählen.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: resizable split layout
  return (
    <div className="h-[calc(100vh-8rem)]">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
          <div className="relative h-full">
            <Button
              size="sm"
              variant="outline"
              className="absolute top-3 right-14 h-8 gap-1 z-20 shadow-sm"
              onClick={() => setListCollapsed(true)}
              title="Gebäudeliste einklappen"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            <BuildingList selectedBuildingId={selectedBuildingId} onSelectBuilding={handleSelectBuilding} />
          </div>
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
