import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import {
  abschnittsweise,
  adminMenu,
  brokerMenu,
  istAktiv,
  menueFuer,
  type MenuItem,
} from "@/lib/adminNavigation";
import { useBrokerModeOptional } from "@/hooks/useBrokerMode";
import { ModusSchalter } from "@/components/broker/ModusSchalter";
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
} from "lucide-react";

interface MobileHeaderProps {
  userRole: 'tenant' | 'weg_owner' | 'admin' | 'employee';
  managementMode?: 'weg' | 'rent';
  onModeChange?: (mode: 'weg' | 'rent') => void;
}

export const MobileHeader = ({ userRole, managementMode, onModeChange }: MobileHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const broker = useBrokerModeOptional();

  const istVerwaltung = userRole === 'admin' || userRole === 'employee';
  const istMakler = !!broker?.brokerActive;
  /** Dieselbe Liste wie in der Seitenleiste — es gibt nur eine. */
  const verwaltungsMenue = menueFuer(
    profile?.role,
    istMakler ? brokerMenu : adminMenu,
    istMakler ? undefined : managementMode,
  );

  const getNavigationItems = () => {
    const baseItems = [
      { 
        icon: House, 
        label: "Dashboard", 
        path: userRole === 'tenant' ? '/tenant' : '/weg-owner',
        active: location.pathname === (userRole === 'tenant' ? '/tenant' : '/weg-owner')
      }
    ];

    if (userRole === 'tenant') {
      return [
        ...baseItems,
        { 
          icon: ClipboardList, 
          label: "Meine Meldungen", 
          path: '/tenant/reports',
          active: location.pathname.startsWith('/tenant/reports')
        },
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
    } else {
      return [
        ...baseItems,
        { 
          icon: ClipboardList, 
          label: "Meine Meldungen", 
          path: '/weg-owner/reports',
          active: location.pathname.startsWith('/weg-owner/reports')
        },
        { 
          icon: Newspaper, 
          label: "Schwarzes Brett", 
          path: '/weg-owner/forum',
          active: location.pathname.startsWith('/weg-owner/forum')
        },
        { 
          icon: Sparkles, 
          label: "Chat", 
          path: '/weg-owner/chatbot',
          active: location.pathname.startsWith('/weg-owner/chatbot')
        }
      ];
    }
  };

  const navigationItems = istVerwaltung ? [] : getNavigationItems();

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <header
      className="bg-white border-b border-border shadow-sm fixed top-0 left-0 right-0 z-50 lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between h-16 px-3">
        {/* Logo */}
        <div className="flex items-center cursor-pointer min-w-0" onClick={() => navigate('/')}>
          <img 
            src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
            alt="RGI Immobilien Logo" 
            className="h-10 w-auto object-contain hover:opacity-80 transition-opacity"
          />
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] sm:w-80 p-0 flex flex-col h-full">
            <div className="flex flex-col h-full min-h-0 w-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <img 
                  src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                  alt="RGI Immobilien Logo" 
                  className="h-8 w-auto object-contain"
                />
              </div>

              {/* User Info */}
              <div className="p-4 border-b">
                <div className="flex items-center gap-3">
                  <UserRound className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <div className="font-semibold text-foreground">{profile?.first_name || 'Benutzer'}</div>
                    <div className="text-sm text-muted-foreground">
                      {userRole === 'tenant' ? 'Mieter' : userRole === 'weg_owner' ? 'WEG-Eigentümer' : userRole === 'employee' ? 'Mitarbeiter' : 'Administrator'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bereich: WEG · Miete · Makler */}
              {(userRole === 'admin' || userRole === 'employee') && managementMode && onModeChange && (
                <div className="p-4 border-b">
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Bereich
                    </label>
                    <ModusSchalter
                      managementMode={managementMode}
                      onModeChange={onModeChange}
                      onDone={() => setIsOpen(false)}
                      className="[&>button]:min-h-11"
                    />
                  </div>
                </div>
              )}

              {/* Navigation */}
              <ScrollArea className="flex-1">
                <nav className="p-4">
                  <div className="space-y-2">
                    {istVerwaltung
                      ? abschnittsweise(verwaltungsMenue).map((gruppe, gi) => (
                          <div key={gruppe.abschnitt ?? `oben-${gi}`} className={gi > 0 ? "pt-2" : ""}>
                            {gruppe.abschnitt && (
                              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {gruppe.abschnitt}
                              </div>
                            )}
                            <div className="space-y-1">
                              {gruppe.items.map((item: MenuItem) => {
                                const aktiv = istAktiv(item, location.pathname);
                                return (
                                  <Button
                                    key={item.url}
                                    variant={aktiv ? "default" : "ghost"}
                                    className={`w-full justify-start gap-3 h-11 ${
                                      aktiv
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                    onClick={() => handleNavigation(item.url)}
                                  >
                                    <item.icon className="w-5 h-5" />
                                    {item.title}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      : navigationItems.map((item) => (
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
              </ScrollArea>

              {/* Footer Actions */}
              <div className="p-4 border-t space-y-2">
                {/* Settings nur für Mieter/Eigentümer (Admin hat es im Hauptmenü) */}
                {(userRole === 'tenant' || userRole === 'weg_owner') && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12"
                    onClick={() => handleNavigation(userRole === 'tenant' ? '/tenant/settings' : '/weg-owner/settings')}
                  >
                    <Settings className="w-5 h-5" />
                    Einstellungen
                  </Button>
                )}
                
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
  );
};