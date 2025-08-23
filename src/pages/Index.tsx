
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, profile, loading } = useAuth();

  console.log('Index - loading:', loading, 'user:', !!user, 'profile:', !!profile);

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
    console.log('Redirecting user with role:', profile.role);
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (profile.role === 'weg_owner') {
      return <Navigate to="/weg-owner" replace />;
    } else if (profile.role === 'tenant') {
      return <Navigate to="/tenant" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  console.log('No user found, redirecting to login');
  return <Navigate to="/login" replace />;
};

export default Index;
