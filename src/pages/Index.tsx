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

  if (user && profile) {
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (profile.role === 'weg_owner') {
      return <Navigate to="/weg-owner" replace />;
    } else if (profile.role === 'tenant') {
      return <Navigate to="/tenant" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/login" replace />;
};

export default Index;
