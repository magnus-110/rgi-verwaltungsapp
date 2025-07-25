import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TenantSidebar } from "./TenantSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface TenantLayoutProps {
  children: React.ReactNode;
}

export const TenantLayout = ({ children }: TenantLayoutProps) => {
  const { user, profile, loading } = useAuth();

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

  if (profile?.role !== 'tenant') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Zugriff verweigert</h1>
          <p className="text-muted-foreground">Sie haben keine Berechtigung für diesen Bereich.</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <TenantSidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b bg-background flex items-center px-4 shrink-0">
            <SidebarTrigger className="mr-4" />
            <h1 className="text-xl font-semibold">Mieter Portal</h1>
          </header>
          <div className="flex-1 p-6 bg-muted/30 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};