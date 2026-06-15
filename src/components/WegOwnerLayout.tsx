 import { useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
 import { TermsAcceptanceDialog } from "@/components/TermsAcceptanceDialog";
 import { IntroVideoDialog } from "@/components/IntroVideoDialog";
 import { PasskeyPromptDialog } from "@/components/PasskeyPromptDialog";
import { supabase } from "@/integrations/supabase/client";
import { VotingPopup } from "@/components/meetings/VotingPopup";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";
import { OnboardingFAB } from "@/components/onboarding/OnboardingFAB";
import { useOnboardingContext } from "@/components/onboarding/useOnboardingContext";
import { GuidedTourProvider } from "@/components/weg-owner/onboarding/GuidedTourProvider";
import { HelpButton } from "@/components/weg-owner/onboarding/HelpButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  House, 
  ClipboardList, 
  Sparkles, 
  Settings,
  LogOut,
  UserRound,
  Menu,
  MessageSquare,
  FolderOpen,
  Users,
  ClipboardCheck,
  Scale
} from "lucide-react";

interface WegOwnerLayoutProps {
  children: React.ReactNode;
}

export const WegOwnerLayout = ({ children }: WegOwnerLayoutProps) => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
  const [hasAudit, setHasAudit] = useState(false);
 const [showTermsDialog, setShowTermsDialog] = useState(false);
 const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
 
  useEffect(() => {
    const checkTermsAcceptance = async () => {
      if (!profile?.user_id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("terms_accepted_at")
        .eq("user_id", profile.user_id)
        .single();
      if (error || !data) return;

      if (data.terms_accepted_at) {
        setTermsAccepted(true);
        setShowTermsDialog(false);
        return;
      }

      // Wenn der Nutzer bereits einem Gebäude zugeordnet ist, gilt das als
      // bereits erfolgte Einwilligung (Onboarding). Stillschweigend markieren,
      // damit der Dialog nicht bei jedem Login erneut erscheint.
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (contact?.id) {
        const { count } = await supabase
          .from("contact_building_assignments")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id)
          .eq("is_active", true);
        if ((count ?? 0) > 0) {
          await supabase
            .from("profiles")
            .update({ terms_accepted_at: new Date().toISOString() })
            .eq("user_id", profile.user_id);
          setTermsAccepted(true);
          setShowTermsDialog(false);
          return;
        }
      }

      setTermsAccepted(false);
      setShowTermsDialog(true);
    };
    checkTermsAcceptance();
  }, [profile?.user_id]);

  // Check if user has active cash audit
  useEffect(() => {
    const checkAudit = async () => {
      if (!profile?.user_id) return;
      // First get contact IDs for this user
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", profile.user_id);
      if (!contacts || contacts.length === 0) return;
      
      const contactIds = contacts.map(c => c.id);
      const { data } = await supabase
        .from("cash_audits")
        .select("id")
        .in("auditor_contact_id", contactIds)
        .neq("status", "completed")
        .gt("visible_in_portal_until", new Date().toISOString())
        .limit(1);
      setHasAudit(!!(data && data.length > 0));
    };
    checkAudit();
  }, [profile?.user_id]);
 
 const handleTermsAccepted = () => {
   setTermsAccepted(true);
   setShowTermsDialog(false);
 };

 // Intro-Video erst NACH abgeschlossenem Onboarding-Wizard zeigen
 const onboarding = useOnboardingContext();
 const videoSeenKey = profile?.user_id ? `intro_video_seen_${profile.user_id}` : null;
 const [videoDismissed, setVideoDismissed] = useState(false);
 useEffect(() => {
   if (videoSeenKey && localStorage.getItem(videoSeenKey) === "1") {
     setVideoDismissed(true);
   }
 }, [videoSeenKey]);
 const onboardingDone =
   !onboarding.loading &&
   (!onboarding.isActive ||
     !!onboarding.progress?.fully_completed_at ||
     !!onboarding.progress?.step5_completed_at);
 const showIntroVideo =
   termsAccepted === true && onboardingDone && !videoDismissed;
 const dismissIntroVideo = () => {
   if (videoSeenKey) localStorage.setItem(videoSeenKey, "1");
   setVideoDismissed(true);
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

  const navigationItems = [
    { 
      icon: House, 
      label: "Dashboard", 
      path: '/weg-owner',
      active: location.pathname === '/weg-owner'
    },
    { 
      icon: ClipboardList, 
      label: "Meine Meldungen", 
      path: '/weg-owner/reports',
      active: location.pathname.startsWith('/weg-owner/reports')
    },
    ...(hasVisibleFiles ? [{ 
      icon: FolderOpen, 
      label: "Dokumente", 
      path: '/weg-owner/files',
      active: location.pathname.startsWith('/weg-owner/files')
    }] : []),
    ...(hasAudit ? [{
      icon: ClipboardCheck,
      label: "Kassenprüfung",
      path: '/weg-owner/kassenpruefung',
      active: location.pathname.startsWith('/weg-owner/kassenpruefung')
    }] : []),
    { 
      icon: Scale, 
      label: "Beschlüsse", 
      path: '/weg-owner/resolutions',
      active: location.pathname.startsWith('/weg-owner/resolutions')
    },
    { 
      icon: MessageSquare, 
      label: "Schwarzes Brett", 
      path: '/weg-owner/forum',
      active: location.pathname.startsWith('/weg-owner/forum')
    },
    { 
      icon: Users, 
      label: "Versammlungen", 
      path: '/weg-owner/meetings',
      active: location.pathname.startsWith('/weg-owner/meetings')
    },
    { 
      icon: Sparkles, 
      label: "Chat", 
      path: '/weg-owner/chatbot',
      active: location.pathname.startsWith('/weg-owner/chatbot')
    }
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <GuidedTourProvider>
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border shadow-sm fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center">
            <img 
              data-tour="logo"
              src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
              alt="RGI Immobilien Logo" 
              className="h-12 w-auto object-contain cursor-pointer"
              onClick={() => navigate('/weg-owner')}
            />
          </div>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button data-tour="menu-button" variant="ghost" size="icon" aria-label="Menü öffnen">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b">
                  <img 
                    src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                    alt="RGI Immobilien Logo" 
                    className="h-8 w-auto object-contain"
                  />
                </div>

                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <UserRound className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="font-semibold text-foreground">{profile?.first_name || 'Benutzer'}</div>
                      <div className="text-sm text-muted-foreground">WEG-Eigentümer</div>
                    </div>
                  </div>
                </div>

                <nav className="flex-1 p-4">
                  <div className="space-y-2">
                    {navigationItems.map((item) => (
                      <Button
                        key={item.path}
                        variant={item.active ? "default" : "ghost"}
                        className={`w-full justify-start gap-3 h-12 ${
                          item.active 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => handleNavigation(item.path)}
                      >
                        <item.icon className="w-5 h-5" />
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </nav>

                <div className="p-4 border-t space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12"
                    onClick={() => handleNavigation('/weg-owner/settings')}
                  >
                    <Settings className="w-5 h-5" />
                    Einstellungen
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive"
                    onClick={() => {
                      signOut();
                      setIsOpen(false);
                    }}
                  >
                    <LogOut className="w-5 h-5" />
                    Abmelden
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      
      <main className="pt-16">
        {children}
      </main>
     
      {profile?.user_id && (
        <TermsAcceptanceDialog 
          open={showTermsDialog} 
          userId={profile.user_id}
          onAccepted={handleTermsAccepted}
        />
      )}
      <VotingPopup />
      {profile?.user_id && (
        <PasskeyPromptDialog userId={profile.user_id} enabled={termsAccepted === true} />
      )}
      {/* Onboarding-Wizard erst zeigen, wenn AGB akzeptiert wurden */}
      {termsAccepted === true && <OnboardingFAB />}
      {/* Erklärvideo erst NACH Onboarding-Abschluss */}
      <IntroVideoDialog open={showIntroVideo} onClose={dismissIntroVideo} />
      {/* Geführte „Erste Schritte"-Tour, jederzeit über den Hilfe-Knopf */}
      {termsAccepted === true && <HelpButton />}
    </div>
    </GuidedTourProvider>
  );
};