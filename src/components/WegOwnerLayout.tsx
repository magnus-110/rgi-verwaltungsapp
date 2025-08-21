import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TopNavigation } from "./TopNavigation";
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
    <div className="min-h-screen bg-background">
      <MobileHeader userRole="weg_owner" />
      <div className="hidden md:block">
        <TopNavigation userRole="weg_owner" />
      </div>
      <main className="pt-16 md:pt-6 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
};