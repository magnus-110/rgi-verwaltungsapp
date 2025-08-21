import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TopNavigation } from "./TopNavigation";

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

  // Tenants are not required to change password

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
    <div className="min-h-screen bg-background">
      <TopNavigation userRole="tenant" />
      <main className="pt-6 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
};