import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { WegOwnerSidebar } from "./WegOwnerSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MobileHeader } from "./MobileHeader";

interface WegOwnerLayoutProps {
  children: React.ReactNode;
}

export const WegOwnerLayout = ({ children }: WegOwnerLayoutProps) => {
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

  // WEG owners are not required to change password

  if (profile?.role !== 'weg_owner') {
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
    <>
      <div className="md:hidden">
        <MobileHeader userRole="weg_owner" />
      </div>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background pt-16 md:pt-0">
          <WegOwnerSidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            <header className="h-16 border-b bg-background flex items-center px-4 shrink-0 hidden md:flex">
              <SidebarTrigger className="mr-4" />
              <img 
                src="/lovable-uploads/2f4fde3b-f4b0-4829-9fcb-a148e37bae43.png" 
                alt="RGI Logo"
                className="w-8 h-8"
              />
            </header>
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
};