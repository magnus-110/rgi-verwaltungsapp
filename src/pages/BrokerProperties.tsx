import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrokerPropertyList } from "@/components/broker/BrokerPropertyList";
import { BrokerPropertyDashboard } from "@/components/broker/BrokerPropertyDashboard";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBrokerMode } from "@/hooks/useBrokerMode";
import { Navigate } from "react-router-dom";

export const BrokerProperties = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const { brokerMode } = useBrokerMode();
  const [selectedId, setSelectedId] = useState<string | null>(id || null);
  const [listCollapsed, setListCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("broker.listCollapsed") === "1"; } catch { return false; }
  });

  useEffect(() => { if (id) setSelectedId(id); }, [id]);
  useEffect(() => {
    try { localStorage.setItem("broker.listCollapsed", listCollapsed ? "1" : "0"); } catch {}
  }, [listCollapsed]);

  if (!profile?.broker_mode_enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSelect = (pid: string) => {
    setSelectedId(pid);
    navigate(`/makler/objekte/${pid}`, { replace: true });
  };
  const handleBack = () => {
    setSelectedId(null);
    navigate('/makler/objekte', { replace: true });
  };

  const effectiveMode = brokerMode ?? 'rent';

  if (isMobile) {
    if (selectedId) {
      return (
        <div className="h-[calc(100vh-4rem)]">
          <BrokerPropertyDashboard propertyId={selectedId} onBack={handleBack} />
        </div>
      );
    }
    return (
      <div className="h-[calc(100vh-4rem)]">
        <BrokerPropertyList listingType={effectiveMode} selectedId={selectedId} onSelect={handleSelect} />
      </div>
    );
  }

  if (listCollapsed) {
    return (
      <div className="h-[calc(100vh-8rem)] flex">
        <div className="w-12 border-r border-border bg-card flex flex-col items-center py-3 gap-2 shrink-0">
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setListCollapsed(false)} title="Liste ausklappen">
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Home className="h-4 w-4 text-muted-foreground mt-1" />
        </div>
        <div className="flex-1 min-w-0 overflow-auto">
          {selectedId ? (
            <BrokerPropertyDashboard propertyId={selectedId} />
          ) : (
            <EmptyHint />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
          <div className="relative h-full">
            <BrokerPropertyList listingType={effectiveMode} selectedId={selectedId} onSelect={handleSelect} />
            <button
              onClick={() => setListCollapsed(true)}
              title="Liste einklappen"
              className="absolute top-3 right-0 z-20 h-8 w-4 flex items-center justify-center rounded-l-md bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100 transition"
            >
              <PanelLeftClose className="h-3 w-3" />
            </button>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75}>
          {selectedId ? <BrokerPropertyDashboard propertyId={selectedId} /> : <EmptyHint />}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

const EmptyHint = () => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
    <div className="p-4 bg-muted rounded-2xl mb-4">
      <Home className="h-12 w-12" />
    </div>
    <h2 className="text-xl font-semibold text-foreground mb-1">Objekt auswählen</h2>
    <p className="text-sm">Wählen Sie ein Objekt aus der Liste oder legen Sie ein neues an.</p>
  </div>
);
