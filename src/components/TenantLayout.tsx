 import { useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
 import { TermsAcceptanceDialog } from "@/components/TermsAcceptanceDialog";
 import { IntroVideoDialog } from "@/components/IntroVideoDialog";
 import { PasskeyPromptDialog } from "@/components/PasskeyPromptDialog";
 import { supabase } from "@/integrations/supabase/client";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  House, 
  ClipboardList, 
  Newspaper, 
  Sparkles, 
  Settings,
  LogOut,
  UserRound,
  Menu,
  FolderOpen
} from "lucide-react";

interface TenantLayoutProps {
  children: React.ReactNode;
}

export const TenantLayout = ({ children }: TenantLayoutProps) => {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
 const [showTermsDialog, setShowTermsDialog] = useState(false);
 const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
 
 useEffect(() => {
   const checkTermsAcceptance = async () => {
     if (profile?.user_id) {
       const { data, error } = await supabase
         .from("profiles")
         .select("terms_accepted_at")
         .eq("user_id", profile.user_id)
         .single();
       
       if (!error && data) {
         const accepted = !!data.terms_accepted_at;
         setTermsAccepted(accepted);
         setShowTermsDialog(!accepted);
       }
     }
   };
   checkTermsAcceptance();
 }, [profile?.user_id]);
 
 const handleTermsAccepted = () => {
   setTermsAccepted(true);
   setShowTermsDialog(false);
 };

 // Intro-Video direkt nach AGB (Mieter haben kein Onboarding)
 const videoSeenKey = profile?.user_id ? `intro_video_seen_${profile.user_id}` : null;
 const [videoDismissed, setVideoDismissed] = useState(false);
 useEffect(() => {
   if (videoSeenKey && localStorage.getItem(videoSeenKey) === "1") {
     setVideoDismissed(true);
   }
 }, [videoSeenKey]);
 const showIntroVideo = termsAccepted === true && !videoDismissed;
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

  const navigationItems = [
    { 
      icon: House, 
      label: "Dashboard", 
      path: '/tenant',
      active: location.pathname === '/tenant'
    },
    { 
      icon: ClipboardList, 
      label: "Meine Meldungen", 
      path: '/tenant/reports',
      active: location.pathname.startsWith('/tenant/reports')
    },
    ...(hasVisibleFiles ? [{ 
      icon: FolderOpen, 
      label: "Dokumente", 
      path: '/tenant/files',
      active: location.pathname.startsWith('/tenant/files')
    }] : []),
    { 
      icon: Newspaper, 
      label: "Schwarzes Brett", 
      path: '/tenant/forum',
      active: location.pathname.startsWith('/tenant/forum')
    },
    { 
      icon: Sparkles, 
      label: "Chat", 
      path: '/tenant/chatbot',
      active: location.pathname.startsWith('/tenant/chatbot')
    }
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border shadow-sm fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center">
            <img 
              src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
              alt="RGI Immobilien Logo" 
              className="h-12 w-auto object-contain cursor-pointer"
              onClick={() => navigate('/tenant')}
            />
          </div>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
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
                      <div className="text-sm text-muted-foreground">Mieter</div>
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
                    onClick={() => handleNavigation('/tenant/settings')}
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
     {profile?.user_id && (
       <PasskeyPromptDialog userId={profile.user_id} enabled={termsAccepted === true} />
     )}
     <IntroVideoDialog open={showIntroVideo} onClose={dismissIntroVideo} />
    </div>
  );
};