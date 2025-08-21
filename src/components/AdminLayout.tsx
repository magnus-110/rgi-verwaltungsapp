import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AdminSidebar } from "./AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ManagementModeProvider, useManagementMode } from "@/hooks/useManagementMode";

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

  if (profile?.force_password_change) {
    return <Navigate to="/change-password" replace />;
  }

  if (profile?.role !== 'admin') {
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
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar 
          managementMode={managementMode} 
          onModeChange={setManagementMode} 
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b bg-background flex items-center px-4 shrink-0">
            <SidebarTrigger className="mr-4" />
            <h1 className="heading-primary text-xl font-semibold">
              {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
            </h1>
          </header>
          <div className="flex-1 p-6 bg-muted/30 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <ManagementModeProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ManagementModeProvider>
  );
};