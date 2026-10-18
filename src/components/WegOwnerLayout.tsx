 import { useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
 import { FirstLoginWelcomeDialog } from "@/components/weg-owner/FirstLoginWelcomeDialog";
import { supabase } from "@/integrations/supabase/client";

import { BackendStatusBanner } from "@/components/system/BackendStatusBanner";
import { OnboardingFAB } from "@/components/onboarding/OnboardingFAB";
import { GuidedTourProvider } from "@/components/weg-owner/onboarding/GuidedTourProvider";
import { HelpButton } from "@/components/weg-owner/onboarding/HelpButton";
import { cn } from "@/lib/utils";
import { House, FileText, Wrench, Users, Menu } from "lucide-react";

interface WegOwnerLayoutProps {
  children: React.ReactNode;
}

export const WegOwnerLayout = ({ children }: WegOwnerLayoutProps) => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
 const [showTermsDialog, setShowTermsDialog] = useState(false);
 const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
 
  useEffect(() => {
    const checkTermsAcceptance = async () => {
      if (!profile?.user_id) return;
      const { hasAcceptedCurrentLegal } = await import("@/lib/legalAcceptance");
      const ok = await hasAcceptedCurrentLegal(profile.user_id);
      if (ok) {
        setTermsAccepted(true);
        setShowTermsDialog(false);
      } else {
        setTermsAccepted(false);
        setShowTermsDialog(true);
      }
    };
    checkTermsAcceptance();
  }, [profile?.user_id]);


  const handleTermsAccepted = () => {
    setTermsAccepted(true);
    setShowTermsDialog(false);
  };

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

  const p = location.pathname;
  // Unterseiten, die über „Mehr" erreichbar sind, markieren den Reiter „Mehr".
  const unterMehr = ["/weg-owner/mehr", "/weg-owner/chatbot", "/weg-owner/forum", "/weg-owner/resolutions",
    "/weg-owner/terminabfrage", "/weg-owner/umfrage", "/weg-owner/kassenpruefung", "/weg-owner/service-hub",
    "/weg-owner/settings", "/weg-owner/change-password"];
  const reiter = [
    { icon: House, label: "Start", path: "/weg-owner", active: p === "/weg-owner" || p === "/weg-owner/" },
    { icon: FileText, label: "Dokumente", path: "/weg-owner/files", active: p.startsWith("/weg-owner/files") },
    { icon: Wrench, label: "Meldungen", path: "/weg-owner/reports", active: p.startsWith("/weg-owner/reports"), hervor: true },
    { icon: Users, label: "Versammlung", path: "/weg-owner/meetings", active: p.startsWith("/weg-owner/meetings") },
    { icon: Menu, label: "Mehr", path: "/weg-owner/mehr", active: unterMehr.some((u) => p.startsWith(u)) },
  ];
  const imChat = p.startsWith("/weg-owner/chatbot");

  return (
    <GuidedTourProvider>
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border shadow-sm fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-center h-16 px-4">
          <div className="flex items-center">
            <img 
              data-tour="logo"
              src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
              alt="RGI Immobilien Logo" 
              className="h-12 w-auto object-contain cursor-pointer"
              onClick={() => navigate('/weg-owner')}
            />
          </div>

        </div>
      </header>
      
      <main className="pt-16 pb-28">
        <BackendStatusBanner />
        {children}
      </main>

      <nav
        data-tour="menu-button"
        aria-label="Hauptmenü"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-xl mx-auto flex items-start justify-around h-[72px] pt-2">
          {reiter.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => navigate(r.path)}
              aria-current={r.active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-start gap-1 min-w-[64px] min-h-[52px] text-[11px] font-medium transition-colors",
                r.active ? "text-[#B35500] font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.hervor ? (
                <span className="-mt-6 h-14 w-14 rounded-full bg-[#B35500] text-white flex items-center justify-center shadow-[0_6px_16px_rgba(179,85,0,0.35)] ring-4 ring-white">
                  <r.icon className="h-6 w-6" />
                </span>
              ) : (
                <r.icon className={cn("h-6 w-6", r.active && "text-primary")} strokeWidth={1.8} />
              )}
              {r.label}
            </button>
          ))}
        </div>
      </nav>
     
      {profile?.user_id && (
        <FirstLoginWelcomeDialog
          open={showTermsDialog}
          userId={profile.user_id}
          onClose={handleTermsAccepted}
        />
      )}
      
      {/* Onboarding-Wizard erst zeigen, wenn AGB akzeptiert wurden */}
      {termsAccepted === true && !imChat && <OnboardingFAB />}
      {/* Geführte Hilfe-Tour, jederzeit über den Hilfe-Knopf */}
      {termsAccepted === true && !imChat && <HelpButton />}
    </div>
    </GuidedTourProvider>
  );
};