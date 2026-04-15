import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
  Castle,
  BarChart3,
  MessageCircle,
  CheckSquare,
  CalendarDays,
  BookUser,
  Landmark,
  Mail,
  Users,
  CreditCard,
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

  const getNavigationItems = () => {
    if (userRole === 'admin' || userRole === 'employee') {
      const items = [
        { icon: BarChart3, label: "Dashboard", path: '/dashboard', active: location.pathname === '/dashboard' },
        { icon: Mail, label: "Postfach", path: '/postfach', active: location.pathname.startsWith('/postfach') },
        { icon: Sparkles, label: "NOVA", path: '/documents', active: location.pathname.startsWith('/documents') },
        { icon: CheckSquare, label: "Aufgaben", path: '/todos', active: location.pathname.startsWith('/todos') },
        { icon: CalendarDays, label: "Kalender", path: '/calendar', active: location.pathname.startsWith('/calendar') },
        { icon: ClipboardList, label: "Meldungen", path: '/reports', active: location.pathname.startsWith('/reports') },
        { icon: Castle, label: "Gebäude", path: '/buildings', active: location.pathname.startsWith('/buildings') },
        { icon: BookUser, label: "Adressen", path: '/contacts', active: location.pathname.startsWith('/contacts') },
        { icon: Users, label: "Versammlungen", path: '/versammlungen', active: location.pathname.startsWith('/versammlungen') },
        { icon: Landmark, label: "Buchhaltung", path: '/finanzen', active: location.pathname.startsWith('/finanzen') },
        { icon: CreditCard, label: "Überweisungen", path: '/ueberweisungen', active: location.pathname.startsWith('/ueberweisungen') },
      ];

      // Filter für Mitarbeiter
      if (userRole === 'employee') {
        return items.filter(item => !['Einstellungen'].includes(item.label));
      }
      
      return items;
    }

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

  const navigationItems = getNavigationItems();

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <header className="bg-white border-b border-border shadow-sm fixed top-0 left-0 right-0 z-50 md:hidden">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Logo */}
        <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
          <img 
            src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
            alt="RGI Immobilien Logo" 
            className="h-12 w-auto object-contain hover:opacity-80 transition-opacity"
          />
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0">
            <div className="flex flex-col h-full">
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

              {/* Management Mode Toggle for Admin and Employee */}
              {(userRole === 'admin' || userRole === 'employee') && managementMode && onModeChange && (
                <div className="p-4 border-b">
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Verwaltungsmodus
                    </label>
                    <div className="flex bg-muted rounded-lg p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onModeChange('weg')}
                        className={`flex-1 rounded-md transition-colors ${
                          managementMode === 'weg' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-background text-muted-foreground'
                        }`}
                      >
                        WEG
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onModeChange('rent')}
                        className={`flex-1 rounded-md transition-colors ${
                          managementMode === 'rent' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-background text-muted-foreground'
                        }`}
                      >
                        Miete
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
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

              {/* Footer Actions */}
              <div className="p-4 border-t space-y-2">
                {/* Settings nur für nicht-Mitarbeiter */}
                {userRole !== 'employee' && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12"
                    onClick={() => handleNavigation(userRole === 'tenant' ? '/tenant/settings' : userRole === 'weg_owner' ? '/weg-owner/settings' : '/settings')}
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