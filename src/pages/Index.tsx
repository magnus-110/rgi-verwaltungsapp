import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, profile, loading } = useAuth();

  

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  // If we have a user but no profile, show loading while profile loads
  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Profil wird geladen...</div>
      </div>
    );
  }

  if (user && profile) {
    
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (profile.role === 'employee') {
      return <Navigate to="/admin" replace />;
    } else if (profile.role === 'weg_owner') {
      let ziel = "/weg-owner";
      try {
        const w = sessionStorage.getItem("rgi_weiter");
        if (w && w.startsWith("/weg-owner")) ziel = w;
        sessionStorage.removeItem("rgi_weiter");
      } catch {
        // egal
      }
      return <Navigate to={ziel} replace />;
    } else if (profile.role === 'tenant') {
      return <Navigate to="/tenant" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  
  return <Navigate to="/login" replace />;
};

export default Index;
