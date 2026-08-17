import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AdminSidebar } from "./AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ManagementModeProvider, useManagementMode } from "@/hooks/useManagementMode";
import { MobileHeader } from "./MobileHeader";
import { UploadProvider } from "@/contexts/UploadContext";
import { UploadProgressWidget } from "./documents/UploadProgressWidget";
import { ErrorBoundary } from "./ErrorBoundary";
import { DmsJobsProvider } from "@/contexts/DmsJobsProvider";
import { DmsJobsTray } from "./finance/DmsJobsTray";
import { PasskeyPromptDialog } from "./PasskeyPromptDialog";
import { RequireMfa } from "./RequireMfa";
import { BrokerModeProvider } from "@/hooks/useBrokerMode";
import { BackendHealthProvider } from "@/hooks/useBackendHealth";
import { BackendStatusBanner } from "@/components/system/BackendStatusBanner";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayoutContent = ({ children }: AdminLayoutProps) => {
  const { user, profile, loading } = useAuth();
  const { managementMode, setManagementMode } = useManagementMode();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Profil wird geladen...</div>
      </div>
    );
  }


  if (profile?.role !== 'admin' && profile?.role !== 'employee') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-sans font-semibold mb-2">Zugriff verweigert</h1>
          <p className="body-secondary">Sie haben keine Berechtigung für diesen Bereich.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden">
        <MobileHeader 
          userRole="admin" 
          managementMode={managementMode}
          onModeChange={setManagementMode}
        />
      </div>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background pt-16 lg:pt-0 overflow-x-hidden" style={{ paddingTop: 'max(4rem, env(safe-area-inset-top))' }}>
          <AdminSidebar 
            managementMode={managementMode} 
            onModeChange={setManagementMode} 
          />
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <header className="h-16 border-b bg-background flex items-center px-4 shrink-0 hidden lg:flex">
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <BackendStatusBanner />
            <header className="h-16 border-b bg-background flex items-center px-4 shrink-0 hidden lg:flex">
              <SidebarTrigger className="mr-4" />
              <h1 className="heading-primary text-xl font-semibold truncate">
                {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
              </h1>
              <div className="ml-auto flex items-center" />
            </header>
            <div
              className="flex-1 px-3 py-3 lg:p-6 bg-muted/30 overflow-x-hidden overflow-y-auto min-w-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <div className="max-w-full min-w-0">
                <ErrorBoundary fallbackTitle="Diese Seite konnte nicht geladen werden">
                  <RequireMfa>{children}</RequireMfa>
                </ErrorBoundary>
              </div>
            </div>
          </main>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
      {profile?.user_id && (
        <PasskeyPromptDialog userId={profile.user_id} enabled={true} />
      )}
    </>
  );
};

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <UploadProvider>
      <DmsJobsProvider>
        <ManagementModeProvider>
          <BrokerModeProvider>
            <AdminLayoutContent>{children}</AdminLayoutContent>
            <UploadProgressWidget />
            <DmsJobsTray />
          </BrokerModeProvider>
        </ManagementModeProvider>
      </DmsJobsProvider>
    </UploadProvider>
  );
};